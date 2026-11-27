# Build context is the repo root:  docker build -f backend/Dockerfile --build-arg APP=api .
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG APP
COPY . .
RUN pnpm install --frozen-lockfile --filter "@wa/${APP}..."
RUN pnpm --filter "@wa/${APP}..." build
# prod-only, self-contained copy of the app + its workspace deps
RUN pnpm --filter "@wa/${APP}" deploy --prod --legacy /out

FROM node:22-slim AS run
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
USER node
ARG APP
ENV APP=${APP}
CMD ["sh", "-c", "node dist/$( [ \"$APP\" = api ] && echo main.js || echo index.js )"]
