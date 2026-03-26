# SpaceGuard

Operational cybersecurity platform for European space infrastructure. SpaceGuard helps satellite operators comply with NIS2, monitor space systems for threats, detect anomalies, manage incidents, and generate regulatory reports.

Built for small-to-medium satellite operators (10-200 person companies) who need security tooling purpose-built for space operations.

## Features

### Module 1: Asset Registry & Compliance Mapper
Register satellites, ground stations, and infrastructure. Map NIS2 Article 21 requirements to each asset and track compliance status with per-category scoring. ENISA Space Threat Landscape 125 controls included. PDF compliance report export.

### Module 2: Telemetry Ingestion
Ingest CCSDS TM/TC frames and housekeeping telemetry via authenticated REST endpoints. TimescaleDB hypertables for time-series storage with downsampling. Configurable streams per asset with protocol support for CCSDS, Syslog, SNMP, and custom protocols. Real-time parameter charting with anomaly highlighting.

### Module 3: Detection Engine
YAML-based detection rules that analyze telemetry in real time. Anomaly detection for battery voltage, thermal parameters, reaction wheels, and comms link quality. Alerts with SPARTA tactic/technique classification. Real-time push via Redis pub/sub and WebSocket. Rule library management with enable/disable and threshold editing.

### Module 4: Incident Management
Full incident lifecycle from detection through eradication and recovery. Create incidents directly from alerts with one click. NIS2 Article 23 regulatory report generation (early warning at 24h, incident notification at 72h, intermediate at 7d, and final report at 30d) with deadline tracking. MTTD/MTTR metrics. Alert-to-incident linking with timeline reconstruction.

### Module 5: Threat Intelligence
SPARTA space-attack framework browser with tactic-grouped navigator. STIX 2.1 data model for threat intelligence objects. Alert enrichment with matched techniques, detection guidance, and mitigation recommendations. STIX bundle export for CSIRT sharing.

### Cross-cutting Features
- Guided onboarding wizard for new organizations (5-step setup)
- Organization switcher for multi-org management
- Supply chain risk management with supplier CRUD and risk scoring
- Dark theme with space/aerospace aesthetic
- Real-time alert badges in sidebar navigation
- Full audit trail with filtering, search, and CSV/PDF export
- STIX 2.1 bundle export for alerts, incidents, and threat intel
- Settings page with notification preferences and API key management
- Multi-user auth with role-based access (Admin, Operator, Auditor)

## Architecture

```
                                    SpaceGuard Architecture
  ============================================================================

  Satellite / Ground Station
        |
        | CCSDS TM/TC frames, HK telemetry
        v
  +------------------+         +-------------------+        +----------------+
  | Telemetry Ingest |-------->| TimescaleDB       |        | PostgreSQL 16  |
  | (Hono REST API)  |         | (hypertables)     |        | (assets, orgs, |
  | POST /ingest/:id |         | telemetry_points  |        |  compliance,   |
  +------------------+         +-------------------+        |  incidents,    |
        |                             |                     |  intel, alerts,|
        v                             v                     |  audit, users) |
  +------------------+         +-------------------+        +----------------+
  | Detection Engine |         | Point Queries     |               ^
  | (YAML rules,     |-------->| (downsampling,    |               |
  |  anomaly detect) |         |  time-range agg)  |               |
  +------------------+         +-------------------+               |
        |                                                          |
        | alert created                                            |
        v                                                          |
  +------------------+   pub   +-------------------+               |
  | Alert Service    |-------->| Redis 7 Pub/Sub   |               |
  | (create, enrich, |         | (real-time push)  |               |
  |  SPARTA mapping) |         +-------------------+               |
  +------------------+                |                            |
        |                             v                            |
        v                      +-------------------+               |
  +------------------+         | WebSocket Server  |               |
  | Incident Mgmt    |         | (push to browser) |               |
  | (lifecycle, NIS2 |         +-------------------+               |
  |  reports, MTTD)  |                |                            |
  +------------------+                v                            |
        |                      +-------------------+               |
        +--------------------->| Next.js 14        |<--------------+
                               | (App Router)      |
                               | 19 pages, shadcn, |
                               | Recharts, Tailwind|
                               +-------------------+
```

### Data Flow

1. Satellites and ground stations transmit CCSDS telemetry frames
2. The Hono API ingests frames via authenticated REST endpoints, storing decoded parameters in TimescaleDB hypertables
3. The detection engine evaluates YAML rules against incoming telemetry, generating alerts when thresholds are breached
4. Alerts are persisted to PostgreSQL and published to Redis for real-time WebSocket push to connected browsers
5. Operators can escalate alerts to incidents directly from the alert detail view, triggering NIS2 regulatory timeline tracking
6. Threat intelligence (SPARTA techniques) enriches alerts with detection guidance and mitigations
7. Compliance mappings track NIS2 Article 21 requirement status per asset with ENISA controls cross-referencing
8. PDF reports and STIX 2.1 bundles can be exported for regulatory bodies and CSIRTs

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | TypeScript (strict mode) | 5.x |
| Backend | Hono | 4.x |
| ORM | Drizzle ORM | 0.36.x |
| Database | PostgreSQL + TimescaleDB | 16.x |
| Validation | Zod | 3.x |
| Cache/PubSub | Redis | 7.x |
| Frontend | Next.js (App Router) | 14.x |
| Styling | Tailwind CSS | 3.x |
| Components | shadcn/ui | latest |
| Charts | Recharts | 2.x |
| Auth | JWT (jose) + scrypt | - |
| PDF Generation | @react-pdf/renderer | 4.x |
| Monorepo | Turborepo + npm workspaces | 2.x |
| Runtime | Node.js | 22.x |
| Containerization | Docker Compose | - |

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Operational overview with compliance score, active alerts, open incidents, NIS2 deadlines, telemetry health, and gap analysis |
| Onboarding | `/onboarding` | 5-step guided wizard for new organizations |
| Login | `/login` | Email/password authentication with demo credentials |
| Assets | `/assets` | Registry of satellites, ground stations, and infrastructure with type/status filters |
| Asset Detail | `/assets/[id]` | Individual asset info with compliance mappings and linked telemetry |
| Telemetry | `/telemetry` | Telemetry stream list with protocol, APID, and health status |
| Stream Detail | `/telemetry/[id]` | Time-series charts for individual stream parameters with anomaly markers |
| Alerts | `/alerts` | Security alerts with severity/status filters, pagination, expandable details, create-incident action, STIX export |
| Alert Rules | `/alerts/rules` | Detection rule library with enable/disable toggles and threshold editing |
| Incidents | `/incidents` | Incident list with severity, status, MTTD/MTTR metrics, and create dialog |
| Incident Detail | `/incidents/[id]` | Timeline, linked alerts, investigator notes, NIS2 report generation with deadline tracking |
| Threat Intel | `/intel` | STIX 2.1 intelligence objects with source/type filters |
| SPARTA Navigator | `/admin/sparta` | SPARTA technique browser grouped by tactic with search and import management |
| Compliance | `/compliance` | NIS2 Article 21 requirement mapper with per-category scoring |
| Reports | `/reports` | PDF compliance report generation and download |
| Supply Chain | `/supply-chain` | Supplier registry with risk scoring, certifications, and review tracking |
| Audit Trail | `/audit` | Full audit log with date/actor/action filters, expandable details, CSV/PDF export |
| Exports | `/exports` | STIX 2.1 bundle export with configurable data types and date ranges |
| Settings | `/settings` | Notification preferences, API key management, account settings |

## API Endpoints

### Organizations
```
POST   /api/v1/organizations              Create organization
GET    /api/v1/organizations              List organizations
GET    /api/v1/organizations/:id          Get organization
PUT    /api/v1/organizations/:id          Update organization
```

### Space Assets
```
POST   /api/v1/assets                     Create asset
GET    /api/v1/assets                     List assets (filter: organizationId, type, status)
GET    /api/v1/assets/:id                 Get asset
PUT    /api/v1/assets/:id                 Update asset
DELETE /api/v1/assets/:id                 Delete asset
```

### Compliance
```
GET    /api/v1/compliance/requirements    List requirements (filter: regulation, category)
GET    /api/v1/compliance/requirements/:id Get requirement
POST   /api/v1/compliance/mappings        Create mapping
GET    /api/v1/compliance/mappings        List mappings (filter: organizationId, assetId, status)
PUT    /api/v1/compliance/mappings/:id    Update mapping
DELETE /api/v1/compliance/mappings/:id    Delete mapping
GET    /api/v1/compliance/dashboard       Dashboard stats for organization
POST   /api/v1/compliance/initialize      Initialize all mappings for organization
```

### Telemetry
```
POST   /api/v1/telemetry/streams          Create telemetry stream
GET    /api/v1/telemetry/streams          List streams for organization
GET    /api/v1/telemetry/streams/:id      Get stream with stats
PUT    /api/v1/telemetry/streams/:id      Update stream
DELETE /api/v1/telemetry/streams/:id      Delete stream
POST   /api/v1/telemetry/ingest/:streamId Ingest telemetry data points
GET    /api/v1/telemetry/streams/:id/points Query time-series data
POST   /api/v1/telemetry/streams/:id/regenerate-key Regenerate API key
```

### Alerts
```
GET    /api/v1/alerts                     List alerts (filter: organizationId, severity, status, spartaTactic)
GET    /api/v1/alerts/:id                 Get alert
PUT    /api/v1/alerts/:id                 Update alert status
GET    /api/v1/alerts/stats               Alert statistics by severity/status
GET    /api/v1/alerts/:id/enrich          SPARTA enrichment for alert
```

### Incidents
```
POST   /api/v1/incidents                  Create incident
GET    /api/v1/incidents                  List incidents (filter: organizationId, status, severity)
GET    /api/v1/incidents/:id              Get incident
PUT    /api/v1/incidents/:id              Update incident
GET    /api/v1/incidents/active-count     Count active incidents for organization
POST   /api/v1/incidents/:id/alerts       Link alert to incident
GET    /api/v1/incidents/:id/alerts       List linked alerts
POST   /api/v1/incidents/:id/notes        Add investigator note
GET    /api/v1/incidents/:id/notes        List notes
POST   /api/v1/incidents/:id/reports      Generate NIS2 report
GET    /api/v1/incidents/:id/reports      List reports
PUT    /api/v1/incidents/:id/reports/:rid/submit  Submit report to authority
```

### Threat Intelligence
```
GET    /api/v1/intel                      List STIX objects (filter: type, source)
GET    /api/v1/intel/:id                  Get STIX object
POST   /api/v1/admin/sparta/sync          Import SPARTA techniques
GET    /api/v1/admin/sparta/status        SPARTA database status
GET    /api/v1/admin/sparta/settings      Get SPARTA settings
PUT    /api/v1/admin/sparta/settings      Update SPARTA settings
```

### Supply Chain
```
POST   /api/v1/suppliers                  Create supplier
GET    /api/v1/suppliers                  List suppliers for organization
GET    /api/v1/suppliers/:id              Get supplier
PUT    /api/v1/suppliers/:id              Update supplier
DELETE /api/v1/suppliers/:id              Delete supplier
```

### Reports & Exports
```
GET    /api/v1/reports/compliance/pdf     Download compliance PDF report
GET    /api/v1/export/alerts/csv          Export alerts as CSV
POST   /api/v1/export/stix               Export STIX 2.1 bundle
```

### Auth & Audit
```
POST   /api/v1/auth/login                Login (returns JWT)
POST   /api/v1/auth/logout               Logout
GET    /api/v1/auth/me                   Current user info
GET    /api/v1/audit                     Query audit log (filter: organizationId, action, actor, from, to)
```

## Getting Started

### Prerequisites
- Node.js 22+
- Docker and Docker Compose (for PostgreSQL and Redis)

### Quick Start

```bash
# Clone and install
git clone <repo-url> spaceguard
cd spaceguard
npm install

# Start PostgreSQL + Redis
docker compose up -d

# Run database migrations
npm run db:migrate

# Seed NIS2 requirements, ENISA controls, and SPARTA techniques
npm run db:seed

# Start the API (port 3001) and frontend (port 3000)
npm run dev
```

### Loading Demo Data

For a full demo environment with realistic multi-org data, incidents, and telemetry:

```bash
# Full demo scenario (4 orgs, users, telemetry, incidents, reports, audit trail)
npx tsx scripts/full-demo.ts

# Or skip telemetry generation for a faster setup
npx tsx scripts/full-demo.ts --skip-telemetry
```

After loading demo data, log in with:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@proba-space.eu | SpaceGuard2026! |
| Operator | operator@proba-space.eu | SpaceGuard2026! |
| Auditor | auditor@proba-space.eu | SpaceGuard2026! |

Alternative: load only multi-org test data without incidents or telemetry:

```bash
npx tsx scripts/realistic-data.ts
```

### Running the Telemetry Simulator

To generate live telemetry with configurable anomalies:

```bash
# 2 hours of telemetry with anomaly injection
npx tsx scripts/simulate-telemetry.ts --hours 2 --anomaly
```

## Screenshots

The following screenshots demonstrate SpaceGuard's key capabilities:

| Screenshot | Description |
|-----------|-------------|
| Dashboard | Operational overview showing compliance score donut chart, active incident count with NIS2 deadline countdown, recent alerts table, telemetry stream health, and gap analysis by category |
| Asset Registry | Filterable table of satellites and ground stations with type badges, status indicators, and criticality levels. Add/edit dialogs with metadata fields |
| Telemetry Charts | Real-time time-series visualization of housekeeping parameters (battery voltage, solar current, temperature) with anomaly highlighting on the stream detail page |
| Alert Investigation | Expandable alert rows showing description, SPARTA tactic/technique mapping, intelligence context with detection tips, and action buttons (Investigate, Resolve, Create Incident) |
| Incident Detail | Full incident timeline with linked alerts, investigator notes, and NIS2 report generation panel showing deadline progress bars for Early Warning, Notification, and Final Report |
| SPARTA Navigator | Tactic-grouped technique browser with search, showing technique details, detection guidance, and related mitigations |
| Compliance Mapper | NIS2 Article 21 requirements grouped by category with per-requirement status toggles, overall score calculation, and regulation filter (NIS2, ENISA, CRA) |
| Supply Chain | Supplier registry with risk score badges, certification indicators (ISO 27001, SOC 2), country flags, and overdue review warnings |
| Audit Trail | Chronological log of all platform actions with actor, resource, and timestamp filtering. Expandable rows showing full event metadata |

## Project Structure

```
spaceguard/
  packages/shared/       Zod schemas, enums, types shared by frontend and backend
  apps/api/              Hono REST API (port 3001) with Drizzle ORM
    src/db/schema/       12 schema files defining all database tables
    src/routes/          15 route files covering all API endpoints
    src/services/        Business logic layer
    src/middleware/       Auth (JWT) and error handling middleware
  apps/web/              Next.js 14 frontend (port 3000) with shadcn/ui
    app/                 19 pages using App Router
    components/          UI components (shadcn/ui + custom)
    lib/                 Typed API client and utilities
  seed-data/             NIS2 requirements, ENISA controls, SPARTA techniques
  scripts/               Setup, seed, simulation, and demo scripts
  detection/rules/       YAML detection rule definitions
  docs/                  Documentation and demo scripts
```

## License

Proprietary. All rights reserved.
