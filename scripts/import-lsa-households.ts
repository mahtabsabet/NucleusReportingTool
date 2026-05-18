/**
 * One-off LSA household import.
 *
 * Reads the LSA's community-list .xlsx, groups people by physical
 * address into households, and (with --commit) writes the
 * unambiguous single-surname households to the LSA layer for the
 * named cluster. Always emits a review .xlsx that splits the
 * input into:
 *   - Imported (single surname per address)
 *   - Review · Case/Space variant (e.g. "De Vries" / "de Vries")
 *   - Review · Compound/Substring (e.g. "Khadem" / "Khadem-Esfahani")
 *   - Review · Different surnames (likely multi-family at one address)
 *   - Review · No address (rows with a blank address column)
 *
 * The community-list .xlsx is sensitive PII and is NOT committed
 * to the repo. Pass its path on the command line.
 *
 * Run from the repo root:
 *   # Dry run — produces the review xlsx, writes nothing to the DB:
 *   npx tsx scripts/import-lsa-households.ts \
 *     --input=/path/to/community_list.xlsx
 *
 *   # Real run — same review xlsx, plus imports the accepted bucket:
 *   npx tsx scripts/import-lsa-households.ts \
 *     --input=/path/to/community_list.xlsx --commit
 *
 * Flags:
 *   --input=<path>        Required. Path to the source .xlsx.
 *   --cluster=<name>      Cluster name to import under. Default: "Calgary".
 *   --output=<path>       Review xlsx path. Default: ./lsa-import-review-<ts>.xlsx.
 *   --sql=<path>          Also emit a ready-to-paste SQL file for the
 *                         accepted bucket. Useful when you don't have
 *                         a service-role key locally — paste the file
 *                         into the Supabase SQL editor instead.
 *   --commit              Actually write to Supabase. Without it, dry-run only.
 *
 * Idempotency: with --commit, each household is keyed by
 * (jurisdiction_id, normalized address_line). Re-running skips
 * households already present and reports them in the review xlsx.
 * The --sql output does NOT include an idempotency guard; the
 * file's header tells the operator to run it exactly once.
 *
 * REMINDER (post-merge cleanup): the first run of this script
 * against the dev Supabase project loads ~280 real Calgary
 * households as sample data. After this branch merges to main and
 * the corrected, assembly-reviewed dataset is imported into
 * production, that sample data should be deleted from dev so we
 * aren't sitting on PII we don't need. The PR body should repeat
 * this reminder as a release checkbox.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import XLSX from 'xlsx';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// ─── Types ───────────────────────────────────────────────────────

type Row = {
  lastName: string;
  firstName: string;
  email: string | null;
  telephone: string | null;
  mobile: string | null;
  address: string | null;
  postal: string | null;
  household: string | null;          // ignored for grouping; kept for reference only
  sector: string | null;
  neighbourhood: string | null;
  sourceRow: number;                 // 1-based row number in the spreadsheet
};

type Group = {
  key: string;                       // normalized address|postal, or "__noaddr__|<row>"
  address: string | null;
  postal: string | null;
  sector: string | null;
  neighbourhood: string | null;
  members: Row[];
  surnames: string[];                // distinct, in first-seen order
  category: 'accepted' | 'case_space' | 'compound' | 'different' | 'no_address';
  proposedName: string;
};

// ─── Args ────────────────────────────────────────────────────────

function parseArgs() {
  const args: Record<string, string | boolean> = {};
  for (const a of process.argv.slice(2)) {
    if (a === '--commit') { args.commit = true; continue; }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  if (!args.input || typeof args.input !== 'string') {
    console.error('Missing required --input=<path to .xlsx>');
    process.exit(1);
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return {
    input: args.input as string,
    cluster: (args.cluster as string) || 'Calgary',
    output: (args.output as string) || path.resolve(process.cwd(), `lsa-import-review-${ts}.xlsx`),
    sql: (args.sql as string) || null,
    decisions: (args.decisions as string) || null,
    commit: args.commit === true,
  };
}

// ─── Decisions sidecar ───────────────────────────────────────────
// The LSA's review xlsx (the one this script emitted on the dry
// run) can carry a "Decision" column on each review tab. We parse
// that here and return a Map<sourceRow, decisionText>. Empty cells
// → no entry; the original proposed name stays. "SKIP" (case-
// insensitive) → drop that person from the import.

const SOURCE_ROW_HEADER = 'Source Row';
const DECISION_HEADER = 'Decision';

function parseDecisions(decisionsPath: string): Map<number, string> {
  const wb = XLSX.readFile(decisionsPath);
  const out = new Map<number, string>();
  for (const sheetName of wb.SheetNames) {
    if (!sheetName.toLowerCase().startsWith('review')) continue;
    const ws = wb.Sheets[sheetName];
    const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
    if (matrix.length === 0) continue;
    const headers = (matrix[0] as unknown[]).map(c => (c == null ? '' : String(c).trim()));
    const srcIdx = headers.indexOf(SOURCE_ROW_HEADER);
    const decIdx = headers.indexOf(DECISION_HEADER);
    if (srcIdx === -1 || decIdx === -1) continue;
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i] ?? [];
      const src = row[srcIdx];
      const dec = row[decIdx];
      if (src == null || dec == null) continue;
      const srcNum = Number(src);
      const decStr = String(dec).trim();
      if (!Number.isFinite(srcNum) || decStr === '') continue;
      out.set(srcNum, decStr);
    }
  }
  return out;
}

// Apply decisions to the grouped output. Members whose decision is
// "SKIP" are dropped; members with an explicit name override get
// regrouped under that name (split if a single address has multiple
// override names — that's the LSA flagging a co-residence as actually
// being multiple households). Untouched members keep the proposed name.
function applyDecisions(groups: Group[], decisions: Map<number, string>): Group[] {
  const out: Group[] = [];
  for (const g of groups) {
    if (g.category === 'accepted') {
      // Single-surname groups don't go through review, but allow
      // overrides anyway so a decisions file can correct anything.
      out.push(...resolveGroup(g, decisions));
      continue;
    }
    out.push(...resolveGroup(g, decisions));
  }
  return out;
}

function resolveGroup(g: Group, decisions: Map<number, string>): Group[] {
  const byName = new Map<string, Row[]>();
  for (const m of g.members) {
    const dec = decisions.get(m.sourceRow);
    if (dec && dec.toUpperCase() === 'SKIP') continue;
    const name = dec ?? g.proposedName;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(m);
  }
  if (byName.size === 0) return [];
  const out: Group[] = [];
  let i = 0;
  for (const [name, members] of byName) {
    out.push({
      ...g,
      // Differentiate split keys so the SQL dedup check stays per-name
      // when a single address splits into multiple households.
      key: byName.size === 1 ? g.key : `${g.key}#${i++}`,
      members,
      surnames: Array.from(new Set(members.map(m => m.lastName))),
      proposedName: name,
      // After a decision is applied the group is treated as accepted —
      // the LSA has resolved the ambiguity. Categories above this point
      // still drive the review xlsx grouping; we just resolve before SQL.
      category: 'accepted',
    });
  }
  return out;
}

// ─── Parse the spreadsheet ───────────────────────────────────────

const HEADERS = [
  'Last Name', 'First Name', 'Email', 'Telephone', 'MobilePhone',
  'Address Line 1', 'Postal', 'Household', 'Community Sector', 'Neighbourhood',
];

function cell(s: unknown): string | null {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}

function readRows(inputPath: string): Row[] {
  const wb = XLSX.readFile(inputPath);
  // Sheet2 is a subset of Sheet1; we ignore it.
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Force a dense matrix so we can locate the real header row (row 4).
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true });

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const row = (matrix[i] ?? []).map((c) => (c == null ? '' : String(c).trim()));
    if (HEADERS.every((h) => row.includes(h))) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error('Could not locate the header row in Sheet1.');

  const headerMap: Record<string, number> = {};
  for (const h of HEADERS) headerMap[h] = (matrix[headerRowIdx] as unknown[]).findIndex((c) => String(c ?? '').trim() === h);

  const out: Row[] = [];
  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const lastName  = cell(r[headerMap['Last Name']]);
    const firstName = cell(r[headerMap['First Name']]);
    // Skip blank rows and the spreadsheet's internal section-break header repeats.
    if (!lastName && !firstName) continue;
    if (lastName === 'Last Name' && firstName === 'First Name') continue;
    if (!lastName || !firstName) {
      console.warn(`  row ${i + 1}: missing name (${lastName ?? '∅'} / ${firstName ?? '∅'}) — skipped`);
      continue;
    }
    out.push({
      lastName,
      firstName,
      email:         cell(r[headerMap['Email']]),
      telephone:     cell(r[headerMap['Telephone']]),
      mobile:        cell(r[headerMap['MobilePhone']]),
      address:       cell(r[headerMap['Address Line 1']]),
      postal:        cell(r[headerMap['Postal']]),
      household:     cell(r[headerMap['Household']]),
      sector:        cell(r[headerMap['Community Sector']]),
      neighbourhood: cell(r[headerMap['Neighbourhood']]),
      sourceRow:     i + 1,
    });
  }
  return out;
}

// ─── Group rows into households ──────────────────────────────────

function normAddr(a: string | null): string | null {
  if (!a) return null;
  return a.trim().toLowerCase().replace(/\s+/g, ' ');
}
function normPostal(p: string | null): string | null {
  if (!p) return null;
  return p.toUpperCase().replace(/\s+/g, '');
}
// Aggressive: lowercase, strip spaces, strip hyphens. Used to detect
// "same surname, different formatting" (case/hyphen/space variants).
function normSurnameAggressive(s: string): string {
  return s.toLowerCase().replace(/[-\s]/g, '');
}
// Normalize sector casing — the source has "south"/"downtown" mixed in.
function normSector(s: string | null): string | null {
  if (!s) return null;
  const v = s.trim();
  if (!v || v.toLowerCase() === 'community sector') return null;
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

function groupRows(rows: Row[]): Group[] {
  const groups = new Map<string, Group>();

  for (const r of rows) {
    const a = normAddr(r.address);
    const p = normPostal(r.postal);
    let key: string;
    if (!a) {
      // No address: each row is its own group (we can't merge them).
      key = `__noaddr__|${r.sourceRow}`;
    } else {
      key = `${a}|${p ?? ''}`;
    }
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        address: r.address,
        postal: r.postal,
        sector: normSector(r.sector),
        neighbourhood: r.neighbourhood,
        members: [],
        surnames: [],
        category: 'accepted',          // placeholder, set below
        proposedName: '',              // ditto
      };
      groups.set(key, g);
    }
    g.members.push(r);
    if (!g.surnames.includes(r.lastName)) g.surnames.push(r.lastName);
  }

  for (const g of groups.values()) categorize(g);
  return Array.from(groups.values()).sort(sortGroups);
}

function categorize(g: Group): void {
  if (!g.address) {
    g.category = 'no_address';
    g.proposedName = g.members[0].lastName;
    return;
  }

  const distinct = g.surnames;
  if (distinct.length === 1) {
    g.category = 'accepted';
    g.proposedName = distinct[0];
    return;
  }

  const norms = distinct.map(normSurnameAggressive);
  const uniqueNorms = Array.from(new Set(norms));
  if (uniqueNorms.length === 1) {
    g.category = 'case_space';
    // Pick the shortest original spelling as the canonical form.
    g.proposedName = [...distinct].sort((a, b) => a.length - b.length)[0];
    return;
  }

  // Substring containment under aggressive normalization — likely the same
  // family with one or more compound/double-barrel variants.
  const allSubstrings = uniqueNorms.every((a, i) =>
    uniqueNorms.some((b, j) => i !== j && (b.includes(a) || a.includes(b))),
  );
  if (allSubstrings) {
    g.category = 'compound';
    g.proposedName = [...distinct].sort((a, b) => a.length - b.length)[0];
    return;
  }

  g.category = 'different';
  g.proposedName = [...distinct].sort((a, b) => a.localeCompare(b)).join(' / ');
}

const CATEGORY_ORDER: Record<Group['category'], number> = {
  accepted: 0, case_space: 1, compound: 2, different: 3, no_address: 4,
};
function sortGroups(a: Group, b: Group) {
  const c = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
  if (c !== 0) return c;
  return (a.address ?? '').localeCompare(b.address ?? '');
}

// ─── Write the review xlsx ───────────────────────────────────────

type ReviewRow = {
  'Household #': number;
  'Proposed Household Name': string;
  'Address': string | null;
  'Postal': string | null;
  'Sector': string | null;
  'Neighbourhood': string | null;
  'First Name': string;
  'Last Name': string;
  'Email': string | null;
  'Telephone': string | null;
  'Mobile': string | null;
  'Source Row': number;
};

function toReviewRows(groups: Group[], startCounter = 1): ReviewRow[] {
  const out: ReviewRow[] = [];
  let n = startCounter;
  for (const g of groups) {
    for (const m of g.members) {
      out.push({
        'Household #': n,
        'Proposed Household Name': g.proposedName,
        'Address': g.address,
        'Postal': g.postal,
        'Sector': g.sector,
        'Neighbourhood': g.neighbourhood,
        'First Name': m.firstName,
        'Last Name': m.lastName,
        'Email': m.email,
        'Telephone': m.telephone,
        'Mobile': m.mobile,
        'Source Row': m.sourceRow,
      });
    }
    n += 1;
  }
  return out;
}

function writeReview(outputPath: string, groups: Group[], skippedExisting: Group[], opts: { cluster: string; committed: boolean }) {
  const byCat = (cat: Group['category']) => groups.filter((g) => g.category === cat);
  const accepted   = byCat('accepted');
  const caseSpace  = byCat('case_space');
  const compound   = byCat('compound');
  const different  = byCat('different');
  const noAddress  = byCat('no_address');

  const totalPeople = groups.reduce((n, g) => n + g.members.length, 0);
  const peopleIn = (gs: Group[]) => gs.reduce((n, g) => n + g.members.length, 0);

  const summary = [
    ['LSA Household Import — Review'],
    [`Cluster: ${opts.cluster}`],
    [`Generated: ${new Date().toISOString()}`],
    [`Mode: ${opts.committed ? 'COMMIT (rows in "Imported" were written to the database)' : 'DRY RUN (no database writes)'}`],
    [],
    ['Category', 'Households', 'People'],
    ['Imported (single surname)',         accepted.length,  peopleIn(accepted)],
    ['Review · Case/Space variants',      caseSpace.length, peopleIn(caseSpace)],
    ['Review · Compound/Substring',       compound.length,  peopleIn(compound)],
    ['Review · Different surnames',       different.length, peopleIn(different)],
    ['Review · No address',               noAddress.length, peopleIn(noAddress)],
    ['TOTAL',                             groups.length,    totalPeople],
    [],
    ['Already in database (skipped)', skippedExisting.length, peopleIn(skippedExisting)],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  const addSheet = (name: string, rows: ReviewRow[]) => {
    const ws = rows.length
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([['(none)']]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet('Imported',                 toReviewRows(accepted));
  addSheet('Review - Case-Space',      toReviewRows(caseSpace));
  addSheet('Review - Compound',        toReviewRows(compound));
  addSheet('Review - Different',       toReviewRows(different));
  addSheet('Review - No Address',      toReviewRows(noAddress));
  if (skippedExisting.length) {
    addSheet('Skipped (already in DB)', toReviewRows(skippedExisting));
  }

  XLSX.writeFile(wb, outputPath);
}

// ─── SQL emit (alternative to --commit when there's no service-role key) ───

function sqlStr(s: string | null | undefined): string {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function writeSqlImport(outPath: string, accepted: Group[], clusterName: string): void {
  const lines: string[] = [];
  lines.push('-- ============================================================');
  lines.push(`-- LSA household import — ${accepted.length} households / ${accepted.reduce((n, g) => n + g.members.length, 0)} people`);
  lines.push(`-- Target cluster: ${clusterName}`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push('--');
  lines.push('-- Paste this whole file into the Supabase SQL editor and click Run.');
  lines.push('-- It runs as one transaction — either everything lands or nothing does.');
  lines.push('-- Idempotent: each household is guarded by a NOT EXISTS lookup');
  lines.push('-- against (jurisdiction_id, address_line) — re-running skips any');
  lines.push('-- household already present at the same address. Addressless rows');
  lines.push('-- dedup on display_name + NULL address.');
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('DO $LSA$');
  lines.push('DECLARE');
  lines.push('  jur_id uuid;');
  lines.push('  hh_id  uuid;');
  lines.push('BEGIN');
  lines.push('  SELECT j.id INTO jur_id');
  lines.push('    FROM lsa_jurisdictions j');
  lines.push('    JOIN clusters c ON c.id = j.cluster_id');
  lines.push(`   WHERE c.name = ${sqlStr(clusterName)}`);
  lines.push('     AND c.deleted_at IS NULL');
  lines.push('     AND j.archived_at IS NULL');
  lines.push('   ORDER BY j.created_at ASC');
  lines.push('   LIMIT 1;');
  lines.push('');
  lines.push(`  IF jur_id IS NULL THEN RAISE EXCEPTION 'No LSA jurisdiction for cluster ${clusterName}'; END IF;`);
  lines.push('');

  for (const g of accepted) {
    const addrComment = g.address ?? '(no address)';
    lines.push(`  -- ${g.proposedName} @ ${addrComment}`);
    // Idempotency guard: skip if a non-archived household with the
    // same identifying signature is already in this jurisdiction.
    if (g.address) {
      lines.push('  IF NOT EXISTS (SELECT 1 FROM households');
      lines.push(`   WHERE jurisdiction_id = jur_id AND archived_at IS NULL`);
      lines.push(`     AND lower(address_line) = lower(${sqlStr(g.address)})) THEN`);
    } else {
      lines.push('  IF NOT EXISTS (SELECT 1 FROM households');
      lines.push(`   WHERE jurisdiction_id = jur_id AND archived_at IS NULL`);
      lines.push(`     AND address_line IS NULL`);
      lines.push(`     AND display_name = ${sqlStr(g.proposedName)}) THEN`);
    }
    lines.push('    INSERT INTO households (jurisdiction_id, display_name, address_line, neighbourhood, sector)');
    lines.push(`    VALUES (jur_id, ${sqlStr(g.proposedName)}, ${sqlStr(g.address)}, ${sqlStr(g.neighbourhood)}, ${sqlStr(g.sector)})`);
    lines.push('    RETURNING id INTO hh_id;');
    lines.push('    INSERT INTO household_members (household_id, display_name, email, phone, mobile) VALUES');
    const memberValues = g.members.map((m) =>
      `      (hh_id, ${sqlStr(`${m.firstName} ${m.lastName}`.trim())}, ${sqlStr(m.email)}, ${sqlStr(m.telephone)}, ${sqlStr(m.mobile)})`,
    );
    lines.push(memberValues.join(',\n') + ';');
    lines.push('  END IF;');
    lines.push('');
  }

  lines.push('END $LSA$;');
  lines.push('');
  fs.writeFileSync(outPath, lines.join('\n'));
}

// ─── DB write (only with --commit) ───────────────────────────────

async function getJurisdictionId(supabase: SupabaseClient, clusterName: string): Promise<string> {
  const { data: cluster, error: cErr } = await supabase
    .from('clusters')
    .select('id, name')
    .eq('name', clusterName)
    .is('deleted_at', null)
    .maybeSingle();
  if (cErr) throw new Error(`Lookup cluster "${clusterName}": ${cErr.message}`);
  if (!cluster) throw new Error(`No cluster named "${clusterName}" (or it's soft-deleted).`);

  const { data: jur, error: jErr } = await supabase
    .from('lsa_jurisdictions')
    .select('id, name')
    .eq('cluster_id', cluster.id)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (jErr) throw new Error(`Lookup jurisdiction for cluster ${cluster.id}: ${jErr.message}`);
  if (!jur) throw new Error(`No LSA jurisdiction for cluster "${clusterName}". The 20260516 migration should have auto-seeded one — has it run?`);

  console.log(`Target: cluster "${cluster.name}" → jurisdiction "${jur.name}" (${jur.id})`);
  return jur.id;
}

async function importAccepted(
  supabase: SupabaseClient,
  jurisdictionId: string,
  accepted: Group[],
): Promise<{ inserted: Group[]; skipped: Group[] }> {
  // Pre-fetch every household already in this jurisdiction so the idempotency
  // check is a single round-trip, not one query per address.
  const { data: existing, error: exErr } = await supabase
    .from('households')
    .select('id, address_line')
    .eq('jurisdiction_id', jurisdictionId)
    .is('archived_at', null);
  if (exErr) throw new Error(`Fetch existing households: ${exErr.message}`);
  const existingByAddr = new Map<string, string>();
  for (const h of existing ?? []) {
    if (h.address_line) existingByAddr.set(normAddr(h.address_line) ?? '', h.id);
  }

  const inserted: Group[] = [];
  const skipped: Group[]  = [];

  for (const g of accepted) {
    const addrKey = normAddr(g.address) ?? '';
    if (existingByAddr.has(addrKey)) {
      skipped.push(g);
      continue;
    }

    const { data: hh, error: hErr } = await supabase
      .from('households')
      .insert({
        jurisdiction_id: jurisdictionId,
        display_name:    g.proposedName,
        address_line:    g.address,
        neighbourhood:   g.neighbourhood,
        sector:          g.sector,
      })
      .select('id')
      .single();
    if (hErr || !hh) throw new Error(`Insert household at "${g.address}": ${hErr?.message}`);

    const members = g.members.map((m) => ({
      household_id: hh.id,
      display_name: `${m.firstName} ${m.lastName}`.trim(),
      email:  m.email,
      phone:  m.telephone,
      mobile: m.mobile,
    }));
    const { error: mErr } = await supabase.from('household_members').insert(members);
    if (mErr) throw new Error(`Insert members for household ${hh.id}: ${mErr.message}`);

    inserted.push(g);
  }

  return { inserted, skipped };
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  console.log(`Input:   ${args.input}`);
  console.log(`Cluster: ${args.cluster}`);
  console.log(`Output:  ${args.output}`);
  console.log(`Mode:    ${args.commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log();

  const rows = readRows(args.input);
  console.log(`Parsed ${rows.length} people from the spreadsheet.`);

  const groups = groupRows(rows);
  const counts = {
    accepted:   groups.filter((g) => g.category === 'accepted').length,
    case_space: groups.filter((g) => g.category === 'case_space').length,
    compound:   groups.filter((g) => g.category === 'compound').length,
    different:  groups.filter((g) => g.category === 'different').length,
    no_address: groups.filter((g) => g.category === 'no_address').length,
  };
  console.log(`Grouped into ${groups.length} households:`);
  console.log(`  ${counts.accepted}   single surname (accepted)`);
  console.log(`  ${counts.case_space} case/space variants`);
  console.log(`  ${counts.compound}   compound/substring`);
  console.log(`  ${counts.different} different surnames`);
  console.log(`  ${counts.no_address} no address`);
  console.log();

  // Resolve review-bucket groups against the decisions sidecar, if
  // provided. After this, every group reads as "accepted" — the LSA
  // has answered the ambiguous cases — and the SQL output spans the
  // full set instead of just the trivially-accepted ones.
  let resolvedGroups = groups;
  if (args.decisions) {
    const decisions = parseDecisions(args.decisions);
    console.log(`Loaded ${decisions.size} decision(s) from ${args.decisions}.`);
    resolvedGroups = applyDecisions(groups, decisions);
    const resolvedPeople = resolvedGroups.reduce((n, g) => n + g.members.length, 0);
    console.log(`Resolved to ${resolvedGroups.length} households (${resolvedPeople} people) after applying decisions.`);
    console.log();
  }

  let skipped: Group[] = [];
  if (args.commit) {
    const supabaseUrl    = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const jurisdictionId = await getJurisdictionId(supabase, args.cluster);
    const accepted = groups.filter((g) => g.category === 'accepted');
    const { inserted, skipped: alreadyThere } = await importAccepted(supabase, jurisdictionId, accepted);
    skipped = alreadyThere;
    console.log(`Imported ${inserted.length} new households (${inserted.reduce((n, g) => n + g.members.length, 0)} members).`);
    console.log(`Skipped  ${alreadyThere.length} households already present.`);
  } else {
    console.log('Dry run — nothing written to the database. Pass --commit to import.');
  }
  console.log();

  writeReview(args.output, groups, skipped, { cluster: args.cluster, committed: args.commit });
  console.log(`Review spreadsheet: ${args.output}`);

  if (args.sql) {
    // Without decisions, only the unambiguous single-surname groups
    // can be safely committed — review buckets need human input. With
    // decisions, every group has been resolved and goes in.
    const forSql = args.decisions
      ? resolvedGroups
      : resolvedGroups.filter((g) => g.category === 'accepted');
    writeSqlImport(args.sql, forSql, args.cluster);
    console.log(`SQL import file:    ${args.sql} (${forSql.length} households)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
