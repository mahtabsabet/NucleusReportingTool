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
  completed?: boolean;
  schedule?: string;
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
  location?: string;
  meetingType?: string;
  attendees: string[];
  createdBy?: string;
  createdAt?: Date;
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