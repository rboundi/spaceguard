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

### Recharts callback type

**Status**: Fixed (code review pass, March 2026)
**Impact**: None

Previously `apps/web/app/page.tsx` used `props: any` for the Recharts
custom label renderer. This has been replaced with an explicit typed
interface.

### AlertStats type not in shared package

**Status**: Deferred
**Impact**: Low

The `AlertStats` interface is defined only in the frontend (`api.ts`) and
the backend (`alert.service.ts`). It should be added to
`packages/shared/src/schemas/alert.ts` for consistency.

### Linter strips newly-added exports and imports

**Status**: Recurring issue
**Impact**: High (causes runtime crashes)

An automatic linter runs on save and removes exports/imports it considers
"unused". This has repeatedly broken the app by stripping:
- `export * from "./schemas/sparta"` from `packages/shared/src/index.ts`
- Admin sidebar items and icon imports from `Sidebar.tsx`
- SPARTA API functions from `apps/web/lib/api.ts`

**Resolution path**: Configure ESLint to not flag re-exports from barrel
files (index.ts). Consider adding `// eslint-disable-next-line` guards on
critical re-export lines, or switch to explicit named exports that the
linter can trace.

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

### Audit log organizationId is nullable

**Status**: Intentional
**Impact**: Low

The `audit_log.organization_id` column is nullable to support system-level
events (login/logout, platform-wide actions) that are not scoped to a
specific organization. The audit middleware infers organizationId from the
URL path when possible, but some events (e.g. system health checks) have
no org context.

### No database CHECK constraint on threat_intel.confidence

**Status**: Deferred
**Impact**: Low (Zod validates 0-100 at API boundary)

The `confidence` column in `threat_intel` allows any integer at the
database level. The Zod schema enforces 0-100 at the API layer, but
direct database inserts (e.g. seed scripts) could set invalid values.

**Resolution path**: Add `CHECK (confidence >= 0 AND confidence <= 100)`
in a future migration.

### OrgContext does not expose API error state

**Status**: Deferred
**Impact**: Medium (header stays in skeleton on API failure)

If the initial `getOrganizations()` call fails in `OrgProvider`, the error
is silently caught. There is no `error` field in `OrgContextValue`, so
consuming components cannot display an error message. The user sees
an indefinite loading skeleton.

**Resolution path**: Add `error: string | null` to the context value and
display a retry button in the Header component.
