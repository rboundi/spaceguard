/**
 * Seed realistic audit trail data for all organizations.
 *
 * Generates ~200-400 audit events per org spread across the last 90 days,
 * covering all 12 action types with realistic actors, resource types,
 * and detail payloads.
 *
 * IDEMPOTENT: truncates audit_log then re-inserts.
 *
 * Usage: npx tsx scripts/seed-audit-trail.ts
 */

import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://spaceguard:spaceguard_dev@localhost:5432/spaceguard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysAgo: number): Date {
  const now = Date.now();
  const msAgo = daysAgo * 24 * 60 * 60 * 1000;
  return new Date(now - Math.random() * msAgo);
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Actors per org (realistic team members)
// ---------------------------------------------------------------------------

const ACTORS_BY_ORG: Record<string, string[]> = {
  "Proba Space Systems": [
    "jan.devos@probaspce.be",
    "elke.janssen@probaspace.be",
    "marc.leclercq@probaspace.be",
    "admin@probaspace.be",
    "system",
  ],
  "HellasSat Operations": [
    "nikos.papadopoulos@hellassat.gr",
    "sofia.alexiou@hellassat.gr",
    "admin@hellassat.gr",
    "system",
  ],
  "NordSpace GmbH": [
    "lars.mueller@nordspace.de",
    "anna.schmidt@nordspace.de",
    "jonas.weber@nordspace.de",
    "admin@nordspace.de",
    "system",
  ],
  "Orbital Dynamics SAS": [
    "pierre.dupont@orbitaldynamics.fr",
    "marie.laurent@orbitaldynamics.fr",
    "jean.moreau@orbitaldynamics.fr",
    "admin@orbitaldynamics.fr",
    "system",
  ],
};

// ---------------------------------------------------------------------------
// Event templates
// ---------------------------------------------------------------------------

type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VIEW"
  | "EXPORT"
  | "LOGIN"
  | "LOGOUT"
  | "STATUS_CHANGE"
  | "REPORT_GENERATED"
  | "ALERT_ACKNOWLEDGED"
  | "INCIDENT_CREATED"
  | "MAPPING_CHANGED";

interface EventTemplate {
  action: AuditAction;
  resourceType: string | null;
  weight: number; // relative frequency
  detailsFn: () => Record<string, unknown>;
}

const ASSET_NAMES = [
  "SAT-LEO-01", "SAT-LEO-02", "SAT-GEO-PRIME", "GS-Svalbard",
  "GS-Athens", "CC-Primary", "CC-DR-Site", "UL-SBand",
  "DL-XBand", "ISL-Crosslink-01",
];

const INCIDENT_TITLES = [
  "Anomalous TM frame on SAT-LEO-01",
  "Unauthorized telecommand attempt",
  "Ground station link degradation",
  "Firmware integrity mismatch",
  "Unusual authentication pattern",
  "Data exfiltration attempt blocked",
  "Solar panel telemetry anomaly",
  "Control center VPN breach attempt",
];

const REPORT_TYPES = [
  "compliance", "incident-summary", "threat-briefing",
  "supply-chain", "audit-trail",
];

const COMPLIANCE_CATEGORIES = [
  "Risk Management", "Incident Handling", "Business Continuity",
  "Supply Chain Security", "Access Control", "Encryption",
  "Vulnerability Handling", "Cyber Hygiene", "Human Resources",
  "Asset Management",
];

const templates: EventTemplate[] = [
  // High frequency: views and logins
  {
    action: "VIEW",
    resourceType: "asset",
    weight: 25,
    detailsFn: () => ({ assetName: pick(ASSET_NAMES), page: "detail" }),
  },
  {
    action: "VIEW",
    resourceType: "compliance_mapping",
    weight: 10,
    detailsFn: () => ({ category: pick(COMPLIANCE_CATEGORIES) }),
  },
  {
    action: "LOGIN",
    resourceType: null,
    weight: 15,
    detailsFn: () => ({
      method: pick(["password", "sso", "api_key"]),
      userAgent: pick([
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "SpaceGuard CLI/1.0",
      ]),
    }),
  },
  {
    action: "LOGOUT",
    resourceType: null,
    weight: 8,
    detailsFn: () => ({ reason: pick(["manual", "timeout", "session_expired"]) }),
  },

  // Medium frequency: updates and creates
  {
    action: "UPDATE",
    resourceType: "asset",
    weight: 12,
    detailsFn: () => ({
      assetName: pick(ASSET_NAMES),
      fields: pick([
        ["status", "description"],
        ["criticality"],
        ["metadata.firmware_version"],
        ["name", "description"],
      ]),
    }),
  },
  {
    action: "CREATE",
    resourceType: "asset",
    weight: 4,
    detailsFn: () => ({
      assetName: `NEW-${pick(["SAT", "GS", "CC", "UL", "DL"])}-${randomInt(10, 99)}`,
      assetType: pick(["LEO_SATELLITE", "GROUND_STATION", "CONTROL_CENTER", "UPLINK"]),
    }),
  },
  {
    action: "MAPPING_CHANGED",
    resourceType: "compliance_mapping",
    weight: 10,
    detailsFn: () => ({
      op: pick(["create", "update"]),
      category: pick(COMPLIANCE_CATEGORIES),
      oldStatus: pick(["NOT_ASSESSED", "NON_COMPLIANT", "PARTIALLY_COMPLIANT"]),
      newStatus: pick(["PARTIALLY_COMPLIANT", "COMPLIANT"]),
    }),
  },
  {
    action: "STATUS_CHANGE",
    resourceType: "asset",
    weight: 5,
    detailsFn: () => ({
      assetName: pick(ASSET_NAMES),
      from: pick(["OPERATIONAL", "DEGRADED"]),
      to: pick(["MAINTENANCE", "OPERATIONAL", "DEGRADED"]),
    }),
  },

  // Low frequency: critical actions
  {
    action: "INCIDENT_CREATED",
    resourceType: "incident",
    weight: 3,
    detailsFn: () => ({
      title: pick(INCIDENT_TITLES),
      severity: pick(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
    }),
  },
  {
    action: "ALERT_ACKNOWLEDGED",
    resourceType: "alert",
    weight: 6,
    detailsFn: () => ({
      ruleId: `RULE-${randomInt(1, 20)}`,
      title: pick([
        "Battery voltage anomaly",
        "Excessive command rate",
        "Link SNR drop",
        "CPU load spike",
        "Temperature threshold breach",
      ]),
      newStatus: pick(["RESOLVED", "FALSE_POSITIVE"]),
    }),
  },
  {
    action: "REPORT_GENERATED",
    resourceType: "report",
    weight: 5,
    detailsFn: () => ({
      reportType: pick(REPORT_TYPES),
      format: "pdf",
    }),
  },
  {
    action: "EXPORT",
    resourceType: "report",
    weight: 3,
    detailsFn: () => ({
      exportType: pick(["csv", "pdf", "json"]),
      recordCount: randomInt(10, 500),
    }),
  },
  {
    action: "DELETE",
    resourceType: pick(["asset", "supplier", "compliance_mapping"]),
    weight: 2,
    detailsFn: () => ({
      reason: pick(["decommissioned", "duplicate", "test_data", "reorganization"]),
    }),
  },
  {
    action: "UPDATE",
    resourceType: "supplier",
    weight: 4,
    detailsFn: () => ({
      supplierName: pick(["KSAT", "e-GEOS", "OHB SE", "AWS GovCloud", "Custom MCS Vendor"]),
      fields: pick([["risk_score"], ["security_assessment"], ["criticality"], ["certifications"]]),
    }),
  },
  {
    action: "CREATE",
    resourceType: "supplier",
    weight: 2,
    detailsFn: () => ({
      supplierName: `Vendor-${randomInt(100, 999)}`,
      type: pick(["GROUND_SEGMENT", "COMPONENT", "SOFTWARE", "CLOUD_PROVIDER"]),
    }),
  },
];

// Build weighted selection array
const weightedTemplates: EventTemplate[] = [];
for (const t of templates) {
  for (let i = 0; i < t.weight; i++) {
    weightedTemplates.push(t);
  }
}

const IP_POOLS = [
  "10.0.1.", "10.0.2.", "192.168.1.", "172.16.0.",
  "85.214.132.", "62.216.8.",
];

function randomIp(): string {
  return pick(IP_POOLS) + randomInt(2, 254);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const sql = postgres(connectionString);

  try {
    // Get all orgs
    const orgs = await sql<Array<{ id: string; name: string }>>`
      SELECT id, name FROM organizations ORDER BY name
    `;

    if (orgs.length === 0) {
      console.error("No organizations found. Run realistic-data.ts first.");
      process.exit(1);
    }

    console.log(`Found ${orgs.length} organizations`);

    // Get some real asset IDs per org for resource_id references
    const assetsByOrg: Record<string, string[]> = {};
    for (const org of orgs) {
      const assets = await sql<Array<{ id: string }>>`
        SELECT id FROM space_assets WHERE organization_id = ${org.id} LIMIT 10
      `;
      assetsByOrg[org.id] = assets.map((a) => a.id);
    }

    // Truncate existing audit data
    await sql`TRUNCATE audit_log`;
    console.log("Truncated audit_log");

    let totalInserted = 0;

    for (const org of orgs) {
      const actors = ACTORS_BY_ORG[org.name] ?? [
        "admin@" + org.name.toLowerCase().replace(/\s+/g, "") + ".eu",
        "operator@" + org.name.toLowerCase().replace(/\s+/g, "") + ".eu",
        "system",
      ];
      const orgAssetIds = assetsByOrg[org.id] ?? [];

      // Generate 200-400 events per org
      const eventCount = randomInt(200, 400);
      const events: Array<{
        organization_id: string;
        actor: string;
        action: string;
        resource_type: string | null;
        resource_id: string | null;
        details: string | null;
        ip_address: string | null;
        timestamp: Date;
      }> = [];

      for (let i = 0; i < eventCount; i++) {
        const template = pick(weightedTemplates);
        const actor = pick(actors);
        const ts = randomDate(90);

        // Use real asset IDs when the resource is an asset
        let resourceId: string | null = null;
        if (
          template.resourceType === "asset" &&
          orgAssetIds.length > 0
        ) {
          resourceId = pick(orgAssetIds);
        } else if (template.resourceType) {
          resourceId = uuid();
        }

        const details = template.detailsFn();
        const ipAddress =
          template.action === "LOGIN" || template.action === "LOGOUT"
            ? randomIp()
            : Math.random() > 0.5
            ? randomIp()
            : null;

        events.push({
          organization_id: org.id,
          actor,
          action: template.action,
          resource_type: template.resourceType,
          resource_id: resourceId,
          details: JSON.stringify(details),
          ip_address: ipAddress,
          timestamp: ts,
        });
      }

      // Batch insert in chunks of 50
      const CHUNK = 50;
      for (let i = 0; i < events.length; i += CHUNK) {
        const chunk = events.slice(i, i + CHUNK);
        const values = chunk
          .map(
            (e) =>
              `(${org.id ? `'${e.organization_id}'::uuid` : "NULL"}, '${e.actor}', '${e.action}'::audit_action, ${
                e.resource_type ? `'${e.resource_type}'` : "NULL"
              }, ${e.resource_id ? `'${e.resource_id}'::uuid` : "NULL"}, ${
                e.details ? `'${e.details.replace(/'/g, "''")}'::jsonb` : "NULL"
              }, ${e.ip_address ? `'${e.ip_address}'` : "NULL"}, '${e.timestamp.toISOString()}'::timestamptz)`
          )
          .join(",\n");

        await sql.unsafe(`
          INSERT INTO audit_log
            (organization_id, actor, action, resource_type, resource_id, details, ip_address, timestamp)
          VALUES ${values}
        `);
      }

      totalInserted += events.length;
      console.log(`  ${org.name}: ${events.length} audit events`);
    }

    console.log(`\nDone! Inserted ${totalInserted} total audit events.`);

    // Summary by action
    const summary = await sql<Array<{ action: string; count: string }>>`
      SELECT action, count(*)::text as count FROM audit_log GROUP BY action ORDER BY count DESC
    `;
    console.log("\nBy action:");
    for (const row of summary) {
      console.log(`  ${row.action}: ${row.count}`);
    }
  } finally {
    await sql.end();
  }
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
