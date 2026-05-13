# NucleusReportingTool

## Git

Always push changes to the `dev` branch.

Before reporting the gap between any two branches (especially `main`
vs `dev`), run `git fetch origin` and diff against the remote refs
(e.g. `git log --oneline origin/main..origin/dev`), not against local
branches. Local `main` is often stale at session start because the
harness checks out the working branch — comparing against it can
hallucinate dozens of "pending" commits that have already shipped via
PR. Never quote a branch gap to the user without having fetched first.
