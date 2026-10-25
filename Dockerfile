# TrustCheck: production image (Express server serves the built Vite client). Works on Vultr, Fly, Render, anything that runs containers.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
# npm ci fails here: a lockfile made on macOS lacks Linux optional deps (rollup native binary).
RUN rm -f package-lock.json && npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
# VITE_* values are baked into the client bundle at build time.
ARG VITE_AUTH0_DOMAIN=""
ARG VITE_AUTH0_CLIENT_ID=""
ARG VITE_AUTH0_AUDIENCE=""
ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w client

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=8787 TRUST_PROXY=1
RUN addgroup -S app && adduser -S app -G app
# The server runs TypeScript through tsx (a dependency), so no server compile step.
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json ./
COPY --chown=app:app server ./server
COPY --from=build --chown=app:app /app/client/dist ./client/dist
RUN mkdir -p server/data && chown app:app server/data
USER app
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null || exit 1
CMD ["node_modules/.bin/tsx", "server/src/index.ts"]
