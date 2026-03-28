# =============================================================================
# SpaceGuard Dev Image
# Shared base for API and Web dev containers.
# Installs all dependencies once; source code is bind-mounted at runtime.
# =============================================================================

FROM node:22-alpine

WORKDIR /app

# Copy workspace config and all package.json files
COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Install all dependencies (dev + prod)
RUN npm ci

# Copy shared package source (needed for initial build)
COPY packages/shared/ packages/shared/

# Copy remaining source (config files, tsconfigs, etc.)
# At runtime, bind mounts overlay the source directories for hot reload
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/drizzle.config.ts apps/api/
COPY apps/web/tsconfig.json apps/web/
COPY apps/web/next.config.js apps/web/
COPY apps/web/tailwind.config.ts apps/web/
COPY apps/web/postcss.config.js apps/web/
COPY apps/web/app/globals.css apps/web/app/

# Copy seed data and scripts (for the seed runner)
COPY seed-data/ seed-data/
COPY scripts/ scripts/
COPY detection/ detection/

# Default command is overridden per-service in docker-compose.dev.yml
CMD ["echo", "Use docker-compose.dev.yml to run specific services"]
