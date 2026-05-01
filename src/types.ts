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

export interface TimelineEvent {
  id: string;
  name: string;
  startDate: Date;
  endDate?: Date;
  clusterId?: string;
  nucleusId?: string;
  location?: string;
}