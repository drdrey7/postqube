# Deployment

## Existing test server

Do not replace the current stack with this reference Compose file. Live deployment
uses /opt/postiz for native app/data configuration, /opt/postqube for branding and
host Nginx for public TLS. Preserve existing volume names, secrets and backup jobs.
The repository includes sanitized examples, not a copy of production environment.

## Fresh isolated installation

Requirements: Linux host, Docker/Compose, sufficient RAM/disk, public hostname and
TLS reverse proxy. Keep the app behind loopback; do not expose DB/Redis/Temporal.
The example topology follows the existing SQL-visibility stack but has not been
run as a fresh full-stack deployment in this release. It needs an operator smoke test.

1. Clone this repository and check out the intended release tag.
2. Copy postqube/deploy examples to a dedicated protected deployment directory.
   Rename compose.example.yaml to compose.yaml and .env.example to .env.
3. Set PUBLIC_URL and independent JWT/PostgreSQL/Temporal PostgreSQL secrets in
   the editor. Hex passwords avoid connection-string escaping problems. Keep .env
   readable only by the operator. Put provider keys here only when configured.
4. Validate with docker compose --env-file .env -f compose.yaml config --quiet.
5. Start infrastructure first: docker compose up -d postiz-postgres postiz-redis
   temporal-postgresql temporal. Wait for Temporal auto-setup to finish.
6. Check the namespace and register the required organizationId/postId Keyword
   search attributes before starting the app. See commands below. Do not create
   demo attributes that consume PostgreSQL visibility's limited attribute slots.
7. Build and select the matching native Postqube image (see postqube/native/README.md),
   then start postiz. Configure host Nginx, DNS and a trusted certificate, then test
   authenticated signup, calendar, isolation, media and scheduling.
8. Copy postqube/branding to /opt/postqube/branding and configure the provided
   site/proxy/limits examples. Replace PUBLIC_IPV4 and postqube.example.com; verify
   cookie domain against your actual hostname. Configure HTTPS renewal.
9. Add the documentation/static source links and confirm access without login.
   Do not activate the Instagram setup guard until Meta and the user authorization
   flow are verified. The site example intentionally blocks Instagram until setup.

```sh
# Retry only after Temporal becomes ready; inspect 'temporal --help' for version differences.
docker compose exec temporal temporal operator namespace describe --namespace default
docker compose exec temporal temporal operator search-attribute create --namespace default --name organizationId --type Keyword
docker compose exec temporal temporal operator search-attribute create --namespace default --name postId --type Keyword
docker compose up -d postiz
```

If a search attribute already exists, inspect it instead of blindly recreating it.
The supplied activation/update helpers are admin-only examples tied to the /opt
layout. They are not one-command generic installers and do not configure provider
accounts, email or billing. Review them before running; prepare rollback first.

The root docker-compose.yaml is retained upstream source, with sample defaults
and broader ports. It is not the recommended public deployment configuration.
Never deploy a public service using its sample passwords.
