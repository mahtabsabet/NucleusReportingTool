import { describe, it, expect } from 'vitest';
import {
  isMinorForAgeGroup,
  ageGroupAllowsMinorToggle,
  candidateLabelsFor,
  pickDistinguishingLabels,
  AGE_GROUP_LABELS,
  type PersonDisambiguatorContext,
} from '../disambiguators';

const baseCtx: PersonDisambiguatorContext = {
  id: '0',
  name: 'John',
  ageGroup: 'unknown',
  isMinor: false,
  profileStatus: 'provisional',
  nucleusNames: [],
  activityNames: [],
  clusterName: null,
  attendsWith: [],
  email: null,
  phone: null,
};

const ctx = (over: Partial<PersonDisambiguatorContext>): PersonDisambiguatorContext => ({
  ...baseCtx,
  ...over,
});

describe('isMinorForAgeGroup', () => {
  it('forces minor=true for child and junior_youth regardless of userChoice', () => {
    expect(isMinorForAgeGroup('child')).toBe(true);
    expect(isMinorForAgeGroup('child', false)).toBe(true);
    expect(isMinorForAgeGroup('junior_youth', false)).toBe(true);
  });

  it('forces minor=false for adult regardless of userChoice', () => {
    expect(isMinorForAgeGroup('adult')).toBe(false);
    expect(isMinorForAgeGroup('adult', true)).toBe(false);
  });

  it('returns userChoice for youth and unknown', () => {
    expect(isMinorForAgeGroup('youth', false)).toBe(false);
    expect(isMinorForAgeGroup('youth', true)).toBe(true);
    expect(isMinorForAgeGroup('unknown', false)).toBe(false);
    expect(isMinorForAgeGroup('unknown', true)).toBe(true);
  });

  it('defaults userChoice to false when omitted', () => {
    expect(isMinorForAgeGroup('youth')).toBe(false);
    expect(isMinorForAgeGroup('unknown')).toBe(false);
  });
});

describe('ageGroupAllowsMinorToggle', () => {
  it('returns true only for youth and unknown', () => {
    expect(ageGroupAllowsMinorToggle('youth')).toBe(true);
    expect(ageGroupAllowsMinorToggle('unknown')).toBe(true);
    expect(ageGroupAllowsMinorToggle('child')).toBe(false);
    expect(ageGroupAllowsMinorToggle('junior_youth')).toBe(false);
    expect(ageGroupAllowsMinorToggle('adult')).toBe(false);
  });
});

describe('AGE_GROUP_LABELS', () => {
  it('renders cohort-specific labels and leaves "unknown" empty', () => {
    expect(AGE_GROUP_LABELS.child).toBe('Child');
    expect(AGE_GROUP_LABELS.junior_youth).toBe('Junior Youth');
    expect(AGE_GROUP_LABELS.youth).toBe('Youth');
    expect(AGE_GROUP_LABELS.adult).toBe('Adult');
    expect(AGE_GROUP_LABELS.unknown).toBe('');
  });
});

describe('candidateLabelsFor', () => {
  it('puts nucleus and activity names ahead of age group', () => {
    const labels = candidateLabelsFor(ctx({
      ageGroup: 'adult',
      nucleusNames: ['Springbank Fireside'],
      activityNames: ['Tuesday Devotional'],
    }));
    expect(labels.slice(0, 3)).toEqual(['Springbank Fireside', 'Tuesday Devotional', 'Adult']);
  });

  it('renders "(under 18)" only when a youth is also flagged minor', () => {
    expect(candidateLabelsFor(ctx({ ageGroup: 'youth', isMinor: true }))).toContain('Youth (under 18)');
    expect(candidateLabelsFor(ctx({ ageGroup: 'youth', isMinor: false }))).toContain('Youth');
    expect(candidateLabelsFor(ctx({ ageGroup: 'youth', isMinor: false }))).not.toContain('Youth (under 18)');
  });

  it('does not include an age label when ageGroup is unknown', () => {
    const labels = candidateLabelsFor(ctx({ ageGroup: 'unknown' }));
    for (const l of labels) {
      expect(l).not.toBe(AGE_GROUP_LABELS.unknown);
    }
  });

  it('includes "attends with X" and "provisional profile" when applicable', () => {
    const labels = candidateLabelsFor(ctx({
      attendsWith: ['Maria Sanchez'],
      profileStatus: 'provisional',
    }));
    expect(labels).toContain('attends with Maria Sanchez');
    expect(labels).toContain('provisional profile');
  });

  it('falls back to phone when email is missing', () => {
    expect(candidateLabelsFor(ctx({ email: null, phone: '555-1234' }))).toContain('555-1234');
    expect(candidateLabelsFor(ctx({ email: 'a@b.c', phone: '555-1234' }))).toContain('a@b.c');
    expect(candidateLabelsFor(ctx({ email: 'a@b.c', phone: '555-1234' }))).not.toContain('555-1234');
  });
});

describe('pickDistinguishingLabels', () => {
  it('picks no labels when there is only one match', () => {
    const out = pickDistinguishingLabels([
      ctx({ id: 'a', nucleusNames: ['Nuc1'], ageGroup: 'adult' }),
    ]);
    // Single matches show one label as a small hint at most.
    expect(out.a.length).toBeLessThanOrEqual(1);
  });

  it('differentiates two same-name people by their nuclei', () => {
    const out = pickDistinguishingLabels([
      ctx({ id: 'a', nucleusNames: ['Springbank Fireside'], ageGroup: 'adult' }),
      ctx({ id: 'b', nucleusNames: ['Junior Youth Group'], ageGroup: 'junior_youth', isMinor: true }),
    ]);
    expect(out.a[0]).toBe('Springbank Fireside');
    expect(out.b[0]).toBe('Junior Youth Group');
  });

  it('falls through to age group when nuclei coincide', () => {
    const out = pickDistinguishingLabels([
      ctx({ id: 'a', nucleusNames: ['Springbank Fireside'], ageGroup: 'adult' }),
      ctx({ id: 'b', nucleusNames: ['Springbank Fireside'], ageGroup: 'junior_youth', isMinor: true }),
    ]);
    expect(out.a).toContain('Adult');
    expect(out.b).toContain('Junior Youth');
  });

  it('skips shared candidates and prefers ones that actually differ', () => {
    // Both Zaphods share the same nucleus AND the same activity, but
    // differ on age group. With a fixed-priority algorithm the second
    // label would be the (shared) activity name and the rows would
    // still look identical. We expect the picker to skip past shared
    // candidates and surface the differing age group instead.
    const out = pickDistinguishingLabels([
      ctx({
        id: 'a',
        nucleusNames: ['Nucleus 1'],
        activityNames: ['Study Circle A'],
        ageGroup: 'adult',
      }),
      ctx({
        id: 'b',
        nucleusNames: ['Nucleus 1'],
        activityNames: ['Study Circle A'],
        ageGroup: 'junior_youth',
        isMinor: true,
      }),
    ]);
    expect(out.a).toContain('Adult');
    expect(out.b).toContain('Junior Youth');
    expect(out.a.join(' ')).not.toBe(out.b.join(' '));
  });

  it('never assigns more than maxLabelsPerRow labels', () => {
    const out = pickDistinguishingLabels([
      ctx({ id: 'a', nucleusNames: ['N1'], activityNames: ['A1'], ageGroup: 'adult' }),
      ctx({ id: 'b', nucleusNames: ['N1'], activityNames: ['A1'], ageGroup: 'adult' }),
    ], 2);
    expect(out.a.length).toBeLessThanOrEqual(2);
    expect(out.b.length).toBeLessThanOrEqual(2);
  });
});
