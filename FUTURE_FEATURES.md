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

## Push Notifications / Email Reminders

Send reminders to activity leads or participants when an upcoming session is scheduled.

**Details:**
- The structured schedule fields on `Activity` (`schedule_day_of_week`, `schedule_time`, `schedule_interval_weeks`) are already designed to support this
- Will require a `NotificationPreference` table per user
- Needs a background job / cron (e.g. Supabase Edge Functions)
