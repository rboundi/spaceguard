# Known Issues and Intentional Limitations

Last updated: 2026-03-26

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

## Fixed in Code Review (2026-03-25, Part 4)

### Missing auth headers on PDF downloads and SPARTA file upload

**File**: `apps/web/lib/api.ts`

Five PDF download functions and the SPARTA bundle upload used raw `fetch()` calls without Authorization headers, bypassing the centralized `request()` helper. All authenticated API calls would fail with 401. Added `headers: exportHeaders()` to all 6 functions.

### Missing organizationId in admin-sparta audit logs

**File**: `apps/api/src/routes/admin-sparta.ts`

All 4 `logAudit()` calls (import, fetch, settings update, duplicates check) were missing `organizationId`. Added `user?.organizationId` (optional chaining since admin routes may not always have org context).

### Missing UUID validation on PUT /users/:id

**File**: `apps/api/src/routes/auth.ts`

The user update endpoint did not validate the `:id` parameter, so an invalid ID would be passed directly to the database. Added `assertUUID(id, "id")`.

### Silent error swallowing in incident note submission

**File**: `apps/web/app/incidents/[id]/page.tsx`

The note add form had an empty catch block. Errors were silently discarded, leaving users with no feedback on failure. Added `noteError` state and a red error message display.

## Fixed in Code Review (2026-03-25, Part 3)

### Missing organizationId in Audit Logs

**Files**: `apps/api/src/routes/incidents.ts`, `apps/api/src/routes/intel.ts`

Five `logAudit()` calls in incidents.ts (link alert, add note, generate report, submit report) and one in intel.ts (create intel) were missing the `organizationId` field, making those audit entries impossible to filter by organization. Added `organizationId: user.organizationId` to all affected calls.

### Duplicate UUID Validation Logic

**Files**: 8 route files each had their own copy of `UUID_RE` regex and `assertUUID()` function.

Extracted to `apps/api/src/middleware/validate.ts` and updated all route files to import from the shared module. Removed now-unused `HTTPException` imports from files that only needed it for the duplicated assertUUID.

## Open: Settings and Configuration

### In-memory Rule Overrides

Detection rule enable/disable state and threshold overrides are stored in an in-memory `Map` in `apps/api/src/routes/settings.ts`. All customizations are lost on server restart. Production should persist these in the database per organization.

### In-memory Rate Limits

Telemetry stream rate limits are acknowledged and audit-logged but not enforced. The PUT endpoint returns success without persisting the value.

### Test Notification is a Stub

`POST /settings/notifications/test` logs an audit entry and returns success but does not send an email. The notification service needs to be wired in.

### Integration Tab Placeholders

The Integrations tab (webhook, syslog, STIX/TAXII, Slack, Teams) is entirely UI. No backend endpoints exist.

### API Keys Tab Uses Demo Data

The API Keys tab displays hardcoded demo keys. Create/revoke functionality is not implemented.

## Open: Type Safety

### Unsafe Buffer-to-BodyInit Cast in PDF Routes

PDF generation uses `buffer as unknown as BodyInit` in 5 places in `apps/api/src/routes/reports.ts`. Should construct a proper `Response` with the buffer as `Uint8Array` or use Hono streaming helpers.

### Inconsistent Error Response Shapes

Most routes return `{ error: string }`, some use `{ error: string, cause: unknown }` (telemetry), and settings uses `{ success: true, message: string }`. Should standardize across all endpoints.

## Open: Frontend Gaps

### Silent Error Handling in Compliance and Alerts

- `apps/web/app/compliance/page.tsx`: `handleSave` catch reverts state silently with no toast or error message
- `apps/web/app/compliance/page.tsx`: `MapAssetDialog` createMapping catch is empty
- `apps/web/app/alerts/page.tsx`: IntelContextCard error state set but never rendered

### Race Conditions on Rapid Org/Filter Changes

Several pages (incidents, alerts, assets) fetch data on org/filter change without
aborting previous in-flight requests. If a user switches organization rapidly,
stale responses could overwrite newer data. Pages use `mountedRef` to prevent
unmount updates but do not cancel mid-flight requests.

**Resolution path**: Use AbortController in fetch calls and cancel previous
requests when dependencies change.

## Fixed in Code Review (2026-03-26, Part 6)

### Missing onDelete cascade on users and sessions

**Files**: `apps/api/src/db/schema/users.ts`

The `users.organization_id` and `sessions.user_id` foreign keys lacked
`onDelete: "cascade"`. Deleting an organization would fail with FK constraint
violations because user and session rows were not automatically removed.
Added `{ onDelete: "cascade" }` to both references.

### Unvalidated JSON body in compliance initialize endpoint

**File**: `apps/api/src/routes/compliance.ts`

The `POST /compliance/initialize` endpoint used raw `c.req.json()` without
Zod validation. Malformed JSON would throw an unhandled exception. Replaced
with `zValidator("json", ...)` for consistent error handling.

### Hardcoded criticality string instead of enum

**File**: `apps/api/src/services/asset.service.ts`

The default criticality was hardcoded as `"MEDIUM"` string literal instead of
using `Criticality.MEDIUM` from the shared enum. Fixed to use the enum constant.

### Missing parameter validation in intel routes

**File**: `apps/api/src/routes/intel.ts`

The `GET /intel/tactics/:tacticId/techniques` and `GET /intel/techniques/:id`
endpoints accepted parameters without validation. Added empty/whitespace checks
with proper 400 error responses.

### Em dash character in PDF report service

**File**: `apps/api/src/services/report.service.tsx`

Used em dash character in `fmtDateShort()` fallback, violating the project's
"no em dashes" convention. Replaced with "N/A".

### Simplified full-demo.ts cleanup with cascades

**File**: `scripts/full-demo.ts`

Now that users/sessions cascade from organization deletion, simplified the
idempotent cleanup from 4 explicit DELETE statements to 2 (audit_log +
organization). All other dependent tables cascade automatically.
