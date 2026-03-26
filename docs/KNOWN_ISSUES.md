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

## Fixed in Code Review (2026-03-26, Part 7)

### Missing tenant isolation on data listing endpoints

**Files**: `apps/api/src/routes/alerts.ts`, `apps/api/src/routes/incidents.ts`,
`apps/api/src/routes/assets.ts`, `apps/api/src/routes/compliance.ts`,
`apps/api/src/routes/telemetry.ts`, `apps/api/src/routes/supply-chain.ts`,
`apps/api/src/routes/audit.ts`

**Severity**: HIGH (security)

All list/stats endpoints accepted an `organizationId` query parameter but never
verified the requesting user belonged to that organization. Any authenticated
user could query another org's data by guessing UUIDs. Added `assertTenant()`
checks across all affected routes.

### Missing admin guard on admin-sparta routes

**File**: `apps/api/src/index.ts`

The `/api/v1/admin/*` route group had `authMiddleware` but no `adminOnly` guard.
Any authenticated user could access admin SPARTA management endpoints. Added
`adminOnly` middleware to the admin route group.

### Audit log actor set to raw Authorization header

**File**: `apps/api/src/routes/auth.ts`

The register endpoint's audit log used the raw `Authorization` header as actor
instead of the user's email. Changed to use `extractActor(c)` for consistent
audit trail formatting.

### Non-null assertions in full-demo.ts

**File**: `scripts/full-demo.ts`

All `orgMap.get("...")!` and `assetMap.get("...")!` calls used TypeScript non-null
assertions, which bypass null checks and crash at runtime with unhelpful errors.
Replaced with `requireOrg()` and `requireAsset()` helper functions that throw
descriptive error messages.

## Fixed in Code Review (2026-03-26, Part 8)

### Missing tenant isolation on export endpoints

**File**: `apps/api/src/routes/exports.ts`

**Severity**: HIGH (security)

All 5 export endpoints (alerts CSV, incidents CSV, compliance CSV, audit CSV,
STIX bundle) accepted an `organizationId` parameter but never verified the
requesting user belonged to that organization. Any authenticated user could
export another org's data. Added `assertTenant()` checks to all 5 endpoints.

### Missing tenant isolation on single-resource endpoints

**Files**: `apps/api/src/routes/alerts.ts`, `apps/api/src/routes/assets.ts`,
`apps/api/src/routes/incidents.ts`

**Severity**: HIGH (security)

GET, PUT, and DELETE endpoints for individual alerts, assets, and incidents did
not verify the resource belonged to the requesting user's organization. A user
could read, modify, or delete any resource by guessing its UUID. Added
`assertTenant()` checks after fetching the resource (fetch-then-verify pattern).

### Missing tenant isolation on incident sub-resource endpoints

**File**: `apps/api/src/routes/incidents.ts`

**Severity**: HIGH (security)

All incident sub-resource endpoints (GET/POST alerts, notes, reports, and
PUT submit report) did not verify the parent incident belonged to the user's
organization. Added `assertTenant()` checks that verify the parent incident's
`organizationId` before proceeding.

### Missing tenant isolation on supply-chain risk-summary

**File**: `apps/api/src/routes/supply-chain.ts`

**Severity**: HIGH (security)

The `/supply-chain/risk-summary` endpoint accepted an `organizationId` but
did not verify the user belonged to that organization. Added `assertTenant()`.

### Missing UUID validation on GET /users organizationId

**File**: `apps/api/src/routes/auth.ts`

**Severity**: MEDIUM (validation)

The admin GET `/users` endpoint accepted an optional `organizationId` query
parameter without validating it was a valid UUID. Added `assertUUID()` guard.

## Open: Frontend Improvements (Deferred)

### Missing AbortController on data fetching

**Pages**: dashboard, alerts, incidents, assets, telemetry, supply-chain

Most pages fetch data in useEffect hooks without using AbortController. If the
user switches organizations rapidly, stale responses could overwrite newer data.
Pages use `mountedRef` to prevent unmount updates but do not cancel in-flight
requests.

### Silent error handling in several dialogs

**Pages**: compliance (MapAssetDialog), incidents (CreateIncidentDialog)

Several dialog submit handlers catch errors silently without displaying feedback
to the user. The dialogs close with no indication that the operation failed.

### ~~IntelContextCard error state not rendered~~ (Resolved)

Already fixed: the component renders the error at line 200 via
`{error ?? "No matched SPARTA techniques found..."}`.

## Fixed in Code Review (2026-03-26, Part 9)

### Missing tenant isolation on supply-chain single-resource endpoints

**Files**: `apps/api/src/routes/supply-chain.ts`

**Severity**: HIGH (security)

GET, PUT, and DELETE endpoints for individual suppliers did not verify the
supplier belonged to the requesting user's organization. Added `assertTenant()`
checks using the fetch-then-verify pattern on all three endpoints.

### Missing tenant isolation on organization GET/:id and PUT/:id

**File**: `apps/api/src/routes/organizations.ts`

**Severity**: HIGH (security)

The `GET /organizations/:id` and `PUT /organizations/:id` endpoints did not
verify the requested organization matched the user's JWT organizationId. A user
could read or update any organization by guessing its UUID. Added
`assertTenant(c, org.id)` and `assertTenant(c, id)` respectively.

### Missing tenant isolation on compliance mappings list

**File**: `apps/api/src/routes/compliance.ts`

**Severity**: MEDIUM (security)

The `GET /compliance/mappings` endpoint accepted an optional `organizationId`
filter but did not verify the user belonged to that organization. Added
`assertTenant()` when organizationId is provided.

### Audit route does not default to user's organization

**File**: `apps/api/src/routes/audit.ts`

**Severity**: MEDIUM (data leakage)

When no `organizationId` query parameter was provided, the audit list endpoint
returned logs from all organizations. Now defaults to the authenticated user's
`organizationId` from the JWT token.

### Generic error messages in export functions

**File**: `apps/web/lib/api.ts`

**Severity**: MEDIUM (user experience)

All 5 export functions (alerts CSV, incidents CSV, compliance CSV, audit CSV,
STIX bundle) threw a generic "Export failed" error without parsing the response
body. Users got no context for why an export failed (e.g., 403 from tenant
check). Updated all 5 functions to parse the error response body using the same
pattern as the PDF export functions.

## Fixed: Part 10 - Tenant Validation & Data Integrity (2026-03-26)

### Missing tenant validation on compliance mapping mutations

**Files**: `apps/api/src/routes/compliance.ts`

**Severity**: CRITICAL (security)

Three compliance mapping endpoints (POST, PUT, DELETE) were missing
`assertTenant()` calls, allowing any authenticated user to create, modify, or
delete compliance mappings belonging to other organizations. Added tenant
validation to all three handlers.

### Missing tenant validation on telemetry routes

**Files**: `apps/api/src/routes/telemetry.ts`

**Severity**: CRITICAL (security)

Five telemetry endpoints were missing `assertTenant()` calls: POST streams,
GET stream by ID, PUT stream, POST logs, and GET logs. This allowed
cross-tenant access to telemetry stream management and log ingestion/querying.
Added tenant validation to all five handlers.

### Incorrect organizationId in incident sub-resource audit logs

**Files**: `apps/api/src/routes/incidents.ts`

**Severity**: MEDIUM (audit accuracy)

Four incident sub-resource handlers (link alert, add note, generate report,
submit report) were logging the authenticated user's home organizationId
instead of the incident's actual organizationId. This produced incorrect audit
trails when ADMIN users operated on incidents belonging to other organizations
via the org-switcher. Fixed all four to use `incident.organizationId`.

### Missing streamId in baseline API response

**Files**: `packages/shared/src/schemas/anomaly.ts`,
`apps/api/src/services/detection/anomaly-detector.ts`, `apps/web/lib/api.ts`

**Severity**: LOW (data completeness)

The baseline response schema and service return types were missing `streamId`,
making it impossible for clients to identify which stream a baseline belonged
to without extra context. Added `streamId` to the Zod schema, both service
functions (`getBaselines` and `updateBaselineManual`), and the frontend type.

## Open: Architecture Decisions (Intentional)

### GET /organizations returns all organizations

The `GET /organizations` endpoint returns all organizations without tenant
filtering. This is intentional: the org-switcher in the frontend header needs
to list available orgs. In production, this should be scoped to orgs the user
has access to via a membership/role table.

### Threat intel endpoints are globally scoped

Intel endpoints (`GET /intel`, `GET /intel/:id`, `GET /intel/tactics/*`) return
data without organization filtering. This is intentional: threat intelligence
(SPARTA techniques, IOCs) is reference data shared across all tenants.

### Telemetry ingest uses API-key auth, not JWT

The `POST /telemetry/ingest/:streamId` endpoint authenticates via `X-API-Key`
header rather than JWT. This is intentional: telemetry data comes from ground
station systems, not browser sessions.
