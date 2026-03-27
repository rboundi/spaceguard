# Changelog

All notable changes to the SpaceGuard platform are documented in this file.

## Phase 4: Operational Intelligence (Current)

### AI Anomaly Detection
- Statistical anomaly detection using rolling baselines with z-score calculation
- Per-parameter baselines (mean, standard deviation, min/max, sample count) auto-updated from incoming telemetry
- Anomaly visualization with baseline overlay on telemetry charts
- Configurable z-score thresholds per stream

### Alert Correlation Engine
- Four built-in correlation rules: temporal proximity, asset proximity, technique clustering, campaign detection
- Auto-creates incidents from correlated alert groups with correlation score and rule attribution
- Reduces alert fatigue by grouping related events across assets and organizations

### Response Playbooks
- Visual playbook builder with six step types: notify, isolate, diagnostic, mitigate, escalate, report
- Auto-trigger playbooks based on alert severity, SPARTA tactic, or specific rule IDs
- Full execution history with per-step status logging (success, failed, skipped, waiting)
- Three pre-built playbook templates: Battery Anomaly, RF Interference, Unauthorized Access

### Risk Scoring
- Five-dimension risk calculation: compliance, threat exposure, active alerts, supply chain, configuration
- Per-asset and per-organization aggregate scores (0-100 scale)
- Historical score tracking with trend visualization
- Risk heatmap widget on customizable dashboard

### Scheduled Reports
- Automated report generation: compliance summary, incident summary, threat briefing, supply chain review, audit trail digest
- Configurable schedules: weekly, monthly, quarterly
- Multi-recipient email distribution
- Last-generated and next-run tracking

### Syslog/SIEM Integration
- Syslog output in CEF (Splunk), LEEF (QRadar), and JSON (Elastic) formats
- Configurable endpoints with protocol selection (UDP, TCP, TLS)
- Per-endpoint severity filtering (LOW, MEDIUM, HIGH, CRITICAL)
- Test event capability for validation

### Real-time WebSocket
- Server-pushed alerts and incident updates via Redis pub/sub to connected browsers
- Replaced polling-based data fetching with WebSocket push
- Sidebar badge counts update in real time without page refresh

### Customizable Dashboard
- Drag-and-drop widget layout with configurable sizes and positions
- Per-user layout persistence across sessions
- Dashboard layout API (GET/PUT) for programmatic access

### CRA Compliance
- Cyber Resilience Act requirements for space operators
- Shared compliance mapper supports NIS2, ENISA, and CRA frameworks simultaneously
- CRA-specific requirements for digital elements and product security

### API Documentation
- OpenAPI/Swagger specification served at /developers
- Interactive endpoint explorer with request/response examples
- Grouped by resource with authentication requirements

### Production Deployment
- Multi-stage Docker builds for API (Hono) and frontend (Next.js standalone)
- Docker Compose production configuration with nginx reverse proxy
- SSL termination via Let's Encrypt with automated renewal
- One-command deployment script with subcommands (deploy, setup-ssl, stop, logs, migrate)
- Production environment variable template with secret generation instructions

### Security Hardening
- Database-level tenant isolation with org_id filtering on all queries
- Per-endpoint rate limiting: auth (10/min), API (1000/min), telemetry (10000/min), reports (10/hr)
- Input sanitization with strict Zod schemas (.strict()) on all input-facing endpoints
- JSONB size guard middleware (1 MB limit per field)
- AES-256-GCM encryption for sensitive data at rest (API keys, credentials)
- Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- Hardened password hashing with explicit scrypt parameters (N=32768)
- PostgreSQL error sanitization to prevent info leaks in production

### Bug Fixes
- Fixed auth race condition where concurrent 401 responses cleared freshly-stored tokens
- Fixed dashboard layout userId extraction from JWT context
- Added backward-compatible password verification for legacy scrypt parameters

## Phase 3: Detection, Incidents, and Threat Intel

### Detection Engine (Module 3)
- YAML-based detection rules analyzing telemetry in real time
- 50+ space-specific detection rules covering battery, thermal, comms, AOCS, and access patterns
- Alert generation with automatic SPARTA tactic/technique classification
- Redis pub/sub for real-time alert push to connected clients
- Detection rule library UI with enable/disable toggles and threshold editing

### Incident Management (Module 4)
- Full incident lifecycle: DETECTED, TRIAGING, INVESTIGATING, CONTAINING, RECOVERING, CLOSED
- One-click incident creation from alert detail view
- NIS2 Article 23 regulatory report generation with four report types:
  - Early Warning (24h deadline)
  - Incident Notification (72h deadline)
  - Intermediate Report (7d deadline)
  - Final Report (30d deadline)
- Deadline tracking with countdown timers
- Alert-to-incident linking with timeline reconstruction
- MTTD/MTTR metrics calculation
- Investigator notes with author attribution

### Threat Intelligence (Module 5)
- SPARTA space-attack framework browser with tactic-grouped navigator
- STIX 2.1 data model for threat intelligence objects
- Alert enrichment with matched techniques, detection guidance, and mitigations
- STIX 2.1 bundle export for CSIRT sharing (JSON format)
- CSV export for alerts with configurable columns

### Supply Chain Management
- Supplier CRUD with type classification and country tracking
- Risk scoring per supplier with certification tracking (ISO 27001, SOC 2)
- Review schedule tracking with overdue warnings
- Supply chain risk assessment PDF report

### Authentication and Authorization
- JWT-based authentication with scrypt password hashing
- Role-based access control: Admin, Operator, Auditor
- Login/logout with session management
- Auth middleware protecting all API routes

### Audit Trail
- Full audit logging for all platform actions
- Action types: LOGIN, LOGOUT, VIEW, CREATE, UPDATE, DELETE, MAPPING_CHANGED, ALERT_ACKNOWLEDGED, STATUS_CHANGE, REPORT_GENERATED, EXPORT
- Filtering by date range, actor, action type, and resource
- CSV and PDF export

### Onboarding and Settings
- 5-step guided wizard for new organizations
- Organization switcher for multi-org management
- Settings page with notification preferences and API key management
- Email notification configuration for alerts, deadlines, and incidents

### ENISA Controls
- ENISA Space Threat Landscape 125 cybersecurity controls imported
- Cross-referenced with SPARTA techniques
- Mapped alongside NIS2 requirements in the compliance mapper

## Phase 2: Telemetry Ingestion

### Telemetry System (Module 2)
- CCSDS TM/TC frame ingestion via authenticated REST endpoints
- TimescaleDB hypertables for time-series storage
- Configurable telemetry streams per asset with protocol support (CCSDS, Syslog, SNMP, custom)
- API key authentication for stream ingestion endpoints
- Time-series data querying with downsampling
- Real-time parameter charting on stream detail pages
- Telemetry quality flagging (GOOD, SUSPECT, BAD)

### Realistic Test Data
- Multi-organization data generator with 4 European satellite operators
- Physics-based telemetry simulator with orbital mechanics
- Configurable anomaly injection for battery, thermal, comms, and attitude parameters
- Full demo scenario script populating all feature areas

## Phase 1: MVP Foundation

### Asset Registry (Module 1)
- Organization CRUD with NIS2 classification (Essential/Important)
- Space asset registry supporting 10 asset types (LEO/MEO/GEO satellites, ground stations, control centers, uplinks, downlinks, inter-satellite links, data centers, network segments)
- Asset metadata with satellite-specific fields (altitude, inclination, NORAD ID, manufacturer)
- Criticality assessment (LOW, MEDIUM, HIGH, CRITICAL)
- Operational status tracking (OPERATIONAL, DEGRADED, MAINTENANCE, DECOMMISSIONED)

### Compliance Mapper
- NIS2 Article 21 requirements (18 space-specific controls across 10 categories)
- Per-asset and per-organization compliance mapping
- Four compliance statuses: COMPLIANT, PARTIALLY_COMPLIANT, NON_COMPLIANT, NOT_ASSESSED
- Evidence description and assessment date tracking
- Per-category compliance scoring with gap analysis
- Compliance dashboard with donut chart and category breakdown

### PDF Reports
- Compliance status PDF report using @react-pdf/renderer
- JSX-based PDF generation (TypeScript throughout)
- Organization branding with NIS2 classification header

### Technical Foundation
- TypeScript monorepo with Turborepo and npm workspaces
- Hono backend (port 3001) with Drizzle ORM
- PostgreSQL 16 with TimescaleDB extension
- Next.js 14 App Router frontend (port 3000) with shadcn/ui and Tailwind CSS
- Shared Zod schemas driving types across the entire stack
- Dark theme with space/aerospace aesthetic (slate-950 background, blue-500 accent)
- Docker Compose for local development (PostgreSQL + Redis)
