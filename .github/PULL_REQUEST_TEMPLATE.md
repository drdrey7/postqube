<!-- PRs target `postqube`. `main` mirrors upstream Postiz; `production` only moves through the release workflow. -->

## What changed

<!-- Area (backend, frontend, Ideas, deploy, docs) and, in 1–3 sentences, what concretely changed and what deliberately stayed the same. -->

## Why

<!-- Problem, issue link or user need. -->

## Database / data

- [ ] No schema change
- [ ] Schema change in `schema.prisma` (applied by `prisma db push` at container start) — additive only, or destructive steps described below
- [ ] Needs a manual SQL step (file + order described below)

## How it was tested

1. [ ] CI green (native tests + image build)
2. [ ] Checked locally / with the steps below (there is no staging; production is updated only by a release):
<!-- Numbered steps a reviewer can follow: setup, action, expected result. -->

## Rollback

<!-- "Redeploy previous release" is enough unless data or config changed. -->
