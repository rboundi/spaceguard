# SpaceGuard - Operational Cybersecurity Platform for European Space Infrastructure

## What This Project Is

SpaceGuard is a cybersecurity SaaS platform for European satellite operators. It helps them comply with NIS2, monitor space systems for threats, and generate incident reports. The target customers are small-to-medium satellite operators (10-200 person companies) who have no existing security tooling.

## Tech Stack (Non-Negotiable)

- **Language**: TypeScript everywhere (frontend + backend + shared)
- **Backend**: Hono (lightweight, fast HTTP framework)
- **ORM**: Drizzle ORM (type-safe, schema-first, generates migrations)
- **Database**: PostgreSQL 16 with TimescaleDB extension (for telemetry time-series)
- **Validation**: Zod (shared schemas between frontend and backend)
- **Cache/PubSub**: Redis 7 (caching + real-time alert pub/sub via WebSocket)
- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Auth**: Better Auth (simple, TypeScript-native auth library)
- **Runtime**: Node.js 22
- **Monorepo**: Turborepo with npm workspaces
- **PDF Generation**: @react-pdf/renderer (JSX-based PDF, stays in TypeScript)
- **Containerization**: Docker Compose for local dev

## Architecture Principles

1. **Monorepo with shared packages**: One repo, three workspaces: `apps/api` (Hono backend), `apps/web` (Next.js frontend), `packages/shared` (Zod schemas, types, constants shared by both).
2. **Single source of truth for types**: Zod schemas live in `packages/shared`. Drizzle schema references them. Frontend imports them. Never duplicate a type definition.
3. **Hono runs as a standalone Node.js server**: Not inside Next.js. Separate process on port 3001. Next.js runs on port 3000.
4. **PostgreSQL for everything**: Assets, incidents, intel, compliance data in regular tables. Only telemetry time-series goes into TimescaleDB hypertables.
5. **Redis for real-time only**: Pub/sub for pushing alerts to the frontend via WebSocket. Not for persistent storage.

## Code Conventions

- **TypeScript**: Strict mode everywhere. No `any` types. Use `as const` for literal types. Prefer `interface` for object shapes, `type` for unions/intersections.
- **Imports**: Use path aliases: `@spaceguard/shared` for shared package, `@/` for local imports within each app.
- **API Design**: REST with consistent URL patterns: `/api/v1/{resource}`. Return JSON. Use HTTP status codes correctly. Paginate list endpoints with `?page=1&perPage=20`.
- **Database**: Snake_case for all column and table names. UUID primary keys. Always include `created_at` and `updated_at` timestamps. Use Drizzle for all schema changes and migrations.
- **Error Handling**: Use Hono's HTTPException. Return consistent error shapes: `{ error: string, details?: unknown }`.
- **Zod Schemas**: Define in `packages/shared/src/schemas/`. Name pattern: `createAssetSchema`, `updateAssetSchema`, `assetResponseSchema`. Export inferred types alongside: `type CreateAsset = z.infer<typeof createAssetSchema>`.
- **No em dashes**: Never use "---" (em dash) in any text, comments, or documentation.

## Project Structure

```
spaceguard/
├── CLAUDE.md                        # THIS FILE
├── turbo.json                       # Turborepo config
├── package.json                     # Root workspace config
├── docker-compose.yml               # PostgreSQL + Redis
├── .env.example                     # Environment variables template
├── .gitignore
│
├── packages/
│   └── shared/                      # Shared types, schemas, constants
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts             # Re-exports everything
│           ├── schemas/
│           │   ├── organization.ts  # Zod schemas for Organization
│           │   ├── asset.ts         # Zod schemas for SpaceAsset
│           │   ├── compliance.ts    # Zod schemas for requirements & mappings
│           │   ├── incident.ts      # (Module 4, later)
│           │   └── intel.ts         # (Module 5, later)
│           ├── enums.ts             # All enum definitions (shared)
│           └── constants.ts         # NIS2 categories, SPARTA tactics, etc.
│
├── apps/
│   ├── api/                         # Hono backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts        # Drizzle Kit config
│   │   └── src/
│   │       ├── index.ts             # Hono app entry point, starts server
│   │       ├── db/
│   │       │   ├── client.ts        # Drizzle + PostgreSQL connection
│   │       │   ├── schema/
│   │       │   │   ├── index.ts     # Re-exports all schemas
│   │       │   │   ├── organizations.ts
│   │       │   │   ├── assets.ts
│   │       │   │   ├── compliance.ts
│   │       │   │   └── telemetry.ts # (Module 2, later)
│   │       │   └── migrations/      # Drizzle-generated SQL migrations
│   │       ├── routes/
│   │       │   ├── organizations.ts # /api/v1/organizations routes
│   │       │   ├── assets.ts        # /api/v1/assets routes
│   │       │   ├── compliance.ts    # /api/v1/compliance/* routes
│   │       │   └── reports.ts       # /api/v1/reports/* routes
│   │       ├── services/
│   │       │   ├── organization.service.ts
│   │       │   ├── asset.service.ts
│   │       │   ├── compliance.service.ts
│   │       │   └── report.service.ts
│   │       └── middleware/
│   │           ├── auth.ts          # JWT auth middleware
│   │           └── error.ts         # Global error handler
│   │
│   └── web/                         # Next.js frontend
│       ├── package.json
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       ├── next.config.js
│       ├── app/
│       │   ├── layout.tsx           # Root layout with sidebar
│       │   ├── page.tsx             # Dashboard
│       │   ├── assets/
│       │   │   ├── page.tsx         # Asset list
│       │   │   └── [id]/page.tsx    # Asset detail
│       │   ├── compliance/
│       │   │   └── page.tsx         # Compliance mapping
│       │   └── reports/
│       │       └── page.tsx         # Report generation
│       ├── components/
│       │   ├── ui/                  # shadcn/ui components
│       │   ├── layout/              # Sidebar, header
│       │   └── charts/              # Dashboard charts
│       └── lib/
│           ├── api.ts               # Typed fetch client using shared schemas
│           └── utils.ts             # Helpers
│
├── seed-data/
│   ├── nis2-requirements.json       # Pre-populated NIS2 Article 21 controls
│   ├── enisa-controls.json          # ENISA Space Threat Landscape 125 controls
│   ├── sparta-techniques.json       # SPARTA matrix (STIX 2.1 format)
│   └── seed.ts                      # Script to load all seed data
│
├── detection/                       # Detection engine (Module 3, later)
│   └── rules/                       # YAML rule definitions
│
├── scripts/
│   ├── setup.sh                     # One-command dev setup
│   └── generate-telemetry.ts        # Simulated CCSDS data (Module 2, later)
│
└── docs/
    ├── CLAUDE_CODE_SESSIONS.md      # Step-by-step build guide
    └── api.md                       # API notes
```

## How Types Flow Through the Stack

This is the key architectural insight. A single Zod schema drives everything:

```
packages/shared/src/schemas/asset.ts
  │
  ├── Zod schema: createAssetSchema
  │     └── Inferred type: CreateAsset
  │
  ├── Used in apps/api:
  │     ├── Drizzle schema references the enum values
  │     ├── Route handler validates request body with zod .parse()
  │     └── Service layer uses the inferred types
  │
  └── Used in apps/web:
        ├── Form validation uses the same zod schema
        ├── API client returns the inferred response type
        └── Components use the shared types for props
```

Example:
```typescript
// packages/shared/src/schemas/asset.ts
import { z } from "zod";
import { AssetType, AssetStatus, Criticality } from "../enums";

export const createAssetSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  assetType: z.nativeEnum(AssetType),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.nativeEnum(AssetStatus).default("OPERATIONAL"),
  criticality: z.nativeEnum(Criticality).default("MEDIUM"),
});

export type CreateAsset = z.infer<typeof createAssetSchema>;

// apps/api uses: createAssetSchema.parse(body)
// apps/web uses: CreateAsset as the form type
// Both import from: @spaceguard/shared
```

## Current Phase: Module 1 - Asset Registry & Compliance Mapper

### What We're Building Now

A web application where satellite operators can:
1. Register their organization and space assets
2. See which NIS2 requirements apply to them
3. Map each requirement to their assets and track compliance status
4. View a compliance dashboard with scores and gaps
5. Export a compliance status report as PDF

### Enums (defined in packages/shared/src/enums.ts)

```typescript
export enum AssetType {
  LEO_SATELLITE = "LEO_SATELLITE",
  MEO_SATELLITE = "MEO_SATELLITE",
  GEO_SATELLITE = "GEO_SATELLITE",
  GROUND_STATION = "GROUND_STATION",
  CONTROL_CENTER = "CONTROL_CENTER",
  UPLINK = "UPLINK",
  DOWNLINK = "DOWNLINK",
  INTER_SATELLITE_LINK = "INTER_SATELLITE_LINK",
  DATA_CENTER = "DATA_CENTER",
  NETWORK_SEGMENT = "NETWORK_SEGMENT",
}

export enum AssetStatus {
  OPERATIONAL = "OPERATIONAL",
  DEGRADED = "DEGRADED",
  MAINTENANCE = "MAINTENANCE",
  DECOMMISSIONED = "DECOMMISSIONED",
}

export enum Criticality {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum NIS2Classification {
  ESSENTIAL = "ESSENTIAL",
  IMPORTANT = "IMPORTANT",
}

export enum Regulation {
  NIS2 = "NIS2",
  CRA = "CRA",
  EU_SPACE_ACT = "EU_SPACE_ACT",
  ENISA_SPACE = "ENISA_SPACE",
}

export enum ComplianceStatus {
  NOT_ASSESSED = "NOT_ASSESSED",
  NON_COMPLIANT = "NON_COMPLIANT",
  PARTIALLY_COMPLIANT = "PARTIALLY_COMPLIANT",
  COMPLIANT = "COMPLIANT",
}
```

### Drizzle Schema (for apps/api/src/db/schema/)

```typescript
// organizations.ts
import { pgTable, uuid, varchar, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const nis2ClassificationEnum = pgEnum("nis2_classification", ["ESSENTIAL", "IMPORTANT"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  nis2Classification: nis2ClassificationEnum("nis2_classification").notNull(),
  country: varchar("country", { length: 2 }).notNull(),
  sector: varchar("sector", { length: 100 }).notNull().default("space"),
  contactEmail: varchar("contact_email", { length: 255 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// assets.ts - similar pattern for space_assets table
// compliance.ts - compliance_requirements and compliance_mappings tables
```

### API Endpoints for Module 1

```
# Organizations
POST   /api/v1/organizations
GET    /api/v1/organizations
GET    /api/v1/organizations/:id
PUT    /api/v1/organizations/:id

# Space Assets
POST   /api/v1/assets
GET    /api/v1/assets?organizationId=&type=&status=
GET    /api/v1/assets/:id
PUT    /api/v1/assets/:id
DELETE /api/v1/assets/:id

# Compliance Requirements (read-only, pre-populated)
GET    /api/v1/compliance/requirements?regulation=&category=
GET    /api/v1/compliance/requirements/:id

# Compliance Mappings
POST   /api/v1/compliance/mappings
GET    /api/v1/compliance/mappings?organizationId=&assetId=&status=
PUT    /api/v1/compliance/mappings/:id
DELETE /api/v1/compliance/mappings/:id

# Dashboard & Reports
GET    /api/v1/compliance/dashboard?organizationId=
GET    /api/v1/reports/compliance/pdf?organizationId=
```

### Frontend Pages for Module 1

1. **Dashboard** (`/`): Compliance score donut, asset count by type, gaps, category breakdown bar chart
2. **Assets** (`/assets`): Table with filters, add/edit dialogs
3. **Asset Detail** (`/assets/[id]`): Asset info + compliance mappings
4. **Compliance** (`/compliance`): Requirements grouped by category, mapping interface
5. **Reports** (`/reports`): Preview and download PDF compliance report

### UI Design Direction

- Dark theme with space/aerospace aesthetic
- Background: slate-950 (#020617)
- Sidebar: slate-900
- Primary accent: blue-500 (#3b82f6)
- Warning/alert: amber-500 (#f59e0b)
- Critical: red-500
- Success/compliant: emerald-500
- Data-dense dashboards, not marketing pages
- shadcn/ui components throughout
- Recharts for all data visualization

### Seed Data

The `seed-data/nis2-requirements.json` file is already created with 18 space-specific NIS2 requirements covering all 10 categories from Article 21(2).

## Git Workflow

After completing any meaningful unit of work:
1. Stage changes: `git add -A`
2. Commit with conventional message:
   - `feat:` new features
   - `fix:` bug fixes
   - `chore:` setup, config, dependencies
   - `docs:` documentation
3. Push: `git push origin main`

Commit frequently. Each logical piece of work = one commit.
Never leave uncommitted work at the end of a task.

## What NOT to Build Yet

- No telemetry ingestion (Module 2)
- No detection/alerting (Module 3)
- No incident management (Module 4)
- No threat intelligence (Module 5)
- No AI/ML anything
- No multi-tenancy/billing
- No SSO/SAML
