# syntax=docker/dockerfile:1

# Copy this file to Floway/docker/Dockerfile. The build context must remain the
# Floway repository root, as used by Floway's docker/docker-compose.yml.
FROM debian:trixie-slim AS base
WORKDIR /app

ARG TARGETPLATFORM
ARG NODE_VERSION=22.23.1

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:/usr/local/bin:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libatomic1 xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    case "$TARGETPLATFORM" in \
      "linux/amd64")   NODE_ARCH=x64;     NODE_HOST=https://nodejs.org/dist ;; \
      "linux/arm64")   NODE_ARCH=arm64;   NODE_HOST=https://nodejs.org/dist ;; \
      "linux/arm/v7")  NODE_ARCH=armv7l;  NODE_HOST=https://nodejs.org/dist ;; \
      "linux/riscv64") NODE_ARCH=riscv64; NODE_HOST=https://unofficial-builds.nodejs.org/download/release ;; \
      *) echo "Unsupported TARGETPLATFORM: $TARGETPLATFORM" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "$NODE_HOST/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o /tmp/node.tar.xz; \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner; \
    rm /tmp/node.tar.xz; \
    corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY patches ./patches
COPY scripts ./scripts
COPY apps ./apps
COPY packages ./packages

FROM base AS server
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV NODE_ENV=production
ENV PORT=8788
ENV FLOWAY_DB_PATH=/data/floway.db
ENV FLOWAY_FILES_DIR=/data/files

RUN mkdir -p /data/files

VOLUME ["/data"]
EXPOSE 8788

CMD ["pnpm", "run", "dev:node"]

# Build Floway Alt UI instead of Floway's bundled Vue dashboard. ALT_UI_REF
# accepts a branch, tag, or commit SHA; pin a commit SHA for reproducible builds.
FROM base AS web-build

ARG ALT_UI_REPOSITORY=https://github.com/chiyuki0325/floway-alt-ui.git
ARG ALT_UI_REF=main

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    git init /alt-ui; \
    cd /alt-ui; \
    git remote add origin "$ALT_UI_REPOSITORY"; \
    git fetch --depth 1 origin "$ALT_UI_REF"; \
    git checkout --detach FETCH_HEAD; \
    git submodule update --init --recursive --depth 1

WORKDIR /alt-ui
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm build

FROM nginx:1.27-alpine AS web

# Keep Floway's nginx configuration: it provides the SPA fallback and proxies
# control-plane, data-plane, SSE, and WebSocket traffic to the server service.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /alt-ui/build/client /usr/share/nginx/html

EXPOSE 80
