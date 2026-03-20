# SpaceGuard: Autonomous Build Prompts
## Copy-paste these into Cowork (or Claude Code) one at a time

---

## Prompt 1: Infrastructure & Monorepo Setup

```
Read CLAUDE.md for full project context. This is a git repo pushed to GitHub.

Set up the SpaceGuard development environment:

1. Run: docker compose up -d (starts PostgreSQL + Redis)
2. Run: npm install (installs all workspace dependencies)
3. Copy .env.example to .env
4. Initialize the Next.js frontend in apps/web/ if not already done:
   - npx create-next-app@latest apps/web --typescript --tailwind --eslint --app --no-src-dir --import-alias="@/*" --use-npm --no-git
   - Add "@spaceguard/shared": "*" to apps/web/package.json dependencies
   - Add "recharts" and "@react-pdf/renderer" as dependencies
5. Install shadcn/ui in the frontend:
   - cd apps/web && npx shadcn@latest init (dark theme, slate color, CSS variables yes)
   - Add components: button card table badge dialog input select tabs dropdown-menu separator sheet tooltip label textarea popover command
6. Run npm install again from root to link everything
7. Verify: npm run dev -w apps/api starts Hono on port 3001
8. Verify: npm run dev -w apps/web starts Next.js on port 3000

Git: commit as "chore: initialize monorepo with Hono API, Next.js frontend, and shared packages" and push to origin main.
```

---

## Prompt 2: Drizzle Schema & Database

```
Read CLAUDE.md. Pull latest from git first.

Create the Drizzle ORM schema for Module 1. The Zod schemas in 
packages/shared/src/schemas/ define the shapes. Now create the 
database tables that store this data.

1. Create apps/api/src/db/schema/organizations.ts:
   - organizations table with columns matching the Organization Zod schema
   - Use pgEnum for nis2_classification
   - UUID primary key with defaultRandom()
   - created_at and updated_at with defaultNow()

2. Create apps/api/src/db/schema/assets.ts:
   - space_assets table
   - pgEnum for asset_type, asset_status, criticality
   - Foreign key to organizations
   - JSONB column for metadata
   - Index on organization_id and status

3. Create apps/api/src/db/schema/compliance.ts:
   - compliance_requirements table (pre-populated, read-only data)
   - pgEnum for regulation, compliance_status
   - compliance_mappings table linking orgs/assets to requirements
   - Foreign keys to organizations, space_assets (nullable), requirements
   - Index on organization_id, requirement_id, status

4. Update apps/api/src/db/schema/index.ts to export everything

5. Run: cd apps/api && npx drizzle-kit push
   This syncs the schema directly to the database.

6. Verify tables exist by connecting to PostgreSQL and listing them.

Git: commit as "feat: add Drizzle schema for organizations, assets, and compliance" and push.
```

---

## Prompt 3: Seed Data Loader

```
Pull latest. Read CLAUDE.md.

Create seed-data/seed.ts that:

1. Connects to PostgreSQL using the postgres driver (same as Drizzle uses)
2. Reads seed-data/nis2-requirements.json
3. Inserts all 18 requirements into the compliance_requirements table
4. Is idempotent: uses ON CONFLICT DO NOTHING or checks before inserting
5. Logs how many requirements were inserted vs skipped
6. Closes the database connection when done

Run it with: npx tsx seed-data/seed.ts
Verify: query the database and confirm 18 rows in compliance_requirements.

Git: commit as "feat: add NIS2 seed data loader with 18 space-specific requirements" and push.
```

---

## Prompt 4: Organization & Asset CRUD API

```
Pull latest. Read CLAUDE.md for API endpoint specifications.

Build the full CRUD API for organizations and space assets.

1. Create apps/api/src/services/organization.service.ts:
   - createOrganization, getOrganization, listOrganizations, updateOrganization
   - All functions use Drizzle ORM queries
   - Use the Zod schemas from @spaceguard/shared to validate inputs
   - Return typed responses

2. Create apps/api/src/services/asset.service.ts:
   - createAsset, getAsset, listAssets, updateAsset, deleteAsset
   - listAssets supports filtering by organizationId, type, status
   - Pagination with page/perPage
   - deleteAsset is soft delete (set status to DECOMMISSIONED)

3. Create apps/api/src/routes/organizations.ts:
   - Hono router with POST/GET/GET:id/PUT for organizations
   - Parse and validate request bodies with Zod schemas
   - Return proper HTTP status codes (201 created, 404 not found, etc.)
   - Consistent error responses: { error: string }

4. Create apps/api/src/routes/assets.ts:
   - Hono router with POST/GET/GET:id/PUT/DELETE for assets
   - Parse query params for filtering with assetQuerySchema

5. Mount both routers in apps/api/src/index.ts under /api/v1

6. Test every endpoint manually:
   - Create an org, verify it returns with ID
   - Create 2 assets under that org
   - List assets, filter by type
   - Update an asset
   - Get single asset by ID
   Show me the curl commands and responses.

Git: 
- "feat: add organization CRUD service and routes"
- "feat: add space asset CRUD service and routes"
Push both.
```

---

## Prompt 5: Compliance API (Requirements + Mappings + Dashboard)

```
Pull latest. Read CLAUDE.md.

Build the compliance API layer:

1. Create apps/api/src/services/compliance.service.ts:
   - listRequirements(filters): query compliance_requirements with optional 
     regulation and category filters
   - getRequirement(id): single requirement
   - createMapping, updateMapping, deleteMapping: CRUD for compliance_mappings
   - listMappings(filters): filter by orgId, assetId, requirementId, status
   - getDashboard(organizationId): the big one. Calculate:
     * Overall compliance score (% of mapped requirements that are COMPLIANT)
     * Count by status (NOT_ASSESSED, NON_COMPLIANT, etc.)
     * Score breakdown by category
     * List of gaps (non-compliant + not-assessed requirements with affected assets)
     * Asset summary (count by type and criticality)
     If no mappings exist, auto-create NOT_ASSESSED mappings for all requirements

2. Create apps/api/src/routes/compliance.ts:
   - GET /api/v1/compliance/requirements (with query filters)
   - GET /api/v1/compliance/requirements/:id
   - POST/GET/PUT/DELETE /api/v1/compliance/mappings
   - GET /api/v1/compliance/dashboard?organizationId=xxx

3. Mount in index.ts

4. Test the full flow:
   - Seed data should already be loaded (18 requirements)
   - Use the org created in Prompt 4
   - Hit the dashboard endpoint (should show all NOT_ASSESSED)
   - Create a few mappings with different statuses
   - Hit dashboard again, verify scores calculate correctly
   Show me the dashboard JSON response.

Git: "feat: add compliance requirements, mappings, and dashboard API" and push.
```

---

## Prompt 6: PDF Report Generation

```
Pull latest. Read CLAUDE.md.

Build PDF compliance report generation:

1. Create apps/api/src/services/report.service.ts:
   - generateCompliancePdf(organizationId): 
     * Fetches the same data as the dashboard endpoint
     * Generates a PDF using @react-pdf/renderer
     * Returns a Buffer containing the PDF

2. The PDF should contain:
   - Title page: "SpaceGuard Compliance Report" with org name and date
   - Executive summary: overall score, total requirements, gap count
   - Compliance matrix: table with requirement title, category, status 
     (use colored text or symbols for status)
   - Gap analysis: detailed list of non-compliant items with 
     evidence guidance for each
   - Asset inventory: table of all assets with type, status, criticality
   - Professional styling: dark navy background (#0a0f1e), 
     white text, blue accents for headers

3. Create apps/api/src/routes/reports.ts:
   - GET /api/v1/reports/compliance/pdf?organizationId=xxx
   - Returns the PDF as application/pdf with proper content-disposition header

4. Mount in index.ts

5. Test: curl the endpoint and save the output as a .pdf file. 
   Open it and verify it looks professional.

Git: "feat: add NIS2 compliance PDF report generator" and push.
```

---

## Prompt 7: Frontend Layout & Navigation

```
Pull latest. Read CLAUDE.md for UI design direction.

Build the application shell for the Next.js frontend in apps/web/:

1. app/layout.tsx - Root layout:
   - Dark theme (bg-slate-950 body)
   - Collapsible sidebar (240px expanded, 64px collapsed) on the left:
     * SpaceGuard logo/name at top
     * Nav items: Dashboard, Assets, Compliance, Reports
     * Each with an icon (use lucide-react icons)
     * Active state highlighting
     * Collapse toggle button at bottom
   - Main content area taking remaining width
   - Top bar with page title and a placeholder user avatar/menu

2. app/globals.css - Dark theme defaults matching shadcn dark mode

3. lib/api.ts - Typed API client:
   - const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
   - Generic async function: api<T>(path, options?) => Promise<T>
   - Convenience methods: api.get<T>(path), api.post<T>(path, body), 
     api.put<T>(path, body), api.delete(path)
   - Error handling: throw on non-2xx with the error message from response
   - Specific functions: getOrganizations(), getAssets(), getDashboard(orgId), etc.

4. Import types from @spaceguard/shared for all API calls

5. Verify: the app loads at localhost:3000, sidebar renders, 
   navigation links work (pages can be empty stubs for now)

Git: "feat: add frontend layout with dark theme sidebar navigation" and push.
```

---

## Prompt 8: Dashboard Page

```
Pull latest. Read CLAUDE.md.

Build the main dashboard at apps/web/app/page.tsx:

Fetch data from GET /api/v1/compliance/dashboard?organizationId=xxx
(For MVP, hardcode the org ID or pick the first org from the list endpoint)

Layout:
1. Top row - 4 stat cards side by side:
   - Overall Compliance Score: large percentage number with a small 
     donut/ring chart (Recharts PieChart). Green if >70, amber if 40-70, red if <40.
   - Total Assets: count with small breakdown text "2 satellites, 2 ground stations..."
   - Open Gaps: count of NON_COMPLIANT + NOT_ASSESSED, red badge
   - Requirements Covered: "X of Y assessed" with progress bar

2. Middle row - full width:
   - Compliance by Category: horizontal stacked bar chart (Recharts)
   - One bar per NIS2 category (Risk Management, Incident Handling, etc.)
   - Segments colored: emerald (compliant), amber (partial), red (non-compliant), 
     slate-700 (not assessed)

3. Bottom row - two columns:
   - Left (60%): Gap Analysis table using shadcn Table
     - Columns: Requirement, Category, Status (colored Badge), Affected Assets
     - Only show NON_COMPLIANT and NOT_ASSESSED items
     - Rows clickable (link to /compliance later)
   - Right (40%): Asset Overview
     - Small cards for each asset type with count and status indicators

Handle states: loading (skeleton), empty (friendly message + "Add your first asset"), 
error (toast or inline message).

Use "use client" where needed for interactivity and data fetching.
Use shadcn Card, Table, Badge components.

Git: "feat: add compliance dashboard with charts and gap analysis" and push.
```

---

## Prompt 9: Asset Management Pages

```
Pull latest. Read CLAUDE.md.

Build asset management pages in apps/web/:

1. app/assets/page.tsx - Asset list:
   - Fetch assets from GET /api/v1/assets
   - shadcn Table with columns: Name, Type (Badge), Status (Badge), 
     Criticality (Badge with color), Created date
   - Filter bar above table: AssetType dropdown, Status dropdown, clear filters button
   - "Add Asset" button in top right -> opens a Sheet (side panel) with creation form
   - Click row navigates to /assets/[id]

2. app/assets/[id]/page.tsx - Asset detail:
   - Fetch single asset from GET /api/v1/assets/:id
   - Header card: name, type badge, status badge, criticality badge
   - Description section
   - Metadata section: render JSONB as a clean key-value grid
   - Compliance section: list all compliance mappings for this asset
     with status badges. If none, show "No compliance mappings yet"
   - Edit button -> opens Sheet with pre-filled edit form
   - Back button

3. Asset creation/edit form (reusable component):
   - Fields: name (input), assetType (select with all enum values), 
     description (textarea), status (select), criticality (select)
   - Dynamic metadata fields based on asset type:
     - Satellites: orbit altitude (number), inclination (number), NORAD ID (string)
     - Ground stations: location (string), antenna type (string), frequency bands (string)
     - Control centers: location (string), redundancy level (select)
   - Form validation using the Zod schemas from @spaceguard/shared
   - Submit calls the API, closes the sheet, refreshes the list

Git: "feat: add asset list, detail, and create/edit pages" and push.
```

---

## Prompt 10: Compliance Mapping Page

```
Pull latest. Read CLAUDE.md.

Build the compliance mapping interface at apps/web/app/compliance/page.tsx:

This is the most important workflow page. Layout:

Left panel (40% width, scrollable):
- Requirements grouped by category using collapsible sections
- Each category header shows: name + "X of Y compliant" badge
- Under each category, list requirements as clickable cards:
  * Title, article reference
  * Status badge (colored by compliance status)
  * Click to select (highlights card, loads detail in right panel)

Right panel (60% width):
- Shows selected requirement detail:
  * Title, article reference, full description
  * Evidence guidance section (what the operator needs to provide)
  * Applicability notes for space sector

- Below detail, a "Compliance Status" section:
  * Organization-level status: dropdown to set overall status for this requirement
  * Asset-level mappings table: 
    - Each asset that's mapped to this requirement
    - Status dropdown per asset
    - Evidence description textarea per asset
    - Responsible person input per asset
    - Next review date picker per asset
    - Save button per row (or auto-save on change)
  * "Add Asset Mapping" button: opens a dialog to select an asset and create mapping

Make the interaction smooth. When status changes, update the left panel 
badge immediately (optimistic update). Use React state management, 
not full page reloads.

Git: "feat: add compliance mapping interface with requirement detail and status tracking" and push.
```

---

## Prompt 11: Reports Page & PDF Download

```
Pull latest. Read CLAUDE.md.

Build the reports page at apps/web/app/reports/page.tsx:

1. Page header: "Compliance Reports"

2. Report card: "NIS2 Compliance Report"
   - Description: "Generate a comprehensive compliance status report 
     for your organization, ready for auditors and authorities."
   - Preview section showing key stats (pull from dashboard endpoint):
     * Overall score
     * Requirements assessed count
     * Gap count
   - "Generate PDF Report" button:
     * On click, fetches /api/v1/reports/compliance/pdf?organizationId=xxx
     * Shows loading spinner while generating
     * Triggers browser download with filename: 
       spaceguard-compliance-YYYY-MM-DD.pdf
   - "Last generated" timestamp (store in localStorage)

3. Future report placeholders (grayed out, "Coming Soon" badge):
   - "Incident Summary Report"
   - "Threat Landscape Briefing"
   - "Supply Chain Risk Assessment"
   These are not functional, just visual placeholders showing the product roadmap.

Git: "feat: add reports page with PDF download" and push.
```

---

## Prompt 12: Demo Data & Final Polish

```
Pull latest. Read CLAUDE.md.

Final polish for Module 1:

1. Create scripts/demo-data.ts (run with npx tsx scripts/demo-data.ts):
   - Creates organization: "Hellas Constellation Systems" 
     (Greece, ESSENTIAL, contact@hellas-constellation.eu)
   - Creates 6 assets:
     * HellasSat-1 (LEO_SATELLITE, OPERATIONAL, CRITICAL, 
       metadata: { altitude_km: 550, inclination: 97.4, norad_id: "58001" })
     * HellasSat-2 (LEO_SATELLITE, OPERATIONAL, HIGH,
       metadata: { altitude_km: 550, inclination: 97.4, norad_id: "58002" })
     * Thessaloniki Ground Station (GROUND_STATION, OPERATIONAL, CRITICAL,
       metadata: { location: "Thessaloniki, Greece", antenna_type: "13m parabolic", bands: "S-band, X-band" })
     * Athens Ground Station (GROUND_STATION, OPERATIONAL, HIGH,
       metadata: { location: "Athens, Greece", antenna_type: "9m parabolic", bands: "S-band" })
     * Athens Mission Control (CONTROL_CENTER, OPERATIONAL, CRITICAL,
       metadata: { location: "Athens, Greece", redundancy: "Active-Standby" })
     * Primary TT&C Link (UPLINK, OPERATIONAL, CRITICAL,
       metadata: { frequency: "2025-2120 MHz", protocol: "CCSDS TC", encryption: "None - pending" })
   - Creates compliance mappings with mixed statuses:
     * 6 requirements mapped as COMPLIANT
     * 4 as PARTIALLY_COMPLIANT
     * 3 as NON_COMPLIANT
     * 5 as NOT_ASSESSED
   - Make sure seed data is loaded first (run seed.ts if needed)

2. Review all frontend pages:
   - Dashboard loads with real data and charts render
   - Assets page lists all 6 assets with correct badges
   - Asset detail shows metadata nicely
   - Compliance page groups requirements and shows status
   - PDF report downloads and opens correctly
   - Fix any visual bugs, missing loading states, or error handling

3. Add a small "Powered by SpaceGuard" footer link

4. Update the root README.md:
   - Project name and one-line description
   - Screenshot placeholder
   - Quick start instructions (docker compose up, npm install, npm run dev)
   - Tech stack list
   - License: proprietary

Git: 
- "feat: add demo data script for Hellas Constellation Systems"
- "fix: polish UI, loading states, and error handling"
- "docs: add README with setup instructions"
Push all.
```

---

## After Module 1: What to Tell Cowork Next

Once all 12 prompts are done, update CLAUDE.md for Module 2. Send this to Cowork:

```
Module 1 is complete. Update CLAUDE.md:

1. Change "Current Phase" to "Module 2 - Telemetry Ingestion Pipeline"
2. Add Module 2 data model:
   - telemetry_streams table (source, protocol, sample_rate, linked asset)
   - telemetry_points TimescaleDB hypertable (time, stream_id, apid, 
     parameter_name, value_float, value_raw, quality_flag)
   - ground_segment_logs table (time, source, severity, message, structured_data JSONB)
3. Add Module 2 API endpoints:
   - POST /api/v1/telemetry/ingest (accept CCSDS packets or JSON telemetry)
   - GET /api/v1/telemetry/streams
   - GET /api/v1/telemetry/points?streamId=&from=&to= (time-range query)
4. Add CCSDS Space Packet Protocol reference for the parser
5. Update "What NOT to Build Yet" to exclude Modules 3-5

Commit as "docs: update CLAUDE.md for Module 2 telemetry ingestion" and push.
```
