# Native Postqube distribution

Ideas is a React page at `apps/frontend/src/app/(app)/(site)/ideas`, inside the
existing application layout. Its menu entry uses the existing MenuItem/Next Link.
No iframe, copied shell, injected page template or alternate navigation handler.
The React editor and workspace UI live in `apps/frontend/src/components/ideas`.

The Nest controller is registered in the native authenticated-controller list.
Session and workspace resolution use the same AuthMiddleware as the other pages.
Notes belong to Organization in PostgreSQL through the Prisma IdeaItem model.
The composite parent foreign key prevents cross-workspace parent references.
Native database backups include these notes automatically.

The editor stores allowlisted rich-text runs in the existing blocks JSON; no new
table or migration is needed for formatting. API validation and rendering share
`libraries/helpers/src/ideas/text-format.ts`. UI translations are part of the
standard `libraries/react-shared-libraries/src/translation/locales` resources.
CI checks every supported locale and formatting/task serialization regressions.

## Build

Use the public repository checkout as the context, with a credential-free
`.dockerignore`. Build `postqube/native/Dockerfile`, tagging the matching release.
The base image is the documented Postiz release; native frontend/backend and
Prisma client are rebuilt. Never copy a live environment file into the context.
Build with sufficient memory; the upstream TypeScript graph needs a 4 GB heap.
Webpack uses a persistent compiler cache and documented memory optimizations.
Unconfigured Sentry does not generate source maps or instrument the production
bundle; configuring Sentry requires a build with the public DSN available.
CI validates the backend/editor tests and complete frontend in cache-only builds,
without exporting a large runtime image. The Docker exporter behavior is documented
in [Docker exporters](https://docs.docker.com/build/exporters/#cache-only-export).
For release reconstruction, pass the recorded runtimeBaseDigest as POSTIZ_BASE.

Production environment is supplied at runtime through the existing protected
Compose configuration, retaining its private networks, database and uploads.

After upstream updates, merge the tracked native changes, rebuild, then verify
routing, data access, publication workflows and backup recovery in staging.

## One-time legacy migration

1. Back up native PostgreSQL, legacy SQLite and deployment configuration privately.
2. Create only the new IdeaItem table/indexes/constraints from the reviewed Prisma
   schema diff. Do not reset databases or accept unrelated destructive schema changes.
3. Freeze legacy note writes. Mount its SQLite directory read-only at /legacy in a
   temporary container of the native release on the existing private database network.
4. Run `node /app/postqube/native/migrate-legacy.cjs`. Supply the existing protected
   DATABASE_URL at runtime; never put credentials into this repository or command output.
5. The migration is transactional, preserves IDs, parent links, content, task state,
   revisions, timestamps and trash, and verifies every field. It refuses to overwrite
   a different existing native record. Original SQLite files remain intact.
6. Deploy the native image, remove the old /ideas reverse-proxy exception, and
   disable the separate legacy service. The standard app/API proxies handle Ideas.
7. Verify a browser document survives Calendar → Ideas → Calendar, without an
   iframe, plus workspace isolation, conflicts, autosave and mobile/theme behavior.

The previous /launches?view=ideas bookmark redirects to /ideas. Source/configuration
and a pre-migration snapshot must be retained for rollback. The daily backup must
no longer attempt to execute a snapshot inside the retired SQLite service.
