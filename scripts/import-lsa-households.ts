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
 *   --commit              Actually write to Supabase. Without it, dry-run only.
 *
 * Idempotency: with --commit, each household is keyed by
 * (jurisdiction_id, normalized address_line). Re-running skips
 * households already present and reports them in the review xlsx.
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
    commit: args.commit === true,
  };
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
