# SpaceGuard

Operational cybersecurity platform for European space infrastructure. SpaceGuard helps satellite operators comply with NIS2 and CRA, monitor space systems for threats, detect anomalies with statistical baselines, manage incidents with automated response playbooks, and generate regulatory reports.

Built for small-to-medium satellite operators (10-200 person companies) who need security tooling purpose-built for space operations.

## Features

### Module 1: Asset Registry & Compliance Mapper
Register satellites, ground stations, and infrastructure. Map NIS2 Article 21 and CRA requirements to each asset and track compliance status with per-category scoring. ENISA Space Threat Landscape 125 controls included. PDF compliance report export.

### Module 2: Telemetry Ingestion
Ingest CCSDS TM/TC frames and housekeeping telemetry via authenticated REST endpoints. TimescaleDB hypertables for time-series storage with downsampling. Configurable streams per asset with protocol support for CCSDS, Syslog, SNMP, and custom protocols. Real-time parameter charting with anomaly highlighting.

### Module 3: Detection Engine
YAML-based detection rules that analyze telemetry in real time. Statistical anomaly detection using rolling baselines with z-score calculation for battery voltage, thermal parameters, reaction wheels, and comms link quality. Alert correlation engine that auto-groups related alerts into incidents using temporal proximity, asset proximity, technique clustering, and campaign detection rules. Alerts with SPARTA tactic/technique classification. Real-time push via Redis pub/sub and WebSocket. Rule library management with enable/disable and threshold editing.

### Module 4: Incident Management
Full incident lifecycle from detection through eradication and recovery. Create incidents directly from alerts with one click, or let the correlation engine auto-create them. NIS2 Article 23 regulatory report generation (early warning at 24h, incident notification at 72h, intermediate at 7d, and final report at 30d) with deadline tracking. MTTD/MTTR metrics. Alert-to-incident linking with timeline reconstruction.

### Module 5: Threat Intelligence
SPARTA space-attack framework browser with tactic-grouped navigator. STIX 2.1 data model for threat intelligence objects. Alert enrichment with matched techniques, detection guidance, and mitigation recommendations. STIX bundle export for CSIRT sharing.

### Phase 4: Operational Intelligence

- **AI Anomaly Detection**: Statistical anomaly detection with rolling baselines. Z-score calculation for each telemetry parameter. Baselines auto-update from incoming data. Anomaly overlay on telemetry charts shows deviations from normal behavior.

- **Alert Correlation**: Four built-in correlation rules (temporal proximity, asset proximity, technique clustering, campaign detection) automatically group related alerts into incidents, reducing alert fatigue and surfacing attack campaigns.

- **Response Playbooks**: Visual playbook builder with step types (notify, isolate, diagnostic, mitigate, escalate, report). Auto-trigger playbooks based on alert severity, SPARTA tactic, or rule ID. Execution history with per-step status logging. Three pre-built templates for battery anomaly, RF interference, and unauthorized access.

- **Risk Scoring**: Five-dimension risk scoring engine (compliance, threat exposure, active alerts, supply chain, configuration) with per-asset and per-organization scores. Historical score tracking with trend visualization. Risk heatmap on dashboard.

- **Webhook and Syslog Integrations**: Syslog output in CEF, LEEF, and JSON formats for SIEM integration (Splunk, QRadar, etc.). Configurable endpoints with protocol (UDP/TCP/TLS), severity filtering, and enable/disable controls.

- **Scheduled Reports**: Automated report generation on weekly, monthly, or quarterly schedules. Report types: compliance summary, incident summary, threat briefing, supply chain review, audit trail digest. Configurable recipients.

- **Real-time WebSocket**: Server-sent alerts and incident updates pushed to connected browsers via Redis pub/sub. Sidebar badge counts update in real time.

- **Customizable Dashboard**: Drag-and-drop widget layout saved per user. Configurable widget sizes and positions. Persistent across sessions.

- **CRA Compliance**: Cyber Resilience Act requirements for space operators alongside NIS2 and ENISA controls. Shared compliance mapper supports all three regulation frameworks.

- **API Documentation**: OpenAPI/Swagger documentation served at `/developers` with interactive endpoint explorer.

- **Production Deployment**: Multi-stage Docker builds for API and frontend. Docker Compose production configuration with nginx reverse proxy, SSL termination via Let's Encrypt, and automated deployment script.

### Cross-cutting Features

- Guided onboarding wizard for new organizations (5-step setup)
- Organization switcher for multi-org management
- Supply chain risk management with supplier CRUD and risk scoring
- Dark theme with space/aerospace aesthetic
- Real-time alert badges in sidebar navigation
- Full audit trail with filtering, search, and CSV/PDF export
- STIX 2.1 bundle export for alerts, incidents, and threat intel
- Settings page with notification preferences, syslog endpoints, and API key management
- Multi-user auth with role-based access (Admin, Operator, Auditor)
- Multi-tenancy hardening with database-level tenant isolation
- Rate limiting per endpoint category (auth, API, telemetry, reports)
- Input sanitization with strict Zod schemas and JSONB size guards
- AES-256-GCM encryption for sensitive data at rest

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
        v                             v                     |  risk, play-  |
  +------------------+         +-------------------+        |  books, audit) |
  | Detection Engine |         | Anomaly Detector  |        +----------------+
  | (YAML rules,     |-------->| (baselines, z-    |               ^
  |  correlator)     |         |  score, rolling)  |               |
  +------------------+         +-------------------+               |
        |                                                          |
        | alert created / correlated                               |
        v                                                          |
  +------------------+   pub   +-------------------+               |
  | Alert Service    |-------->| Redis 7 Pub/Sub   |               |
  | (create, enrich, |         | (real-time push)  |               |
  |  SPARTA + syslog)|         +-------------------+               |
  +------------------+                |                            |
        |                             v                            |
        v                      +-------------------+               |
  +------------------+         | WebSocket Server  |               |
  | Incident Mgmt    |         | (push to browser) |               |
  | (lifecycle, NIS2 |         +-------------------+               |
  |  playbooks, risk)|                |                            |
  +------------------+                v                            |
        |                      +-------------------+               |
        +--------------------->| Next.js 14        |<--------------+
                               | (App Router)      |
                               | 21 pages, shadcn, |
                               | Recharts, Tailwind|
                               +-------------------+
```

### Data Flow

1. Satellites and ground stations transmit CCSDS telemetry frames
2. The Hono API ingests frames via authenticated REST endpoints, storing decoded parameters in TimescaleDB hypertables
3. The detection engine evaluates YAML rules against incoming telemetry, generating alerts when thresholds are breached
4. The anomaly detector compares incoming values against rolling statistical baselines, flagging z-score deviations
5. The correlation engine groups related alerts using temporal, asset, and technique proximity rules, auto-creating incidents
6. Alerts are persisted to PostgreSQL and published to Redis for real-time WebSocket push and syslog SIEM output
7. Auto-triggered playbooks execute response steps (notify, isolate, mitigate, escalate) and log execution history
8. Operators can escalate alerts to incidents directly from the alert detail view, triggering NIS2 regulatory timeline tracking
9. Risk scores are calculated across five dimensions and tracked historically for trend analysis
10. Threat intelligence (SPARTA techniques) enriches alerts with detection guidance and mitigations
11. Compliance mappings track NIS2, CRA, and ENISA requirement status per asset
12. PDF reports and STIX 2.1 bundles can be exported for regulatory bodies and CSIRTs

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
| Reverse Proxy | Nginx | 1.27.x |
| SSL | Let's Encrypt / certbot | - |

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Customizable operational overview with drag-and-drop widgets: compliance score, active alerts, open incidents, NIS2 deadlines, risk heatmap, telemetry health, and gap analysis |
| Onboarding | `/onboarding` | 5-step guided wizard for new organizations |
| Login | `/login` | Email/password authentication with demo credentials |
| Assets | `/assets` | Registry of satellites, ground stations, and infrastructure with type/status filters |
| Asset Detail | `/assets/[id]` | Individual asset info with compliance mappings, linked telemetry, and risk score breakdown |
| Telemetry | `/telemetry` | Telemetry stream list with protocol, APID, and health status |
| Stream Detail | `/telemetry/[id]` | Time-series charts with anomaly baseline overlay and z-score markers |
| Alerts | `/alerts` | Security alerts with severity/status filters, pagination, expandable details, create-incident action, STIX export |
| Alert Rules | `/alerts/rules` | Detection rule library with enable/disable toggles and threshold editing |
| Incidents | `/incidents` | Incident list with severity, status, MTTD/MTTR metrics, correlation badges, and create dialog |
| Incident Detail | `/incidents/[id]` | Timeline, linked alerts, investigator notes, playbook execution log, NIS2 report generation with deadline tracking |
| Threat Intel | `/intel` | STIX 2.1 intelligence objects with source/type filters |
| SPARTA Navigator | `/admin/sparta` | SPARTA technique browser grouped by tactic with search and import management |
| Compliance | `/compliance` | NIS2, CRA, and ENISA requirement mapper with per-category scoring |
| Reports | `/reports` | PDF compliance report generation and download |
| Playbooks | `/playbooks` | Visual playbook builder with step configuration, trigger conditions, and execution history |
| Risk | `/risk` | Organization and asset risk scores with five-dimension breakdown and historical trends |
| Supply Chain | `/supply-chain` | Supplier registry with risk scoring, certifications, and review tracking |
| Audit Trail | `/audit` | Full audit log with date/actor/action filters, expandable details, CSV/PDF export |
| Exports | `/exports` | STIX 2.1 bundle export with configurable data types and date ranges |
| Settings | `/settings` | Notification preferences, syslog/SIEM endpoints, scheduled reports, API key management, account settings |
| Developer Portal | `/developers` | OpenAPI documentation with interactive endpoint explorer |

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

### Anomaly Detection
```
GET    /api/v1/anomaly/baselines          List baselines for stream
GET    /api/v1/anomaly/stats              Anomaly statistics for organization
PUT    /api/v1/anomaly/baselines/:id      Update baseline manually
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

### Playbooks
```
POST   /api/v1/playbooks                  Create playbook
GET    /api/v1/playbooks                  List playbooks for organization
GET    /api/v1/playbooks/:id              Get playbook
PUT    /api/v1/playbooks/:id              Update playbook
DELETE /api/v1/playbooks/:id              Delete playbook
POST   /api/v1/playbooks/:id/execute      Execute playbook
GET    /api/v1/playbooks/:id/executions   List execution history
```

### Risk Scoring
```
GET    /api/v1/risk/assets/:id            Get asset risk score with breakdown
GET    /api/v1/risk/overview              Organization risk overview
GET    /api/v1/risk/history               Historical risk score trend
```

### Scheduled Reports
```
POST   /api/v1/scheduled-reports          Create scheduled report
GET    /api/v1/scheduled-reports          List scheduled reports
PUT    /api/v1/scheduled-reports/:id      Update schedule
DELETE /api/v1/scheduled-reports/:id      Delete scheduled report
```

### Syslog/SIEM Integration
```
POST   /api/v1/syslog/endpoints           Create syslog endpoint
GET    /api/v1/syslog/endpoints           List syslog endpoints
PUT    /api/v1/syslog/endpoints/:id       Update endpoint
DELETE /api/v1/syslog/endpoints/:id       Delete endpoint
POST   /api/v1/syslog/endpoints/:id/test  Send test event
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

### Dashboard Layouts
```
GET    /api/v1/dashboard/layout           Get user's dashboard layout
PUT    /api/v1/dashboard/layout           Save user's dashboard layout
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

For a full demo environment with realistic multi-org data, incidents, playbooks, risk scores, and telemetry:

```bash
# Full demo scenario (4 orgs, users, telemetry, incidents, playbooks, risk scores, reports, audit trail)
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

### Production Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full production deployment instructions using Docker Compose, nginx, and Let's Encrypt SSL.

```bash
# Quick production deploy
cp .env.production.example .env.production
# Edit .env.production with real secrets
./scripts/deploy.sh
```

## Screenshots

The following screenshots demonstrate SpaceGuard's key capabilities:

| Screenshot | Description |
|-----------|-------------|
| Dashboard | Customizable operational overview with drag-and-drop widgets showing compliance score donut chart, active incident count with NIS2 deadline countdown, risk heatmap, recent alerts, and telemetry stream health |
| Asset Registry | Filterable table of satellites and ground stations with type badges, status indicators, criticality levels, and risk score badges |
| Telemetry Charts | Real-time time-series visualization with statistical baseline overlay and anomaly z-score markers showing deviations from normal behavior |
| Alert Investigation | Expandable alert rows showing description, SPARTA tactic/technique mapping, intelligence context with detection tips, correlation group badges, and action buttons |
| Incident Detail | Full incident timeline with linked alerts, investigator notes, playbook execution log, and NIS2 report generation panel with deadline progress bars |
| Playbook Builder | Visual playbook editor with step types (notify, isolate, diagnostic, mitigate, escalate, report), trigger conditions, and execution history |
| Risk Scoring | Five-dimension risk breakdown (compliance, threat, alerts, supply chain, config) with historical trend chart and asset comparison |
| SPARTA Navigator | Tactic-grouped technique browser with search, showing technique details, detection guidance, and related mitigations |
| Compliance Mapper | NIS2, CRA, and ENISA requirements grouped by category with per-requirement status toggles, overall score calculation, and regulation filter |
| Supply Chain | Supplier registry with risk score badges, certification indicators (ISO 27001, SOC 2), country flags, and overdue review warnings |
| Audit Trail | Chronological log of all platform actions with actor, resource, and timestamp filtering. Expandable rows showing full event metadata |

## Project Structure

```
spaceguard/
  packages/shared/       Zod schemas, enums, types shared by frontend and backend
  apps/api/              Hono REST API (port 3001) with Drizzle ORM
    src/db/schema/       18 schema files defining all database tables
    src/routes/          22 route files covering all API endpoints
    src/services/        Business logic layer (detection, anomaly, risk, playbooks)
    src/middleware/       Auth, rate limiting, tenant scope, sanitization, security headers
  apps/web/              Next.js 14 frontend (port 3000) with shadcn/ui
    app/                 21 pages using App Router
    components/          UI components (shadcn/ui + custom)
    lib/                 Typed API client and utilities
  seed-data/             NIS2 requirements, ENISA controls, SPARTA techniques
  scripts/               Setup, seed, simulation, and demo scripts
  detection/rules/       YAML detection rule definitions
  nginx/                 Nginx reverse proxy config for production
  docs/                  Documentation, demo scripts, and deployment guide
```

## License

Proprietary. All rights reserved.
