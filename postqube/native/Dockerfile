# Reuse the pinned upstream dependencies/runtime; rebuild genuine native routes.
ARG POSTIZ_BASE=ghcr.io/gitroomhq/postiz-app:v2.25.3
FROM ${POSTIZ_BASE} AS native-backend
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY libraries/nestjs-libraries/src/database/prisma/schema.prisma libraries/nestjs-libraries/src/database/prisma/schema.prisma
RUN pnpm exec prisma generate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
COPY apps/backend/src/api/api.module.ts apps/backend/src/api/api.module.ts
COPY apps/backend/src/api/routes/ideas.controller.ts apps/backend/src/api/routes/ideas.controller.ts
COPY apps/backend/src/main.ts apps/backend/src/main.ts
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter postiz-backend build
FROM native-backend AS dist
COPY apps/frontend/src/components/ideas apps/frontend/src/components/ideas
COPY apps/frontend/src/components/layout/top.menu.tsx apps/frontend/src/components/layout/top.menu.tsx
COPY apps/frontend/src/components/new-layout/layout.component.tsx apps/frontend/src/components/new-layout/layout.component.tsx
COPY apps/frontend/src/app/(app)/(site)/ideas/ apps/frontend/src/app/(app)/(site)/ideas/
COPY apps/frontend/next.config.js apps/frontend/next.config.js
COPY postqube/native/migrate-legacy.cjs postqube/native/migrate-legacy.cjs
RUN --mount=type=cache,target=/app/apps/frontend/.next/cache,id=postqube-native-next NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter postiz-frontend exec next build --webpack
