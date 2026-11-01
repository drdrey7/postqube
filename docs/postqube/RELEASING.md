# Releasing Postqube

## Branches

| Branch | Role | Runs on |
|---|---|---|
| `feature/*`, `fix/*` | One change per branch, opened as a PR into `postqube` | CI only |
| `postqube` | Integration branch (default). Every merge is built and tested | Nothing until released |
| `production` | Exactly what the public uses. Moved only by the release workflow | Production |
| `main` | Untouched mirror of upstream Postiz, used for upstream updates | Nothing |

## Day-to-day flow

1. `git switch -c feature/my-change postqube`, commit, push, open a PR into `postqube`.
2. CI must be green: native regression tests, frontend route build and documentation checks.
3. Squash-merge. The **Postqube image** workflow tests again, builds the runtime image once and
   publishes `ghcr.io/drdrey7/postqube:sha-<commit>`.
4. Several merges can be collected and released together. There is no staging environment yet:
   use the fast lane below to try small changes, and release when ready.

Never build or restart production by hand (`docker build -t postqube:...` on the server,
`docker compose up` with a new local image). Production changes only through the fast lane or a
release, so every running version is a known commit that can be rolled back.

## Fast lane (small changes, minutes)

For text, colour, layout and small UI fixes while Postqube has few users. Push the change to a
branch, then on the server:

```
postqube-quick fix/my-change        # build that branch here and put it live
postqube-quick --rollback           # undo the last quick deploy
```

| Change | Time | Downtime |
|---|---|---|
| Only `postqube/branding/` (logo, colours, brand CSS/JS) | seconds | none (no restart) |
| Frontend/backend code | about 4 minutes (about 3.5 min build + 40 s restart) | about 40 seconds |

Every fast-lane deploy builds the exact pushed commit (never local edits), takes a database
snapshot first (`/var/backups/postiz/quick`, latest 10), checks health and rolls back
automatically. It refuses `schema.prisma` changes unless `--allow-schema` is given: use a release
for those. Always open a PR for the same branch, because the next release replaces what the fast lane
put live.

## Releasing to production (safe lane)

Run **Actions → Postqube release → Run workflow** with a version such as `v0.6.0`
(append `-beta.N` while in beta). It waits for approval in the `production` environment, then:

- fast-forwards `production` to the chosen `postqube` commit (no rebuild, no merge commit),
- creates the git tag and GitHub release with generated notes,
- retags the already-tested `sha-<commit>` image as `:vX.Y.Z` and `:production`.

The production deployer then runs the verified backup, pins the new image digest in
`compose.override.yaml`, recreates the app, checks `/api/auth/can-register` and restores the
previous digest automatically if the check fails. History is in
`/var/lib/postqube-deployer/<env>/history.log`.

## Database changes

The container applies `schema.prisma` with `prisma db push` on every start. Keep schema changes
additive. A destructive change makes the start fail and triggers the rollback; recover
data from the pre-deploy backup. Describe any manual SQL in the PR. Image rollback alone does
not undo data changes, see [Operations](OPERATIONS.md).

## Rolling back production

The release workflow only moves forward. To go back immediately, point `:production` at the
previous release (the deployer picks it up within five minutes):
 `docker buildx imagetools create -t ghcr.io/drdrey7/postqube:production
ghcr.io/drdrey7/postqube:vPREVIOUS` 
Or, on the server, set the previous digest in `compose.override.yaml` and run
`docker compose up -d postiz`. Then fix forward with a new release.

## Upstream updates

Merge an upstream Postiz tag from `main` into a `chore/upstream-vX.Y.Z` branch, update the
`POSTIZ_BASE` argument in `postqube/native/Dockerfile` and `postqube/release.json`, and open a
PR into `postqube` like any other change.
