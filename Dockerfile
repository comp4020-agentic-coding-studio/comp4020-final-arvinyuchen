# syntax = docker/dockerfile:1

# Spots: an Astro server (Node adapter) over one SQLite file on the /data
# volume. Install and build, then keep only the built server and its
# production dependencies. Serves HTTP on 0.0.0.0:$PORT (fly.toml sets 8080).

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@11.9.0

FROM base AS build
# toolchain for better-sqlite3, in case no prebuilt binary matches
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

FROM base
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATABASE_PATH=/data/spots.db
EXPOSE 8080
CMD ["node", "./dist/server/entry.mjs"]
