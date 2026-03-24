# Known Issues and Intentional Limitations

## Architecture

### Frontend type definitions are duplicated from shared schemas

**Status**: Intentional limitation
**Impact**: Low (types are manually synchronized)

The frontend API client (`apps/web/lib/api.ts`) defines its own response
interfaces (AlertResponse, IncidentResponse, IntelResponse, etc.) using
string literal unions instead of importing from `@spaceguard/shared`.

This is intentional: the shared Zod schemas use `z.nativeEnum()` which
infers to TypeScript nominal enum types (e.g. `IncidentStatus`), but JSON
deserialization produces plain strings. The frontend types use string
literal unions to match the JSON wire format.

**Resolution path**: Refactor shared schemas to use `z.enum()` with string
literal arrays instead of `z.nativeEnum()`, then import types directly
in the frontend. This is a cross-cutting change that should be done as a
dedicated task.

### Missing `constants.ts` in shared package

**Status**: Deferred
**Impact**: Low

CLAUDE.md project structure mentions a `packages/shared/src/constants.ts`
for NIS2 categories, SPARTA tactics, and other shared constants. This file
does not exist yet. Constants are currently embedded in frontend components
and seed data files.

## Backend

### Fire-and-forget patterns in alert creation

**Status**: Intentional (with logging)
**Impact**: Medium

When a HIGH/CRITICAL alert is created, incident auto-creation and Redis
pub/sub notifications are dispatched as fire-and-forget promises. If either
fails, only a console.error is logged. The alert itself is still persisted
to the database.

This is acceptable for the current phase because:
- The alert (primary data) is always persisted before side effects
- Redis unavailability is transient and self-recovering
- Incident auto-creation failures are logged for operational review

**Resolution path**: Add a dead-letter queue or retry mechanism for failed
side effects. Consider a health check endpoint that reports Redis
connectivity and recent side-effect failures.

### TimescaleDB hypertable setup is manual

**Status**: Known limitation
**Impact**: Low (dev setup only)

The `telemetry_points` table requires a manual
`SELECT create_hypertable(...)` call after initial migration. This is not
automated in the Drizzle migration flow because Drizzle Kit does not
natively support TimescaleDB DDL.

**Resolution path**: Add a post-migration script or include the hypertable
creation in `seed-data/seed.ts`.

## Frontend

### Recharts callback uses `any` type

**Status**: Accepted
**Impact**: None (guarded by explicit cast)

In `apps/web/app/page.tsx`, the `renderLabel` callback for Recharts' Bar
component accepts `props: any` because Recharts does not export a typed
props interface for custom label renderers. The function immediately casts
to a known shape.

### AlertStats type not in shared package

**Status**: Deferred
**Impact**: Low

The `AlertStats` interface is defined only in the frontend (`api.ts`) and
the backend (`alert.service.ts`). It should be added to
`packages/shared/src/schemas/alert.ts` for consistency.

## Data

### No automated end-to-end test suite

**Status**: Not yet implemented
**Impact**: Medium

There are no integration tests that verify API endpoints against a real
database. Runtime verification is currently manual. A test harness using
Vitest and a Docker-based PostgreSQL fixture should be added before
production deployment.

### LIKE pattern wildcards not escaped in search queries

**Status**: Low priority
**Impact**: Low (cosmetic, not a security issue)

User search input containing SQL LIKE wildcards (`%` or `_`) is passed
directly into ILIKE patterns (e.g. `%${query.q}%`). This is safe because
Drizzle parameterizes the values, but a search for literal `%` or `_`
characters will match more broadly than expected.

**Resolution path**: Escape `%` and `_` in user search input before
constructing LIKE patterns.
