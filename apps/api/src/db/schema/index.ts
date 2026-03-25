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
