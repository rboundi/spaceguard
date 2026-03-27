# =============================================================================
# SpaceGuard API - Production Dockerfile
# Multi-stage build: compile TypeScript, then run with minimal production image
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
COPY apps/api/package.json apps/api/

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
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# Copy source code
COPY package.json turbo.json ./
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Build shared package first, then API
RUN cd packages/shared && npx tsc
RUN cd apps/api && npx tsc

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
ENV PORT=3001

# Copy only production node_modules and built output
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# Copy compiled output
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy package.json files (Node.js needs them for module resolution)
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Copy Drizzle migration files for runtime migrations
COPY apps/api/src/db/migrations ./apps/api/src/db/migrations
COPY apps/api/drizzle.config.ts ./apps/api/

# Copy seed data (needed for initial setup)
COPY seed-data/ ./seed-data/

# Switch to non-root user
USER spaceguard

EXPOSE 3001

# Health check: hit the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "apps/api/dist/index.js"]
