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
- Book 3 (?) — Grade 2, 3, 4, and 5   ← see Open Question 1
- Book 5 — branch course 1, 2, and 3
- Book 7 — branch course 1, 2, and 3

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

## Open questions (blocking — answer before build)

1. **Table 3 "Book 5 (Grade 2–5)":** the write-up lists Book 5 twice. Grades 2–5
   are children's-class grades, which in Ruhi are branch courses of **Book 3**.
   Is the first group meant to be **Book 3** (Grades 2–5)?
2. **What counts as "attending"/"attendees":** current **active roster
   participants** (`activity_participants`, excluding `inactive`)? Or people with
   recorded notebook attendance?
3. **"Friends of the faith":** `religious_status = 'friend'` **only** (treat
   `'unknown'` as not-a-friend)?
4. **Which activities are counted:** only **active** activities (exclude
   planned/completed/cancelled)? And totals are simple **sums** across activities
   (double-counting a person who attends multiple activities is fine)?
