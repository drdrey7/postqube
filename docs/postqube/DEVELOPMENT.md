# Development

Read apps/frontend/AGENTS.md and the installed Next.js guides before frontend changes.
Use Node 22.23.4 and pnpm 10.6.1. Keep credentials/runtime data outside the checkout.
Install dependencies in an isolated environment; Prisma generation and full builds
need the native schema and the upstream PostgreSQL/Redis/Temporal services.

Ideas is implemented in native source: frontend route/components, MenuItem entry,
Nest controller registered with AuthMiddleware and Prisma IdeaItem. Build the
native frontend/backend/client with postqube/native/Dockerfile. The resulting image
reuses the pinned upstream runtime and dependencies; it is a custom source build.

Validate native authentication, cross-workspace access, stale revisions, trash,
large-note saving and Calendar ↔ Ideas navigation with disposable users. Confirm
window/document identity survives navigation and no iframe is present. Verify
mobile, native light/dark themes and original workspace/header controls.

Documentation validation is separate: python3 scripts/postqube/check.py and
python3 scripts/postqube/build-docs.py. The documentation-only CI job does not
substitute for the full native application build or authenticated browser checks.

Preserve source/license notices and keep changes in focused commits. Do not patch
running compiled containers or implement new pages by injecting HTML into the DOM.
