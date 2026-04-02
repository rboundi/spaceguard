// Drizzle schema definitions
// Each file exports table definitions that Drizzle uses for:
// 1. Type-safe queries
// 2. Migration generation via drizzle-kit
// 3. Schema introspection in db/client.ts

// Module 1: Asset Registry & Compliance
export * from "./organizations";
export * from "./assets";
export * from "./compliance";

// Module 2: Telemetry
export * from "./telemetry";

// Anomaly Detection Baselines
export * from "./baselines";

// Module 3: Detection Engine
export * from "./alerts";

// Module 4: Incident Management
export * from "./incidents";

// Module 5: Threat Intelligence
export * from "./intel";

// Admin: SPARTA Data Management
export * from "./sparta";

// Supply Chain Management
export * from "./supply-chain";

// User Management & Auth
export * from "./users";

// Syslog SIEM Integration
export * from "./syslog";

// Audit Trail
export * from "./audit";

// Scheduled Reports
export * from "./scheduled-reports";

// Risk Scores
export * from "./risk";

// Playbooks
export * from "./playbooks";

// Dashboard Layouts
export * from "./dashboard-layouts";

// Vulnerability / SBOM Management
export * from "./vulnerability";

// Threat Profiles / SPARTA Tailoring
export * from "./threat-profiles";
