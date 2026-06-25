# CODE-AI Frontend
# Next.js 16 — multi-stage build (deps → build → runtime)
#
# BACKEND_URL is set at build time so Next.js rewrites() bake in the
# correct proxy target.  In Docker Compose this is http://backend:8000
# (Docker internal network).  The browser never connects to this URL
# directly — all /api/* calls are proxied server-side by Next.js.

# ---- Stage 1: install dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# ---- Stage 2: build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL

RUN npm run build

# ---- Stage 3: runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built output + runtime deps
COPY --from=builder /app/.next      ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public     ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.ts ./

# Runtime env (Next.js re-reads next.config.ts on start)
ENV BACKEND_URL=http://backend:8000

EXPOSE 3000
CMD ["npm", "start"]
