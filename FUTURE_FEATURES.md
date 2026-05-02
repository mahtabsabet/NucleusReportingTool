# Future Features

Features that are planned but not yet ready to implement.

---

## Splash Screen

On initial page load, show a full-screen random image for ~2 seconds, then fade into the app.

**Details:**
- Images will be provided by the team and stored as static assets (e.g. `public/splash/`)
- A config file will list the available images so new ones can be added without touching component code
- Display duration: ~2 seconds, with a short fade-out transition

---

## Progressive Web App (PWA)

Add PWA support to the existing Vite app so users can install it to their home screen on iOS and Android.

**Details:**
- Add `manifest.json` (app name, icons, theme colour)
- Add a service worker via the `vite-plugin-pwa` plugin
- Users get a full-screen experience and home screen install prompt
- No app store required — works for internal tools with a known user base
- Roughly a day of work once the core app is stable

---

## Unit Tests

Add a unit test suite covering pure logic and DB helper functions.

**Details:**
- Framework: Vitest (already part of the Vite ecosystem, zero config)
- Priority targets: type-mapping utilities (`DB_TO_APP_TYPE`, `APP_TO_DB_TYPE`, `ROLE_DISPLAY`), `syncCourseEnrollments` diffing logic, date formatting helpers in Timeline
- DB modules should be tested with a mocked Supabase client (swap `supabase` import in tests)
- Run on every PR via GitHub Actions

---

## Integration Tests

Spin up a dev/staging Supabase instance and drive the full UI through real workflows.

**Details:**
- Framework: Playwright (browser automation)
- Test scenarios: create a nucleus → add an activity → add a person to the activity → verify they appear in ConcentricCircles and the person's profile; change engagement level → verify it persists on refresh; run GrowthReport and verify counts match seeded event_log data
- Permissions smoke tests: log in as each role (Viewer, Activity Lead, Nucleus Collaborator, Cluster Coordinator, Admin) and assert that forbidden actions are blocked in the UI and at the DB layer (RLS)
- Maintain a seed script that resets the dev DB to a known state before each run

---

## Person Search When Adding to an Activity

When adding a person to an activity, search existing people in the DB rather than creating a new record each time.

**Details:**
- Replace the current free-text name field with a search-as-you-type combobox
- Query `persons` table by name as the user types (debounced, case-insensitive)
- Show matching results as a dropdown; selecting one re-uses that person's existing record
- If no match, offer "Create new person: [typed name]" as the last option
- Prevents duplicate person records and ensures cross-nucleus linking works correctly

---

## Integration Tests for User Permissions

Add dedicated integration tests covering permission enforcement for each user role.

**Details:**
- Extend the existing integration test suite (Playwright + dev Supabase instance)
- Test each role (Viewer, Activity Lead, Nucleus Collaborator, Cluster Coordinator, Admin) against every permission boundary
- Assert both that permitted actions succeed and that forbidden actions are blocked in the UI and at the DB layer (RLS)
- Should complement the general integration test smoke tests already planned

---

## Fix Activity Lead Permissions

Activity leads should not be able to see the option to create a new activity or move people in the concentric circles.

**Details:**
- Hide the "Create Activity" button/option from the UI when the logged-in user's role is Activity Lead
- Hide the drag/move controls in the ConcentricCircles component for Activity Lead users
- Enforce the same restrictions at the DB layer (RLS) to ensure UI-only gating is not the sole protection

---

## Push Notifications / Email Reminders

Send reminders to activity leads or participants when an upcoming session is scheduled.

**Details:**
- The structured schedule fields on `Activity` (`schedule_day_of_week`, `schedule_time`, `schedule_interval_weeks`) are already designed to support this
- Will require a `NotificationPreference` table per user
- Needs a background job / cron (e.g. Supabase Edge Functions)
