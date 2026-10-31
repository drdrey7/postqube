# Operations and recovery

## Daily operation

Monitor HTTP readiness, container health, publishing failures, disk/media growth,
queue/workflow failures and certificate renewal. /admin/errors and /admin/stats
provide native product visibility; provider spending must be checked separately.
Keep databases, Redis, Temporal and privileged panels off public raw ports.

## Backups

Back up application PostgreSQL, Temporal PostgreSQL, uploads, protected environment,
Compose/proxy configuration, the native Ideas records and Postqube source version. Encrypt backups containing
secrets, restrict access and keep an off-server copy. Verify hashes and perform a
restore in an isolated environment. A successful archive alone is not a restore test.
The current live backup job contains operational secrets and is intentionally not
copied into this public repository.

Before migrations, record the running image digest, source tag and a complete backup.
Database changes may make an older image incompatible; restore the pre-migration
DB/volumes where required. Never promise rollback by changing only a Docker tag.

## Domain migration

Keep the test domain until final selection. Before public launch, update DNS/TLS,
MAIN_URL, FRONTEND_URL, NEXT_PUBLIC_BACKEND_URL, cookie scope, source links and all
provider callbacks. Audit existing stored media URLs. Preserve old callbacks during
transition where appropriate; OAuth tokens may require reconnecting. Re-test mobile
and desktop and review Meta settings/legal URLs. Do not buy a domain automatically.

## Ideas recovery

Ideas are included in the native PostgreSQL dump and the matching native source
configuration archive. Restore into an isolated database with the matching image,
then verify notes, tasks and workspace isolation. Legacy SQLite snapshots remain
private recovery archives; the retired container is not needed by the daily job.
See [Ideas](IDEAS.md). Include this separate store in workspace deletion requests.
