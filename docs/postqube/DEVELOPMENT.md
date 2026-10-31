# Development

Read apps/frontend/AGENTS.md before changing frontend components. Preserve internal
package/API/database identifiers unless an intentional migration is planned.

The baseline declares Node 22.23.4 and pnpm 10.6.1. Install in an isolated development
environment, use the upstream .env.example as a reference and never reuse production
credentials. pnpm install runs Prisma generation; pnpm run build compiles the apps.
Full product setup also needs PostgreSQL, Redis and Temporal.

For this release no upstream application source has changed. Validate presentation
JS and documentation with python3 scripts/postqube/check.py. A complete product
build is not claimed by the documentation-only workflow.

Keep changes small and in separate commits. Prefer native configuration, then
focused component changes; avoid global rewrites of user text. Do not add features
by editing the running container. A future custom application image needs a separate
build/deploy review; this release distributes official image plus overlay.
