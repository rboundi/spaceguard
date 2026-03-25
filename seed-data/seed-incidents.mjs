/**
 * seed-incidents.mjs
 *
 * Inserts realistic test incidents into SpaceGuard via the REST API.
 * Run from the repo root:
 *
 *   node seed-data/seed-incidents.mjs
 *
 * Requires the API to be running on http://localhost:3001.
 * Uses only built-in Node fetch (Node 18+) - no extra dependencies.
 */

const API = process.env.API_URL ?? "http://localhost:3001";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function req(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function minutesAfter(isoStr, minutes) {
  return new Date(new Date(isoStr).getTime() + minutes * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// 1. Resolve org + assets
// ---------------------------------------------------------------------------

console.log("Fetching organizations...");
const { data: orgs } = await req("GET", "/api/v1/organizations");
if (!orgs || orgs.length === 0) {
  console.error("No organizations found. Run the main seed first.");
  process.exit(1);
}
const org = orgs[0];
console.log(`  Using org: ${org.name} (${org.id})`);

console.log("Fetching assets...");
const { data: assets } = await req("GET", `/api/v1/assets?organizationId=${org.id}&perPage=20`);
const assetIds = (assets ?? []).map((a) => a.id);
console.log(`  Found ${assetIds.length} assets`);

// Helper: pick n random asset IDs
function pickAssets(n) {
  const shuffled = [...assetIds].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

// ---------------------------------------------------------------------------
// 2. Incident definitions
// ---------------------------------------------------------------------------

const NOW = new Date();

const INCIDENTS = [
  // --- CRITICAL / CLOSED (90 days ago) ---
  {
    organizationId: org.id,
    title: "Command injection via unprotected uplink session",
    description:
      "Anomalous telecommand sequence detected on primary uplink during routine maintenance window. Investigation confirmed an adversary had injected forged TC frames using a compromised ground-station operator credential. The satellite acknowledged several unauthorized mode-change commands before the session was terminated. CCSDS authentication was not enforced on legacy uplink path.",
    severity: "CRITICAL",
    status: "CLOSED",
    nis2Classification: "SIGNIFICANT",
    spartaTechniques: [
      { tactic: "Initial Access", technique: "Exploitation of Public-Facing Application" },
      { tactic: "Execution",      technique: "Command and Scripting Interpreter" },
    ],
    affectedAssetIds: pickAssets(2),
    detectedAt: daysAgo(90),
    resolvedAt: minutesAfter(daysAgo(90), 340),
    timeToDetectMinutes: 42,
    timeToRespondMinutes: 340,
  },

  // --- HIGH / CLOSED (75 days ago) ---
  {
    organizationId: org.id,
    title: "Ransomware infection on mission control workstation",
    description:
      "Lateral movement detected from a phishing-compromised endpoint in the mission control network. Ransomware payload encrypted three engineering workstations before endpoint controls isolated the segment. No on-orbit systems were affected. Backups were intact; full recovery completed within 18 hours.",
    severity: "HIGH",
    status: "CLOSED",
    nis2Classification: "SIGNIFICANT",
    spartaTechniques: [
      { tactic: "Initial Access", technique: "Phishing" },
      { tactic: "Impact",         technique: "Data Encrypted for Impact" },
    ],
    affectedAssetIds: pickAssets(1),
    detectedAt: daysAgo(75),
    resolvedAt: minutesAfter(daysAgo(75), 1080),
    timeToDetectMinutes: 95,
    timeToRespondMinutes: 1080,
  },

  // --- HIGH / CLOSED (62 days ago) ---
  {
    organizationId: org.id,
    title: "Anomalous beacon replay on inter-satellite link",
    description:
      "Detection rule fired on repeated identical beacon frames arriving on the ISL receiver with identical sequence counters - a clear indicator of a replay attack. The link was put into safe-mode pending investigation. Origin traced to a rogue transmitter in adjacent orbital slot. Link authentication keys were rotated and a frequency exclusion zone filed.",
    severity: "HIGH",
    status: "CLOSED",
    nis2Classification: "SIGNIFICANT",
    spartaTechniques: [
      { tactic: "Reconnaissance",  technique: "Active Scanning" },
      { tactic: "Initial Access",  technique: "Supply Chain Compromise" },
    ],
    affectedAssetIds: pickAssets(2),
    detectedAt: daysAgo(62),
    resolvedAt: minutesAfter(daysAgo(62), 480),
    timeToDetectMinutes: 18,
    timeToRespondMinutes: 480,
  },

  // --- MEDIUM / CLOSED (50 days ago) ---
  {
    organizationId: org.id,
    title: "Credential stuffing against ground-segment web portal",
    description:
      "Brute-force attempts against the ground-segment operator portal detected by the rate-limiting WAF rule. 3,400 requests in 12 minutes from rotating IP ranges. No successful logins confirmed. Accounts with weak passwords were force-reset; MFA enforcement tightened for all operator accounts.",
    severity: "MEDIUM",
    status: "CLOSED",
    nis2Classification: "NON_SIGNIFICANT",
    spartaTechniques: [
      { tactic: "Reconnaissance", technique: "Gather Victim Identity Information" },
      { tactic: "Initial Access",  technique: "Valid Accounts" },
    ],
    affectedAssetIds: pickAssets(1),
    detectedAt: daysAgo(50),
    resolvedAt: minutesAfter(daysAgo(50), 240),
    timeToDetectMinutes: 8,
    timeToRespondMinutes: 240,
  },

  // --- CRITICAL / INVESTIGATING (38 days ago) ---
  {
    organizationId: org.id,
    title: "Persistent backdoor discovered in OBC firmware update package",
    description:
      "Supply chain audit flagged a binary difference in the on-board computer firmware package received from a third-party vendor. Reverse engineering confirmed a persistent backdoor providing covert telemetry exfiltration capability. The firmware was not deployed. Scope of supply chain compromise is under active investigation with the vendor.",
    severity: "CRITICAL",
    status: "INVESTIGATING",
    nis2Classification: "SIGNIFICANT",
    spartaTechniques: [
      { tactic: "Persistence",    technique: "Implant Internal Image" },
      { tactic: "Exfiltration",   technique: "Exfiltration Over C2 Channel" },
    ],
    affectedAssetIds: pickAssets(3),
    detectedAt: daysAgo(38),
    resolvedAt: null,
    timeToDetectMinutes: 2880, // 2 days - found in audit
    timeToRespondMinutes: null,
  },

  // --- HIGH / CONTAINING (22 days ago) ---
  {
    organizationId: org.id,
    title: "Denial-of-service on telemetry downlink receiver",
    description:
      "High-power interference source identified jamming the primary telemetry downlink receiver at the main ground station. Satellite telemetry blackout lasted 4 hours. Backup cross-link to secondary ground station activated. RF survey underway to characterise the interference pattern and determine if intentional jamming or adjacent-band leakage.",
    severity: "HIGH",
    status: "CONTAINING",
    nis2Classification: "SIGNIFICANT",
    spartaTechniques: [
      { tactic: "Impact", technique: "Denial of Service" },
    ],
    affectedAssetIds: pickAssets(2),
    detectedAt: daysAgo(22),
    resolvedAt: null,
    timeToDetectMinutes: 12,
    timeToRespondMinutes: null,
  },

  // --- HIGH / CLOSED (14 days ago) ---
  {
    organizationId: org.id,
    title: "Exfiltration of mission planning data via compromised VPN node",
    description:
      "Unusual outbound data transfer detected from a mission planning server. Investigation identified a compromised VPN concentrator used as a pivot point. Approximately 4 GB of mission schedule data and spacecraft configuration files were transferred to an external IP. The VPN device was running end-of-life firmware. Incident is closed after network redesign and device replacement.",
    severity: "HIGH",
    status: "CLOSED",
    nis2Classification: "SIGNIFICANT",
    spartaTechniques: [
      { tactic: "Lateral Movement", technique: "Remote Services" },
      { tactic: "Exfiltration",      technique: "Exfiltration Over Alternative Protocol" },
    ],
    affectedAssetIds: pickAssets(2),
    detectedAt: daysAgo(14),
    resolvedAt: minutesAfter(daysAgo(14), 720),
    timeToDetectMinutes: 210,
    timeToRespondMinutes: 720,
  },

  // --- MEDIUM / TRIAGING (7 days ago) ---
  {
    organizationId: org.id,
    title: "Suspicious API calls from decommissioned service account",
    description:
      "SIEM alert fired on REST API calls authenticated with a service account that was decommissioned six months ago. The account had not been disabled in the identity provider. Total of 47 API calls made over 90 minutes, mostly read-only asset queries. Access has been revoked. Investigation into how the credential was obtained is ongoing.",
    severity: "MEDIUM",
    status: "TRIAGING",
    nis2Classification: "NON_SIGNIFICANT",
    spartaTechniques: [
      { tactic: "Initial Access",  technique: "Valid Accounts" },
      { tactic: "Reconnaissance",  technique: "Active Scanning" },
    ],
    affectedAssetIds: pickAssets(1),
    detectedAt: daysAgo(7),
    resolvedAt: null,
    timeToDetectMinutes: 35,
    timeToRespondMinutes: null,
  },

  // --- LOW / CLOSED (4 days ago) ---
  {
    organizationId: org.id,
    title: "Misconfigured S3 bucket exposed non-sensitive telemetry logs",
    description:
      "Routine cloud security scan identified a publicly accessible S3 bucket containing 90-day-old housekeeping telemetry logs. No credentials, PII, or mission-critical data were present. Bucket ACLs were corrected immediately. Added to cloud configuration drift monitoring policy.",
    severity: "LOW",
    status: "CLOSED",
    nis2Classification: "NON_SIGNIFICANT",
    spartaTechniques: [],
    affectedAssetIds: pickAssets(1),
    detectedAt: daysAgo(4),
    resolvedAt: minutesAfter(daysAgo(4), 90),
    timeToDetectMinutes: 5,
    timeToRespondMinutes: 90,
  },

  // --- MEDIUM / DETECTED (yesterday) ---
  {
    organizationId: org.id,
    title: "GPS spoofing signal detected near primary ground station",
    description:
      "Ground station GPS receiver reported sudden position jump of 14 km inconsistent with physical location. Simultaneous alert from adjacent receiver confirms external signal. Analysis of signal characteristics suggests a portable spoofer operating in the vicinity. Satellite operations unaffected. Physical security and law enforcement notified.",
    severity: "MEDIUM",
    status: "DETECTED",
    nis2Classification: "NON_SIGNIFICANT",
    spartaTechniques: [
      { tactic: "Impact", technique: "Denial of Service" },
    ],
    affectedAssetIds: pickAssets(1),
    detectedAt: daysAgo(1),
    resolvedAt: null,
    timeToDetectMinutes: 3,
    timeToRespondMinutes: null,
  },
];

// ---------------------------------------------------------------------------
// 3. Insert incidents
// ---------------------------------------------------------------------------

console.log(`\nInserting ${INCIDENTS.length} incidents...`);
let created = 0;
for (const inc of INCIDENTS) {
  try {
    const result = await req("POST", "/api/v1/incidents", inc);
    console.log(`  ✓ [${inc.severity.padEnd(8)}] ${inc.title.slice(0, 65)}`);
    created++;

    // Update status + resolved timestamps if needed
    if (inc.status !== "DETECTED") {
      await req("PUT", `/api/v1/incidents/${result.id}`, {
        status: inc.status,
        ...(inc.resolvedAt   ? { resolvedAt: inc.resolvedAt }   : {}),
        ...(inc.timeToDetectMinutes !== null ? { timeToDetectMinutes: inc.timeToDetectMinutes } : {}),
        ...(inc.timeToRespondMinutes !== null ? { timeToRespondMinutes: inc.timeToRespondMinutes } : {}),
      });
    }
  } catch (err) {
    console.error(`  ✗ ${inc.title.slice(0, 60)}: ${err.message}`);
  }
}

console.log(`\nDone. Created ${created}/${INCIDENTS.length} incidents for "${org.name}".`);
console.log("Refresh the Reports page and try downloading the Incident Summary PDF.");
