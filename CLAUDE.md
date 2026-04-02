# SpaceGuard - CLAUDE.md

## What is this project?

SpaceGuard is a cybersecurity SaaS platform for European satellite operators.
It provides NIS2/CRA/ENISA compliance tracking, real-time telemetry monitoring,
statistical anomaly detection, threat intelligence (SPARTA framework), incident
management with automated NIS2 reporting, and response playbooks.

Target customers: small-to-medium European satellite operators who need to
comply with NIS2 (active), CRA (rolling out), and the upcoming EU Space Act.

GitHub: github.com/rboundi/SpaceGuard

## Tech Stack

- Monorepo: Turborepo with npm workspaces
- Backend: Hono (lightweight HTTP framework) on Node.js
- ORM: Drizzle ORM (type-safe, schema-first, PostgreSQL)
- Database: PostgreSQL 16 + TimescaleDB (telemetry time-series hypertables)
- Validation: Zod (shared schemas between frontend and backend)
- Frontend: Next.js 14+ (App Router) + Tailwind CSS + shadcn/ui
- Auth: Custom JWT with scryptSync (node:crypto) password hashing and jose for tokens
- Cache/PubSub: Redis 7
- Real-time: WebSocket via Hono + Redis pub/sub
- PDF generation: @react-pdf/renderer
- Email: Resend (direct REST API calls, no npm package)
- Charts: Recharts
- Icons: lucide-react

## Project Structure

```
spaceguard/
  packages/
    shared/                  # Zod schemas, enums, TypeScript types
      src/
        enums.ts             # All enums with display labels and colors
        index.ts             # Re-exports everything
        schemas/
          alert.ts
          anomaly.ts
          asset.ts
          compliance.ts
          incident.ts
          intel.ts
          organization.ts
          playbook.ts
          risk.ts
          scheduled-report.ts
          sparta.ts
          supplier.ts
          telemetry.ts
  apps/
    api/                     # Hono backend
      src/
        index.ts             # App entry, middleware, route mounting
        db/
          client.ts          # Drizzle + postgres connection
          schema/            # Drizzle table definitions
          migrations/
        routes/              # 22 Hono route files (see inventory below)
        services/            # Business logic layer
          detection/         # 5 files: engine, anomaly-detector, correlator, rule-loader, alert.service
          telemetry/         # 3 files: telemetry.service, ccsds-parser, ccsds-parser.test
          # Plus 18 top-level service files (see inventory below)
        middleware/           # 8 files: audit, auth-guard, error, rate-limit, sanitize, security-headers, tenant-scope, validate
      drizzle.config.ts
    web/                     # Next.js frontend
      app/                   # 17 authenticated pages + login (see inventory below)
      lib/
        api.ts               # Typed API client
        context.ts           # Org context provider
        ws.ts                # WebSocket hook
  seed-data/
    nis2-requirements.json          # 18 space-specific NIS2 requirements
    enisa-controls.json             # 125 ENISA Space Threat Landscape controls
    cra-requirements.json           # CRA requirements
    sparta-full-matrix.json         # Complete SPARTA v3.2 (4.2 MB)
    sparta-countermeasures.json     # SPARTA countermeasures with NIST mappings
    sparta-techniques.json          # SPARTA techniques reference data
    playbook-templates.json         # Predefined response playbook templates
    seed.ts                         # Seed data loader (idempotent)
    seed-incidents.mjs              # Incident seed data
    seed-playbooks.ts               # Playbook seed data
  scripts/
    realistic-data.ts               # 4 European space company profiles (45 KB)
    simulate-telemetry.ts           # Telemetry simulator with anomaly injection (22 KB)
    full-demo.ts                    # Complete demo scenario loader (88 KB)
    test-telemetry.ts               # Telemetry endpoint testing
    seed-audit-trail.ts             # Audit trail seed data
    seed-users.ts                   # User account seed data
    run-migration.ts                # Database migration runner
    setup.sh                        # Dev environment setup
    deploy.sh                       # Deployment script
  detection/
    rules/                          # 50 YAML detection rules across 9 files
      access-control.yaml           # 6 rules (SG-AC-001 to SG-AC-006)
      command-security.yaml         # 5 rules (SG-TC-001 to SG-TC-005)
      data-exfiltration.yaml        # 6 rules (SG-DX-001 to SG-DX-006)
      data-integrity.yaml           # 5 rules (SG-DI-001 to SG-DI-005)
      ground-segment.yaml           # 5 rules (SG-GS-001 to SG-GS-005)
      link-security.yaml            # 6 rules (SG-RF-001 to SG-RF-006)
      persistence-evasion.yaml      # 6 rules (SG-PE-001 to SG-PE-006)
      spacecraft-health.yaml        # 6 rules (SG-SC-001 to SG-SC-006)
      telemetry-anomalies.yaml      # 5 rules (SG-TM-001 to SG-TM-005)
  docs/
    SpaceGuard_Gap_Analysis_Report.md
  docker-compose.yml                # Dev: PostgreSQL (TimescaleDB) + Redis
  docker-compose.prod.yml           # Prod: + Nginx 1.27 + certbot SSL
```

## How Types Flow (Critical Architecture Pattern)

This is the key architectural pattern. Understand this and everything else follows.

1. Zod schema defined ONCE in packages/shared (e.g., createAssetSchema)
2. TypeScript type inferred: type CreateAsset = z.infer<typeof createAssetSchema>
3. Drizzle schema in apps/api mirrors the Zod shape (column names match)
4. API route validates request body with the Zod schema
5. Frontend imports the same types for API calls and form validation
6. One change to the Zod schema propagates everywhere via TypeScript

NEVER define types separately in the API or frontend. Always import from @spaceguard/shared.

## Conventions

- Database columns: snake_case (organization_id, created_at)
- TypeScript/JSON fields: camelCase (organizationId, createdAt)
- Drizzle handles the casing transformation
- API responses always camelCase
- All API routes under /api/v1/
- All state-changing operations create an audit log entry
- All queries filter by organization_id (multi-tenant isolation)
- Error responses: { error: string, details?: any }
- HTTP status codes: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized,
  403 Forbidden, 404 Not Found, 429 Rate Limited, 500 Internal Error
- Never use em dashes in any output or documentation
- Commit messages: "feat:", "fix:", "docs:", "chore:" prefixes

## Database Commands

```bash
docker compose up -d                    # Start PostgreSQL + Redis
npx drizzle-kit push                    # Sync schema to database (dev)
npx drizzle-kit generate                # Generate migration files (prod)
npx tsx seed-data/seed.ts               # Load all seed data
npx tsx scripts/realistic-data.ts       # Load demo company data
npx tsx scripts/simulate-telemetry.ts   # Generate telemetry (--anomaly flag)
npx tsx scripts/full-demo.ts            # Full demo scenario
```

## Development Commands

```bash
npm run dev                             # Start API + Web via Turborepo
npm run dev -w apps/api                 # API only (port 3001)
npm run dev -w apps/web                 # Frontend only (port 3000)
npm run db:studio -w apps/api           # Drizzle Studio (DB browser)
```

## Environment Variables

```
DATABASE_URL=postgresql://spaceguard:spaceguard_dev@localhost:5432/spaceguard
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=dev-secret-key-change-in-production
PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001
RESEND_API_KEY=                         # Optional, logs to console if missing
WEBHOOK_ENCRYPTION_KEY=                 # For encrypting webhook auth values
```

## Current State: What Actually Exists

### Completed Modules

Module 1 - Asset Registry and Compliance:
  Organization CRUD, asset CRUD, compliance mapping supporting NIS2, CRA,
  EU Space Act, and ENISA Space regulations via shared mapper, compliance
  dashboard with scoring per regulation, PDF report generation

Module 2 - Telemetry Ingestion:
  CCSDS Space Packet parser (TM and TC) with unit tests, TimescaleDB
  hypertable storage, JSON and binary ingestion endpoints with per-stream
  API key auth, telemetry simulator (3 concurrent streams), time-series
  visualization with Recharts

Module 3 - Detection Engine:
  50 YAML detection rules across 9 categories mapped to SPARTA tactics,
  rule evaluation engine, statistical anomaly detection with rolling
  baselines and z-score alerting, alert correlation engine (temporal
  clustering, kill chain progression, cross-asset spread)

Module 4 - Incident Management:
  Full incident lifecycle (8 states: DETECTED through CLOSED + FALSE_POSITIVE),
  NIS2 Article 23 reporting (24h/72h/7d/30d deadlines), timeline tracking,
  linked alerts, investigator notes, MTTD/MTTR metrics, NIS2 classification
  (SIGNIFICANT/NON_SIGNIFICANT)

Module 5 - Threat Intelligence:
  Complete SPARTA v3.2 matrix (159 techniques, 268 countermeasures,
  860 indicators, 3,484 relationships) in STIX 2.1 format, live sync
  from sparta.aerospace.org with deterministic change detection,
  interactive SPARTA matrix navigator, admin interface for STIX bundle
  import and server fetch

### Verified Features

Authentication and Access Control:
- User auth with RBAC (Admin, Operator, Viewer, Auditor)
- Custom JWT with scryptSync + jose
- Multi-tenancy hardening with tenant-scope middleware
- Rate limiting per endpoint category

Monitoring and Detection:
- 50 detection rules across 9 categories mapped to SPARTA tactics
- Statistical anomaly detection with rolling baselines and z-score alerting
- Alert correlation engine (temporal, kill chain, cross-asset)
- WebSocket real-time alert push via Redis pub/sub

Incident Response:
- Full incident lifecycle (8 states)
- NIS2 Article 23 reporting (24h/72h/7d/30d deadlines)
- Response playbook engine with visual builder (6 step types:
  notify, isolate, diagnostic, mitigate, escalate, report)
- Webhook dispatch as playbook action step (placeholder implementation)
- MTTD/MTTR metrics

Reporting and Integration:
- 5 PDF report types (compliance, incident summary, threat briefing,
  supply chain risk, audit trail)
- Scheduled automatic report generation with Resend email delivery
- Syslog CEF/LEEF output for SIEM integration
- STIX 2.1 export (alerts and threat intel)
- OpenAPI documentation at /api/docs with interactive explorer
- CSV export for alerts, incidents, compliance, audit data

Risk and Supply Chain:
- 5-dimension risk scoring engine (0-100 per asset and org):
  compliance 30%, threat exposure 25%, alerts 25%, supply chain 10%, config 10%
- Supply chain management with supplier risk tracking and certification inventory
- Complete audit trail with middleware logging on all state changes

User Interface:
- Customizable dashboard with 12 drag-and-drop widgets
- 5-step onboarding wizard
- Dark theme with space/aerospace aesthetic
- Email notifications via Resend REST API (console fallback when key absent)

Infrastructure:
- Docker production configuration with Nginx 1.27 reverse proxy + certbot SSL
- docker-compose.prod.yml ready for deployment

### NOT Built Yet (From Phase 5 Prompts)

These features were planned but not implemented:
- Claude-powered AI assistant with streaming chat
- AI report drafting and SPARTA explanations
- PWA with push notifications for mobile alerts
- Public NIS2 self-assessment tool (lead generation)
- Landing page and demo booking
- Industry benchmarking (anonymous peer comparison)
- Regulatory change tracker
- Tabletop exercise module

### Demo Data

4 realistic European space company profiles:
- Proba Space Systems (Belgium, EO constellation, ESSENTIAL)
  Ground stations: Svalbard (KSAT), Matera (e-GEOS)
- NordSat IoT (Sweden, CubeSat IoT, IMPORTANT)
  Ground station: Kiruna (SSC)
- MediterraneanSat Communications (Greece, GEO SATCOM, ESSENTIAL)
  Teleports: Thermopylae, Limassol
- Orbital Watch Europe (France, SSA/surveillance, IMPORTANT)
  Sensors: Aire-sur-l'Adour radar, Tenerife optical

## Verified Codebase Inventory

### Frontend Pages (apps/web/app/)
page.tsx (dashboard), login/, onboarding/, admin/ (SPARTA navigator),
alerts/, assets/, audit/, compliance/, developers/, exports/,
incidents/, intel/, playbooks/, reports/, risk/, settings/,
supply-chain/, telemetry/

### API Routes (apps/api/src/routes/) - 22 files
admin-sparta.ts, alerts.ts, anomaly.ts, assets.ts, audit.ts, auth.ts,
compliance.ts, dashboard-layouts.ts, docs.ts, enisa.ts, exports.ts,
incidents.ts, intel.ts, organizations.ts, playbooks.ts, reports.ts,
risk.ts, scheduled-reports.ts, settings.ts, supply-chain.ts, syslog.ts,
telemetry.ts

### Services (apps/api/src/services/) - 18 top-level + 2 subdirectories
asset.service.ts, audit.service.ts, auth.service.ts, compliance.service.ts,
dashboard-layout.service.ts, export.service.ts, incident.service.ts,
intel.service.ts, notification.service.ts, organization.service.ts,
playbook.service.ts, realtime.service.ts, report.service.tsx,
risk.service.ts, scheduler.service.ts, sparta.service.ts,
supply-chain.service.ts, syslog.service.ts
detection/ (5 files), telemetry/ (3 files)

### Middleware (apps/api/src/middleware/) - 8 files
audit.ts, auth-guard.ts, error.ts, rate-limit.ts, sanitize.ts,
security-headers.ts, tenant-scope.ts, validate.ts

## Roadmap

### Phase 5: Gap Analysis Remediation
Reference: docs/SpaceGuard_Gap_Analysis_Report.md

Tier 1 - Immediate Priority:
1. Hierarchical asset taxonomy (ENISA Annex B 4-segment model)
2. SBOM and vulnerability management (CRA compliance)
3. Satellite lifecycle phase tracking (Phase 0-F)
4. NIS2 awareness/guidance layer

Tier 2 - Strategic Differentiation:
5. SPARTA control tailoring workflow (TOR-2023-02161 methodology)
6. Cryptographic posture management (PQC readiness)
7. ENISA three-tier crisis escalation model
8. Enhanced supply chain (vendor questionnaires, component tracking)

Tier 3 - Future (build when customers request):
9. STIX/TAXII feed ingestion and information sharing
10. Command authorization workflow
11. Firmware integrity verification
12. Crisis exercise tracking

## What NOT to Build (Until Customers Ask)

- Active IPS / command blocking (too risky for mission-critical systems)
- Native mobile apps (PWA is sufficient once built)
- Multi-language i18n (English only)
- White-label / OEM features
- On-premise deployment automation (Docker compose is enough)
- Integration with specific MCS software (SCOS-2000, etc.)

### Unbuilt Features (DO NOT BUILD YET)

1. Claude-powered AI assistant (Anthropic API + streaming chat UI)
2. Public NIS2 self-assessment tool (lead generation, no auth)
3. Landing page and demo booking
4. PWA with push notifications
5. Industry benchmarking
6. Regulatory change tracker
7. Tabletop exercise module (3 scenarios)
