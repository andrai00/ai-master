# ai-master — production image (Next.js 16 custom server + Socket.IO + Prisma/SQLite)

FROM node:22-bookworm-slim AS build

WORKDIR /app

# Prisma engine + Next.js prerender need OpenSSL
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.15.0

ENV DATABASE_URL="file:./data/ai-master.db"

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Create the DB + schema BEFORE next build: static prerender hits the DB,
# and libsql refuses to create a file in a missing directory.
RUN mkdir -p data && pnpm exec prisma db push && pnpm exec prisma generate && pnpm build

# ── runtime ────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="file:./data/ai-master.db"

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.15.0

# Full node_modules (incl. dev deps): the custom server (server.mjs), the
# Prisma CLI (db push on start), sharp and next.config.ts all need them.
COPY --from=build /app/node_modules ./node_modules

COPY --from=build /app/.next ./.next
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
COPY --from=build /app/server.mjs ./
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3015

# The volume is empty on first start: create the data dir, apply the schema, start.
CMD ["sh", "/app/docker-entrypoint.sh"]
