# Data Model & Permissions Design

## Recommended Backend: Supabase

Supabase (PostgreSQL + Auth + Row Level Security + Storage) fits well here:
- Built-in auth with email/password or magic links
- Row Level Security (RLS) enforces the permission rules at the database level — lower-permission users literally cannot query data outside their scope
- PostgreSQL handles all the relational integrity we need
- Real-time subscriptions available if we want live updates across users
- Supabase Storage for banner and profile images (organized into buckets: `nucleus-banners`, `person-profiles`)

---

## Entities

### User
Managed by Supabase Auth. Extended with a `profiles` table.

| Field | Type | Notes |
|---|---|---|
| id | uuid | from auth.users |
| name | text | display name |
| email | text | from auth.users |
| is_admin | boolean | global admin flag |
| person_id | uuid → Person | nullable — links this User to a Person record if they are also a tracked participant |

> A Person and a User are separate concepts. Most people tracked in the system will never log in. But some people — like a nucleus coordinator who is also a children's class teacher and a devotional participant — will have both a User account *and* a Person record. The `person_id` field on User makes that link explicit.

### UserPermission
Grants a user a role scoped to a specific cluster, nucleus, or activity. A user can have multiple permission rows (e.g., nucleus collaborator in two nuclei, plus activity lead for a specific activity).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid → User | |
| role | enum | `cluster_coordinator`, `nucleus_collaborator`, `activity_lead`, `viewer` |
| cluster_id | uuid → Cluster | nullable |
| nucleus_id | uuid → Nucleus | nullable |
| activity_id | uuid → Activity | nullable |

Exactly one of `cluster_id`, `nucleus_id`, `activity_id` should be set per row, matching the role type.

---

### Cluster
A geographic grouping of nuclei (e.g., Calgary, Edmonton).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | |
| center_lat | float | for map centering |
| center_lng | float | |
| zoom | int | default map zoom level |
| deleted_at | timestamp | nullable — soft delete |

### Nucleus
A neighbourhood community unit within a cluster.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| cluster_id | uuid → Cluster | |
| name | text | |
| lat | float | |
| lng | float | |
| notes | text | free-form notes |
| banner_image_url | text | nullable — stored in Supabase Storage (`nucleus-banners` bucket) |
| deleted_at | timestamp | nullable — soft delete |

---

### Person
Anyone tracked in the system — a participant, teacher, parent, child, etc. Not the same as a User, but may be linked to one.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | first name only — see privacy note below |
| email | text | nullable — never collect for minors |
| phone | text | nullable — never collect for minors |
| is_minor | boolean | default false — flags children and junior youth |
| notes | text | free-form notes |
| profile_image_url | text | nullable — stored in Supabase Storage (`person-profiles` bucket) |
| created_at | timestamp | |
| deleted_at | timestamp | nullable — soft delete |

> **Privacy — Children's Data:** For anyone flagged `is_minor = true`, collect **first name only**. No age, no contact information. The parent/guardian relationship is captured via the `ActivityParticipant` role (role = `parent`), so the child's record itself stays minimal. The app should enforce this in the UI by hiding email/phone fields when `is_minor` is true. This aligns with Alberta's PIPA obligations around collecting only what is necessary. A privacy policy should be in place before real user data is onboarded.

### NucleusEnrollment
Links a Person to a Nucleus, capturing their engagement level **within that specific nucleus**. A person can be enrolled in multiple nuclei with different engagement levels in each.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| person_id | uuid → Person | |
| nucleus_id | uuid → Nucleus | |
| engagement_level | enum | `aware`, `participating`, `supporting`, `coordinating` |
| deleted_at | timestamp | nullable — use to remove someone from a nucleus without destroying history |

> `engagement_level` is the concentric-circle position for this person within this nucleus. There is no single global engagement level on a person — it always depends on the nucleus context.

---

### Course
A catalog of institute courses (Ruhi books, etc.). Only admins can add or retire courses.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | e.g. "Book 1: Reflections on the Life of the Spirit" |
| short_name | text | e.g. "Book 1" |
| description | text | nullable |
| order | int | for display sorting (Book 1 = 1, Book 2 = 2, etc.) |
| is_active | boolean | admins can retire courses without deleting them |

### CourseEnrollment
Tracks a Person's progress through a Course.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| person_id | uuid → Person | |
| course_id | uuid → Course | |
| status | enum | `in_progress`, `completed` |
| started_at | date | nullable |
| completed_at | date | nullable |
| nucleus_id | uuid → Nucleus | nullable — which nucleus context this course was taken in |

---

### Activity
A standing, recurring activity within a nucleus (e.g., "Children's Class - Taradale"). Each individual occurrence is a Session.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| nucleus_id | uuid → Nucleus | |
| name | text | |
| type | enum | `children_class`, `junior_youth`, `study_circle`, `devotional`, `fireside`, `other` |
| schedule_day_of_week | int | nullable, 0=Sunday … 6=Saturday |
| schedule_time | time | nullable |
| schedule_interval_weeks | int | nullable, 1=weekly, 2=biweekly, etc. |
| schedule_notes | text | human-readable fallback, e.g. "Every other Friday at 7:00 PM" |
| current_course_id | uuid → Course | nullable, relevant for study circles |
| location | text | nullable — free text, e.g. "At Bob's house", "123 Main St NE", "Online via Zoom" |
| is_active | boolean | allows archiving without deleting |
| notes | text | |
| deleted_at | timestamp | nullable — soft delete |

> **Schedule design:** The structured fields (`schedule_day_of_week`, `schedule_time`, `schedule_interval_weeks`) allow the app to compute upcoming session dates and eventually send push notifications or email reminders. `schedule_notes` is for display when the structured fields don't cover an irregular pattern. Both can be populated — structured fields drive logic, notes drive display.

### ActivityParticipant
The standing roster for an activity — who regularly participates and in what role. Separate from per-session attendance.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| activity_id | uuid → Activity | |
| person_id | uuid → Person | |
| role | enum | `teacher`, `animator`, `tutor`, `child`, `junior_youth`, `parent`, `host`, `attendee`, `participant`, `other` |
| role_notes | text | nullable — required context when role = `other` |
| deleted_at | timestamp | nullable — soft delete, preserves history |

---

### Session
A single occurrence of an Activity — one instance of the class, gathering, or circle.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| activity_id | uuid → Activity | |
| date | date | |
| notes | text | log of what happened — topics covered, observations, reflections |
| created_by | uuid → User | who logged this session |
| created_at | timestamp | |

### SessionAttendance
Who actually attended a specific Session.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| session_id | uuid → Session | |
| person_id | uuid → Person | |
| attended | boolean | default true — can mark someone absent if needed |
| notes | text | nullable — per-person note for this session |

---

### TimelineCycle
Planning cycles (typically 3-month intervals). Can be global or scoped to a cluster.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| label | text | e.g. "Cycle 1" |
| start_date | date | |
| end_date | date | |
| cluster_id | uuid → Cluster | nullable — null means applies to all clusters |

### TimelineEvent
A significant event on the timeline (camps, gatherings, campaigns, etc.).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | |
| start_date | date | |
| end_date | date | nullable |
| cluster_id | uuid → Cluster | nullable |
| nucleus_id | uuid → Nucleus | nullable |
| location | text | nullable |

---

### EventLog
Immutable audit trail of meaningful changes. Written by the application, never edited or deleted.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| timestamp | timestamp | |
| type | enum | `activity_created`, `participant_added`, `participant_removed`, `circle_movement`, `course_completed`, `course_started`, `person_created`, `nucleus_created`, `session_logged`, `profile_updated` |
| cluster_id | uuid | nullable |
| nucleus_id | uuid | nullable |
| activity_id | uuid | nullable |
| person_id | uuid | nullable |
| user_id | uuid | nullable — which User made the change |
| description | text | human-readable summary |
| details | jsonb | structured payload |

---

## Relationships Summary

```
Cluster ──< Nucleus ──< Activity ──< ActivityParticipant >── Person
                                └──< Session ──< SessionAttendance >── Person

Person ──< NucleusEnrollment >── Nucleus    (engagement level is per-nucleus)
Person ──< CourseEnrollment  >── Course     (progress per course)

User (optional) ──── Person                (a user may also be a tracked person)
User ──< UserPermission >── Cluster | Nucleus | Activity
```

---

## Permissions Model

### Role Hierarchy
Permissions are cumulative — each role inherits everything the roles below it can do.

```
Admin
  └── Cluster Coordinator
        └── Nucleus Collaborator
              └── Activity Lead
                    └── Viewer
```

### What Each Role Can Do

| Action | Viewer | Activity Lead | Nucleus Collaborator | Cluster Coordinator | Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| View reports & dashboards (within scope) | ✓ | ✓ | ✓ | ✓ | ✓ |
| View full person profiles (for people in their scope) | ✓ | ✓ | ✓ | ✓ | ✓ |
| View course history of participants (in their scope) | ✓ | ✓ | ✓ | ✓ | ✓ |
| View a person's enrollment & activities in other nuclei (read-only) | | ✓ | ✓ | ✓ | ✓ |
| Create a Person | | ✓ | ✓ | ✓ | ✓ |
| Add/remove people from their activity | | ✓ | ✓ | ✓ | ✓ |
| Log sessions + attendance | | ✓ | ✓ | ✓ | ✓ |
| Edit participant profiles (within their scope) | | ✓ | ✓ | ✓ | ✓ |
| Manage activities within a nucleus | | | ✓ | ✓ | ✓ |
| Update engagement levels within a nucleus | | | ✓ | ✓ | ✓ |
| Update nucleus notes | | | ✓ | ✓ | ✓ |
| Assign Activity Lead for activities in their nucleus | | | ✓ | ✓ | ✓ |
| Assign Nucleus Collaborator for nuclei in their cluster | | | | ✓ | ✓ |
| Manage nuclei within a cluster | | | | ✓ | ✓ |
| View all data within a cluster | | | | ✓ | ✓ |
| Manage courses catalog | | | | | ✓ |
| Manage users & permissions | | | | | ✓ |
| View all data globally | | | | | ✓ |

### Scope Rules (what data each role can see)

**Viewer** — read-only, cannot edit anything. Can be scoped to a cluster or to one or more specific nuclei. If scoped to a cluster, they can view all nuclei within it.

**Activity Lead** — scoped to their assigned activity for editing, but with broader read access:
- Can add/remove people from their activity roster
- Can log sessions and record attendance
- Can edit basic profile fields for people in their activity
- Can **read** a person's full profile — including course history and their enrollment/activities in other nuclei — for anyone on their roster
- Cannot **edit** anything outside their own activity's scope

**Nucleus Collaborator** — scoped to their assigned nucleus for editing, with full read on people in their nucleus:
- All Activity Lead permissions for every activity in the nucleus
- Can create new activities in their nucleus
- Can update engagement levels (NucleusEnrollment) for people in their nucleus
- Can assign the Activity Lead role to a user for any activity within their nucleus
- Can view **all data** about any person enrolled in their nucleus — including that person's activities, sessions, and enrollment in other nuclei. The edit restriction applies: they can only modify data within their own nucleus.

**Cluster Coordinator** — scoped to their assigned cluster:
- All Nucleus Collaborator permissions for every nucleus in the cluster
- Can create new nuclei in their cluster
- Can assign the Nucleus Collaborator role to a user for any nucleus within their cluster
- Can search and view all people within their cluster
- Cannot see other clusters

**Admin** — no restrictions. Can also:
- Manage the Course catalog
- Assign and revoke user permissions
- View and manage all clusters, nuclei, people globally

---

## Cross-Nucleus Person Visibility

**Nucleus Collaborators** can see the full picture of any person enrolled in their nucleus — including that person's engagement levels, activities, and sessions in other nuclei. Their edit access remains restricted to their own nucleus; they cannot modify another nucleus's data, but they have full read visibility into the whole person.

**Activity Leads** can read a person's full profile for anyone on their activity roster — including course history and enrollment/activities in other nuclei. They cannot edit anything outside their own activity's scope.

**Shared profile editing:** Any collaborator (or above) who has access to a person can edit that person's core profile fields (name, contact, notes, image). The EventLog tracks who made each change.

**Avoiding duplicate Person records:** When adding a new person, the app should allow searching for existing people first:
- Activity Leads: can search within the activity's nucleus only
- Nucleus Collaborators: can search by name within their cluster (to catch near-matches before creating a duplicate), but can only see limited info (name only) for people not yet in their nucleus
- Cluster Coordinators: can search within their cluster with full visibility
- Admins: global search

---

## Soft Delete Policy

All core entities include a `deleted_at` timestamp. A non-null value means the record is archived, not destroyed. This preserves the integrity of the EventLog and Session history — you can see that "Sara taught the class on March 3rd" even if Sara's record is later archived.

Hard deletes are never performed in the application layer.

---

## Still To Decide

1. **Notifications:** When we add push notifications / email reminders for upcoming sessions, we'll need a `NotificationPreference` table per user. Not needed for v1 but the structured schedule fields on Activity are already in place for it. See also `FUTURE_FEATURES.md`.
