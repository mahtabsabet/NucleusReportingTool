export type EngagementLevel = 'aware' | 'participating' | 'supporting' | 'coordinating';
export type ActivityType = 'children_class' | 'junior_youth' | 'study_circle' | 'devotional' | 'fireside' | 'other';
export type ParticipantRole = 'teacher' | 'animator' | 'tutor' | 'child' | 'junior_youth' | 'parent' | 'host' | 'attendee' | 'participant' | 'other';
export type PermissionRole = 'cluster_coordinator' | 'nucleus_collaborator' | 'activity_lead' | 'viewer';
export type CourseStatus = 'in_progress' | 'completed';
export type EventLogType = 'activity_created' | 'participant_added' | 'participant_removed' | 'circle_movement' | 'course_completed' | 'course_started' | 'person_created' | 'nucleus_created' | 'session_logged' | 'profile_updated';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          is_admin: boolean;
          person_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      clusters: {
        Row: {
          id: string;
          name: string;
          center_lat: number;
          center_lng: number;
          zoom: number;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['clusters']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['clusters']['Insert']>;
      };
      nuclei: {
        Row: {
          id: string;
          cluster_id: string;
          name: string;
          lat: number;
          lng: number;
          notes: string | null;
          banner_image_url: string | null;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['nuclei']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['nuclei']['Insert']>;
      };
      persons: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          is_minor: boolean;
          capacities: string[];
          notes: string | null;
          profile_image_url: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['persons']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['persons']['Insert']>;
      };
      nucleus_enrollments: {
        Row: {
          id: string;
          person_id: string;
          nucleus_id: string;
          engagement_level: EngagementLevel;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['nucleus_enrollments']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['nucleus_enrollments']['Insert']>;
      };
      courses: {
        Row: {
          id: string;
          name: string;
          short_name: string;
          description: string | null;
          order: number;
          is_active: boolean;
        };
        Insert: Omit<Database['public']['Tables']['courses']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['courses']['Insert']>;
      };
      course_enrollments: {
        Row: {
          id: string;
          person_id: string;
          course_id: string;
          status: CourseStatus;
          started_at: string | null;
          completed_at: string | null;
          nucleus_id: string | null;
        };
        Insert: Omit<Database['public']['Tables']['course_enrollments']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['course_enrollments']['Insert']>;
      };
      activities: {
        Row: {
          id: string;
          nucleus_id: string;
          name: string;
          type: ActivityType;
          schedule_day_of_week: number | null;
          schedule_time: string | null;
          schedule_interval_weeks: number | null;
          schedule_notes: string | null;
          location: string | null;
          current_course_id: string | null;
          is_active: boolean;
          notes: string | null;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['activities']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['activities']['Insert']>;
      };
      activity_participants: {
        Row: {
          id: string;
          activity_id: string;
          person_id: string;
          role: ParticipantRole;
          role_notes: string | null;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['activity_participants']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['activity_participants']['Insert']>;
      };
      sessions: {
        Row: {
          id: string;
          activity_id: string;
          date: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sessions']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>;
      };
      session_attendance: {
        Row: {
          id: string;
          session_id: string;
          person_id: string;
          attended: boolean;
          notes: string | null;
        };
        Insert: Omit<Database['public']['Tables']['session_attendance']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['session_attendance']['Insert']>;
      };
      user_permissions: {
        Row: {
          id: string;
          user_id: string;
          role: PermissionRole;
          cluster_id: string | null;
          nucleus_id: string | null;
          activity_id: string | null;
        };
        Insert: Omit<Database['public']['Tables']['user_permissions']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['user_permissions']['Insert']>;
      };
      timeline_cycles: {
        Row: {
          id: string;
          label: string;
          start_date: string;
          end_date: string;
          cluster_id: string | null;
        };
        Insert: Omit<Database['public']['Tables']['timeline_cycles']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['timeline_cycles']['Insert']>;
      };
      timeline_events: {
        Row: {
          id: string;
          name: string;
          start_date: string;
          end_date: string | null;
          cluster_id: string | null;
          nucleus_id: string | null;
          location: string | null;
        };
        Insert: Omit<Database['public']['Tables']['timeline_events']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['timeline_events']['Insert']>;
      };
      event_log: {
        Row: {
          id: string;
          timestamp: string;
          type: EventLogType;
          cluster_id: string | null;
          nucleus_id: string | null;
          activity_id: string | null;
          person_id: string | null;
          user_id: string | null;
          description: string;
          details: Record<string, unknown> | null;
        };
        Insert: Omit<Database['public']['Tables']['event_log']['Row'], 'id' | 'timestamp'> & { id?: string; timestamp?: string };
        Update: never; // event_log is append-only
      };
    };
  };
}
