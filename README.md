# SpaceGuard

Operational cybersecurity platform for European space infrastructure. SpaceGuard helps satellite operators comply with NIS2, monitor space systems for threats, detect anomalies, manage incidents, and generate regulatory reports.

Built for small-to-medium satellite operators (10-200 person companies) who need security tooling purpose-built for space operations.

## Features

### Module 1: Asset Registry & Compliance Mapper
Register satellites, ground stations, and infrastructure. Map NIS2 Article 21 requirements to each asset and track compliance status with per-category scoring.

### Module 2: Telemetry Ingestion
Ingest CCSDS TM/TC frames and housekeeping telemetry. TimescaleDB hypertables for time-series storage. Configurable streams per asset with protocol support for CCSDS, Syslog, SNMP, and custom protocols.

### Module 3: Detection Engine
YAML-based detection rules that analyze telemetry in real time. Anomaly detection for battery voltage, thermal parameters, reaction wheels, and comms link quality. Alerts with SPARTA tactic/technique classification. Real-time push via Redis pub/sub and WebSocket.

### Module 4: Incident Management
Full incident lifecycle from detection through eradication and recovery. NIS2 regulatory report generation (early warning, incident notification, intermediate, and final reports) with deadline tracking. MTTD/MTTR metrics. Alert-to-incident linking.

### Module 5: Threat Intelligence
SPARTA technique browser with tactic-grouped navigator. STIX 2.1 data model for threat intelligence objects. Alert enrichment with matched techniques, detection guidance, and mitigation recommendations. STIX bundle export for CSIRT sharing.

### Cross-cutting
- Organization switcher for multi-org management
- Dark theme with space/aerospace aesthetic
- Real-time alert badges in sidebar navigation
- Operational dashboard with metrics from all five modules
- PDF compliance report generation

## Architecture

```
                                    SpaceGuard Architecture
  ============================================================================

  Satellite / Ground Station
        |
        | CCSDS TM/TC frames, HK telemetry
        v
  +------------------+         +-------------------+        +----------------+
  | Telemetry Ingest |-------->| TimescaleDB       |        | PostgreSQL     |
  | (Hono REST API)  |         | (hypertables)     |        | (assets, orgs, |
  | POST /ingest/:id |         | telemetry_points  |        |  compliance,   |
  +------------------+         +-------------------+        |  incidents,    |
        |                             |                     |  intel, alerts)|
        v                             v                     +----------------+
  +------------------+         +-------------------+               ^
  | Detection Engine |         | Point Queries     |               |
  | (YAML rules,     |-------->| (downsampling,    |               |
  |  anomaly detect) |         |  time-range agg)  |               |
  +------------------+         +-------------------+               |
        |                                                          |
        | alert created                                            |
        v                                                          |
  +------------------+   pub   +-------------------+               |
  | Alert Service    |-------->| Redis Pub/Sub     |               |
  | (create, enrich) |         | (real-time push)  |               |
  +------------------+         +-------------------+               |
        |                             |                            |
        v                             v                            |
  +------------------+         +-------------------+               |
  | Incident Mgmt    |         | WebSocket Server  |               |
  | (lifecycle, NIS2 |         | (push to browser) |               |
  |  reports, MTTD)  |         +-------------------+               |
  +------------------+                |                            |
        |                             v                            |
        |                      +-------------------+               |
        +--------------------->| Next.js Frontend  |<--------------+
                               | (App Router)      |
                               | Dashboard, Assets,|
                               | Telemetry, Alerts,|
                               | Incidents, Intel, |
                               | Compliance,Reports|
                               +-------------------+
```

### Data Flow

1. Satellites and ground stations transmit CCSDS telemetry frames
2. The Hono API ingests frames via authenticated REST endpoints, storing decoded parameters in TimescaleDB hypertables
3. The detection engine evaluates YAML rules against incoming telemetry, generating alerts when thresholds are breached
4. Alerts are persisted to PostgreSQL and published to Redis for real-time WebSocket push to connected browsers
5. Operators can escalate alerts to incidents, triggering NIS2 regulatory timeline tracking
6. Threat intelligence (SPARTA techniques) enriches alerts with detection guidance and mitigations
7. Compliance mappings track NIS2 Article 21 requirement status per asset
8. PDF reports and STIX bundles can be exported for regulatory bodies and CSIRTs

## Tech Stack

- **Language**: TypeScript (frontend + backend + shared)
- **Backend**: Hono (lightweight HTTP framework)
- **ORM**: Drizzle ORM (type-safe, schema-first)
- **Database**: PostgreSQL 16 + TimescaleDB
- **Validation**: Zod (shared schemas)
- **Cache/PubSub**: Redis 7
- **Frontend**: Next.js 14+ (App Router), Tailwind CSS, shadcn/ui, Recharts
- **Monorepo**: Turborepo with npm workspaces

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Operational overview with compliance score, active alerts, open incidents, telemetry health, and gap analysis |
| Assets | `/assets` | Registry of satellites, ground stations, and infrastructure with type/status filters |
| Asset Detail | `/assets/[id]` | Individual asset info with compliance mappings |
| Telemetry | `/telemetry` | Telemetry stream list with protocol, APID, and status |
| Stream Detail | `/telemetry/[id]` | Time-series charts for individual stream parameters |
| Alerts | `/alerts` | Security alerts with severity/status filters, expandable details, STIX export |
| Incidents | `/incidents` | Incident list with MTTD/MTTR metrics and create dialog |
| Incident Detail | `/incidents/[id]` | Incident timeline, linked alerts, notes, NIS2 report generation |
| Threat Intel | `/intel` | SPARTA technique browser with detection/mitigation guidance |
| Compliance | `/compliance` | NIS2 Article 21 requirement mapper with per-category scoring |
| Reports | `/reports` | PDF report generation for compliance status |

## Getting Started

```bash
# Install dependencies
npm install

# Start PostgreSQL + Redis
docker compose up -d

# Run database migrations
npm run db:migrate

# Seed NIS2 requirements and SPARTA techniques
npm run db:seed

# Load realistic multi-org test data
npx tsx scripts/realistic-data.ts

# Start the API (port 3001) and frontend (port 3000)
npm run dev

# (Optional) Run telemetry simulator with anomalies
npx tsx scripts/simulate-telemetry.ts --hours 2 --anomaly
```

## Project Structure

```
spaceguard/
  packages/shared/       Zod schemas, enums, types shared by frontend and backend
  apps/api/              Hono REST API with Drizzle ORM
  apps/web/              Next.js 14 frontend with shadcn/ui
  seed-data/             NIS2 requirements, ENISA controls, SPARTA techniques
  scripts/               Setup, seed, and simulation scripts
  detection/rules/       YAML detection rule definitions
```

## License

Proprietary. All rights reserved.
