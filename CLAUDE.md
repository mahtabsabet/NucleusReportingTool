# NucleusReportingTool

## Git

Branch from `main`, push the feature branch, and open a PR targeting `main`. Once Vercel posts the preview URL on the PR, report it back so it can be verified before merging.

Before reporting the gap between any two branches, run `git fetch origin` and diff against the remote refs (e.g. `git log --oneline origin/main..origin/dev`), not against local branches. Local branches are often stale at session start because the harness checks out the working branch — comparing against them can hallucinate dozens of "pending" commits that have already shipped via PR. Never quote a branch gap to the user without having fetched first.

### `dev` branch — stable demo link

`dev` exists to give a permanent, stable Vercel URL (`nucleus-reporting-tool-git-dev-mahtab-s-projects-526ebf89.vercel.app`) for demoing the product — unlike per-PR preview links, this one never changes. It should always mirror the code on `main`.

Whenever a PR is merged into `main`, immediately also merge `main` into `dev` and push (`git fetch origin && git checkout dev && git merge origin/main && git push origin dev`, or equivalent) — no need to ask the user first, this is routine. If the merge isn't a fast-forward, resolve conflicts the same way as any other merge.

Note this only syncs *code*. The `dev` Vercel deployment points at a separate dev Supabase project seeded with fictional demo data (see `scripts/seed-demo-full.sql`) — merging `main` into `dev` never touches that data, by design.
