# =============================================================================
# SpaceGuard Dev Image
# Shared base for API and Web dev containers.
# Installs all dependencies once; source code is bind-mounted at runtime.
# =============================================================================

FROM node:22-alpine

# Security: run as non-root user (matches production Dockerfiles)
# Note: bind mounts on Linux inherit host UID, so file watching works.
# On macOS Docker Desktop, files are mapped through gRPC-FUSE and work
# regardless of container user.
RUN addgroup --system --gid 1001 spaceguard && \
    adduser --system --uid 1001 --ingroup spaceguard spaceguard

WORKDIR /app

# Copy workspace config and all package.json files
COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Install all dependencies (dev + prod)
# Run as root for npm ci, then fix ownership
RUN npm ci && chown -R spaceguard:spaceguard /app

# Copy shared package source (needed for initial build)
COPY --chown=spaceguard:spaceguard packages/shared/ packages/shared/

# Copy remaining source (config files, tsconfigs, etc.)
# At runtime, bind mounts overlay the source directories for hot reload
COPY --chown=spaceguard:spaceguard apps/api/tsconfig.json apps/api/
COPY --chown=spaceguard:spaceguard apps/api/drizzle.config.ts apps/api/
COPY --chown=spaceguard:spaceguard apps/web/tsconfig.json apps/web/
COPY --chown=spaceguard:spaceguard apps/web/next.config.js apps/web/
COPY --chown=spaceguard:spaceguard apps/web/tailwind.config.ts apps/web/
COPY --chown=spaceguard:spaceguard apps/web/postcss.config.js apps/web/
COPY --chown=spaceguard:spaceguard apps/web/app/globals.css apps/web/app/

# Copy seed data and scripts (for the seed runner)
COPY --chown=spaceguard:spaceguard seed-data/ seed-data/
COPY --chown=spaceguard:spaceguard scripts/ scripts/
COPY --chown=spaceguard:spaceguard detection/ detection/

# Next.js needs a writable .next directory for dev mode
RUN mkdir -p apps/web/.next && chown spaceguard:spaceguard apps/web/.next

USER spaceguard

# Default command is overridden per-service in docker-compose.dev.yml
CMD ["echo", "Use docker-compose.dev.yml to run specific services"]
