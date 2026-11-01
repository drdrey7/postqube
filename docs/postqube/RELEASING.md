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
   test locally before merging, and release when ready.

Never build or restart production by hand (`docker build -t postqube:...` on the server,
`docker compose up` with a new local image). Production changes only through a release, so
every running version is a tagged, tested image that can be rolled back.

## Releasing to production

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
