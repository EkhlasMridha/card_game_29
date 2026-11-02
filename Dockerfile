# syntax=docker/dockerfile:1.7
#
# Card 29. Multi-stage build:
#   build    full Node toolchain; installs deps and produces the minified bundles
#   runtime  bare Alpine + the node binary only (no npm/yarn/corepack, no node_modules):
#            the server bundle already contains its dependencies.

ARG NODE_VERSION=22.23.4
ARG ALPINE_VERSION=3.24

# ---------------------------------------------------------------- build
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS build
WORKDIR /src

# Dependency layer first, so code changes don't reinstall packages.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
# Sourcemaps are disabled in vite.config.ts, so dist holds only shipped assets.
RUN npm run build

# Symbol-stripped copy of node for the runtime image (about 16 MB smaller; only
# native crash dumps lose symbol names). Checked by running it afterwards.
RUN apk add --no-cache binutils \
 && cp /usr/local/bin/node /tmp/node \
 && strip --strip-all /tmp/node \
 && /tmp/node -e "process.exit(process.version === 'v' + process.env.NODE_VERSION ? 0 : 1)"

# ---------------------------------------------------------------- runtime
FROM alpine:${ALPINE_VERSION} AS runtime

# libstdc++ (pulls libgcc) is the only shared library node needs on musl.
RUN apk add --no-cache libstdc++ \
 && addgroup -S -g 10001 app \
 && adduser -S -D -H -u 10001 -G app -s /sbin/nologin app

COPY --from=build /tmp/node /usr/local/bin/node

WORKDIR /app
# Owned by root and read-only for the app user: the server never writes to disk.
COPY --from=build /src/apps/server/dist/index.js apps/server/dist/index.js
COPY --from=build /src/apps/web/dist apps/web/dist

ENV NODE_ENV=production \
    PORT=5050

USER app
EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||5050)+'/api/info').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["node", "apps/server/dist/index.js"]
