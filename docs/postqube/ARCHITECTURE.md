# Architecture

The Postqube distribution preserves upstream Postiz and builds tracked native
changes: Next.js frontend, NestJS backend, Prisma/PostgreSQL, Redis and Temporal.
Its publishing scheduler remains upstream. Nginx terminates HTTPS and proxies to
127.0.0.1:4007; data services remain on private Docker networks.

Ideas is a native route under the existing site layout. The existing MenuItem/Next
Link performs client navigation and retains the layout. Its workspace/editor are
React components using original theme tokens/font, without iframe or copied shell.
The native Nest controller uses the same AuthMiddleware as the rest of the API.
Prisma IdeaItem records relate to Organization with composite parent/tenant
constraints. Standard PostgreSQL backups cover them.

Brand presentation assets remain under postqube/branding. Their existing overlay
changes branding/onboarding only; it no longer implements Ideas navigation,
page rendering, menu insertion or theme propagation. Upstream selectors used by
that presentation layer still need review after updates.

Native distribution build/migration instructions are in postqube/native/README.md.
Never replace existing databases/uploads with new empty Compose volumes. Temporal
visibility uses SQL; organizationId and postId search attributes remain registered.
