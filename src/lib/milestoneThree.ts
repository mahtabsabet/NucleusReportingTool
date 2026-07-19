// ============================================================
// Milestone Three features
//
// The fixed set of capacities that characterise a cluster which has
// consolidated its progress at the third milestone, expressed here so
// they can be assessed for an individual *nucleus*. Each feature is
// scored 0–10 by nucleus collaborators on the nucleus's own page; the
// cluster "progress & connections" view averages a nucleus's scores
// into a single composite for positioning along the progress axis.
//
// `key` is the stable identifier persisted in
// nucleus_milestone_three_scores.feature_key — never change a key once
// data exists. Labels, blurbs, and anchor descriptors are free to edit;
// they are wording only.
//
// Anchors describe what 0 / 5 / 10 mean for each feature specifically,
// since a single generic scale ("Not present / Emerging / Established")
// doesn't read true across all eight.
// ============================================================

export interface MilestoneThreeFeature {
  key: string;
  /** Short user-facing label (slider heading). */
  label: string;
  /** One-line description of the feature. */
  blurb: string;
  /** Descriptor at each scale anchor. */
  anchors: {
    /** 0 */ none: string;
    /** 5 */ emerging: string;
    /** 10 */ established: string;
  };
}

export const MILESTONE_THREE_FEATURES: MilestoneThreeFeature[] = [
  {
    key: 'human_resources',
    label: 'Expanding pool of human resources',
    blurb: "The institute's programmes are sustained by a substantial and growing body of people.",
    anchors: {
      none: 'Few if any people are actively supporting the programmes.',
      emerging: 'A small but growing group sustains the programmes; the pool is starting to expand.',
      established: 'A substantial, steadily expanding pool of human resources supports the programmes.',
    },
  },
  {
    key: 'spreading_activity',
    label: 'Spreading intense activity more widely',
    blurb: 'Effort to help activity take root in more places — a new street, part of a neighbourhood, or a nearby locality.',
    anchors: {
      none: 'Intense activity is confined to where it began.',
      emerging: 'Effort is underway to extend activity into further pockets or nearby areas.',
      established: 'Several areas sustain intense activity of their own.',
    },
  },
  {
    key: 'embracing_numbers',
    label: 'Embracing numbers & managing complexity',
    blurb: 'Capacity to absorb growing numbers and coordinate them through both formal and informal arrangements.',
    anchors: {
      none: 'Only small numbers are involved; no arrangements for coordinating growth.',
      emerging: 'Numbers are rising; informal arrangements are beginning to manage the added complexity.',
      established: 'Large numbers are embraced smoothly through both formal and informal arrangements.',
    },
  },
  {
    key: 'effective_cycles',
    label: 'Sustaining effective cycles',
    blurb: 'A regular pulse of study, consultation, action, and reflection.',
    anchors: {
      none: 'No regular rhythm of study, consultation, action, and reflection.',
      emerging: 'Cycles occur but are irregular or missing elements.',
      established: 'A consistent, regular pulse of study, consultation, action, and reflection is sustained.',
    },
  },
  {
    key: 'periods_of_intensity',
    label: 'Periods of intensity',
    blurb: 'Injections of energy that propel the engagement of the widest possible circle of friends.',
    anchors: {
      none: 'No intensive phases; engagement stays within a fixed small circle.',
      emerging: 'Occasional bursts of intensity begin to draw in new friends.',
      established: 'Regular periods of intensity propel engagement of the widest possible circle of friends.',
    },
  },
  {
    key: 'community_undertakings',
    label: 'Community undertakings',
    blurb: 'Family festivals, junior youth camps, service projects, arts endeavours, and collective teaching, each on its own rhythm.',
    anchors: {
      none: 'Few or no community undertakings are taking place.',
      emerging: 'Some undertakings happen, but sporadically rather than on their own rhythm.',
      established: 'A range of undertakings proceed steadily, each according to its own rhythm.',
    },
  },
  {
    key: 'reflection_spaces',
    label: 'Reflection spaces generating action',
    blurb: 'Well-attended reflection gatherings whose quality is measured by the purposeful action arising from them.',
    anchors: {
      none: 'Reflection spaces are absent or poorly attended.',
      emerging: "Reflection gatherings occur and draw a fair number, though action doesn't always follow.",
      established: 'Well-attended reflection spaces are used deliberately and reliably generate purposeful action.',
    },
  },
  {
    key: 'resources_outward',
    label: 'Resources flowing outward',
    blurb: 'The nucleus generates resources that flow out to help surrounding areas make accelerated progress.',
    anchors: {
      none: 'Draws on outside help and sends none outward.',
      emerging: 'Becoming self-sustaining; starting to share resources beyond itself.',
      established: 'Generates resources that flow out to help surrounding neighbourhoods, nuclei, or clusters accelerate.',
    },
  },
];

export const MILESTONE_THREE_MAX = 10;

/** Look up a feature by its stable key. */
export function featureByKey(key: string): MilestoneThreeFeature | undefined {
  return MILESTONE_THREE_FEATURES.find(f => f.key === key);
}

/**
 * The composite progress score for a nucleus: the mean of the feature
 * scores that have been recorded. Features not yet scored are treated
 * as absent (not zero) so an unassessed nucleus reads as "not yet
 * assessed" rather than "stalled at zero". Returns null when nothing
 * has been recorded.
 */
export function computeComposite(scores: Array<{ score: number }>): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((acc, s) => acc + s.score, 0);
  return sum / scores.length;
}

export interface MilestoneLevel {
  key: 'unassessed' | 'not_present' | 'early' | 'emerging' | 'established';
  label: string;
  /** Solid hex for meters / node accents. */
  color: string;
  /** Tailwind text colour token. */
  text: string;
  /** Tailwind border token. */
  border: string;
  /** Tailwind background token. */
  bg: string;
}

// A sequential ramp from unassessed (slate) through to established
// (violet), echoing the previous tier palette at its top end.
const LEVELS: Record<MilestoneLevel['key'], MilestoneLevel> = {
  unassessed:  { key: 'unassessed',  label: 'Not yet assessed', color: '#94a3b8', text: 'text-slate-500', border: 'border-slate-300', bg: 'bg-slate-50' },
  not_present: { key: 'not_present', label: 'Not present',       color: '#f59e0b', text: 'text-amber-700', border: 'border-amber-300', bg: 'bg-amber-50' },
  early:       { key: 'early',       label: 'Early',             color: '#10b981', text: 'text-emerald-700', border: 'border-emerald-300', bg: 'bg-emerald-50' },
  emerging:    { key: 'emerging',    label: 'Emerging',          color: '#3b82f6', text: 'text-blue-700', border: 'border-blue-300', bg: 'bg-blue-50' },
  established: { key: 'established',  label: 'Established',       color: '#7c3aed', text: 'text-violet-700', border: 'border-violet-400', bg: 'bg-violet-50' },
};

/** Map a 0–10 composite (or null) to a named developmental level. */
export function milestoneLevel(composite: number | null): MilestoneLevel {
  if (composite === null) return LEVELS.unassessed;
  if (composite < 2.5) return LEVELS.not_present;
  if (composite < 5) return LEVELS.early;
  if (composite < 7.5) return LEVELS.emerging;
  return LEVELS.established;
}

// Continuous colour ramp for a 0–10 score, interpolating smoothly through
// the same stops as the named levels (amber → emerald → blue → violet) so
// dragging a slider produces a gradual colour shift rather than stepping
// between the four discrete level colours. The axis gradient in the
// cluster view uses the same stops.
const RAMP_STOPS: Array<[number, [number, number, number]]> = [
  [0, [245, 158, 11]],   // amber
  [4, [16, 185, 129]],   // emerald
  [7, [59, 130, 246]],   // blue
  [10, [124, 58, 237]],  // violet
];

export function progressColor(value: number): string {
  const v = Math.max(0, Math.min(MILESTONE_THREE_MAX, value));
  let lo = RAMP_STOPS[0];
  let hi = RAMP_STOPS[RAMP_STOPS.length - 1];
  for (let i = 0; i < RAMP_STOPS.length - 1; i++) {
    if (v >= RAMP_STOPS[i][0] && v <= RAMP_STOPS[i + 1][0]) {
      lo = RAMP_STOPS[i];
      hi = RAMP_STOPS[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0];
  const t = span === 0 ? 0 : (v - lo[0]) / span;
  const ch = (i: number) => Math.round(lo[1][i] + (hi[1][i] - lo[1][i]) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}
