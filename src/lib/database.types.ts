export type AgeGroup = 'child' | 'junior_youth' | 'youth' | 'adult' | 'unknown';
export type ProfileStatus = 'provisional' | 'confirmed';
export type EngagementLevel = 'aware' | 'participating' | 'supporting' | 'coordinating';
export type ActivityType = 'children_class' | 'junior_youth' | 'study_circle' | 'devotional' | 'fireside' | 'other';
export type ParticipantRole = 'teacher' | 'animator' | 'tutor' | 'child' | 'junior_youth' | 'parent' | 'host' | 'attendee' | 'participant' | 'other';
export type PermissionRole = 'cluster_coordinator' | 'nucleus_collaborator' | 'activity_lead' | 'viewer';
export type CompletionStatus = 'in_progress' | 'partially_completed' | 'completed';
export type CurriculumStream = 'ruhi_main' | 'branch' | 'jysep';
export type ActivityLifecycleEnum = 'planned' | 'active' | 'completed' | 'cancelled';
export type ActivitySchedulingModeEnum = 'structured_recurring' | 'sporadic_ongoing' | 'short_duration';
export type ActivityParticipantStatusEnum = 'active' | 'inactive';
export type ActivityOccurrenceStatusEnum = 'did_not_occur' | 'dismissed';
export type EventLogType = 'activity_created' | 'participant_added' | 'participant_removed' | 'circle_movement' | 'course_completed' | 'course_started' | 'person_created' | 'person_deleted' | 'nucleus_created' | 'nucleus_deleted' | 'activity_deleted' | 'session_logged' | 'profile_updated' | 'permission_request_submitted' | 'permission_request_resolved' | 'user_role_changed' | 'user_deleted' | 'participant_marked_inactive' | 'participant_reactivated';

export type PermissionRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          is_admin: boolean;
          is_super_admin: boolean;
          is_regional_viewer: boolean;
          person_id: string | null;
          profile_image_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'is_super_admin' | 'is_regional_viewer' | 'profile_image_url'> & {
          created_at?: string;
          is_super_admin?: boolean;
          is_regional_viewer?: boolean;
          profile_image_url?: string | null;
        };
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
          age_group: AgeGroup;
          profile_status: ProfileStatus;
          capacities: string[];
          notes: string | null;
          profile_image_url: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['persons']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['persons']['Insert']>;
      };
      cluster_capacities: {
        Row: {
          id: string;
          cluster_id: string;
          name: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['cluster_capacities']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['cluster_capacities']['Insert']>;
      };
      person_capacities: {
        Row: {
          person_id: string;
          capacity_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['person_capacities']['Row'], 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['person_capacities']['Insert']>;
      };
      nucleus_enrollments: {
        Row: {
          id: string;
          person_id: string;
          nucleus_id: string;
          engagement_level: EngagementLevel | null;
          primary_contact_id: string | null;
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
          stream: CurriculumStream;
          parent_course_id: string | null;
          allows_whole_completion: boolean;
          is_active: boolean;
        };
        Insert: Omit<Database['public']['Tables']['courses']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['courses']['Insert']>;
      };
      course_units: {
        Row: {
          id: string;
          course_id: string;
          name: string;
          order: number;
          is_placeholder: boolean;
        };
        Insert: Omit<Database['public']['Tables']['course_units']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['course_units']['Insert']>;
      };
      course_enrollments: {
        Row: {
          id: string;
          person_id: string;
          course_id: string;
          status: CompletionStatus;
          started_at: string | null;
          completed_at: string | null;
          nucleus_id: string | null;
        };
        Insert: Omit<Database['public']['Tables']['course_enrollments']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['course_enrollments']['Insert']>;
      };
      course_unit_enrollments: {
        Row: {
          id: string;
          person_id: string;
          course_unit_id: string;
          status: CompletionStatus;
          started_at: string | null;
          completed_at: string | null;
          nucleus_id: string | null;
        };
        Insert: Omit<Database['public']['Tables']['course_unit_enrollments']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['course_unit_enrollments']['Insert']>;
      };
      activities: {
        Row: {
          id: string;
          nucleus_id: string;
          name: string;
          type: ActivityType;
          schedule_day_of_week: number | null;
          schedule_days_of_week: number[];
          schedule_time: string | null;
          schedule_interval_weeks: number | null;
          schedule_notes: string | null;
          location: string | null;
          current_course_id: string | null;
          is_active: boolean;
          lifecycle_state: ActivityLifecycleEnum;
          scheduling_mode: ActivitySchedulingModeEnum;
          start_date: string | null;
          end_date: string | null;
          completed_at: string | null;
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
          status: ActivityParticipantStatusEnum;
          status_changed_at: string | null;
          status_changed_by: string | null;
          last_reviewed_at: string | null;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['activity_participants']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['activity_participants']['Insert']>;
      };
      activity_occurrence_log: {
        Row: {
          id: string;
          activity_id: string;
          occurrence_date: string;
          status: ActivityOccurrenceStatusEnum;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['activity_occurrence_log']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['activity_occurrence_log']['Insert']>;
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
          activity_id: string | null;
          location: string | null;
        };
        Insert: Omit<Database['public']['Tables']['timeline_events']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['timeline_events']['Insert']>;
      };
      permission_requests: {
        Row: {
          id: string;
          target_type: string;
          target_id: string | null;
          action: string;
          payload: Record<string, unknown> | null;
          note: string | null;
          cluster_id: string | null;
          nucleus_id: string | null;
          activity_id: string | null;
          requested_by: string | null;
          requested_at: string;
          status: PermissionRequestStatus;
          resolved_by: string | null;
          resolved_at: string | null;
          resolution_note: string | null;
        };
        Insert: Omit<Database['public']['Tables']['permission_requests']['Row'], 'id' | 'requested_at' | 'status' | 'resolved_by' | 'resolved_at' | 'resolution_note'> & {
          id?: string;
          requested_at?: string;
          status?: PermissionRequestStatus;
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
        };
        Update: Partial<Database['public']['Tables']['permission_requests']['Insert']>;
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
