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
| id | uuid | the only identifier — names are NOT unique |
| name | text | first name only — see privacy note below |
| email | text | nullable — never collect for minors |
| phone | text | nullable — never collect for minors |
| age_group | enum | `child`, `junior_youth`, `youth`, `adult`, `unknown` — program cohort |
| is_minor | boolean | derived: always true for child/junior_youth, always false for adult; user-settable for youth/unknown. Enforced by a check constraint on `persons`. |
| profile_status | enum | `provisional` for half-known people; `confirmed` once a nucleus/activity attachment exists. |
| notes | text | free-form notes |
| profile_image_url | text | nullable — stored in Supabase Storage (`person-profiles` bucket) |
| created_at | timestamp | |
| deleted_at | timestamp | nullable — soft delete |

> **Identity & duplicate names.** `id` is the only identifier; two people may share a name. When a user types a name that matches an existing record, the UI shows each match with contextual disambiguators (associated nucleus, activity, age group, "attends with X", profile status) and requires either an intentional selection or an explicit "this is a different person" action — never a silent auto-select. Disambiguators are drawn only from structural data (nucleus enrollments, activity participations, age group, profile status); appearance-based or subjective descriptions are not collected. See `src/lib/persons/disambiguators.ts`.

> **Age cohorts.** Reflect Bahá'í community structure: **Child** (≈ up to 10), **Junior Youth** (≈ 11–14), **Youth** (≈ 15–30 — wider than the legal definition of minor), **Adult**. Because Youth spans minor and adult ages, the create/edit form pairs a Youth selection with an optional "Under 18 (minor)" checkbox. Child and Junior Youth are always minors; Adult is never a minor; these are enforced both in the UI and by the `persons_age_minor_invariant` check constraint.

> **Privacy — Children's Data:** For anyone flagged `is_minor = true` (child / junior_youth / minor youth), the app collects **first name only**. No age, no contact information — email and phone are forced to `null` at the data-access layer whenever the resulting state is `is_minor = true`, regardless of what the caller submits. The parent/guardian relationship is captured via the `ActivityParticipant` role (role = `parent`), so the child's record itself stays minimal. This aligns with Alberta's PIPA obligations around collecting only what is necessary. A privacy policy should be in place before real user data is onboarded.

### Capacity (cluster-scoped catalog)
A capacity is a skill/service a person can offer (e.g. "teaches children's classes"). To stop spelling drift and rephrasings from fragmenting the stats, capacities are a **relational catalog scoped per cluster** rather than free text — each cluster maintains its own independent list.

- `cluster_capacities` — one canonical entry per `(cluster_id, lower(name))`. A unique index enforces case-insensitive uniqueness within the cluster.
- `person_capacities` — join table `(person_id, capacity_id)` recording which person holds which catalog entry. Because the entry carries the cluster, a person enrolled in nuclei across multiple clusters holds a separate entry per cluster.

On a profile, capacities are chosen from the relevant cluster's catalog via a dropdown; a "new capacity" option creates a catalog entry. **Renaming and merging** entries is a cluster-stewardship action: admins / super admins on any cluster, and a cluster's own coordinators on theirs — never across clusters (every row is pinned to a single `cluster_id`). See `src/lib/db/capacities.ts`, the `CapacityManagement` panel on the Cluster Profile, and migration `20260529_cluster_capacity_catalog.sql`.

> The legacy `persons.capacities` (`text[]`) column is retained but no longer read by the app — the migration backfills the catalog from it (deduping case-insensitively per cluster) without dropping it, so no data is lost for people who had capacities but no cluster to attach them to.

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
The curriculum catalog. A flexible, relational structure — the system does **not** hard-code "Books 1-7". Only admins can add or retire courses.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | e.g. "Book 1: Reflections on the Life of the Spirit" |
| short_name | text | e.g. "Book 1" |
| description | text | nullable |
| order | int | display sorting *within its stream / parent* |
| stream | enum | `ruhi_main` (the 14-book main sequence), `branch` (a branch course), `jysep` (a Junior Youth Spiritual Empowerment Program text) |
| parent_course_id | uuid → Course | nullable — for branch courses, points at the main-sequence book they hang off (Book 3 / Book 5) |
| allows_whole_completion | boolean | `false` for books whose unit set is not finalized (Books 12-14 carry a placeholder Unit 3) — those can only ever be marked partially complete |
| is_active | boolean | admins can retire courses without deleting them |

> **Three curriculum streams.** *Ruhi Main Sequence* — Books 1-14, each with units. *Branch Courses* — nested under Book 3 (Grades 2-4) and Book 5 (Initial Impulse, Widening Circle); they behave as independent courses for completion purposes but display nested beneath their parent. *JYSEP* — the 15 Junior Youth texts, tracked whole/partial with no units.

### CourseUnit
A unit of a Ruhi book. The unit count is **not** assumed to be 3 — Book 3 has 2, Books 12-14 carry a placeholder. JY texts and branch courses have no units.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| course_id | uuid → Course | |
| name | text | e.g. "Prayer" |
| order | int | unit order within the book |
| is_placeholder | boolean | reserves a slot for unreleased content (the future Unit 3 of Books 12-14) — displayable but never markable |

### CourseEnrollment
Tracks a Person's course-level progress. For a Ruhi book this is the **rollup** of the person's unit enrollments (maintained by the application layer); for JY texts and branch courses it is the whole-course status.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| person_id | uuid → Person | |
| course_id | uuid → Course | |
| status | enum | `in_progress`, `partially_completed`, `completed` |
| started_at | date | nullable |
| completed_at | date | nullable |
| nucleus_id | uuid → Nucleus | nullable — which nucleus context this course was taken in |

### CourseUnitEnrollment
Tracks a Person's progress through an individual Ruhi book unit. A person can mark a whole book complete, or mark specific units complete / partially complete.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| person_id | uuid → Person | |
| course_unit_id | uuid → CourseUnit | |
| status | enum | `in_progress`, `partially_completed`, `completed` |
| started_at | date | nullable |
| completed_at | date | nullable |
| nucleus_id | uuid → Nucleus | nullable — which nucleus context this unit was studied in |

> **Future group workflows.** `nucleus_id` on both enrollment tables and `Activity.current_course_id` (which can now point at a JY text or branch course) leave room for future study-circle / JY-group completion workflows — marking a whole group complete while selecting which participants completed, partially completed, or did not complete — without further schema changes.

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
Person ──< CourseEnrollment  >── Course     (course-level progress)
Person ──< CourseUnitEnrollment >── CourseUnit >── Course   (unit-level progress)
Course ──< Course            (branch courses via parent_course_id)

User (optional) ──── Person                (a user may also be a tracked person)
User ──< UserPermission >── Cluster | Nucleus | Activity
```

---

## Permissions Model

> **The canonical source for what each role can do is `src/lib/permissions.ts`.** UI option lists, action gates, and the `manage-user` / `create-user` Edge Functions all consume that module. This section summarises the model; if doc and code disagree, code wins.

### Roles

Six active roles. Three are **global** (boolean flags on `profiles`) and three are **scoped** (rows in `user_permissions` tying a user to a cluster / nucleus / activity). A single user holds at most one global flag and any number of scoped grants.

| Role | Storage | Scope |
|---|---|---|
| **Super Admin** | `profiles.is_super_admin` | Global. Bootstrap-only — cannot be created or assigned via the app. Typically exactly one exists. |
| **Administrator** | `profiles.is_admin` | Global. Full read + write everywhere. (Super Admins also have `is_admin = true`.) |
| **Regional (View-Only)** | `profiles.is_regional_viewer` | Global. Read everywhere; write nowhere. |
| **Cluster Coordinator** | `user_permissions` row with `cluster_id` | One cluster (per row). |
| **Nucleus Coordinator** | `user_permissions` row with `nucleus_id` | One nucleus. UI label is "Nucleus Coordinator"; the enum value is the legacy `nucleus_collaborator`. |
| **Activity Lead** | `user_permissions` row with `activity_id` | One activity. |

The `viewer` value in `permission_role_enum` is a legacy artefact and unused — Postgres doesn't support removing enum values in place, so it stays in the schema with a comment.

### Who can do what

Mostly cumulative within a scope hierarchy — a Cluster Coordinator can do everything a Nucleus Coordinator can do within their cluster, and so on. Exceptions are called out in the table.

| Action | Activity Lead | Nucleus Coord. | Cluster Coord. | Regional Viewer | Admin | Super Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View data within scope | own activity | own nucleus | own cluster | everywhere (read-only) | everywhere | everywhere |
| Add / remove activity participants | own activity | within nucleus | within cluster | | ✓ | ✓ |
| Manage nucleus enrollments | own activity's nucleus ¹ | within nucleus | within cluster | | ✓ | ✓ |
| Create persons (via activity flow) | own activity | within nucleus | within cluster | | ✓ | ✓ |
| Edit person profiles | own activity's people | within nucleus | within cluster | | ✓ | ✓ |
| Add a capacity to a profile (incl. new catalog entry) | own activity's people | within nucleus | within cluster | | ✓ | ✓ |
| Rename / merge capacities | | | within cluster | | any cluster ⁶ | any cluster ⁶ |
| Hard-delete persons | request only | request only | within cluster | | ✓ | ✓ |
| Create / edit / delete activities | | within nucleus | within cluster | | ✓ | ✓ |
| Create / delete nuclei | | | within cluster | | ✓ | ✓ |
| Add / edit timeline events, meetings, notes | | within nucleus | within cluster | | ✓ | ✓ |
| Edit timeline cycle dates | | | within cluster ² | | ✓ | ✓ |
| Create users (new accounts) | | within nucleus (Activity Lead only) | within cluster (CC / NC / AL) | | ✓ ³ | ✓ |
| Change a user's role | | within nucleus (assign Activity Lead) ⁴ | within cluster (assign CC / NC / AL) ⁴ | | ✓ ³ | ✓ |
| Delete a user entirely | | request only | request only | | ✓ ³ | ✓ |
| Reset another user's password | | | | | ✓ ⁵ | ✓ |
| Manage the course catalog | | | | | ✓ | ✓ |

¹ Via the auto-enroll step in `addPersonToActivity` — adding someone to an activity also enrolls them in the parent nucleus.
² Cycles are cluster-level administrative data. Nuclei inherit them and the cycle editor is hidden in nucleus mode for everyone.
³ Admin cannot touch other Admins or Super Admins; only a Super Admin can.
⁴ CC and NC change roles **directly** (no admin-review request step) within their scope. `ROLE_ASSIGNERS` narrows which roles each can hand out: CC may assign cluster_coordinator / nucleus_collaborator / activity_lead; NC may assign activity_lead.
⁵ Admin cannot reset another Admin's password — only a Super Admin can.
⁶ Capacity catalogs are independent per cluster, so rename/merge always acts within a single cluster — admins and super admins can steward any cluster's list, but cannot merge entries across clusters.

### Safeguards (apply regardless of role)

- A user cannot delete, demote, or change their own role through this interface.
- No one can promote anyone to Super Admin through the app.
- No one can demote a Super Admin through the app.
- Email-confirmation typing is required for deletes, role changes, and password resets.
- **Children's data:** any person flagged `is_minor = true` (child / junior_youth, or youth/unknown with the manual minor toggle) has email and phone forced to `NULL` at the data-access layer regardless of what the caller submits.

### Where the checks live

| Layer | Where |
|---|---|
| Canonical helpers (intent of record) | `src/lib/permissions.ts` — `actionPermission()`, `canChangeUserRoleDirectly()`, `canDeleteUserDirectly()`, `ROLE_ASSIGNERS`, scope helpers. |
| UI gating (what buttons appear) | `src/components/UserManagement.tsx` for user management; per-feature components for their own affordances. All consume the helpers above. |
| Server-side enforcement | Postgres RLS in `supabase/schema.sql` + migrations; `manage-user` and `create-user` Edge Functions (which run as `service_role`, bypass RLS, and perform scope checks in code). |

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
