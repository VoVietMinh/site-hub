# ── Stage 1: Build TypeScript ─────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates openssh-client python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ALL deps (including devDeps needed for tsc)
COPY package*.json ./
RUN npm install

# Copy source and compile
COPY . .
RUN npm run build \
 && cp src/services/contentService.js dist/services/contentService.js

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates openssh-client \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production deps only
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled output + static assets
COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/src/views  ./src/views
COPY --from=builder /app/src/public ./src/public
COPY --from=builder /app/src/modules/articles/prompts ./src/modules/articles/prompts
COPY --from=builder /app/src/i18n/locales ./src/i18n/locales

RUN mkdir -p /app/data /app/logs

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require(\'http\').get(\'http://localhost:3000/healthz\', r => process.exit(r.statusCode === 200 ? 0 : 1)).on(\'error\', () => process.exit(1))"

CMD ["node", "dist/app.js"]
