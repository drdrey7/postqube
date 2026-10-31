# Architecture

The full Postiz source is preserved: Next.js frontend, NestJS backend, Prisma /
PostgreSQL, Redis and Temporal orchestration. Postqube does not replace the scheduler.

The documented runtime uses official Postiz v2.25.3 plus a host Nginx presentation
layer. Nginx terminates HTTPS and proxies to 127.0.0.1:4007. Databases, Redis and
Temporal stay private. Public media must be reachable for social provider ingestion.

Branding source lives in postqube/branding. Nginx injects its JS/CSS after app
hydration. This keeps the official image intact but depends on upstream selectors;
UI changes require review after updates. The optional-company adapter uses the
normal form; authentication remains native. This separation is not an AGPL exception.

The host uses SQL Temporal visibility without Elasticsearch. Required search
attributes organizationId and postId are registered before scheduling is tested.
Existing production data volumes must never be replaced by a fresh Compose project.

## Ideas workspace service

The original Postqube Ideas module runs separately on Node with SQLite, behind
/ideas/ on the same HTTPS origin. Its private data volume is separate from Postiz.
Every request uses native session/workspace verification; no second identity system
or signing secret is introduced. Revision checks protect simultaneous edits. See
[Ideas](IDEAS.md) for team access, recovery and deletion limitations.
