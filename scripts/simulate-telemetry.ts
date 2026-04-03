/**
 * SpaceGuard Multi-Satellite Telemetry Simulator
 *
 * Generates realistic satellite telemetry for all 4 demo companies
 * and feeds it into the telemetry ingestion API.
 *
 * Usage:
 *   npx tsx scripts/simulate-telemetry.ts                        # all companies, 1 hour, nominal
 *   npx tsx scripts/simulate-telemetry.ts --company proba        # only Proba satellites
 *   npx tsx scripts/simulate-telemetry.ts --company nordsat      # only NordSat CubeSats
 *   npx tsx scripts/simulate-telemetry.ts --company medsat       # only MedSat-1 (GEO)
 *   npx tsx scripts/simulate-telemetry.ts --hours 6 --anomaly    # all companies, 6 hours, anomalies
 *   npx tsx scripts/simulate-telemetry.ts --scenario rf-jamming  # RF jamming attack scenario
 *   npx tsx scripts/simulate-telemetry.ts --scenario supply-chain-compromise
 *   npx tsx scripts/simulate-telemetry.ts --scenario insider-threat
 *   npx tsx scripts/simulate-telemetry.ts --scenario all         # all scenarios staggered
 *
 * Satellite profiles:
 *   Proba Space Systems:  3 LEO (EO constellation), SSO 615 km
 *   NordSat IoT:          4 CubeSats, LEO 520 km, 52 deg inclination
 *   MediterraneanSat:     1 GEO at 39.0E, continuous solar/contact
 *   Orbital Watch Europe: ground-only (skipped for satellite telemetry)
 */

const API = "http://localhost:3001/api/v1";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const hoursFlag = args.find((a) => a === "--hours");
const HOURS = hoursFlag
  ? Math.min(24, Math.max(0.1, parseFloat(args[args.indexOf("--hours") + 1] ?? "1")))
  : 1;
const companyFlag = args.find((a) => a === "--company");
const COMPANY_FILTER = companyFlag
  ? (args[args.indexOf("--company") + 1] ?? "").toLowerCase()
  : null;
const scenarioFlag = args.find((a) => a === "--scenario");
const SCENARIO_NAME = scenarioFlag
  ? (args[args.indexOf("--scenario") + 1] ?? "").toLowerCase()
  : args.includes("--anomaly") ? "spacecraft-failure" : null;
const INJECT_ANOMALY = SCENARIO_NAME === "spacecraft-failure" || args.includes("--anomaly");

// ---------------------------------------------------------------------------
// Satellite profile interface
// ---------------------------------------------------------------------------

interface SatelliteProfile {
  name: string;
  assetNamePattern: string;     // substring match in DB asset name
  orbitPeriodS: number;
  eclipseFraction: number;
  batteryNominalV: number;
  batteryRange: [number, number];
  solarMaxA: number;
  thermalRange: [number, number];
  hasAocsStream: boolean;
  aocsRateHz: number;
  hasCommsStream: boolean;
  commsRateHz: number;
  geoStationary: boolean;
  degradedAocs: boolean;
  // GEO-specific
  hasTransponderStream: boolean;
}

interface CompanyConfig {
  name: string;
  cliKey: string;
  orgNamePattern: string;
  assetType: string;
  satellites: SatelliteProfile[];
}

// ---------------------------------------------------------------------------
// Company/satellite configurations
// ---------------------------------------------------------------------------

const PROBA_PROFILE: Omit<SatelliteProfile, "name" | "assetNamePattern" | "degradedAocs"> = {
  orbitPeriodS: 97 * 60,      // 97 min SSO
  eclipseFraction: 0.35,
  batteryNominalV: 30.2,
  batteryRange: [22.0, 33.0],
  solarMaxA: 4.2,
  thermalRange: [-15, 55],
  hasAocsStream: true,
  aocsRateHz: 10,
  hasCommsStream: true,
  commsRateHz: 0.1,
  geoStationary: false,
  hasTransponderStream: false,
};

const NORDSAT_PROFILE: Omit<SatelliteProfile, "name" | "assetNamePattern" | "degradedAocs"> = {
  orbitPeriodS: 95 * 60,      // 95 min at 520 km
  eclipseFraction: 0.33,
  batteryNominalV: 7.4,       // 2S LiPo CubeSat
  batteryRange: [6.0, 8.4],
  solarMaxA: 1.2,
  thermalRange: [-20, 50],
  hasAocsStream: false,        // CubeSat: no high-rate AOCS
  aocsRateHz: 0,
  hasCommsStream: true,
  commsRateHz: 0.1,
  geoStationary: false,
  hasTransponderStream: false,
};

const MEDSAT_PROFILE: Omit<SatelliteProfile, "name" | "assetNamePattern" | "degradedAocs"> = {
  orbitPeriodS: 86400,         // GEO: 24h period
  eclipseFraction: 0.0,       // no eclipse (except equinox, simplified)
  batteryNominalV: 50.0,      // 50V bus
  batteryRange: [42.0, 54.0],
  solarMaxA: 8.0,
  thermalRange: [0, 40],
  hasAocsStream: true,
  aocsRateHz: 1,              // lower rate for GEO
  hasCommsStream: true,
  commsRateHz: 0.1,
  geoStationary: true,
  hasTransponderStream: true,
};

const COMPANIES: CompanyConfig[] = [
  {
    name: "Proba Space Systems",
    cliKey: "proba",
    orgNamePattern: "Proba",
    assetType: "LEO_SATELLITE",
    satellites: [
      { ...PROBA_PROFILE, name: "Proba-EO-1", assetNamePattern: "Proba-EO-1", degradedAocs: false },
      { ...PROBA_PROFILE, name: "Proba-EO-2", assetNamePattern: "Proba-EO-2", degradedAocs: false },
      { ...PROBA_PROFILE, name: "Proba-EO-3", assetNamePattern: "Proba-EO-3", degradedAocs: true },
    ],
  },
  {
    name: "NordSat IoT",
    cliKey: "nordsat",
    orgNamePattern: "NordSat",
    assetType: "LEO_SATELLITE",
    satellites: [
      { ...NORDSAT_PROFILE, name: "NordSat-Alpha", assetNamePattern: "NordSat-Alpha", degradedAocs: false },
      { ...NORDSAT_PROFILE, name: "NordSat-Beta",  assetNamePattern: "NordSat-Beta",  degradedAocs: false },
      { ...NORDSAT_PROFILE, name: "NordSat-Gamma", assetNamePattern: "NordSat-Gamma", degradedAocs: false },
      { ...NORDSAT_PROFILE, name: "NordSat-Delta", assetNamePattern: "NordSat-Delta", degradedAocs: false },
    ],
  },
  {
    name: "MediterraneanSat Communications",
    cliKey: "medsat",
    orgNamePattern: "MediterraneanSat",
    assetType: "GEO_SATELLITE",
    satellites: [
      { ...MEDSAT_PROFILE, name: "MedSat-1", assetNamePattern: "MedSat-1", degradedAocs: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// PRNG helpers
// ---------------------------------------------------------------------------

const TWO_PI = 2 * Math.PI;

function noise(amplitude: number): number {
  return (Math.random() - 0.5) * 2 * amplitude;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// Waveform generators (profile-driven)
// ---------------------------------------------------------------------------

function inSunlight(t: number, p: SatelliteProfile): boolean {
  if (p.geoStationary) return true; // GEO: always in sunlight (simplified)
  const phase = (t % p.orbitPeriodS) / p.orbitPeriodS;
  return phase < (1 - p.eclipseFraction);
}

function batteryVoltage(t: number, p: SatelliteProfile, anomaly: boolean, anomalyStart: number): number {
  const phase = (t % p.orbitPeriodS) / p.orbitPeriodS;
  const amplitude = (p.batteryRange[1] - p.batteryRange[0]) * 0.35;
  let v = p.batteryNominalV + amplitude * Math.sin(TWO_PI * phase + Math.PI / 4);
  v += noise(amplitude * 0.03);
  if (anomaly && t >= anomalyStart) {
    const dt = Math.min(t - anomalyStart, 900);
    v -= (p.batteryRange[1] - p.batteryRange[0]) * 0.3 * (dt / 900);
  }
  return +clamp(v, p.batteryRange[0], p.batteryRange[1]).toFixed(3);
}

function solarCurrent(t: number, p: SatelliteProfile): number {
  if (!inSunlight(t, p)) return +Math.abs(noise(0.02)).toFixed(3);
  if (p.geoStationary) {
    return +(p.solarMaxA * 0.92 + noise(p.solarMaxA * 0.02)).toFixed(3);
  }
  const phase = (t % p.orbitPeriodS) / p.orbitPeriodS;
  const elevation = Math.sin(TWO_PI * phase / (1 - p.eclipseFraction));
  const i = p.solarMaxA * Math.max(0, elevation);
  return +clamp(i + noise(0.05), 0, p.solarMaxA * 1.02).toFixed(3);
}

function temperatureObc(t: number, p: SatelliteProfile, anomaly: boolean, anomalyStart: number): number {
  const phase = (t % p.orbitPeriodS) / p.orbitPeriodS;
  const mid = (p.thermalRange[0] + p.thermalRange[1]) / 2;
  const amp = (p.thermalRange[1] - p.thermalRange[0]) * 0.4;
  let temp = mid + amp * Math.sin(TWO_PI * phase + 1.0) + noise(0.3);
  if (anomaly && t >= anomalyStart) {
    const dt = Math.min(t - anomalyStart, 600);
    temp += 25 * (dt / 600);
  }
  return +clamp(temp, p.thermalRange[0] - 5, p.thermalRange[1] + 20).toFixed(2);
}

function temperatureBattery(t: number, p: SatelliteProfile): number {
  const phase = (t % p.orbitPeriodS) / p.orbitPeriodS;
  const mid = (p.thermalRange[0] + p.thermalRange[1]) / 2 - 5;
  const amp = (p.thermalRange[1] - p.thermalRange[0]) * 0.2;
  const temp = mid + amp * Math.sin(TWO_PI * phase + 0.8) + noise(0.2);
  return +clamp(temp, p.thermalRange[0], p.thermalRange[1] - 10).toFixed(2);
}

function reactionWheelRpm(t: number, wheelIdx: number, p: SatelliteProfile, anomaly: boolean, anomalyStart: number): number {
  const drift = 0.003 + wheelIdx * 0.001;
  const setpoint = 2000 + wheelIdx * 200;
  let rpm = setpoint + 500 * Math.sin(drift * t + wheelIdx * 1.2) + noise(5);
  if (p.degradedAocs) {
    rpm += noise(50); // higher noise for degraded AOCS
    if (Math.random() < 0.002) rpm += noise(200); // occasional spikes
  }
  if (anomaly && t >= anomalyStart && wheelIdx === 1) {
    const dt = Math.min(t - anomalyStart, 3600);
    rpm += 800 * (dt / 3600);
  }
  return +clamp(rpm, 0, 6000).toFixed(1);
}

function quaternionComponent(t: number, idx: number, p: SatelliteProfile): number {
  const rate = TWO_PI / (2 * p.orbitPeriodS);
  const offsets = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
  const raw = idx === 3
    ? Math.cos(rate * t / 2)
    : Math.sin(rate * t) * 0.05 * Math.sin(rate * t + offsets[idx]);
  const noiseAmp = p.degradedAocs ? 0.002 : 0.0002;
  return +(raw + noise(noiseAmp)).toFixed(6);
}

function angularRate(t: number, axis: number, p: SatelliteProfile): number {
  const baseNoise = p.degradedAocs ? 0.02 : 0.002;
  const micro = 0.01 * Math.sin(0.002 * t + axis * 1.1) + noise(baseNoise);
  return +clamp(micro, -0.5, 0.5).toFixed(5);
}

function starTrackerStatus(t: number, p: SatelliteProfile): number {
  if (p.degradedAocs && Math.random() < 0.05) return Math.random() < 0.5 ? 0 : 1; // occasional dropouts
  const phase = (t % p.orbitPeriodS) / p.orbitPeriodS;
  const nearTerminator = !p.geoStationary && Math.abs(phase - (1 - p.eclipseFraction)) < 0.02;
  if (nearTerminator) return Math.random() < 0.4 ? 1 : 2;
  return 2;
}

function gpsAltitude(t: number, p: SatelliteProfile): number {
  if (p.geoStationary) return +(35786 + 5 * Math.sin(TWO_PI * t / p.orbitPeriodS) + noise(0.5)).toFixed(2);
  const baseAlt = p.orbitPeriodS === 97 * 60 ? 615 : 520;
  const alt = baseAlt + 2.5 * Math.sin(TWO_PI * t / p.orbitPeriodS) + noise(0.1);
  return +alt.toFixed(2);
}

function signalStrength(t: number, p: SatelliteProfile, anomaly: boolean, anomalyStart: number): number {
  if (p.geoStationary) {
    // GEO: always in contact, stable signal
    let sig = -68 + 3 * Math.sin(0.0001 * t) + noise(0.3);
    if (anomaly && t >= anomalyStart) sig -= 8 * Math.min(1, (t - anomalyStart) / 600);
    return +clamp(sig, -99, -55).toFixed(1);
  }
  const contactPeriod = p.orbitPeriodS;
  const inContact = (t % contactPeriod) / contactPeriod < 0.11;
  if (!inContact) return -99;
  const phase = ((t % contactPeriod) / contactPeriod) / 0.11;
  const elevationGain = 20 * Math.sin(Math.PI * phase);
  let sig = -85 + elevationGain + noise(0.5);
  if (anomaly && t >= anomalyStart && inContact) sig -= 8 * Math.min(1, (t - anomalyStart) / 600);
  return +clamp(sig, -99, -55).toFixed(1);
}

function uplinkLocked(t: number, p: SatelliteProfile): number {
  if (p.geoStationary) return Math.random() > 0.001 ? 1 : 0;
  const contactPeriod = p.orbitPeriodS;
  const inContact = (t % contactPeriod) / contactPeriod < 0.11;
  return inContact && Math.random() > 0.02 ? 1 : 0;
}

function bitErrorRate(t: number, p: SatelliteProfile): number {
  if (p.geoStationary) return +(-9.5 + noise(0.2)).toFixed(2);
  const contactPeriod = p.orbitPeriodS;
  const phase = ((t % contactPeriod) / contactPeriod) / 0.11;
  const inContact = (t % contactPeriod) / contactPeriod < 0.11;
  if (!inContact) return 0;
  const elevation = Math.sin(Math.PI * clamp(phase, 0, 1));
  return +clamp(-9 + 3 * (1 - elevation) + noise(0.1), -12, -3).toFixed(2);
}

function linkMargin(t: number, p: SatelliteProfile, anomaly: boolean, anomalyStart: number): number {
  const dbm = signalStrength(t, p, anomaly, anomalyStart);
  if (dbm === -99) return 0;
  return +clamp(dbm + 75, -5, 20).toFixed(1);
}

// GEO-specific parameters
function transponderLoad(t: number): number {
  // Diurnal traffic pattern: peaks at European daytime
  const hourOfDay = (t / 3600) % 24;
  const load = 45 + 35 * Math.sin(TWO_PI * (hourOfDay - 6) / 24) + noise(2);
  return +clamp(load, 5, 98).toFixed(1);
}

function eirpPerBeam(t: number): number {
  const base = 52 + noise(0.3);
  return +clamp(base, 48, 55).toFixed(1);
}

function stationKeepingDeltaV(t: number): number {
  // Slowly depleting budget (m/s remaining)
  const remaining = 120 - 0.00001 * t + noise(0.01);
  return +clamp(remaining, 0, 150).toFixed(2);
}

// ---------------------------------------------------------------------------
// Attack scenario definitions
// ---------------------------------------------------------------------------

interface ScenarioStep {
  offsetSeconds: number;
  parameterName: string;
  generator: (t: number, stepStart: number) => number;
  durationSeconds: number;
  ruleId: string;
  severity: string;
  description: string;
}

interface ScenarioDefinition {
  name: string;
  description: string;
  targetAssetPattern: string;
  targetCompany: string;
  steps: ScenarioStep[];
  spartaTactics: string[];
  detectionRules: string[];
}

const SCENARIOS: Record<string, ScenarioDefinition> = {
  "rf-jamming": {
    name: "rf-jamming",
    description: "Broadband RF interference attack on satellite downlink",
    targetAssetPattern: "Proba-EO-1",
    targetCompany: "proba",
    spartaTactics: ["Initial Access", "Impact"],
    detectionRules: ["SG-RF-001", "SG-RF-003", "SG-RF-004"],
    steps: [
      {
        offsetSeconds: 0,
        parameterName: "rf.snr_db",
        durationSeconds: 300,
        ruleId: "SG-RF-001",
        severity: "HIGH",
        description: "SNR drops below 5.0 dB (jamming onset)",
        generator: (t, s) => {
          const elapsed = t - s;
          if (elapsed < 0) return 15 + noise(0.5);          // nominal
          if (elapsed < 30) return 15 - 12 * (elapsed / 30) + noise(0.3); // rapid drop
          if (elapsed < 270) return 2.5 + noise(1.0);       // sustained jamming
          return 2.5 + 12.5 * ((elapsed - 270) / 30) + noise(0.5); // recovery
        },
      },
      {
        offsetSeconds: 15,
        parameterName: "rf.ber",
        durationSeconds: 285,
        ruleId: "SG-RF-003",
        severity: "MEDIUM",
        description: "BER spikes above 0.001",
        generator: (t, s) => {
          const elapsed = t - s;
          if (elapsed < 0) return 1e-9;
          if (elapsed < 10) return 1e-9 * Math.pow(1e6, elapsed / 10); // exponential rise
          if (elapsed < 255) return 0.005 + noise(0.003);   // sustained high BER
          return 0.005 * Math.pow(0.001, (elapsed - 255) / 30); // recovery
        },
      },
      {
        offsetSeconds: 20,
        parameterName: "rf.agc_level_db",
        durationSeconds: 280,
        ruleId: "SG-RF-004",
        severity: "HIGH",
        description: "AGC rate of change exceeds 15 dB/s",
        generator: (t, s) => {
          const elapsed = t - s;
          if (elapsed < 0) return -35 + noise(0.3);
          // Rapid fluctuations simulating broadband interference
          return -35 + 20 * Math.sin(elapsed * 3.7) * Math.sin(elapsed * 0.5) + noise(2);
        },
      },
    ],
  },
  "supply-chain-compromise": {
    name: "supply-chain-compromise",
    description: "Firmware backdoor activation and data exfiltration",
    targetAssetPattern: "Proba-EO-1",
    targetCompany: "proba",
    spartaTactics: ["Persistence", "Execution", "Exfiltration", "Defense Evasion"],
    detectionRules: ["SG-PE-001", "SG-PE-004", "SG-DX-001", "SG-DX-002", "SG-PE-003"],
    steps: [
      {
        offsetSeconds: 0,
        parameterName: "pe.firmware_hash_mismatch_flag",
        durationSeconds: 1200,
        ruleId: "SG-PE-001",
        severity: "CRITICAL",
        description: "Firmware hash mismatch detected on OBC",
        generator: () => 1,
      },
      {
        offsetSeconds: 120,
        parameterName: "pe.process_injection_flag",
        durationSeconds: 1080,
        ruleId: "SG-PE-004",
        severity: "CRITICAL",
        description: "Unexpected process spawned on OBC",
        generator: () => 1,
      },
      {
        offsetSeconds: 300,
        parameterName: "dx.outbound_volume_mb",
        durationSeconds: 600,
        ruleId: "SG-DX-001",
        severity: "HIGH",
        description: "Outbound data volume ramps above 500 MB",
        generator: (t, s) => {
          const elapsed = t - s;
          if (elapsed < 0) return 10 + noise(5);
          return Math.min(800, 10 + 790 * (elapsed / 300)) + noise(10);
        },
      },
      {
        offsetSeconds: 600,
        parameterName: "dx.unauthorized_dest_flag",
        durationSeconds: 300,
        ruleId: "SG-DX-002",
        severity: "CRITICAL",
        description: "Data transfer to unauthorized destination",
        generator: () => 1,
      },
      {
        offsetSeconds: 900,
        parameterName: "pe.log_deletion_flag",
        durationSeconds: 60,
        ruleId: "SG-PE-003",
        severity: "CRITICAL",
        description: "Audit log deletion detected (covering tracks)",
        generator: () => 1,
      },
    ],
  },
  "insider-threat": {
    name: "insider-threat",
    description: "Privileged user misuse on ground segment",
    targetAssetPattern: "Brussels Mission Control",
    targetCompany: "proba",
    spartaTactics: ["Initial Access", "Persistence", "Exfiltration", "Defense Evasion"],
    detectionRules: ["SG-AC-005", "SG-AC-001", "SG-GS-003", "SG-DX-005", "SG-DX-004", "SG-PE-003"],
    steps: [
      {
        offsetSeconds: 0,
        parameterName: "ac.after_hours_login_flag",
        durationSeconds: 1200,
        ruleId: "SG-AC-005",
        severity: "MEDIUM",
        description: "After-hours login to mission-critical system",
        generator: () => 1,
      },
      {
        offsetSeconds: 60,
        parameterName: "ac.privilege_escalation_flag",
        durationSeconds: 1140,
        ruleId: "SG-AC-001",
        severity: "CRITICAL",
        description: "Privilege escalation detected",
        generator: () => 1,
      },
      {
        offsetSeconds: 180,
        parameterName: "gs.config_change_flag",
        durationSeconds: 60,
        ruleId: "SG-GS-003",
        severity: "HIGH",
        description: "Configuration change outside maintenance window",
        generator: () => 1,
      },
      {
        offsetSeconds: 300,
        parameterName: "dx.bulk_query_count",
        durationSeconds: 600,
        ruleId: "SG-DX-005",
        severity: "HIGH",
        description: "Bulk database queries ramping above 50",
        generator: (t, s) => {
          const elapsed = t - s;
          if (elapsed < 0) return 2 + noise(1);
          return Math.min(120, 2 + 118 * (elapsed / 300)) + noise(3);
        },
      },
      {
        offsetSeconds: 600,
        parameterName: "dx.key_export_flag",
        durationSeconds: 60,
        ruleId: "SG-DX-004",
        severity: "CRITICAL",
        description: "Cryptographic key material export detected",
        generator: () => 1,
      },
      {
        offsetSeconds: 900,
        parameterName: "pe.log_deletion_flag",
        durationSeconds: 60,
        ruleId: "SG-PE-003",
        severity: "CRITICAL",
        description: "Audit log deletion (covering tracks)",
        generator: () => 1,
      },
    ],
  },
};

function getActiveScenarios(): ScenarioDefinition[] {
  if (!SCENARIO_NAME) return [];
  if (SCENARIO_NAME === "spacecraft-failure") return []; // handled by existing anomaly injection
  if (SCENARIO_NAME === "all") return Object.values(SCENARIOS);
  const s = SCENARIOS[SCENARIO_NAME];
  if (!s) {
    console.error(`Unknown scenario: "${SCENARIO_NAME}". Options: ${Object.keys(SCENARIOS).join(", ")}, spacecraft-failure, all`);
    process.exit(1);
  }
  return [s];
}

function generateScenarioPoints(
  startMs: number,
  durationS: number,
  scenario: ScenarioDefinition,
  scenarioOffsetS: number = 0,
): Point[] {
  const points: Point[] = [];
  const t0 = durationS / 2 + scenarioOffsetS; // scenario starts at halfway + offset

  for (const step of scenario.steps) {
    const stepStart = t0 + step.offsetSeconds;
    const stepEnd = stepStart + step.durationSeconds;
    // Generate at 1 Hz for flag/threshold params
    for (let t = Math.max(0, stepStart); t < Math.min(durationS, stepEnd); t += 1) {
      const ts = new Date(startMs + t * 1000).toISOString();
      const value = step.generator(t, stepStart);
      points.push({
        time: ts,
        parameterName: step.parameterName,
        valueNumeric: +value.toFixed(6),
        quality: "SUSPECT",
      });
    }
  }

  return points.sort((a, b) => a.time.localeCompare(b.time));
}

function printScenarioTimeline(scenario: ScenarioDefinition, startMs: number, durationS: number, scenarioOffset: number = 0): void {
  const t0S = durationS / 2 + scenarioOffset;
  const t0Ms = startMs + t0S * 1000;
  console.log(`\n  Scenario: ${scenario.name} (${scenario.description})`);
  console.log(`  SPARTA tactics: ${scenario.spartaTactics.join(", ")}`);
  console.log(`  ${"=".repeat(56)}`);
  for (const step of scenario.steps) {
    const mm = Math.floor(step.offsetSeconds / 60);
    const ss = step.offsetSeconds % 60;
    const timeStr = `t+${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    const sevColor = step.severity === "CRITICAL" ? "!" : step.severity === "HIGH" ? "*" : " ";
    console.log(`  ${timeStr}  ${step.parameterName.padEnd(36)} -> ${step.ruleId} (${step.severity}) ${sevColor}`);
    console.log(`           ${step.description}`);
  }
  console.log(`  Absolute time: ${new Date(t0Ms).toISOString()}`);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

interface StreamInfo { id: string; apiKey: string; name: string }

let AUTH_TOKEN = "";

async function login(): Promise<void> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@proba-space.eu", password: "admin" }),
  });
  if (!res.ok) {
    // Try fallback password
    const res2 = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@proba-space.eu", password: "SpaceGuard2026!" }),
    });
    if (!res2.ok) throw new Error("Failed to login. Check API credentials.");
    const body = await res2.json() as { token: string };
    AUTH_TOKEN = body.token;
    return;
  }
  const body = await res.json() as { token: string };
  AUTH_TOKEN = body.token;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function createStream(orgId: string, assetId: string, name: string, apid: number, sampleRateHz: number): Promise<StreamInfo> {
  return apiFetch<StreamInfo>("/telemetry/streams", {
    method: "POST",
    body: JSON.stringify({ organizationId: orgId, assetId, name, protocol: "CCSDS_TM", apid, sampleRateHz, status: "ACTIVE" }),
  });
}

// ---------------------------------------------------------------------------
// Point types and quality helper
// ---------------------------------------------------------------------------

interface Point {
  time: string;
  parameterName: string;
  valueNumeric?: number;
  valueText?: string;
  quality: "GOOD" | "SUSPECT" | "BAD";
}

function quality(v: number | null, nominal: [number, number]): "GOOD" | "SUSPECT" | "BAD" {
  if (v === null) return "GOOD";
  if (v < nominal[0] || v > nominal[1]) return "SUSPECT";
  return "GOOD";
}

// ---------------------------------------------------------------------------
// Ingestion worker
// ---------------------------------------------------------------------------

async function ingestStream(stream: StreamInfo, points: Point[], batchSize: number): Promise<void> {
  const total = points.length;
  let sent = 0;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await apiFetch<{ inserted: number }>(`/telemetry/ingest/${stream.id}`, {
      method: "POST",
      headers: { "X-API-Key": stream.apiKey },
      body: JSON.stringify({ streamId: stream.id, points: batch }),
    });
    sent += batch.length;
    if (sent % 5000 < batchSize || sent >= total) {
      const pct = ((sent / total) * 100).toFixed(0);
      process.stdout.write(`\r  ${stream.name.padEnd(48)} ${sent.toLocaleString().padStart(8)}/${total.toLocaleString()} pts  [${pct.padStart(3)}%]`);
    }
  }
  process.stdout.write("\n");
}

// ---------------------------------------------------------------------------
// Point generators (profile-parameterized)
// ---------------------------------------------------------------------------

function generateHkPoints(startMs: number, durationS: number, anomalyStart: number, p: SatelliteProfile): Point[] {
  const points: Point[] = [];
  const anomaly = INJECT_ANOMALY;
  const hkRate = p.geoStationary ? 1 : (p.hasAocsStream ? 1 : 0.5);

  for (let t = 0; t < durationS; t += 1 / hkRate) {
    const ts = new Date(startMs + t * 1000).toISOString();
    const bv = batteryVoltage(t, p, anomaly, anomalyStart);
    const sc = solarCurrent(t, p);
    const tobc = temperatureObc(t, p, anomaly, anomalyStart);
    const tbatt = temperatureBattery(t, p);

    points.push({ time: ts, parameterName: "battery_voltage_v", valueNumeric: bv, quality: quality(bv, [p.batteryRange[0] + 2, p.batteryRange[1]]) });
    points.push({ time: ts, parameterName: "solar_current_a", valueNumeric: sc, quality: quality(sc, [0, p.solarMaxA + 0.1]) });
    points.push({ time: ts, parameterName: "temperature_obc_c", valueNumeric: tobc, quality: quality(tobc, p.thermalRange) });
    points.push({ time: ts, parameterName: "temperature_batt_c", valueNumeric: tbatt, quality: quality(tbatt, [p.thermalRange[0], p.thermalRange[1] - 10]) });

    // Reaction wheels (not for CubeSats using magnetorquers)
    if (p.hasAocsStream || !p.geoStationary) {
      const rw0 = reactionWheelRpm(t, 0, p, anomaly, anomalyStart);
      const rw1 = reactionWheelRpm(t, 1, p, anomaly, anomalyStart);
      const rw2 = reactionWheelRpm(t, 2, p, anomaly, anomalyStart);
      points.push({ time: ts, parameterName: "reaction_wheel_0_rpm", valueNumeric: rw0, quality: quality(rw0, [0, 5000]) });
      points.push({ time: ts, parameterName: "reaction_wheel_1_rpm", valueNumeric: rw1, quality: quality(rw1, [0, 5000]) });
      points.push({ time: ts, parameterName: "reaction_wheel_2_rpm", valueNumeric: rw2, quality: quality(rw2, [0, 5000]) });
    }
  }
  return points;
}

function generateAocsPoints(startMs: number, durationS: number, p: SatelliteProfile): Point[] {
  if (!p.hasAocsStream) return [];
  const points: Point[] = [];
  const step = 1 / p.aocsRateHz;

  for (let t = 0; t < durationS; t = +(t + step).toFixed(3)) {
    const ts = new Date(startMs + t * 1000).toISOString();
    points.push({ time: ts, parameterName: "attitude_q1", valueNumeric: quaternionComponent(t, 0, p), quality: "GOOD" });
    points.push({ time: ts, parameterName: "attitude_q2", valueNumeric: quaternionComponent(t, 1, p), quality: "GOOD" });
    points.push({ time: ts, parameterName: "attitude_q3", valueNumeric: quaternionComponent(t, 2, p), quality: "GOOD" });
    points.push({ time: ts, parameterName: "attitude_q4", valueNumeric: quaternionComponent(t, 3, p), quality: "GOOD" });
    const wx = angularRate(t, 0, p); const wy = angularRate(t, 1, p); const wz = angularRate(t, 2, p);
    points.push({ time: ts, parameterName: "angular_rate_x_deg_s", valueNumeric: wx, quality: quality(wx, [-0.1, 0.1]) });
    points.push({ time: ts, parameterName: "angular_rate_y_deg_s", valueNumeric: wy, quality: quality(wy, [-0.1, 0.1]) });
    points.push({ time: ts, parameterName: "angular_rate_z_deg_s", valueNumeric: wz, quality: quality(wz, [-0.1, 0.1]) });
    const st = starTrackerStatus(t, p);
    points.push({ time: ts, parameterName: "star_tracker_status", valueNumeric: st, quality: st < 2 ? "SUSPECT" : "GOOD" });
    points.push({ time: ts, parameterName: "gps_altitude_km", valueNumeric: gpsAltitude(t, p), quality: "GOOD" });
  }
  return points;
}

function generateCommsPoints(startMs: number, durationS: number, anomalyStart: number, p: SatelliteProfile): Point[] {
  const points: Point[] = [];
  const step = 1 / p.commsRateHz;
  const anomaly = INJECT_ANOMALY;

  for (let t = 0; t < durationS; t += step) {
    const ts = new Date(startMs + t * 1000).toISOString();
    const sig = signalStrength(t, p, anomaly, anomalyStart);
    const locked = uplinkLocked(t, p);
    const ber = bitErrorRate(t, p);
    const margin = linkMargin(t, p, anomaly, anomalyStart);
    const inContact = sig > -98;

    points.push({ time: ts, parameterName: "signal_strength_dbm", valueNumeric: sig, quality: quality(sig, [-90, -55]) });
    points.push({ time: ts, parameterName: "uplink_locked", valueNumeric: locked, quality: "GOOD" });
    points.push({ time: ts, parameterName: "bit_error_rate_log", valueNumeric: inContact ? ber : undefined, quality: quality(ber, [-12, -5]) });
    points.push({ time: ts, parameterName: "link_margin_db", valueNumeric: margin, quality: quality(margin, [0, 25]) });

    // GEO-specific transponder telemetry
    if (p.hasTransponderStream) {
      points.push({ time: ts, parameterName: "transponder_load_pct", valueNumeric: transponderLoad(t), quality: "GOOD" });
      points.push({ time: ts, parameterName: "eirp_dbw", valueNumeric: eirpPerBeam(t), quality: "GOOD" });
      points.push({ time: ts, parameterName: "sk_delta_v_remaining_ms", valueNumeric: stationKeepingDeltaV(t), quality: "GOOD" });
    }
  }
  return points;
}

// ---------------------------------------------------------------------------
// Per-satellite simulation
// ---------------------------------------------------------------------------

async function simulateSatellite(
  orgId: string,
  assetId: string,
  assetName: string,
  profile: SatelliteProfile,
  durationS: number,
  startMs: number,
  scenarios: ScenarioDefinition[],
): Promise<{ name: string; totalPoints: number; elapsedMs: number }> {
  const anomalyStart = durationS / 2;
  const t0 = Date.now();

  // Create streams
  const streams: Array<{ stream: StreamInfo; points: Point[]; batch: number }> = [];

  const apidBase = Math.abs(profile.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 900 + 100;

  const hkStream = await createStream(orgId, assetId, `${profile.name} Housekeeping TM`, apidBase, profile.geoStationary ? 1 : (profile.hasAocsStream ? 1 : 0.5));
  const hkPoints = generateHkPoints(startMs, durationS, anomalyStart, profile);
  streams.push({ stream: hkStream, points: hkPoints, batch: 100 });

  if (profile.hasAocsStream) {
    const aocsStream = await createStream(orgId, assetId, `${profile.name} AOCS TM`, apidBase + 100, profile.aocsRateHz);
    const aocsPoints = generateAocsPoints(startMs, durationS, profile);
    streams.push({ stream: aocsStream, points: aocsPoints, batch: 500 });
  }

  if (profile.hasCommsStream) {
    const commsStream = await createStream(orgId, assetId, `${profile.name} COMMS TM`, apidBase + 200, profile.commsRateHz);
    const commsPoints = generateCommsPoints(startMs, durationS, anomalyStart + 1800, profile);
    streams.push({ stream: commsStream, points: commsPoints, batch: 100 });
  }

  // Inject scenario points into the HK stream (scenario params ride on the same stream)
  const matchingScenarios = scenarios.filter(
    (s) => assetName.includes(s.targetAssetPattern) || profile.name.includes(s.targetAssetPattern)
  );
  if (matchingScenarios.length > 0) {
    for (let i = 0; i < matchingScenarios.length; i++) {
      const scenario = matchingScenarios[i];
      const offset = i * 1200; // stagger scenarios by 20 min when running "all"
      const scenarioPoints = generateScenarioPoints(startMs, durationS, scenario, offset);
      if (scenarioPoints.length > 0) {
        const scenarioStream = await createStream(orgId, assetId, `${profile.name} ${scenario.name} Events`, apidBase + 300 + i, 1);
        streams.push({ stream: scenarioStream, points: scenarioPoints, batch: 100 });
        console.log(`    Scenario "${scenario.name}": ${scenarioPoints.length} injected points`);
      }
    }
  }

  // Ingest all streams concurrently
  await Promise.all(streams.map((s) => ingestStream(s.stream, s.points, s.batch)));

  const totalPoints = streams.reduce((sum, s) => sum + s.points.length, 0);
  return { name: profile.name, totalPoints, elapsedMs: Date.now() - t0 };
}

// ---------------------------------------------------------------------------
// Per-company simulation
// ---------------------------------------------------------------------------

async function simulateCompany(company: CompanyConfig, durationS: number, startMs: number, scenarios: ScenarioDefinition[]): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${company.name}`);
  console.log(`${"=".repeat(60)}`);

  // Find org
  const orgsRes = await apiFetch<{ data: Array<{ id: string; name: string }> }>("/organizations");
  const org = orgsRes.data.find((o) => o.name.includes(company.orgNamePattern));
  if (!org) {
    console.log(`  SKIP: Organization "${company.orgNamePattern}" not found`);
    return;
  }

  // Find assets
  const assetsRes = await apiFetch<{ data: Array<{ id: string; name: string; assetType: string }> }>(
    `/assets?organizationId=${org.id}&type=${company.assetType}&perPage=50`
  );

  let totalPoints = 0;
  const results: Array<{ name: string; totalPoints: number; elapsedMs: number }> = [];

  for (const profile of company.satellites) {
    const asset = assetsRes.data.find((a) => a.name.includes(profile.assetNamePattern));
    if (!asset) {
      console.log(`  SKIP: Asset "${profile.assetNamePattern}" not found`);
      continue;
    }
    console.log(`\n  Satellite: ${profile.name} (${asset.id.slice(0, 8)}...)`);
    const companyScenarios = scenarios.filter((s) => s.targetCompany === company.cliKey);
    const result = await simulateSatellite(org.id, asset.id, asset.name, profile, durationS, startMs, companyScenarios);
    results.push(result);
    totalPoints += result.totalPoints;
  }

  // Company summary
  console.log(`\n  ${company.name} Summary:`);
  for (const r of results) {
    console.log(`    ${r.name.padEnd(20)} ${r.totalPoints.toLocaleString().padStart(10)} pts  (${(r.elapsedMs / 1000).toFixed(1)}s)`);
  }
  console.log(`    ${"TOTAL".padEnd(20)} ${totalPoints.toLocaleString().padStart(10)} pts`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n+----------------------------------------------------------+");
  console.log("|     SpaceGuard Multi-Satellite Telemetry Simulator        |");
  console.log("+----------------------------------------------------------+");
  console.log(`  Duration  : ${HOURS} hour${HOURS !== 1 ? "s" : ""}`);
  console.log(`  Anomalies : ${INJECT_ANOMALY ? "ENABLED" : "disabled"}`);
  console.log(`  Scenario  : ${SCENARIO_NAME ?? "none"}`);
  console.log(`  Company   : ${COMPANY_FILTER ?? "all"}`);
  console.log(`  API       : ${API}\n`);

  console.log("  Authenticating...");
  await login();
  console.log("  Authenticated.\n");

  const durationS = Math.round(HOURS * 3600);
  const startMs = Date.now() - durationS * 1000;

  const companies = COMPANY_FILTER
    ? COMPANIES.filter((c) => c.cliKey === COMPANY_FILTER)
    : COMPANIES;

  if (companies.length === 0) {
    console.error(`Unknown company: "${COMPANY_FILTER}". Options: ${COMPANIES.map((c) => c.cliKey).join(", ")}`);
    process.exit(1);
  }

  const activeScenarios = getActiveScenarios();
  if (activeScenarios.length > 0) {
    console.log(`  Active scenarios: ${activeScenarios.map((s) => s.name).join(", ")}\n`);
  }

  const globalT0 = Date.now();

  for (const company of companies) {
    await simulateCompany(company, durationS, startMs, activeScenarios);
  }

  // Print scenario timelines
  if (activeScenarios.length > 0) {
    console.log("\n  SCENARIO TIMELINE (expected detection rule triggers):");
    for (let i = 0; i < activeScenarios.length; i++) {
      printScenarioTimeline(activeScenarios[i], startMs, durationS, i * 1200);
    }
  }

  const totalElapsed = ((Date.now() - globalT0) / 1000).toFixed(1);
  console.log(`\n+----------------------------------------------------------+`);
  console.log(`|  All simulations complete in ${totalElapsed}s`);
  console.log(`+----------------------------------------------------------+\n`);
}

main().catch((err: unknown) => {
  console.error("\nSimulator failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
