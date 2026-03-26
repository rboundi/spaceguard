/**
 * SpaceGuard Full Demo Scenario
 *
 * Creates a rich, realistic environment for investor demos and customer
 * presentations. Populates every feature area with meaningful data:
 *
 * 1. Creates 4 organizations with assets (via realistic-data.ts logic)
 * 2. Creates suppliers for Proba Space Systems
 * 3. Creates users for Proba (admin, operator, auditor)
 * 4. Loads seed data (NIS2, ENISA, SPARTA)
 * 5. Creates mixed compliance mappings per org
 * 6. Runs telemetry simulation for configurable duration
 * 7. Injects 5 anomaly scenarios as alerts
 * 8. Creates 3 incidents from critical alerts
 * 9. Generates NIS2 reports for the closed incident
 * 10. Generates audit trail entries
 * 11. Sets NIS2 deadlines for active incidents
 *
 * Usage:
 *   npx tsx scripts/full-demo.ts              # default (~2 min)
 *   npx tsx scripts/full-demo.ts --skip-telemetry  # fast, no telemetry
 *
 * Requires: PostgreSQL running, seed data loaded.
 */

import postgres from "postgres";
import * as crypto from "crypto";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://spaceguard:spaceguard_dev@localhost:5432/spaceguard";

const args = process.argv.slice(2);
const SKIP_TELEMETRY = args.includes("--skip-telemetry");

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function logSection(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

// ---------------------------------------------------------------------------
// Password hashing (matches auth service: scrypt)
// ---------------------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// 1. Organization and Asset data (matches realistic-data.ts)
// ---------------------------------------------------------------------------

interface OrgDef {
  name: string;
  country: string;
  nis2Classification: "ESSENTIAL" | "IMPORTANT";
  contactName: string;
  contactEmail: string;
  sector: string;
}

interface AssetDef {
  name: string;
  assetType: string;
  status: string;
  criticality: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface MappingDef {
  requirementIndex: number;
  status: "COMPLIANT" | "PARTIALLY_COMPLIANT" | "NON_COMPLIANT" | "NOT_ASSESSED";
  evidenceDescription?: string;
  notes?: string;
  lastAssessed?: string;
}

interface SupplierDef {
  name: string;
  type: string;
  country: string;
  criticality: string;
  description?: string;
  securityAssessment?: Record<string, unknown>;
}

const ORGS: Array<{
  org: OrgDef;
  assets: AssetDef[];
  mappings: MappingDef[];
  suppliers?: SupplierDef[];
}> = [
  // 1. Proba Space Systems (Belgium, most mature)
  {
    org: {
      name: "Proba Space Systems",
      country: "BE",
      nis2Classification: "ESSENTIAL",
      contactName: "Dr. Lena Vandermeer",
      contactEmail: "ops@proba-space.eu",
      sector: "space",
    },
    assets: [
      { name: "Proba-EO-1", assetType: "LEO_SATELLITE", status: "OPERATIONAL", criticality: "CRITICAL", description: "LEO Earth Observation satellite with MSI payload", metadata: { altitude_km: 615, inclination: 97.9, orbit_type: "SSO", norad_id: "55201", launch_date: "2024-03-15", manufacturer: "OHB SE" } },
      { name: "Proba-EO-2", assetType: "LEO_SATELLITE", status: "OPERATIONAL", criticality: "CRITICAL", description: "LEO Earth Observation satellite with SAR payload", metadata: { altitude_km: 615, inclination: 97.9, orbit_type: "SSO", norad_id: "55202", launch_date: "2024-03-15", manufacturer: "OHB SE" } },
      { name: "Proba-EO-3", assetType: "LEO_SATELLITE", status: "MAINTENANCE", criticality: "HIGH", description: "LEO EO satellite - AOCS anomaly under investigation", metadata: { altitude_km: 615, inclination: 97.9, orbit_type: "SSO", norad_id: "55203", status_notes: "AOCS anomaly since 2025-11" } },
      { name: "Svalbard Ground Station", assetType: "GROUND_STATION", status: "OPERATIONAL", criticality: "CRITICAL", description: "Primary high-latitude ground station via KSAT", metadata: { location: "Longyearbyen, Svalbard", latitude: 78.23, longitude: 15.39, operator: "KSAT" } },
      { name: "Matera Ground Station", assetType: "GROUND_STATION", status: "OPERATIONAL", criticality: "HIGH", description: "Secondary ground station via e-GEOS / ASI", metadata: { location: "Matera, Italy", latitude: 40.65, longitude: 16.7, operator: "e-GEOS" } },
      { name: "Brussels Mission Control", assetType: "CONTROL_CENTER", status: "OPERATIONAL", criticality: "CRITICAL", description: "Primary mission control with hot standby in Liege", metadata: { location: "Brussels, Belgium", redundancy: "Hot standby in Liege", staff: "12 operators, 24/7 coverage" } },
      { name: "Primary S-band TT&C Link", assetType: "UPLINK", status: "OPERATIONAL", criticality: "CRITICAL", description: "Encrypted S-band telecommand and telemetry link", metadata: { frequency: "2025-2110 MHz", protocol: "CCSDS TC/TM", encryption: "SDLS AES-256-GCM" } },
      { name: "X-band Payload Data Link", assetType: "DOWNLINK", status: "OPERATIONAL", criticality: "HIGH", description: "High-rate payload data downlink - encryption pending", metadata: { frequency: "8025-8400 MHz", data_rate_mbps: 150, encryption: "None (pending CRA review)" } },
    ],
    mappings: [
      { requirementIndex: 0, status: "COMPLIANT", evidenceDescription: "ISO 27001 certified. Last audit March 2025 by DNV.", lastAssessed: "2025-03-15T10:00:00Z" },
      { requirementIndex: 1, status: "COMPLIANT", evidenceDescription: "Full asset register in SpaceGuard. Criticality reviewed Q4 2024.", lastAssessed: "2024-12-10T14:00:00Z" },
      { requirementIndex: 5, status: "COMPLIANT", evidenceDescription: "BCP/DRP tested annually. RTO 4h, RPO 1h.", lastAssessed: "2025-10-20T09:00:00Z" },
      { requirementIndex: 6, status: "COMPLIANT", evidenceDescription: "Hot standby MCC in Liege tested quarterly.", lastAssessed: "2025-09-05T11:00:00Z" },
      { requirementIndex: 12, status: "COMPLIANT", evidenceDescription: "Annual security awareness training. Quarterly phishing simulation.", lastAssessed: "2025-11-01T08:00:00Z" },
      { requirementIndex: 13, status: "COMPLIANT", evidenceDescription: "AES-256-GCM for TT&C. RSA-4096 for key exchange.", lastAssessed: "2025-06-15T10:00:00Z" },
      { requirementIndex: 15, status: "COMPLIANT", evidenceDescription: "Background checks for all staff. Access revocation audited.", lastAssessed: "2025-08-20T14:00:00Z" },
      { requirementIndex: 16, status: "COMPLIANT", evidenceDescription: "MFA via Okta for mission control. Hardware tokens for privileged accounts.", lastAssessed: "2025-07-10T09:00:00Z" },
      { requirementIndex: 2, status: "PARTIALLY_COMPLIANT", evidenceDescription: "Ground segment IR tested. Space-specific playbooks in draft.", notes: "Space-segment playbooks Q1 2026.", lastAssessed: "2025-05-20T10:00:00Z" },
      { requirementIndex: 3, status: "PARTIALLY_COMPLIANT", evidenceDescription: "CCN-CERT Belgium notification procedure documented.", notes: "Formal validation Q2 2026.", lastAssessed: "2025-04-10T11:00:00Z" },
      { requirementIndex: 7, status: "PARTIALLY_COMPLIANT", evidenceDescription: "Tier-1 suppliers assessed. Tier-2 pending.", notes: "Supply chain questionnaire sent.", lastAssessed: "2025-09-15T10:00:00Z" },
      { requirementIndex: 8, status: "PARTIALLY_COMPLIANT", evidenceDescription: "KSAT SOC 2 reviewed. e-GEOS assessed informally.", lastAssessed: "2025-10-05T14:00:00Z" },
      { requirementIndex: 9, status: "PARTIALLY_COMPLIANT", evidenceDescription: "OWASP Top 10 for ground software. Flight software informal.", lastAssessed: "2025-07-20T09:00:00Z" },
      { requirementIndex: 4, status: "NON_COMPLIANT", notes: "No SIEM. Ground monitoring ad-hoc. SIEM approved Q1 2026.", lastAssessed: "2025-11-15T10:00:00Z" },
      { requirementIndex: 10, status: "NON_COMPLIANT", notes: "Flight software not patchable in-orbit. Risk accepted.", lastAssessed: "2025-10-30T11:00:00Z" },
      { requirementIndex: 14, status: "NON_COMPLIANT", notes: "X-band downlink unencrypted. CRA review Q2 2026.", lastAssessed: "2025-09-20T10:00:00Z" },
      { requirementIndex: 11, status: "NOT_ASSESSED" },
      { requirementIndex: 17, status: "NOT_ASSESSED" },
    ],
    suppliers: [
      { name: "KSAT", type: "GROUND_STATION_OPERATOR", country: "NO", criticality: "CRITICAL", description: "Primary ground station network (Svalbard, TrollSat)", securityAssessment: { lastAssessed: "2025-11-15", nextReview: "2026-05-15", iso27001Certified: true, soc2Certified: false, nis2Compliant: true, riskScore: 3 } },
      { name: "e-GEOS", type: "GROUND_STATION_OPERATOR", country: "IT", criticality: "HIGH", description: "Secondary ground station via ASI Matera", securityAssessment: { lastAssessed: "2025-09-22", nextReview: "2026-03-22", iso27001Certified: true, riskScore: 4 } },
      { name: "OHB SE", type: "COMPONENT_MANUFACTURER", country: "DE", criticality: "CRITICAL", description: "Satellite bus manufacturer (SmallGEO-derived)", securityAssessment: { lastAssessed: "2025-06-10", nextReview: "2026-06-10", iso27001Certified: true, soc2Certified: true, nis2Compliant: true, riskScore: 2 } },
      { name: "AWS", type: "CLOUD_PROVIDER", country: "IE", criticality: "HIGH", description: "Cloud infrastructure for MCS and data processing (eu-west-1)", securityAssessment: { lastAssessed: "2025-12-01", nextReview: "2026-06-01", iso27001Certified: true, soc2Certified: true, riskScore: 3 } },
      { name: "Custom MCS Vendor", type: "SOFTWARE_VENDOR", country: "BE", criticality: "MEDIUM", description: "Bespoke Mission Control System software (8 engineers)", securityAssessment: { lastAssessed: "2025-04-20", nextReview: "2025-10-20", iso27001Certified: false, soc2Certified: false, riskScore: 7 } },
    ],
  },

  // 2. NordSat IoT (Sweden, startup, least mature)
  {
    org: {
      name: "NordSat IoT",
      country: "SE",
      nis2Classification: "IMPORTANT",
      contactName: "Erik Lindqvist",
      contactEmail: "security@nordsat.io",
      sector: "space",
    },
    assets: [
      { name: "NordSat-Alpha", assetType: "LEO_SATELLITE", status: "OPERATIONAL", criticality: "MEDIUM", description: "6U CubeSat - IoT connectivity payload", metadata: { altitude_km: 520, inclination: 52.0, bus: "6U CubeSat", manufacturer: "GomSpace" } },
      { name: "NordSat-Beta", assetType: "LEO_SATELLITE", status: "OPERATIONAL", criticality: "MEDIUM", description: "6U CubeSat - IoT connectivity payload", metadata: { altitude_km: 520, inclination: 52.0, bus: "6U CubeSat" } },
      { name: "NordSat-Gamma", assetType: "LEO_SATELLITE", status: "OPERATIONAL", criticality: "MEDIUM", description: "6U CubeSat - IoT connectivity payload", metadata: { altitude_km: 520, inclination: 52.0, bus: "6U CubeSat" } },
      { name: "NordSat-Delta", assetType: "LEO_SATELLITE", status: "OPERATIONAL", criticality: "MEDIUM", description: "6U CubeSat - IoT connectivity payload", metadata: { altitude_km: 520, inclination: 52.0, bus: "6U CubeSat" } },
      { name: "Kiruna Ground Station", assetType: "GROUND_STATION", status: "OPERATIONAL", criticality: "HIGH", description: "TT&C ground station via SSC Kiruna", metadata: { location: "Kiruna, Sweden", operator: "SSC" } },
      { name: "Stockholm Operations", assetType: "CONTROL_CENTER", status: "OPERATIONAL", criticality: "HIGH", description: "Mission control hosted in AWS eu-north-1", metadata: { location: "Stockholm", cloud: "AWS eu-north-1" } },
    ],
    mappings: [
      { requirementIndex: 15, status: "COMPLIANT", evidenceDescription: "HR policy in place. IAM least-privilege.", lastAssessed: "2025-08-10T10:00:00Z" },
      { requirementIndex: 16, status: "COMPLIANT", evidenceDescription: "MFA on all AWS and GitHub accounts.", lastAssessed: "2025-08-10T11:00:00Z" },
      { requirementIndex: 0, status: "PARTIALLY_COMPLIANT", evidenceDescription: "Basic risk register in Confluence.", notes: "ISO 27001 readiness 2026.", lastAssessed: "2025-06-01T09:00:00Z" },
      { requirementIndex: 12, status: "PARTIALLY_COMPLIANT", evidenceDescription: "KnowBe4 training. No space-specific yet.", lastAssessed: "2025-09-15T10:00:00Z" },
      { requirementIndex: 13, status: "PARTIALLY_COMPLIANT", evidenceDescription: "AWS AES-256 at rest. TLS 1.3. No formal crypto policy.", lastAssessed: "2025-07-20T14:00:00Z" },
      { requirementIndex: 4, status: "NON_COMPLIANT", notes: "No dedicated security monitoring.", lastAssessed: "2025-10-01T10:00:00Z" },
      { requirementIndex: 7, status: "NON_COMPLIANT", notes: "No formal supplier assessment.", lastAssessed: "2025-10-01T10:00:00Z" },
      { requirementIndex: 8, status: "NON_COMPLIANT", notes: "SSC ground station used without security assessment.", lastAssessed: "2025-10-01T10:00:00Z" },
      { requirementIndex: 10, status: "NON_COMPLIANT", notes: "CubeSat firmware not patchable. Known CVEs.", lastAssessed: "2025-10-01T10:00:00Z" },
      { requirementIndex: 14, status: "NON_COMPLIANT", notes: "UHF and S-band links unencrypted.", lastAssessed: "2025-10-01T10:00:00Z" },
      { requirementIndex: 1, status: "NOT_ASSESSED" },
      { requirementIndex: 2, status: "NOT_ASSESSED" },
      { requirementIndex: 3, status: "NOT_ASSESSED" },
      { requirementIndex: 5, status: "NOT_ASSESSED" },
      { requirementIndex: 6, status: "NOT_ASSESSED" },
      { requirementIndex: 9, status: "NOT_ASSESSED" },
      { requirementIndex: 11, status: "NOT_ASSESSED" },
      { requirementIndex: 17, status: "NOT_ASSESSED" },
    ],
  },

  // 3. MediterraneanSat Communications (Greece, established)
  {
    org: {
      name: "MediterraneanSat Communications",
      country: "GR",
      nis2Classification: "ESSENTIAL",
      contactName: "Dimitris Karagiannis",
      contactEmail: "ciso@medsat-comm.gr",
      sector: "space",
    },
    assets: [
      { name: "MedSat-1", assetType: "GEO_SATELLITE", status: "OPERATIONAL", criticality: "CRITICAL", description: "GEO SATCOM covering Mediterranean/MENA", metadata: { longitude_degrees: 39.0, orbit_type: "GEO", manufacturer: "Thales Alenia Space", transponders: "36 Ku + 12 Ka" } },
      { name: "Thermopylae Teleport", assetType: "GROUND_STATION", status: "OPERATIONAL", criticality: "CRITICAL", description: "Primary owned teleport", metadata: { location: "Thermopylae, Greece", operator: "MedSat (owned)" } },
      { name: "Limassol Backup Teleport", assetType: "GROUND_STATION", status: "OPERATIONAL", criticality: "HIGH", description: "DR teleport in Cyprus", metadata: { location: "Limassol, Cyprus" } },
      { name: "Athens NOC", assetType: "CONTROL_CENTER", status: "OPERATIONAL", criticality: "CRITICAL", description: "24/7 Network Operations Centre", metadata: { location: "Athens, Greece", monitoring: "24/7 with 8 operators" } },
    ],
    mappings: [
      { requirementIndex: 0, status: "COMPLIANT", evidenceDescription: "ISO 27001:2022 certified since 2020.", lastAssessed: "2025-04-20T10:00:00Z" },
      { requirementIndex: 1, status: "COMPLIANT", evidenceDescription: "Asset inventory maintained. Criticality approved by CISO.", lastAssessed: "2025-03-10T14:00:00Z" },
      { requirementIndex: 2, status: "COMPLIANT", evidenceDescription: "CSIRT established. Tabletop exercise Nov 2025.", lastAssessed: "2025-11-10T10:00:00Z" },
      { requirementIndex: 3, status: "COMPLIANT", evidenceDescription: "ADAE (Greece NCA) notification aligned.", lastAssessed: "2025-09-01T09:00:00Z" },
      { requirementIndex: 5, status: "COMPLIANT", evidenceDescription: "Active-Active NOC. BCP tested annually.", lastAssessed: "2025-09-15T11:00:00Z" },
      { requirementIndex: 12, status: "COMPLIANT", evidenceDescription: "Proofpoint training. 100% completion.", lastAssessed: "2025-10-05T10:00:00Z" },
      { requirementIndex: 13, status: "COMPLIANT", evidenceDescription: "AES-256 at rest, TLS 1.3 in transit.", lastAssessed: "2025-05-20T14:00:00Z" },
      { requirementIndex: 14, status: "COMPLIANT", evidenceDescription: "SDLS AES-256-GCM for TT&C. HSM key management.", lastAssessed: "2025-06-10T09:00:00Z" },
      { requirementIndex: 15, status: "COMPLIANT", evidenceDescription: "HR security policy. Quarterly access reviews.", lastAssessed: "2025-08-15T10:00:00Z" },
      { requirementIndex: 16, status: "COMPLIANT", evidenceDescription: "RSA SecurID MFA. Hardware tokens for NOC.", lastAssessed: "2025-07-20T09:00:00Z" },
      { requirementIndex: 4, status: "PARTIALLY_COMPLIANT", evidenceDescription: "Splunk SIEM deployed. Space telemetry not integrated yet.", notes: "Integration Q2 2026.", lastAssessed: "2025-11-01T10:00:00Z" },
      { requirementIndex: 6, status: "PARTIALLY_COMPLIANT", evidenceDescription: "Degraded-mode tested but not for cyber attack.", lastAssessed: "2025-09-15T11:00:00Z" },
      { requirementIndex: 7, status: "PARTIALLY_COMPLIANT", evidenceDescription: "Thales has ISO 27001. Other suppliers informal.", lastAssessed: "2025-07-10T14:00:00Z" },
      { requirementIndex: 11, status: "PARTIALLY_COMPLIANT", evidenceDescription: "Annual pentest. No continuous measurement.", lastAssessed: "2025-10-30T10:00:00Z" },
      { requirementIndex: 10, status: "NON_COMPLIANT", notes: "GEO software not patchable post-launch. Risk accepted.", lastAssessed: "2025-10-15T10:00:00Z" },
      { requirementIndex: 17, status: "NON_COMPLIANT", notes: "No out-of-band secure comms for incidents.", lastAssessed: "2025-09-20T11:00:00Z" },
      { requirementIndex: 8, status: "NOT_ASSESSED" },
      { requirementIndex: 9, status: "NOT_ASSESSED" },
    ],
  },

  // 4. Orbital Watch Europe (France, SSA, strong posture)
  {
    org: {
      name: "Orbital Watch Europe",
      country: "FR",
      nis2Classification: "IMPORTANT",
      contactName: "Marie Delacroix",
      contactEmail: "security@orbitalwatch.eu",
      sector: "space",
    },
    assets: [
      { name: "OWE Radar Station Alpha", assetType: "GROUND_STATION", status: "OPERATIONAL", criticality: "CRITICAL", description: "Phased array radar for SST", metadata: { location: "Aire-sur-l'Adour, France", detection_range_km: 2000 } },
      { name: "OWE Optical Sensor Beta", assetType: "GROUND_STATION", status: "OPERATIONAL", criticality: "HIGH", description: "Optical telescope for GEO monitoring", metadata: { location: "Tenerife, Canary Islands", aperture_cm: 50 } },
      { name: "Toulouse Operations Center", assetType: "CONTROL_CENTER", status: "OPERATIONAL", criticality: "CRITICAL", description: "SSA platform and analyst operations", metadata: { location: "Toulouse, France", cloud: "OVHcloud eu-west", staff: "15 analysts" } },
      { name: "SST Data Network", assetType: "NETWORK_SEGMENT", status: "OPERATIONAL", criticality: "HIGH", description: "Encrypted WireGuard VPN mesh connecting all sensor sites", metadata: { type: "Encrypted VPN mesh", protocol: "WireGuard" } },
    ],
    mappings: [
      { requirementIndex: 0, status: "COMPLIANT", evidenceDescription: "ISO 27001:2022 + ANSSI SecNumCloud.", lastAssessed: "2025-05-10T10:00:00Z" },
      { requirementIndex: 1, status: "COMPLIANT", evidenceDescription: "Full asset register. Quarterly reviews.", lastAssessed: "2025-11-01T09:00:00Z" },
      { requirementIndex: 2, status: "COMPLIANT", evidenceDescription: "CERT-FR aligned. Red team exercise Sep 2025.", lastAssessed: "2025-09-20T10:00:00Z" },
      { requirementIndex: 3, status: "COMPLIANT", evidenceDescription: "ANSSI-approved notification procedure.", lastAssessed: "2025-03-15T11:00:00Z" },
      { requirementIndex: 4, status: "COMPLIANT", evidenceDescription: "Splunk Enterprise SIEM 24/7. Custom SSA rules.", lastAssessed: "2025-10-15T10:00:00Z" },
      { requirementIndex: 5, status: "COMPLIANT", evidenceDescription: "BCP/DRP tested annually. RTO 2h.", lastAssessed: "2025-11-05T09:00:00Z" },
      { requirementIndex: 7, status: "COMPLIANT", evidenceDescription: "All critical suppliers assessed. OVHcloud SecNumCloud.", lastAssessed: "2025-07-20T14:00:00Z" },
      { requirementIndex: 12, status: "COMPLIANT", evidenceDescription: "CISA/ENISA training. Monthly phishing sims.", lastAssessed: "2025-10-20T10:00:00Z" },
      { requirementIndex: 13, status: "COMPLIANT", evidenceDescription: "ANSSI-compliant crypto. WireGuard + AES-256.", lastAssessed: "2025-06-10T09:00:00Z" },
      { requirementIndex: 14, status: "COMPLIANT", evidenceDescription: "No RF uplinks (SSA only). WireGuard with cert auth.", lastAssessed: "2025-07-05T10:00:00Z" },
      { requirementIndex: 15, status: "COMPLIANT", evidenceDescription: "National security clearance for classified SSA data.", lastAssessed: "2025-09-10T11:00:00Z" },
      { requirementIndex: 16, status: "COMPLIANT", evidenceDescription: "FIDO2 hardware keys for privileged access.", lastAssessed: "2025-08-15T10:00:00Z" },
      { requirementIndex: 8, status: "PARTIALLY_COMPLIANT", evidenceDescription: "OVHcloud assessed. Sensor contractors signed but not audited.", notes: "Audit H1 2026.", lastAssessed: "2025-10-01T10:00:00Z" },
      { requirementIndex: 10, status: "PARTIALLY_COMPLIANT", evidenceDescription: "Software sensors patchable. Legacy radar firmware has CVEs.", notes: "Firmware upgrade Q3 2026.", lastAssessed: "2025-11-01T10:00:00Z" },
      { requirementIndex: 11, status: "PARTIALLY_COMPLIANT", evidenceDescription: "Annual pentest. No formalised metrics dashboard.", lastAssessed: "2025-08-30T14:00:00Z" },
      { requirementIndex: 17, status: "NON_COMPLIANT", notes: "No dedicated out-of-band comms. TETRA under procurement.", lastAssessed: "2025-11-01T10:00:00Z" },
      { requirementIndex: 6, status: "NOT_ASSESSED" },
      { requirementIndex: 9, status: "NOT_ASSESSED" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Users for Proba
// ---------------------------------------------------------------------------

const PROBA_USERS = [
  { email: "admin@proba-space.eu", name: "Dr. Lena Vandermeer", role: "ADMIN", password: "SpaceGuard2026!" },
  { email: "operator@proba-space.eu", name: "Thomas Mertens", role: "OPERATOR", password: "SpaceGuard2026!" },
  { email: "auditor@proba-space.eu", name: "Clara Dubois", role: "AUDITOR", password: "SpaceGuard2026!" },
];

// ---------------------------------------------------------------------------
// Telemetry physics helpers
// ---------------------------------------------------------------------------

const ORBIT_PERIOD_S = 96 * 60;
const ECLIPSE_FRACTION = 0.35;
const TWO_PI = 2 * Math.PI;

function noise(amp: number): number { return (Math.random() - 0.5) * 2 * amp; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

function inSunlight(t: number): boolean {
  return ((t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S) < (1 - ECLIPSE_FRACTION);
}

function batteryVoltage(t: number, fail: boolean, failStart: number): number {
  const phase = (t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S;
  let v = 30.2 + 2.2 * Math.sin(TWO_PI * phase + Math.PI / 4) + noise(0.08);
  if (fail && t >= failStart) {
    v -= 3.0 * Math.min(1, (t - failStart) / 900);
  }
  return +clamp(v, 22.0, 33.0).toFixed(3);
}

function solarCurrent(t: number): number {
  if (!inSunlight(t)) return +Math.abs(noise(0.02)).toFixed(3);
  const phase = (t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S;
  const i = 4.2 * Math.max(0, Math.sin(TWO_PI * phase / (1 - ECLIPSE_FRACTION)));
  return +clamp(i + noise(0.05), 0, 4.3).toFixed(3);
}

function temperatureObc(t: number, spike: boolean, spikeStart: number): number {
  const phase = (t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S;
  let temp = 15 + 18 * Math.sin(TWO_PI * phase + 1.0) + noise(0.3);
  if (spike && t >= spikeStart) {
    temp += 25 * Math.min(1, (t - spikeStart) / 600);
  }
  return +clamp(temp, -15, 75).toFixed(2);
}

function signalStrength(t: number, jammed: boolean, jamStart: number): number {
  const inContact = (t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S < 0.11;
  if (!inContact) return -99;
  const phase = ((t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S) / 0.11;
  let sig = -85 + 20 * Math.sin(Math.PI * phase) + noise(0.5);
  if (jammed && t >= jamStart) {
    sig -= 8 * Math.min(1, (t - jamStart) / 600);
  }
  return +clamp(sig, -99, -55).toFixed(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const sql = postgres(connectionString, { max: 5 });

  try {
    // ==================================================================
    logSection("Step 1-2: Organizations, Assets, Suppliers");
    // ==================================================================

    const reqRows = await sql<Array<{ id: string; title: string }>>`
      SELECT id, title FROM compliance_requirements ORDER BY created_at ASC
    `;
    if (reqRows.length === 0) {
      log("ERROR: No compliance requirements found. Run 'npx tsx seed-data/seed.ts' first.");
      process.exit(1);
    }
    log(`Found ${reqRows.length} compliance requirements`);
    const reqIds = reqRows.map((r) => r.id);

    // Track created org IDs and asset IDs by name
    const orgMap = new Map<string, string>();
    const assetMap = new Map<string, string>();

    for (const { org, assets, mappings, suppliers: orgSuppliers } of ORGS) {
      log(`Creating: ${org.name}`);

      // Idempotent: delete existing (users and sessions now cascade from org)
      await sql`DELETE FROM audit_log WHERE organization_id IN (SELECT id FROM organizations WHERE name = ${org.name})`;
      await sql`DELETE FROM organizations WHERE name = ${org.name}`;

      const [orgRow] = await sql<Array<{ id: string }>>`
        INSERT INTO organizations (name, nis2_classification, country, sector, contact_email, contact_name)
        VALUES (${org.name}, ${org.nis2Classification}::nis2_classification, ${org.country}, ${org.sector}, ${org.contactEmail}, ${org.contactName})
        RETURNING id
      `;
      orgMap.set(org.name, orgRow.id);

      for (const asset of assets) {
        const [assetRow] = await sql<Array<{ id: string }>>`
          INSERT INTO space_assets (organization_id, name, asset_type, description, metadata, asset_status, criticality)
          VALUES (${orgRow.id}, ${asset.name}, ${asset.assetType}::asset_type, ${asset.description ?? null}, ${asset.metadata ? JSON.stringify(asset.metadata) : null}, ${asset.status}::asset_status, ${asset.criticality}::criticality)
          RETURNING id
        `;
        assetMap.set(asset.name, assetRow.id);
      }
      log(`  ${assets.length} assets created`);

      // Compliance mappings
      for (const m of mappings) {
        const reqId = reqIds[m.requirementIndex];
        if (!reqId) continue;
        await sql`
          INSERT INTO compliance_mappings (organization_id, requirement_id, status, evidence_description, notes, last_assessed)
          VALUES (${orgRow.id}, ${reqId}, ${m.status}::compliance_status, ${m.evidenceDescription ?? null}, ${m.notes ?? null}, ${m.lastAssessed ? new Date(m.lastAssessed) : null})
        `;
      }
      log(`  ${mappings.length} compliance mappings`);

      // Suppliers
      if (orgSuppliers && orgSuppliers.length > 0) {
        for (const sup of orgSuppliers) {
          await sql`
            INSERT INTO suppliers (organization_id, name, type, country, criticality, description, security_assessment)
            VALUES (${orgRow.id}, ${sup.name}, ${sup.type}::supplier_type, ${sup.country}, ${sup.criticality}::supplier_criticality, ${sup.description ?? null}, ${sup.securityAssessment ? JSON.stringify(sup.securityAssessment) : null})
          `;
        }
        log(`  ${orgSuppliers.length} suppliers`);
      }
    }

    // ==================================================================
    logSection("Step 3: Users for Proba Space Systems");
    // ==================================================================

    const probaOrgId = orgMap.get("Proba Space Systems")!;

    // Delete existing users for this org first
    await sql`DELETE FROM users WHERE organization_id = ${probaOrgId}`;

    for (const u of PROBA_USERS) {
      const hash = await hashPassword(u.password);
      await sql`
        INSERT INTO users (organization_id, email, password_hash, name, role)
        VALUES (${probaOrgId}, ${u.email}, ${hash}, ${u.name}, ${u.role}::user_role)
      `;
      log(`  Created user: ${u.email} (${u.role})`);
    }

    // ==================================================================
    logSection("Step 6: Telemetry Streams & Simulation");
    // ==================================================================

    const probaEO1 = assetMap.get("Proba-EO-1")!;
    const nordAlpha = assetMap.get("NordSat-Alpha")!;

    // Delete existing streams for Proba and NordSat
    await sql`DELETE FROM telemetry_streams WHERE organization_id = ${probaOrgId}`;
    const nordOrgId = orgMap.get("NordSat IoT")!;
    await sql`DELETE FROM telemetry_streams WHERE organization_id = ${nordOrgId}`;

    // Create streams
    const streams: Array<{ id: string; apiKey: string; name: string; orgId: string; assetId: string }> = [];

    for (const [orgName, assetName, streamName, apid, hz] of [
      ["Proba Space Systems", "Proba-EO-1", "Proba-EO-1 HK", 100, 1],
      ["Proba Space Systems", "Proba-EO-1", "Proba-EO-1 COMMS", 300, 0.1],
      ["NordSat IoT", "NordSat-Alpha", "NordSat-Alpha HK", 100, 1],
    ] as const) {
      const oId = orgMap.get(orgName)!;
      const aId = assetMap.get(assetName)!;
      const key = generateApiKey();

      const [row] = await sql<Array<{ id: string }>>`
        INSERT INTO telemetry_streams (organization_id, asset_id, name, protocol, apid, sample_rate_hz, status, api_key)
        VALUES (${oId}, ${aId}, ${streamName}, 'CCSDS_TM'::stream_protocol, ${apid}, ${hz}, 'ACTIVE'::stream_status, ${key})
        RETURNING id
      `;
      streams.push({ id: row.id, apiKey: key, name: streamName as string, orgId: oId, assetId: aId });
      log(`  Created stream: ${streamName} (${row.id})`);
    }

    if (!SKIP_TELEMETRY) {
      // Generate 2 hours of telemetry data (compressed from 24h for speed)
      const DURATION_S = 2 * 3600; // 2 hours
      const now = Date.now();
      const startMs = now - DURATION_S * 1000;

      log(`Generating ${DURATION_S / 3600}h of telemetry data...`);

      const hkStream = streams[0];
      const commsStream = streams[1];
      const nordStream = streams[2];

      // Battery cell failure anomaly starts at 75% of duration on Proba-EO-1
      const batteryFailStart = DURATION_S * 0.75;
      // Temperature spike on NordSat-Alpha at 80%
      const tempSpikeStart = DURATION_S * 0.80;
      // Jamming on comms at 85%
      const jammingStart = DURATION_S * 0.85;

      const BATCH = 500;

      // HK Stream for Proba-EO-1
      let hkBatch: Array<{ time: string; parameterName: string; valueNumeric: number; quality: string }> = [];
      for (let t = 0; t < DURATION_S; t += 1) {
        const ts = new Date(startMs + t * 1000).toISOString();
        const bv = batteryVoltage(t, true, batteryFailStart);
        const sc = solarCurrent(t);
        const temp = temperatureObc(t, false, 0);

        hkBatch.push({ time: ts, parameterName: "battery_voltage_v", valueNumeric: bv, quality: bv < 27 ? "SUSPECT" : "GOOD" });
        hkBatch.push({ time: ts, parameterName: "solar_current_a", valueNumeric: sc, quality: "GOOD" });
        hkBatch.push({ time: ts, parameterName: "temperature_obc_c", valueNumeric: temp, quality: temp > 40 ? "SUSPECT" : "GOOD" });

        if (hkBatch.length >= BATCH) {
          await sql`
            INSERT INTO telemetry_points (time, stream_id, parameter_name, value_numeric, quality)
            SELECT (p->>'time')::timestamptz, ${hkStream.id}::uuid, p->>'parameterName', (p->>'valueNumeric')::double precision, (p->>'quality')::telemetry_quality
            FROM jsonb_array_elements(${sql.json(hkBatch)}::jsonb) AS p
          `;
          hkBatch = [];
        }
      }
      if (hkBatch.length > 0) {
        await sql`
          INSERT INTO telemetry_points (time, stream_id, parameter_name, value_numeric, quality)
          SELECT (p->>'time')::timestamptz, ${hkStream.id}::uuid, p->>'parameterName', (p->>'valueNumeric')::double precision, (p->>'quality')::telemetry_quality
          FROM jsonb_array_elements(${sql.json(hkBatch)}::jsonb) AS p
        `;
      }
      log(`  Proba-EO-1 HK: ${DURATION_S * 3} points ingested`);

      // COMMS stream with jamming anomaly
      let commsBatch: Array<{ time: string; parameterName: string; valueNumeric: number; quality: string }> = [];
      for (let t = 0; t < DURATION_S; t += 10) {
        const ts = new Date(startMs + t * 1000).toISOString();
        const sig = signalStrength(t, true, jammingStart);
        commsBatch.push({ time: ts, parameterName: "signal_strength_dbm", valueNumeric: sig, quality: sig < -90 && sig > -99 ? "SUSPECT" : "GOOD" });

        if (commsBatch.length >= BATCH) {
          await sql`
            INSERT INTO telemetry_points (time, stream_id, parameter_name, value_numeric, quality)
            SELECT (p->>'time')::timestamptz, ${commsStream.id}::uuid, p->>'parameterName', (p->>'valueNumeric')::double precision, (p->>'quality')::telemetry_quality
            FROM jsonb_array_elements(${sql.json(commsBatch)}::jsonb) AS p
          `;
          commsBatch = [];
        }
      }
      if (commsBatch.length > 0) {
        await sql`
          INSERT INTO telemetry_points (time, stream_id, parameter_name, value_numeric, quality)
          SELECT (p->>'time')::timestamptz, ${commsStream.id}::uuid, p->>'parameterName', (p->>'valueNumeric')::double precision, (p->>'quality')::telemetry_quality
          FROM jsonb_array_elements(${sql.json(commsBatch)}::jsonb) AS p
        `;
      }
      log(`  Proba-EO-1 COMMS: ${Math.ceil(DURATION_S / 10)} points ingested`);

      // NordSat HK with temperature spike
      let nordBatch: Array<{ time: string; parameterName: string; valueNumeric: number; quality: string }> = [];
      for (let t = 0; t < DURATION_S; t += 1) {
        const ts = new Date(startMs + t * 1000).toISOString();
        const temp = temperatureObc(t, true, tempSpikeStart);
        const bv = batteryVoltage(t, false, 0);

        nordBatch.push({ time: ts, parameterName: "temperature_obc_c", valueNumeric: temp, quality: temp > 40 ? "SUSPECT" : "GOOD" });
        nordBatch.push({ time: ts, parameterName: "battery_voltage_v", valueNumeric: bv, quality: "GOOD" });

        if (nordBatch.length >= BATCH) {
          await sql`
            INSERT INTO telemetry_points (time, stream_id, parameter_name, value_numeric, quality)
            SELECT (p->>'time')::timestamptz, ${nordStream.id}::uuid, p->>'parameterName', (p->>'valueNumeric')::double precision, (p->>'quality')::telemetry_quality
            FROM jsonb_array_elements(${sql.json(nordBatch)}::jsonb) AS p
          `;
          nordBatch = [];
        }
      }
      if (nordBatch.length > 0) {
        await sql`
          INSERT INTO telemetry_points (time, stream_id, parameter_name, value_numeric, quality)
          SELECT (p->>'time')::timestamptz, ${nordStream.id}::uuid, p->>'parameterName', (p->>'valueNumeric')::double precision, (p->>'quality')::telemetry_quality
          FROM jsonb_array_elements(${sql.json(nordBatch)}::jsonb) AS p
        `;
      }
      log(`  NordSat-Alpha HK: ${DURATION_S * 2} points ingested`);
    } else {
      log("Telemetry simulation SKIPPED (--skip-telemetry)");
    }

    // ==================================================================
    logSection("Step 7: Inject 5 Anomaly Alerts");
    // ==================================================================

    const NOW = new Date();
    const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

    // Helper: get or use first stream for Proba
    const probaHkStreamId = streams[0]?.id ?? null;
    const probaCommsStreamId = streams[1]?.id ?? null;
    const nordStreamId = streams[2]?.id ?? null;

    // Svalbard Ground Station asset
    const svalbardAssetId = assetMap.get("Svalbard Ground Station")!;
    const brusselsMCCId = assetMap.get("Brussels Mission Control")!;
    const probaEO3Id = assetMap.get("Proba-EO-3")!;

    interface AlertInsert {
      orgId: string;
      streamId: string | null;
      ruleId: string;
      severity: string;
      title: string;
      description: string;
      status: string;
      spartaTactic: string | null;
      spartaTechnique: string | null;
      affectedAssetId: string | null;
      triggeredAt: Date;
      resolvedAt: Date | null;
      resolvedBy: string | null;
      metadata: Record<string, unknown> | null;
    }

    const alertDefs: AlertInsert[] = [
      // 1. Battery cell failure on Proba-EO-1
      {
        orgId: probaOrgId,
        streamId: probaHkStreamId,
        ruleId: "SG-TM-001",
        severity: "CRITICAL",
        title: "Battery voltage below critical threshold on Proba-EO-1",
        description: "Battery voltage dropped to 24.8V (threshold: 26V). Cell failure signature detected: asymmetric discharge curve. Immediate investigation required.",
        status: "RESOLVED",
        spartaTactic: "Denial",
        spartaTechnique: "Denial of Service",
        affectedAssetId: probaEO1,
        triggeredAt: hoursAgo(36),
        resolvedAt: hoursAgo(30),
        resolvedBy: "operator@proba-space.eu",
        metadata: { parameter: "battery_voltage_v", value: 24.8, threshold: 26.0, trend: "declining", cell_index: 3 },
      },
      // 2. Possible jamming on ground station link
      {
        orgId: probaOrgId,
        streamId: probaCommsStreamId,
        ruleId: "SG-RF-002",
        severity: "HIGH",
        title: "Possible RF interference/jamming on Svalbard uplink",
        description: "Signal-to-noise ratio degraded by 8dB during Svalbard pass. Pattern consistent with deliberate interference. Link margin critically low.",
        status: "INVESTIGATING",
        spartaTactic: "Denial",
        spartaTechnique: "Jamming",
        affectedAssetId: svalbardAssetId,
        triggeredAt: hoursAgo(6),
        resolvedAt: null,
        resolvedBy: null,
        metadata: { parameter: "signal_strength_dbm", baseline: -72, current: -93, degradation_db: 8, pass_number: 14 },
      },
      // 3. Unauthorized login on Brussels MCC
      {
        orgId: probaOrgId,
        streamId: null,
        ruleId: "SG-IA-003",
        severity: "CRITICAL",
        title: "Unauthorized login attempt on Brussels Mission Control",
        description: "3 failed login attempts from unknown IP 185.220.101.42 (Tor exit node) targeting admin account within 2 minutes. Account locked after 3rd attempt. No successful breach.",
        status: "NEW",
        spartaTactic: "Initial Access",
        spartaTechnique: "Exploit Public-Facing Application",
        affectedAssetId: brusselsMCCId,
        triggeredAt: hoursAgo(2),
        resolvedAt: null,
        resolvedBy: null,
        metadata: { source_ip: "185.220.101.42", target_user: "admin@proba-space.eu", attempts: 3, tor_exit: true, geo: "Unknown/Tor" },
      },
      // 4. Telemetry dropout on Proba-EO-3 (MAINTENANCE)
      {
        orgId: probaOrgId,
        streamId: probaHkStreamId,
        ruleId: "SG-TM-004",
        severity: "MEDIUM",
        title: "Telemetry dropout on Proba-EO-3 (already in MAINTENANCE)",
        description: "No housekeeping telemetry received for 3 consecutive passes. Expected given AOCS anomaly and safe-mode entry. Low urgency since asset is in MAINTENANCE status.",
        status: "NEW",
        spartaTactic: "Exfiltration",
        spartaTechnique: "Loss of Telemetry",
        affectedAssetId: probaEO3Id,
        triggeredAt: hoursAgo(4),
        resolvedAt: null,
        resolvedBy: null,
        metadata: { missed_passes: 3, asset_status: "MAINTENANCE", expected: true },
      },
      // 5. Temperature spike on NordSat-Alpha
      {
        orgId: nordOrgId,
        streamId: nordStreamId,
        ruleId: "SG-TM-005",
        severity: "HIGH",
        title: "OBC temperature spike on NordSat-Alpha",
        description: "On-board computer temperature rising abnormally: 38.5C and climbing (nominal max: 35C). Rate of increase suggests thermal runaway or payload malfunction.",
        status: "NEW",
        spartaTactic: "Denial",
        spartaTechnique: "Thermal Manipulation",
        affectedAssetId: nordAlpha,
        triggeredAt: hoursAgo(1),
        resolvedAt: null,
        resolvedBy: null,
        metadata: { parameter: "temperature_obc_c", value: 38.5, threshold: 35, rate_c_per_min: 0.42 },
      },
    ];

    const alertIds: string[] = [];
    for (const a of alertDefs) {
      const [row] = await sql<Array<{ id: string }>>`
        INSERT INTO alerts (organization_id, stream_id, rule_id, severity, title, description, status, sparta_tactic, sparta_technique, affected_asset_id, triggered_at, resolved_at, resolved_by, metadata)
        VALUES (
          ${a.orgId}, ${a.streamId}, ${a.ruleId},
          ${a.severity}::alert_severity, ${a.title}, ${a.description},
          ${a.status}::alert_status, ${a.spartaTactic}, ${a.spartaTechnique},
          ${a.affectedAssetId}, ${a.triggeredAt}, ${a.resolvedAt},
          ${a.resolvedBy}, ${a.metadata ? JSON.stringify(a.metadata) : null}
        )
        RETURNING id
      `;
      alertIds.push(row.id);
      log(`  Alert: ${a.title.substring(0, 60)}... [${a.severity}/${a.status}]`);
    }

    // Also create some additional lower-severity alerts for dashboard richness
    const extraAlerts = [
      { orgId: probaOrgId, ruleId: "SG-TM-010", severity: "LOW", title: "Reaction wheel speed drift on Proba-EO-2", description: "Wheel 3 RPM drifted 200 RPM from setpoint. Within tolerance but trending.", status: "RESOLVED", triggeredAt: hoursAgo(48), resolvedAt: hoursAgo(47), resolvedBy: "operator@proba-space.eu" },
      { orgId: probaOrgId, ruleId: "SG-NW-011", severity: "LOW", title: "Ground network latency spike to Matera", description: "Round-trip latency to Matera ground station exceeded 200ms for 5 minutes.", status: "RESOLVED", triggeredAt: hoursAgo(40), resolvedAt: hoursAgo(39), resolvedBy: "system" },
      { orgId: probaOrgId, ruleId: "SG-TM-012", severity: "MEDIUM", title: "Solar array current lower than predicted", description: "Solar current 12% below orbital prediction model. Possible panel degradation.", status: "FALSE_POSITIVE", triggeredAt: hoursAgo(24), resolvedAt: hoursAgo(23), resolvedBy: "operator@proba-space.eu" },
      { orgId: nordOrgId, ruleId: "SG-TM-013", severity: "LOW", title: "NordSat-Beta missed scheduled contact", description: "One missed scheduled contact window at Kiruna. Recovered on next pass.", status: "RESOLVED", triggeredAt: hoursAgo(20), resolvedAt: hoursAgo(18), resolvedBy: "system" },
      { orgId: nordOrgId, ruleId: "SG-IA-014", severity: "MEDIUM", title: "Unusual API access pattern on Stockholm MCS", description: "50 requests in 10 seconds from internal IP. Likely automated script, not attack.", status: "RESOLVED", triggeredAt: hoursAgo(12), resolvedAt: hoursAgo(11), resolvedBy: "security@nordsat.io" },
    ];

    for (const ea of extraAlerts) {
      await sql`
        INSERT INTO alerts (organization_id, rule_id, severity, title, description, status, triggered_at, resolved_at, resolved_by)
        VALUES (${ea.orgId}, ${ea.ruleId}, ${ea.severity}::alert_severity, ${ea.title}, ${ea.description}, ${ea.status}::alert_status, ${ea.triggeredAt}, ${ea.resolvedAt ?? null}, ${ea.resolvedBy ?? null})
      `;
    }
    log(`  ${extraAlerts.length} additional context alerts created`);

    // ==================================================================
    logSection("Step 8: Create 3 Incidents");
    // ==================================================================

    // Incident 1: CLOSED (battery failure, resolved)
    const batteryIncidentTimeline = [
      { timestamp: hoursAgo(36).toISOString(), event: "Incident detected: battery voltage critical", actor: "system" },
      { timestamp: hoursAgo(35.5).toISOString(), event: "Status changed to TRIAGING", actor: "operator@proba-space.eu" },
      { timestamp: hoursAgo(35).toISOString(), event: "Status changed to INVESTIGATING", actor: "operator@proba-space.eu" },
      { timestamp: hoursAgo(34).toISOString(), event: "Root cause identified: Cell 3 internal short circuit", actor: "operator@proba-space.eu" },
      { timestamp: hoursAgo(33).toISOString(), event: "Status changed to CONTAINING", actor: "operator@proba-space.eu" },
      { timestamp: hoursAgo(32).toISOString(), event: "Battery management system reconfigured to bypass Cell 3", actor: "operator@proba-space.eu" },
      { timestamp: hoursAgo(31).toISOString(), event: "Status changed to RECOVERING", actor: "operator@proba-space.eu" },
      { timestamp: hoursAgo(30).toISOString(), event: "Battery voltage stabilised at 28.9V on remaining cells", actor: "system" },
      { timestamp: hoursAgo(30).toISOString(), event: "Status changed to CLOSED. Resolution: Cell 3 bypassed. Satellite operating nominally on reduced battery capacity. Long-term: schedule replacement in next maintenance window.", actor: "admin@proba-space.eu" },
    ];

    const [batteryIncident] = await sql<Array<{ id: string }>>`
      INSERT INTO incidents (organization_id, title, description, severity, status, nis2_classification, sparta_techniques, affected_asset_ids, timeline, detected_at, resolved_at, time_to_detect_minutes, time_to_respond_minutes)
      VALUES (
        ${probaOrgId},
        'Battery Cell Failure on Proba-EO-1',
        'Critical battery voltage drop detected on Proba-EO-1. Cell 3 internal short circuit confirmed. Battery management system reconfigured to bypass faulty cell. Satellite operating at reduced capacity.',
        'CRITICAL'::incident_severity,
        'CLOSED'::incident_status,
        'SIGNIFICANT'::incident_nis2_classification,
        ${JSON.stringify([{ tactic: "Denial", technique: "Denial of Service" }])}::jsonb,
        ${JSON.stringify([probaEO1])}::jsonb,
        ${JSON.stringify(batteryIncidentTimeline)}::jsonb,
        ${hoursAgo(36)},
        ${hoursAgo(30)},
        5,
        360
      )
      RETURNING id
    `;
    log(`  Incident 1 (CLOSED): Battery Cell Failure [${batteryIncident.id}]`);

    // Link battery alert to incident
    await sql`INSERT INTO incident_alerts (incident_id, alert_id) VALUES (${batteryIncident.id}, ${alertIds[0]})`;

    // Add notes
    await sql`INSERT INTO incident_notes (incident_id, author, content) VALUES (${batteryIncident.id}, 'operator@proba-space.eu', 'Initial analysis: voltage drop correlates with eclipse exit. Cell 3 discharge curve asymmetric.')`;
    await sql`INSERT INTO incident_notes (incident_id, author, content) VALUES (${batteryIncident.id}, 'admin@proba-space.eu', 'OHB SE consulted. Confirmed cell failure mode consistent with manufacturing batch 2024Q1. Firmware patch to bypass cell uploaded via S-band.')`;
    await sql`INSERT INTO incident_notes (incident_id, author, content) VALUES (${batteryIncident.id}, 'auditor@proba-space.eu', 'Audit note: NIS2 Article 23 reporting obligations met. Early warning submitted within 24h. Incident notification submitted within 72h.')`;

    // Incident 2: INVESTIGATING (jamming)
    const jammingTimeline = [
      { timestamp: hoursAgo(6).toISOString(), event: "Incident detected: RF interference on Svalbard link", actor: "system" },
      { timestamp: hoursAgo(5.5).toISOString(), event: "Status changed to TRIAGING", actor: "operator@proba-space.eu" },
      { timestamp: hoursAgo(5).toISOString(), event: "Status changed to INVESTIGATING", actor: "operator@proba-space.eu" },
      { timestamp: hoursAgo(4).toISOString(), event: "KSAT contacted for ground-side verification", actor: "operator@proba-space.eu" },
      { timestamp: hoursAgo(3).toISOString(), event: "KSAT confirms no local interference source. Pattern consistent with deliberate jamming from 30-40km range.", actor: "operator@proba-space.eu" },
    ];

    const [jammingIncident] = await sql<Array<{ id: string }>>`
      INSERT INTO incidents (organization_id, title, description, severity, status, nis2_classification, sparta_techniques, affected_asset_ids, timeline, detected_at)
      VALUES (
        ${probaOrgId},
        'Suspected RF Jamming on Svalbard Ground Station Link',
        'Persistent 8dB signal degradation on Svalbard S-band uplink. Pattern consistent with deliberate RF interference. KSAT has ruled out local sources. Norwegian authorities notified. Link operating on reduced margin.',
        'HIGH'::incident_severity,
        'INVESTIGATING'::incident_status,
        'SIGNIFICANT'::incident_nis2_classification,
        ${JSON.stringify([{ tactic: "Denial", technique: "Jamming" }])}::jsonb,
        ${JSON.stringify([svalbardAssetId, probaEO1])}::jsonb,
        ${JSON.stringify(jammingTimeline)}::jsonb,
        ${hoursAgo(6)}
      )
      RETURNING id
    `;
    log(`  Incident 2 (INVESTIGATING): RF Jamming [${jammingIncident.id}]`);

    await sql`INSERT INTO incident_alerts (incident_id, alert_id) VALUES (${jammingIncident.id}, ${alertIds[1]})`;
    await sql`INSERT INTO incident_notes (incident_id, author, content) VALUES (${jammingIncident.id}, 'operator@proba-space.eu', 'Switched to Matera backup link for critical TC passes. Signal analysis data forwarded to ESA ESOC frequency management.')`;

    // Incident 3: DETECTED (unauthorized access)
    const accessTimeline = [
      { timestamp: hoursAgo(2).toISOString(), event: "Incident detected: unauthorized login attempts on Brussels MCC", actor: "system" },
    ];

    const [accessIncident] = await sql<Array<{ id: string }>>`
      INSERT INTO incidents (organization_id, title, description, severity, status, nis2_classification, sparta_techniques, affected_asset_ids, timeline, detected_at)
      VALUES (
        ${probaOrgId},
        'Unauthorized Access Attempt on Brussels Mission Control',
        '3 failed login attempts from Tor exit node (185.220.101.42) targeting admin account. Account auto-locked. No successful breach confirmed. Requires investigation of attack vector and intent.',
        'CRITICAL'::incident_severity,
        'DETECTED'::incident_status,
        'SIGNIFICANT'::incident_nis2_classification,
        ${JSON.stringify([{ tactic: "Initial Access", technique: "Exploit Public-Facing Application" }])}::jsonb,
        ${JSON.stringify([brusselsMCCId])}::jsonb,
        ${JSON.stringify(accessTimeline)}::jsonb,
        ${hoursAgo(2)}
      )
      RETURNING id
    `;
    log(`  Incident 3 (DETECTED): Unauthorized Access [${accessIncident.id}]`);

    await sql`INSERT INTO incident_alerts (incident_id, alert_id) VALUES (${accessIncident.id}, ${alertIds[2]})`;

    // ==================================================================
    logSection("Step 9: NIS2 Reports for Closed Incident");
    // ==================================================================

    // Early Warning (submitted 2h after detection, deadline 24h)
    const earlyWarningDeadline = new Date(hoursAgo(36).getTime() + 24 * 3600_000);
    await sql`
      INSERT INTO incident_reports (incident_id, report_type, content, submitted_to, submitted_at, deadline)
      VALUES (
        ${batteryIncident.id},
        'EARLY_WARNING'::incident_report_type,
        ${JSON.stringify({
          incidentTitle: "Battery Cell Failure on Proba-EO-1",
          severity: "CRITICAL",
          detectedAt: hoursAgo(36).toISOString(),
          summary: "Critical battery voltage drop detected on LEO satellite Proba-EO-1. Cell 3 exhibiting anomalous discharge curve. Potential impact on spacecraft power budget and mission operations. Investigation initiated.",
          impactAssessment: "Satellite power capacity may be reduced. No immediate risk to other operators or services. Earth observation data delivery may be delayed.",
          crossBorderImpact: false,
          initialMeasures: "Satellite placed in safe mode. Ground team mobilised. OHB SE (manufacturer) notified.",
        })}::jsonb,
        'CCB (Centre for Cybersecurity Belgium)',
        ${new Date(hoursAgo(36).getTime() + 2 * 3600_000)},
        ${earlyWarningDeadline}
      )
    `;
    log("  Early Warning report: SUBMITTED");

    // Incident Notification (submitted 24h after detection, deadline 72h)
    const notificationDeadline = new Date(hoursAgo(36).getTime() + 72 * 3600_000);
    await sql`
      INSERT INTO incident_reports (incident_id, report_type, content, submitted_to, submitted_at, deadline)
      VALUES (
        ${batteryIncident.id},
        'INCIDENT_NOTIFICATION'::incident_report_type,
        ${JSON.stringify({
          incidentTitle: "Battery Cell Failure on Proba-EO-1",
          severity: "CRITICAL",
          detectedAt: hoursAgo(36).toISOString(),
          summary: "Root cause confirmed: Cell 3 internal short circuit, consistent with manufacturing batch defect (2024Q1). Battery management firmware updated to bypass faulty cell. Satellite operating nominally at 87% power capacity.",
          impactAssessment: "Mission capability reduced to 87% power budget. No data loss. EO imaging schedule adjusted. No impact on other operators.",
          rootCauseAnalysis: "Manufacturing defect in lithium-ion cell batch 2024Q1 from OHB SE supply chain. Affects Cell 3 of the 8-cell string. Same batch used in Proba-EO-2; monitoring initiated.",
          crossBorderImpact: false,
          mitigationMeasures: "Cell bypassed via firmware. OHB SE notified for batch investigation. Proba-EO-2 battery monitoring thresholds tightened.",
          affectedServices: "Earth observation data delivery (reduced imaging windows)",
          affectedAssets: ["Proba-EO-1"],
        })}::jsonb,
        'CCB (Centre for Cybersecurity Belgium)',
        ${new Date(hoursAgo(36).getTime() + 24 * 3600_000)},
        ${notificationDeadline}
      )
    `;
    log("  Incident Notification report: SUBMITTED");

    // Final Report (submitted 5 days after, deadline 30 days)
    const finalDeadline = new Date(hoursAgo(36).getTime() + 30 * 24 * 3600_000);
    await sql`
      INSERT INTO incident_reports (incident_id, report_type, content, submitted_to, submitted_at, deadline)
      VALUES (
        ${batteryIncident.id},
        'FINAL_REPORT'::incident_report_type,
        ${JSON.stringify({
          incidentTitle: "Battery Cell Failure on Proba-EO-1",
          severity: "CRITICAL",
          detectedAt: hoursAgo(36).toISOString(),
          resolvedAt: hoursAgo(30).toISOString(),
          summary: "Final report on Proba-EO-1 battery cell failure. Incident fully resolved. Root cause: manufacturing defect in Cell 3. Mitigation: firmware bypass applied successfully. No recurrence expected on this satellite. Preventive actions for Proba-EO-2 implemented.",
          rootCauseAnalysis: "Internal short circuit in Cell 3 (LG Chem NMC622, batch 2024Q1). Caused by microscopic dendrite growth at anode/separator interface. OHB SE confirmed 2 other cells from same batch failed in ground testing.",
          impactAssessment: "Mission capability at 87% nominal. Imaging schedule adjusted. Total downtime: 6 hours during safe mode. No data permanently lost. 14 imaging tasks rescheduled.",
          crossBorderImpact: false,
          mitigationMeasures: "1) Cell 3 permanently bypassed. 2) Battery charge profile optimised for 7-cell operation. 3) Proba-EO-2 monitoring thresholds reduced by 10%. 4) OHB SE supply chain audit initiated for NMC622 batch.",
          lessonsLearned: "1) Battery cell monitoring thresholds were adequate for detection but could be improved with rate-of-change analysis. 2) Manufacturer notification channel was informal; formalised in updated IR playbook. 3) Safe mode entry was manual; recommending automated trigger for future missions.",
          preventiveActions: "1) Updated detection rules for battery anomalies. 2) OHB SE supply chain audit. 3) Automated safe mode trigger for battery voltage < 25V. 4) IR playbook updated with manufacturer escalation procedures.",
        })}::jsonb,
        'CCB (Centre for Cybersecurity Belgium)',
        ${new Date(hoursAgo(36).getTime() + 5 * 24 * 3600_000)},
        ${finalDeadline}
      )
    `;
    log("  Final Report: SUBMITTED");

    // ==================================================================
    logSection("Step 10: Audit Trail Entries");
    // ==================================================================

    // Generate 48 hours of realistic audit entries
    const auditEntries: Array<{
      orgId: string;
      actor: string;
      action: string;
      resourceType: string;
      resourceId: string | null;
      details: Record<string, unknown>;
      ts: Date;
    }> = [];

    const actors = [
      "admin@proba-space.eu",
      "operator@proba-space.eu",
      "auditor@proba-space.eu",
      "system",
    ];

    // Login/Logout events
    for (let h = 48; h >= 0; h -= 8) {
      const actor = actors[h % actors.length];
      auditEntries.push({ orgId: probaOrgId, actor, action: "LOGIN", resourceType: "session", resourceId: null, details: { method: "password", ip: "10.0.1." + (100 + (h % 50)) }, ts: hoursAgo(h) });
      if (h > 0) auditEntries.push({ orgId: probaOrgId, actor, action: "LOGOUT", resourceType: "session", resourceId: null, details: {}, ts: hoursAgo(h - 7.5) });
    }

    // Asset views
    for (let h = 44; h >= 0; h -= 6) {
      auditEntries.push({ orgId: probaOrgId, actor: actors[1], action: "VIEW", resourceType: "space_asset", resourceId: probaEO1, details: { page: "asset_detail" }, ts: hoursAgo(h) });
    }

    // Compliance mapping changes
    auditEntries.push({ orgId: probaOrgId, actor: actors[0], action: "MAPPING_CHANGED", resourceType: "compliance_mapping", resourceId: null, details: { requirementTitle: "Risk Management Policy", oldStatus: "NOT_ASSESSED", newStatus: "PARTIALLY_COMPLIANT" }, ts: hoursAgo(42) });
    auditEntries.push({ orgId: probaOrgId, actor: actors[0], action: "MAPPING_CHANGED", resourceType: "compliance_mapping", resourceId: null, details: { requirementTitle: "Cybersecurity Training", oldStatus: "PARTIALLY_COMPLIANT", newStatus: "COMPLIANT" }, ts: hoursAgo(38) });

    // Alert acknowledgements
    auditEntries.push({ orgId: probaOrgId, actor: actors[1], action: "ALERT_ACKNOWLEDGED", resourceType: "alert", resourceId: alertIds[0], details: { alertTitle: "Battery voltage below critical threshold" }, ts: hoursAgo(35.5) });

    // Incident lifecycle
    auditEntries.push({ orgId: probaOrgId, actor: "system", action: "INCIDENT_CREATED", resourceType: "incident", resourceId: batteryIncident.id, details: { title: "Battery Cell Failure on Proba-EO-1", severity: "CRITICAL" }, ts: hoursAgo(36) });
    auditEntries.push({ orgId: probaOrgId, actor: actors[1], action: "STATUS_CHANGE", resourceType: "incident", resourceId: batteryIncident.id, details: { from: "DETECTED", to: "TRIAGING" }, ts: hoursAgo(35.5) });
    auditEntries.push({ orgId: probaOrgId, actor: actors[1], action: "STATUS_CHANGE", resourceType: "incident", resourceId: batteryIncident.id, details: { from: "TRIAGING", to: "INVESTIGATING" }, ts: hoursAgo(35) });
    auditEntries.push({ orgId: probaOrgId, actor: actors[1], action: "STATUS_CHANGE", resourceType: "incident", resourceId: batteryIncident.id, details: { from: "INVESTIGATING", to: "CONTAINING" }, ts: hoursAgo(33) });
    auditEntries.push({ orgId: probaOrgId, actor: actors[1], action: "STATUS_CHANGE", resourceType: "incident", resourceId: batteryIncident.id, details: { from: "CONTAINING", to: "RECOVERING" }, ts: hoursAgo(31) });
    auditEntries.push({ orgId: probaOrgId, actor: actors[0], action: "STATUS_CHANGE", resourceType: "incident", resourceId: batteryIncident.id, details: { from: "RECOVERING", to: "CLOSED" }, ts: hoursAgo(30) });

    // Report generation
    auditEntries.push({ orgId: probaOrgId, actor: actors[0], action: "REPORT_GENERATED", resourceType: "incident_report", resourceId: batteryIncident.id, details: { reportType: "EARLY_WARNING" }, ts: hoursAgo(34) });
    auditEntries.push({ orgId: probaOrgId, actor: actors[0], action: "REPORT_GENERATED", resourceType: "incident_report", resourceId: batteryIncident.id, details: { reportType: "INCIDENT_NOTIFICATION" }, ts: hoursAgo(12) });
    auditEntries.push({ orgId: probaOrgId, actor: actors[0], action: "REPORT_GENERATED", resourceType: "incident_report", resourceId: batteryIncident.id, details: { reportType: "FINAL_REPORT" }, ts: hoursAgo(6) });

    // Export events
    auditEntries.push({ orgId: probaOrgId, actor: actors[2], action: "EXPORT", resourceType: "compliance_report", resourceId: null, details: { format: "PDF", scope: "full_compliance" }, ts: hoursAgo(28) });
    auditEntries.push({ orgId: probaOrgId, actor: actors[2], action: "EXPORT", resourceType: "audit_trail", resourceId: null, details: { format: "PDF", dateRange: "7d" }, ts: hoursAgo(20) });

    // Jamming incident audit
    auditEntries.push({ orgId: probaOrgId, actor: "system", action: "INCIDENT_CREATED", resourceType: "incident", resourceId: jammingIncident.id, details: { title: "Suspected RF Jamming", severity: "HIGH" }, ts: hoursAgo(6) });
    auditEntries.push({ orgId: probaOrgId, actor: actors[1], action: "STATUS_CHANGE", resourceType: "incident", resourceId: jammingIncident.id, details: { from: "DETECTED", to: "INVESTIGATING" }, ts: hoursAgo(5) });

    // Unauthorized access audit
    auditEntries.push({ orgId: probaOrgId, actor: "system", action: "INCIDENT_CREATED", resourceType: "incident", resourceId: accessIncident.id, details: { title: "Unauthorized Access Attempt", severity: "CRITICAL" }, ts: hoursAgo(2) });

    // Sort by timestamp
    auditEntries.sort((a, b) => a.ts.getTime() - b.ts.getTime());

    for (const entry of auditEntries) {
      await sql`
        INSERT INTO audit_log (organization_id, actor, action, resource_type, resource_id, details, timestamp)
        VALUES (${entry.orgId}, ${entry.actor}, ${entry.action}::audit_action, ${entry.resourceType}, ${entry.resourceId}, ${JSON.stringify(entry.details)}::jsonb, ${entry.ts})
      `;
    }
    log(`  ${auditEntries.length} audit trail entries created`);

    // ==================================================================
    logSection("Step 11: NIS2 Deadlines for Active Incidents");
    // ==================================================================

    // Jamming incident: notification due in 18 hours
    const jammingNotifDeadline = new Date(NOW.getTime() + 18 * 3600_000);
    await sql`
      INSERT INTO incident_reports (incident_id, report_type, content, deadline)
      VALUES (
        ${jammingIncident.id},
        'INCIDENT_NOTIFICATION'::incident_report_type,
        ${JSON.stringify({
          incidentTitle: "Suspected RF Jamming on Svalbard Ground Station Link",
          severity: "HIGH",
          summary: "DRAFT - Investigation ongoing. KSAT ground verification complete. Pattern analysis in progress.",
          status: "DRAFT - NOT YET SUBMITTED"
        })}::jsonb,
        ${jammingNotifDeadline}
      )
    `;
    log(`  Jamming incident: notification deadline ${jammingNotifDeadline.toISOString()} (18h)`);

    // Access incident: early warning due in 22 hours
    const accessEarlyDeadline = new Date(NOW.getTime() + 22 * 3600_000);
    await sql`
      INSERT INTO incident_reports (incident_id, report_type, content, deadline)
      VALUES (
        ${accessIncident.id},
        'EARLY_WARNING'::incident_report_type,
        ${JSON.stringify({
          incidentTitle: "Unauthorized Access Attempt on Brussels Mission Control",
          severity: "CRITICAL",
          summary: "DRAFT - Login attempts from Tor exit node. Account locked. No breach confirmed.",
          status: "DRAFT - NOT YET SUBMITTED"
        })}::jsonb,
        ${accessEarlyDeadline}
      )
    `;
    log(`  Access incident: early warning deadline ${accessEarlyDeadline.toISOString()} (22h)`);

    // ==================================================================
    logSection("Summary");
    // ==================================================================

    const counts = await sql<Array<{ table_name: string; count: string }>>`
      SELECT 'organizations' as table_name, count(*)::text FROM organizations
      UNION ALL SELECT 'space_assets', count(*)::text FROM space_assets
      UNION ALL SELECT 'compliance_mappings', count(*)::text FROM compliance_mappings
      UNION ALL SELECT 'suppliers', count(*)::text FROM suppliers
      UNION ALL SELECT 'users', count(*)::text FROM users
      UNION ALL SELECT 'telemetry_streams', count(*)::text FROM telemetry_streams
      UNION ALL SELECT 'alerts', count(*)::text FROM alerts
      UNION ALL SELECT 'incidents', count(*)::text FROM incidents
      UNION ALL SELECT 'incident_reports', count(*)::text FROM incident_reports
      UNION ALL SELECT 'incident_notes', count(*)::text FROM incident_notes
      UNION ALL SELECT 'audit_log', count(*)::text FROM audit_log
      ORDER BY table_name
    `;

    for (const c of counts) {
      log(`  ${c.table_name.padEnd(25)} ${c.count.padStart(6)}`);
    }

    console.log(`
${"=".repeat(60)}
  Demo environment ready!
${"=".repeat(60)}

  Login credentials (Proba Space Systems):
    Admin:    admin@proba-space.eu    / SpaceGuard2026!
    Operator: operator@proba-space.eu / SpaceGuard2026!
    Auditor:  auditor@proba-space.eu  / SpaceGuard2026!

  Key demo scenarios:
    - Dashboard: Shows compliance scores, active alerts, incident deadlines
    - Alerts: 5 anomaly scenarios + 5 context alerts (mix of severities)
    - Incidents: 1 CLOSED (full lifecycle), 1 INVESTIGATING, 1 DETECTED
    - Compliance: Mixed posture across 4 orgs and 2 regulations
    - Supply Chain: 5 assessed vendors for Proba
    - NIS2 Reports: Full Article 23 lifecycle for battery incident
    - Deadlines: Notification due 18h, Early warning due 22h
    - Audit Trail: 48h of realistic activity
`);

  } finally {
    await sql.end();
  }
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
