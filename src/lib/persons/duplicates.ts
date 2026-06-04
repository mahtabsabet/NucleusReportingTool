// Proactive duplicate detection for the People page.
//
// Given a roster of people, group together any that look like the same person:
// they share a normalized name, an email, or a phone number. Grouping is
// transitive (union-find) so A↔B by name and B↔C by phone yields one {A,B,C}
// group rather than two overlapping pairs. Pure and synchronous so it can be
// unit-tested and run on the already-loaded roster without extra queries.

export type DuplicateReason = 'name' | 'email' | 'phone';

export interface DuplicateCandidate {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface DuplicateGroup<T extends DuplicateCandidate> {
  people: T[];
  /** Which signals tied this group together, e.g. ['name'] or ['name','phone']. */
  reasons: DuplicateReason[];
}

function normName(name: string): string | null {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return n.length > 0 ? n : null;
}

function normEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e.length > 0 ? e : null;
}

function normPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  // Ignore very short fragments — too weak a signal to group strangers on.
  return digits.length >= 7 ? digits : null;
}

const REASON_KEYS: ReadonlyArray<readonly [DuplicateReason, (p: DuplicateCandidate) => string | null]> = [
  ['name', p => normName(p.name)],
  ['email', p => normEmail(p.email)],
  ['phone', p => normPhone(p.phone)],
];

const REASON_ORDER: DuplicateReason[] = ['name', 'email', 'phone'];

export function findDuplicateGroups<T extends DuplicateCandidate>(people: T[]): DuplicateGroup<T>[] {
  const parent = new Map<string, string>();
  for (const p of people) parent.set(p.id, p.id);

  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path-compress so repeated lookups stay flat.
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Link everyone sharing the same key for each signal.
  for (const [, keyFn] of REASON_KEYS) {
    const byKey = new Map<string, string[]>();
    for (const p of people) {
      const k = keyFn(p);
      if (!k) continue;
      const arr = byKey.get(k);
      if (arr) arr.push(p.id); else byKey.set(k, [p.id]);
    }
    for (const ids of byKey.values()) {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    }
  }

  // Collect components.
  const byRoot = new Map<string, T[]>();
  for (const p of people) {
    const root = find(p.id);
    const arr = byRoot.get(root);
    if (arr) arr.push(p); else byRoot.set(root, [p]);
  }

  const groups: DuplicateGroup<T>[] = [];
  for (const members of byRoot.values()) {
    if (members.length < 2) continue;
    // Which signals actually occur (shared) within this group.
    const reasons = new Set<DuplicateReason>();
    for (const [reason, keyFn] of REASON_KEYS) {
      const seen = new Map<string, number>();
      for (const m of members) {
        const k = keyFn(m);
        if (!k) continue;
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      if ([...seen.values()].some(c => c >= 2)) reasons.add(reason);
    }
    groups.push({
      people: [...members].sort((a, b) => a.name.localeCompare(b.name)),
      reasons: REASON_ORDER.filter(r => reasons.has(r)),
    });
  }

  // Biggest / most-certain groups first; stable by first name otherwise.
  return groups.sort(
    (a, b) => b.people.length - a.people.length || a.people[0].name.localeCompare(b.people[0].name),
  );
}
