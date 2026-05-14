// Pure helpers for building short contextual labels that distinguish
// two people with the same name. Allowed sources are structural only —
// nucleus, activity, age group, "attends with X", area, profile status,
// already-stored contact info. Subjective / appearance descriptions are
// never allowed.

import type { AgeGroup, ProfileStatus } from '../database.types';

export interface PersonDisambiguatorContext {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  isMinor: boolean;
  profileStatus: ProfileStatus;
  nucleusNames: string[];
  activityNames: string[];
  clusterName: string | null;
  attendsWith: string[];
  email: string | null;
  phone: string | null;
}

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  child: 'Child',
  junior_youth: 'Junior Youth',
  youth: 'Youth',
  adult: 'Adult',
  unknown: '',
};

// Build every candidate label this person could be tagged with,
// in priority order. The combobox picks the first one(s) needed
// to make a row distinct from its sibling matches.
export function candidateLabelsFor(p: PersonDisambiguatorContext): string[] {
  const out: string[] = [];

  for (const n of p.nucleusNames) out.push(n);
  for (const a of p.activityNames) out.push(a);

  const ageLabel = AGE_GROUP_LABELS[p.ageGroup];
  if (ageLabel) {
    out.push(p.ageGroup === 'youth' && p.isMinor ? `${ageLabel} (under 18)` : ageLabel);
  }

  for (const w of p.attendsWith) out.push(`attends with ${w}`);

  if (p.clusterName) out.push(p.clusterName);

  if (p.profileStatus === 'provisional') out.push('provisional profile');

  if (p.email) out.push(p.email);
  else if (p.phone) out.push(p.phone);

  return out;
}

// Given a set of same-name matches, pick the smallest set of labels
// per row that makes every row distinct from the others. Falls back
// to all available labels if perfect distinctness is unachievable.
export function pickDistinguishingLabels(
  matches: PersonDisambiguatorContext[],
  maxLabelsPerRow = 2,
): Record<string, string[]> {
  const candidates: Record<string, string[]> = {};
  for (const m of matches) candidates[m.id] = candidateLabelsFor(m);

  if (matches.length <= 1) {
    const only = matches[0];
    return only ? { [only.id]: candidates[only.id].slice(0, 1) } : {};
  }

  const chosen: Record<string, string[]> = {};
  // Step 1: give every row its top candidate so each row has a baseline label.
  for (const m of matches) {
    chosen[m.id] = candidates[m.id].length > 0 ? [candidates[m.id][0]] : [];
  }

  // Step 2: while any group of rows shares an identical signature, expand
  // every member of the group together. Crucially, prefer candidate labels
  // that *differ* across the tied group — labels common to every member
  // (e.g. the same nucleus and same activity) can never break the tie, so
  // they're skipped in favour of whatever does (e.g. age group). This is
  // why two "Zaphod — Nucleus 1 — Study Circle A" rows don't repeat: the
  // tie is broken with "Adult" vs "Junior Youth" instead of more shared
  // context.
  const sig = (id: string) => chosen[id].join(' • ');
  for (let pass = 1; pass < maxLabelsPerRow; pass++) {
    const groups = new Map<string, string[]>();
    for (const m of matches) {
      const key = sig(m.id);
      const arr = groups.get(key) ?? [];
      arr.push(m.id);
      groups.set(key, arr);
    }
    let added = false;
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;

      // Labels every member of this tied group also has — these are
      // useless for distinguishing the group, even if they sit higher in
      // the priority order. Build the intersection of their full candidate
      // lists.
      const sets = ids.map(id => new Set(candidates[id]));
      const commonAcrossGroup = new Set<string>();
      if (sets.length > 0) {
        for (const label of sets[0]) {
          if (sets.every(s => s.has(label))) commonAcrossGroup.add(label);
        }
      }

      for (const id of ids) {
        const used = new Set(chosen[id]);
        // Prefer the first candidate that actually distinguishes this row
        // from at least one of its tied siblings. Only fall back to a
        // common label if no distinguishing label is available.
        const distinguishing = candidates[id].find(
          l => !used.has(l) && !commonAcrossGroup.has(l)
        );
        const next = distinguishing ?? candidates[id].find(l => !used.has(l));
        if (next) {
          chosen[id].push(next);
          added = true;
        }
      }
    }
    if (!added) break;
  }

  return chosen;
}

// Derived: child / junior_youth → always minor; adult → never minor;
// youth / unknown → caller's choice (defaults false).
export function isMinorForAgeGroup(ageGroup: AgeGroup, userChoice = false): boolean {
  if (ageGroup === 'child' || ageGroup === 'junior_youth') return true;
  if (ageGroup === 'adult') return false;
  return userChoice;
}

// Whether a UI should expose the "Under 18" toggle for this cohort.
export function ageGroupAllowsMinorToggle(ageGroup: AgeGroup): boolean {
  return ageGroup === 'youth' || ageGroup === 'unknown';
}
