# =============================================================================
# SpaceGuard Web - Production Dockerfile
# Multi-stage build: install deps, build Next.js standalone, run minimal image
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install ALL dependencies (including devDependencies for build)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Copy workspace root files
COPY package.json turbo.json ./

# Copy workspace package.json files
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

# Install all dependencies (including dev for build step)
RUN npm install --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2: Build the application
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copy source code
COPY package.json turbo.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

# Build shared package first (Next.js transpiles it, but standalone needs it)
RUN cd packages/shared && npx tsc

# Set build-time env vars (overridden at runtime via docker-compose)
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build Next.js in standalone mode
RUN cd apps/web && npx next build

# ---------------------------------------------------------------------------
# Stage 3: Production image
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

# Security: run as non-root user
RUN addgroup --system --gid 1001 spaceguard && \
    adduser --system --uid 1001 --ingroup spaceguard spaceguard

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone server output
COPY --from=builder /app/apps/web/.next/standalone ./
# Copy static assets
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# Copy public folder (if it exists)
COPY --from=builder /app/apps/web/public ./apps/web/public

# Switch to non-root user
USER spaceguard

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Next.js standalone outputs server.js at the app root
CMD ["node", "apps/web/server.js"]
