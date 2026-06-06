# Cluster Growth Profile (CGP) — Spec

> Status: captured from owner's write-up (2026-06-06). Some details have open
> questions (see bottom) before implementation begins.

## Nature of the report

- A **point-in-time snapshot** of where a cluster currently stands.
- **Everything is a running total** — no time framing, no cycle/period comparison.
- Scoped to a **single cluster**.

## Tables to generate (owner's wording, verbatim)

### Table 1 — Ruhi main sequence, Books 1–7
How many people have **completed** each of Books 1 to 7, based purely on the
completions listed on person profiles.

### Table 2 — Ruhi main sequence, Books 8–14 (by unit)
How many people have completed **each of the three units** of each of Books 8
through 14. (7 books × 3 units.)

### Table 3 — Branch courses
How many people have completed the branch courses of:
- **Book 3** — Grade 2, 3, 4, and 5
- **Book 5** — branch course 1, 2, and 3
- **Book 7** — branch course 1, 2, and 3

Not all of these exist in our logging yet; any that don't simply return **0**.

### Table 4 — Educational activities
For each of the three educational activity types, show **# of activities**,
**# attending**, and **# of those who are friends of the faith**:
- Children's classes
- Junior youth groups
- Study circles

### Table 5 — Devotionals + roll-up totals
- **Devotional gatherings:** # of gatherings, # attendees, # friends of the faith.
- **Total educational activities** (CC + JY + study circles): activity #,
  participant #, friend-of-faith # — summed from Table 4.
- **Total core activities** (devotionals + total educational): activity #,
  participant #, friend-of-faith # — summed from devotional row + educational total.

## Implementation plan

- **Surface:** a **"Generate Cluster Growth Profile"** button in the **Growth
  Report** interface (`GrowthReport.tsx`), shown when the report is
  **cluster-scoped** (`?cluster=<id>`). It opens an in-app CGP page for that same
  cluster, so viewing permissions exactly track the Growth Report's cluster scope.
- **Route:** `/cluster/:clusterId/cgp` (read-only page rendering the 5 tables).
- **Export:** from the CGP page — user's choice of:
  - **Excel (.xlsx)** via SheetJS (`xlsx`) — natural fit for these tables, one
    sheet per table (or stacked). Recommended.
  - **PDF** — recommend a **print-optimized layout + "Save as PDF"** (browser
    print, zero deps) for an exact-fidelity snapshot; can swap to `jspdf` +
    `jspdf-autotable` if a pixel-controlled standalone PDF is preferred.
- **Code layout:**
  - `src/lib/cgp.ts` — pure, unit-tested compute (raw rows → the 5 tables).
  - `src/lib/db/cgp.ts` — one cluster-scoped fetch (people + completions + active
    activities/rosters).
  - `src/components/ClusterGrowthProfile.tsx` — the page + export actions.
  - `src/lib/__tests__/cgp.test.ts` — compute tests.

## Data-model mapping (from current schema)

| Spec concept | Source |
|---|---|
| Book completion (Books 1–7) | `course_enrollments.status = 'completed'` (Ruhi main stream) |
| Unit completion (Books 8–14) | `course_unit_enrollments.status = 'completed'` |
| Branch courses | `courses.parent_course_id` set, `CurriculumStream = 'branch'` |
| Friend of the faith | `persons.religious_status = 'friend'` |
| Activity type | `activities.type` ∈ {children_class, junior_youth, study_circle, devotional} |
| Cluster affiliation (people) | `persons.cluster_id` |
| Roster / attendance | `activity_participants` (+ `status` active/inactive) |

## Resolved decisions (locked 2026-06-06)

1. **Table 3 grouping:** Book **3** (Grades 2–5), Book **5** (branch 1–3), Book
   **7** (branch 1–3). Missing branch courses return 0.
2. **"Attending" / "attendees" = current active roster** — `activity_participants`
   with `status = 'active'`. We do **not** derive attendance from logged notebook
   presence: leads/coordinators are responsible for marking people inactive, so a
   regular participant who is simply away (e.g. travelling) still counts as
   attending until explicitly inactivated.
3. **Friend of the faith = `religious_status = 'friend'` only.** `'unknown'` does
   **not** count toward the friend tally (nor does `'bahai'`).
4. **Only `active` activities** are counted (exclude planned/completed/cancelled).
   Roll-up totals are simple **sums** across activities — a person on the roster of
   two activities is counted in both (no cross-activity de-duplication).
