export interface Participant {
  id: string;
  name: string;
  nuclei: string[];
  engagementLevel: 'aware' | 'participating' | 'supporting' | 'coordinating';
  courses: Course[];
  capacities: string[];
  activities: ActivityParticipation[];
}

export interface Course {
  id: string;
  name: string;
  status: 'completed' | 'in-progress';
}

export interface ActivityParticipation {
  activityId: string;
  activityName: string;
  nucleusId: string;
  role: string;
}

// Lifecycle for an activity. The system preserves completed and
// cancelled activities historically rather than deleting them —
// the dashboard and reports filter on this column instead of
// hiding rows behind a soft-delete.
export type ActivityLifecycle =
  | 'planned'
  | 'active'
  | 'completed'
  | 'cancelled';

// Scheduling mode the user picked for the activity. The three
// modes are mutually exclusive at the data level — the UI only
// asks for the fields that apply to the chosen mode, and the
// nucleus timeline only auto-populates entries when the chosen
// mode carries enough structured information to do so.
export type ActivitySchedulingMode =
  | 'structured_recurring'  // recurring meetings (children's classes, devotionals, JY groups…)
  | 'sporadic_ongoing'      // ongoing but irregular (accompaniment, service)
  | 'short_duration';       // finite start/end (camps, intensives)

export interface Activity {
  id: string;
  nucleusId: string;
  name: string;
  type:
  'children-class' |
  'junior-youth' |
  'study-circle' |
  'devotional' |
  'other';
  participants: {
    [role: string]: string[]; // role -> participant IDs
  };
  currentBook?: string;
  /** @deprecated use `lifecycle` instead */
  completed?: boolean;
  // Lifecycle state — defaults to 'active' when omitted (for back-
  // compat with older callers that only know about `is_active`).
  lifecycle: ActivityLifecycle;
  schedulingMode: ActivitySchedulingMode;
  // Free-text description; the primary schedule field for
  // sporadic_ongoing, and a fallback caption for the other modes.
  schedule?: string;
  // Structured recurring fields (0 = Sunday … 6 = Saturday). The
  // array supports multi-day activities (e.g. "Tue + Thu").
  daysOfWeek?: number[];
  time?: string;             // "HH:MM" (24-hour)
  intervalWeeks?: number;    // 1 = weekly, 2 = biweekly, 4 ≈ monthly
  // Short-duration fields. Optional on structured_recurring
  // activities too — start_date represents "began on", end_date
  // becomes set when a recurring activity is marked completed.
  startDate?: Date;
  endDate?: Date;
  completedAt?: Date;
  notes?: string;
}

export interface Cluster {
  id: string;
  name: string;
  center: {lat: number;lng: number;};
  zoom: number;
}

export interface Nucleus {
  id: string;
  clusterId: string;
  name: string;
  location: {
    lat: number;
    lng: number;
  };
  activities: Activity[];
  engagementCounts: {
    coordinating: number;
    supporting: number;
    participating: number;
    aware: number;
  };
}

export interface TimelineCycle {
  id: string;
  startDate: Date;
  endDate: Date;
  label: string;
}

// Timeline items come in two shapes: long-running events (e.g. an
// expansion phase, intensive, campaign) and discrete meetings (e.g.
// reflection meeting, cluster coordination meeting). The legacy
// table name is `timeline_events`; we keep the React-side type name
// `TimelineEvent` for the same reason — both stand for the
// generalized "timeline item".
export type TimelineItemType = 'event' | 'meeting';

export interface TimelineEvent {
  id: string;
  itemType: TimelineItemType;
  name: string;
  startDate: Date;
  endDate?: Date;
  // Optional time-of-day for meetings; events typically span days
  // and leave this null.
  startTime?: string;
  clusterId?: string;
  nucleusId?: string;
  // When this timeline row was auto-generated from an activity,
  // activityId points back to the source. The nucleus timeline
  // uses this to navigate from the strip to the activity detail
  // page and to render a subtle "auto-generated" affordance so
  // editors aren't surprised when a manual edit gets re-synced.
  activityId?: string;
  location?: string;
  meetingType?: string;
  attendees: string[];
  createdBy?: string;
  createdAt?: Date;
}

// ─── Reflective Learning System ──────────────────────────────
//
// Two append-only layers — Activity Notebook and Nucleus Journal
// — bound together by a shared set of learning themes ("Objects
// of Learning") owned by each nucleus.

export type LearningThemeStatus = 'emerging' | 'established' | 'archived';

export interface LearningTheme {
  id: string;
  nucleusId: string;
  clusterThemeId?: string;
  name: string;
  description?: string;
  color: string;
  status: LearningThemeStatus;
  proposedBy?: string;
  proposedAt: Date;
  promotedAt?: Date;
  mergedIntoId?: string;
  // Populated by aggregating queries; absent on plain reads.
  entryCount?: number;
}

// Cluster-level canonical theme. Every learning_theme links to one
// of these (auto-linked by trigger on name match within the
// cluster). The Cluster Learning Hub is organised by these.
export interface ClusterTheme {
  id: string;
  clusterId: string;
  name: string;
  description?: string;
  color: string;
  // 0–100 slider value indicating how consolidated this learning
  // is in the cluster coordinator's judgement.
  consolidationLevel: number;
  createdAt: Date;
  archivedAt?: Date;
  // Aggregates populated by Hub-specific queries.
  nucleusCount?: number;
  entryCount?: number;
  lastEntryAt?: Date;
}

// One nucleus's contribution to a cluster theme.
export interface NucleusContribution {
  nucleusId: string;
  nucleusName: string;
  entryCount: number;
  lastEntryAt?: Date;
}

export type JournalEntrySource = 'activity' | 'nucleus' | 'cluster';

export interface JournalEntry {
  id: string;
  nucleusId?: string;
  source: JournalEntrySource;
  activityId?: string;
  activityName?: string;
  clusterId?: string;
  clusterThemeId?: string;
  nucleusName?: string;
  authorId?: string;
  authorName?: string;
  occurredAt: Date;
  createdAt: Date;
  editedAt?: Date;
  editedByName?: string;
  // Activity-style prompts (all optional)
  whatHappened?: string;
  encouragingSigns?: string;
  challenges?: string;
  peopleEmerging?: string;
  followUp?: string;
  // Nucleus-style free narrative
  body?: string;
  themes: LearningTheme[];
}

// One attachment on a timeline item. Kind discriminates the body
// shape — text vs. uploaded document vs. external link — without
// forcing each attachment into a single blob column.
export type TimelineItemNoteKind = 'text' | 'document' | 'link';

export interface TimelineItemNote {
  id: string;
  timelineItemId: string;
  kind: TimelineItemNoteKind;
  title?: string;
  bodyText?: string;
  filePath?: string;
  fileName?: string;
  fileMime?: string;
  fileSizeBytes?: number;
  linkUrl?: string;
  linkLabel?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: Date;
}