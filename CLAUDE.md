# NucleusReportingTool

## Git

Branch from `main`, push the feature branch, and open a PR targeting `main`. Once Vercel posts the preview URL on the PR, report it back so it can be verified before merging.

Before reporting the gap between any two branches, run `git fetch origin` and diff against the remote refs (e.g. `git log --oneline origin/main..origin/dev`), not against local branches. Local branches are often stale at session start because the harness checks out the working branch — comparing against them can hallucinate dozens of "pending" commits that have already shipped via PR. Never quote a branch gap to the user without having fetched first.
