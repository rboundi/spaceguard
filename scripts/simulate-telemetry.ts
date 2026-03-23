/**
 * SpaceGuard Telemetry Simulator
 *
 * Generates realistic satellite telemetry for Proba-EO-1 and feeds it into
 * the telemetry ingestion API.
 *
 * Usage:
 *   npx tsx scripts/simulate-telemetry.ts               # 1 hour, nominal
 *   npx tsx scripts/simulate-telemetry.ts --hours 6     # 6 hours
 *   npx tsx scripts/simulate-telemetry.ts --anomaly     # inject anomalies
 *   npx tsx scripts/simulate-telemetry.ts --hours 24 --anomaly
 *
 * Three streams are created for Proba-EO-1:
 *   HK  (APID 100, 1 Hz):  battery, solar, temperature, reaction wheels
 *   AOCS(APID 200, 10 Hz): quaternion, angular rates, star tracker, GPS
 *   COMMS(APID 300, 0.1Hz): signal strength, uplink lock, BER, link margin
 *
 * Data is sent in batches of 100 points (500 for AOCS due to volume).
 * All three streams are ingested concurrently.
 */

const API = "http://localhost:3001/api/v1";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const INJECT_ANOMALY = args.includes("--anomaly");
const hoursArg = args.find((a) => a.startsWith("--hours"));
const HOURS = hoursArg ? Math.min(24, Math.max(0.1, parseFloat(hoursArg.split("=")[1] ?? args[args.indexOf("--hours") + 1] ?? "1"))) : 1;

// ---------------------------------------------------------------------------
// Physics / orbital constants
// ---------------------------------------------------------------------------

const ORBIT_PERIOD_S = 96 * 60;       // 96-minute LEO orbit
const ECLIPSE_FRACTION = 0.35;         // ~35% of orbit in eclipse
const TWO_PI = 2 * Math.PI;

// ---------------------------------------------------------------------------
// PRNG: deterministic but varied enough to look real
// ---------------------------------------------------------------------------

function noise(amplitude: number): number {
  return (Math.random() - 0.5) * 2 * amplitude;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// Waveform generators
// All take t in seconds from mission start (= simulated start time)
// ---------------------------------------------------------------------------

/** True when the satellite is in sunlight */
function inSunlight(t: number): boolean {
  const phase = (t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S;
  return phase < (1 - ECLIPSE_FRACTION);
}

/** Battery voltage: 28.0-32.4 V, charges in sun, depletes in eclipse */
function batteryVoltage(t: number, anomaly: boolean, anomalyStart: number): number {
  const phase = (t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S;
  // Sinusoidal charge cycle with orbit phase
  let v = 30.2 + 2.2 * Math.sin(TWO_PI * phase + Math.PI / 4);
  v += noise(0.08);
  if (anomaly && t >= anomalyStart) {
    // Cell failure: sudden drop proportional to time since anomaly
    const dt = Math.min(t - anomalyStart, 900); // max 15 min effect
    v -= 3.0 * (dt / 900);
  }
  return +clamp(v, 22.0, 33.0).toFixed(3);
}

/** Solar array current: 0-4.2 A, only in sunlight */
function solarCurrent(t: number): number {
  if (!inSunlight(t)) return +Math.abs(noise(0.02)).toFixed(3);
  const phase = (t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S;
  // Peaks at orbit mid-point (directly facing sun)
  const elevation = Math.sin(TWO_PI * phase / (1 - ECLIPSE_FRACTION));
  const i = 4.2 * Math.max(0, elevation);
  return +clamp(i + noise(0.05), 0, 4.3).toFixed(3);
}

/** OBC temperature: -10 to +40 °C, thermal cycle + self-heating */
function temperatureObc(t: number, anomaly: boolean, anomalyStart: number): number {
  const phase = (t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S;
  let temp = 15 + 18 * Math.sin(TWO_PI * phase + 1.0) + noise(0.3);
  if (anomaly && t >= anomalyStart) {
    const dt = Math.min(t - anomalyStart, 600);
    temp += 25 * (dt / 600); // thermal runaway over 10 minutes
  }
  return +clamp(temp, -15, 75).toFixed(2);
}

/** Battery temperature: tighter range than OBC */
function temperatureBattery(t: number): number {
  const phase = (t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S;
  const temp = 5 + 10 * Math.sin(TWO_PI * phase + 0.8) + noise(0.2);
  return +clamp(temp, -5, 25).toFixed(2);
}

/** Reaction wheel speed (RPM): slow drift around setpoint */
function reactionWheelRpm(
  t: number,
  wheelIdx: number,
  anomaly: boolean,
  anomalyStart: number
): number {
  // Each wheel has a slightly different natural drift frequency
  const drift = 0.003 + wheelIdx * 0.001;
  const setpoint = 2000 + wheelIdx * 200;
  let rpm = setpoint + 500 * Math.sin(drift * t + wheelIdx * 1.2) + noise(5);
  if (anomaly && t >= anomalyStart && wheelIdx === 1) {
    // Wheel 1 begins to diverge (bearing degradation)
    const dt = Math.min(t - anomalyStart, 3600);
    rpm += 800 * (dt / 3600);
  }
  return +clamp(rpm, 0, 6000).toFixed(1);
}

// AOCS

/** Quaternion component: slowly precessing unit quaternion */
function quaternionComponent(t: number, idx: number): number {
  // Very slow precession rate (one full rotation per ~2 orbits)
  const rate = TWO_PI / (2 * ORBIT_PERIOD_S);
  const offsets = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
  const raw =
    idx === 3
      ? Math.cos(rate * t / 2) // q4 (scalar part) stays near 1
      : Math.sin(rate * t) * 0.05 * Math.sin(rate * t + offsets[idx]);
  // Normalise approximately and add tiny noise
  return +(raw + noise(0.0002)).toFixed(6);
}

/** Angular rate (deg/s): near-zero for nadir pointing */
function angularRate(t: number, axis: number): number {
  const micro = 0.01 * Math.sin(0.002 * t + axis * 1.1) + noise(0.002);
  return +clamp(micro, -0.5, 0.5).toFixed(5);
}

/** Star tracker: 0=lost, 1=acquiring, 2=tracking */
function starTrackerStatus(t: number): number {
  // Usually tracking (2); briefly loses lock during eclipse transitions
  const phase = (t % ORBIT_PERIOD_S) / ORBIT_PERIOD_S;
  const nearTerminator = Math.abs(phase - (1 - ECLIPSE_FRACTION)) < 0.02;
  if (nearTerminator) return Math.random() < 0.4 ? 1 : 2;
  if (!inSunlight(t)) return 2; // fine in eclipse (using star field)
  return 2;
}

/** GPS position altitude (km): 520 km ± eccentricity */
function gpsAltitude(t: number): number {
  const alt = 520 + 2.5 * Math.sin(TWO_PI * t / ORBIT_PERIOD_S) + noise(0.1);
  return +alt.toFixed(2);
}

// COMMS

/** Signal strength (dBm): -85 to -65 dBm, varies with elevation */
function signalStrength(
  t: number,
  anomaly: boolean,
  anomalyStart: number
): number {
  // Ground station contact windows: ~10 min per ~90 min orbit, 4-5 passes/day
  const contactPeriod = ORBIT_PERIOD_S;
  const inContact = (t % contactPeriod) / contactPeriod < 0.11;
  if (!inContact) return -99; // out of contact

  const phase = ((t % contactPeriod) / contactPeriod) / 0.11;
  // Elevation profile: rises and falls during pass
  const elevationGain = 20 * Math.sin(Math.PI * phase);
  let sig = -85 + elevationGain + noise(0.5);
  if (anomaly && t >= anomalyStart && inContact) {
    sig -= 8 * Math.min(1, (t - anomalyStart) / 600); // jamming / interference
  }
  return +clamp(sig, -99, -55).toFixed(1);
}

/** Uplink lock: 1 when in contact and locked, 0 otherwise */
function uplinkLocked(t: number): number {
  const contactPeriod = ORBIT_PERIOD_S;
  const inContact = (t % contactPeriod) / contactPeriod < 0.11;
  return inContact && Math.random() > 0.02 ? 1 : 0;
}

/** Bit error rate (log10 scale): -9 nominal, degrades near horizon */
function bitErrorRate(t: number): number {
  const contactPeriod = ORBIT_PERIOD_S;
  const phase = ((t % contactPeriod) / contactPeriod) / 0.11;
  const inContact = (t % contactPeriod) / contactPeriod < 0.11;
  if (!inContact) return 0;
  // Worse at low elevation (start/end of pass)
  const elevation = Math.sin(Math.PI * clamp(phase, 0, 1));
  const ber = -9 + 3 * (1 - elevation) + noise(0.1);
  return +clamp(ber, -12, -3).toFixed(2);
}

/** Link margin (dB): positive means link is healthy */
function linkMargin(t: number, anomaly: boolean, anomalyStart: number): number {
  const dbm = signalStrength(t, anomaly, anomalyStart);
  if (dbm === -99) return 0;
  const margin = dbm + 75; // threshold at -75 dBm → 0 dB margin
  return +clamp(margin, -5, 20).toFixed(1);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

interface StreamInfo {
  id: string;
  apiKey: string;
  name: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function createStream(
  organizationId: string,
  assetId: string,
  name: string,
  apid: number,
  sampleRateHz: number
): Promise<StreamInfo> {
  const stream = await apiFetch<StreamInfo>("/telemetry/streams", {
    method: "POST",
    body: JSON.stringify({
      organizationId,
      assetId,
      name,
      protocol: "CCSDS_TM",
      apid,
      sampleRateHz,
      status: "ACTIVE",
    }),
  });
  return stream;
}

// ---------------------------------------------------------------------------
// Point generation types
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
// Ingestion worker: sends all points for one stream
// ---------------------------------------------------------------------------

async function ingestStream(
  stream: StreamInfo,
  points: Point[],
  batchSize: number
): Promise<void> {
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

    // Print progress every 5000 points or on last batch
    if (sent % 5000 < batchSize || sent >= total) {
      const pct = ((sent / total) * 100).toFixed(0);
      process.stdout.write(
        `\r  ${stream.name.padEnd(40)} ${sent.toLocaleString().padStart(8)}/${total.toLocaleString()} pts  [${pct.padStart(3)}%]`
      );
    }
  }
  process.stdout.write("\n");
}

// ---------------------------------------------------------------------------
// Point generators per stream
// ---------------------------------------------------------------------------

function generateHkPoints(
  startMs: number,
  durationS: number,
  anomalyStart: number
): Point[] {
  const points: Point[] = [];
  const HZ = 1;
  const anomaly = INJECT_ANOMALY;

  for (let t = 0; t < durationS; t += 1 / HZ) {
    const ts = new Date(startMs + t * 1000).toISOString();

    const bv = batteryVoltage(t, anomaly, anomalyStart);
    const sc = solarCurrent(t);
    const tobc = temperatureObc(t, anomaly, anomalyStart);
    const tbatt = temperatureBattery(t);
    const rw0 = reactionWheelRpm(t, 0, anomaly, anomalyStart);
    const rw1 = reactionWheelRpm(t, 1, anomaly, anomalyStart);
    const rw2 = reactionWheelRpm(t, 2, anomaly, anomalyStart);

    points.push({ time: ts, parameterName: "battery_voltage_v",   valueNumeric: bv,    quality: quality(bv,    [27.5, 33.0]) });
    points.push({ time: ts, parameterName: "solar_current_a",     valueNumeric: sc,    quality: quality(sc,    [0, 4.5]) });
    points.push({ time: ts, parameterName: "temperature_obc_c",   valueNumeric: tobc,  quality: quality(tobc,  [-15, 55]) });
    points.push({ time: ts, parameterName: "temperature_batt_c",  valueNumeric: tbatt, quality: quality(tbatt, [-5, 25]) });
    points.push({ time: ts, parameterName: "reaction_wheel_0_rpm", valueNumeric: rw0,  quality: quality(rw0,   [0, 5000]) });
    points.push({ time: ts, parameterName: "reaction_wheel_1_rpm", valueNumeric: rw1,  quality: quality(rw1,   [0, 5000]) });
    points.push({ time: ts, parameterName: "reaction_wheel_2_rpm", valueNumeric: rw2,  quality: quality(rw2,   [0, 5000]) });
  }
  return points;
}

function generateAocsPoints(
  startMs: number,
  durationS: number
): Point[] {
  const points: Point[] = [];
  const STEP = 0.1; // 10 Hz = 0.1s interval

  for (let t = 0; t < durationS; t = +(t + STEP).toFixed(1)) {
    const ts = new Date(startMs + t * 1000).toISOString();

    const q1 = quaternionComponent(t, 0);
    const q2 = quaternionComponent(t, 1);
    const q3 = quaternionComponent(t, 2);
    const q4 = quaternionComponent(t, 3);
    const wx = angularRate(t, 0);
    const wy = angularRate(t, 1);
    const wz = angularRate(t, 2);
    const st = starTrackerStatus(t);
    const alt = gpsAltitude(t);

    points.push({ time: ts, parameterName: "attitude_q1",       valueNumeric: q1, quality: "GOOD" });
    points.push({ time: ts, parameterName: "attitude_q2",       valueNumeric: q2, quality: "GOOD" });
    points.push({ time: ts, parameterName: "attitude_q3",       valueNumeric: q3, quality: "GOOD" });
    points.push({ time: ts, parameterName: "attitude_q4",       valueNumeric: q4, quality: "GOOD" });
    points.push({ time: ts, parameterName: "angular_rate_x_deg_s", valueNumeric: wx, quality: quality(wx, [-0.1, 0.1]) });
    points.push({ time: ts, parameterName: "angular_rate_y_deg_s", valueNumeric: wy, quality: quality(wy, [-0.1, 0.1]) });
    points.push({ time: ts, parameterName: "angular_rate_z_deg_s", valueNumeric: wz, quality: quality(wz, [-0.1, 0.1]) });
    points.push({ time: ts, parameterName: "star_tracker_status",  valueNumeric: st, quality: st < 2 ? "SUSPECT" : "GOOD" });
    points.push({ time: ts, parameterName: "gps_altitude_km",      valueNumeric: alt, quality: quality(alt, [510, 540]) });
  }
  return points;
}

function generateCommsPoints(
  startMs: number,
  durationS: number,
  anomalyStart: number
): Point[] {
  const points: Point[] = [];
  const STEP = 10; // 0.1 Hz = 10s interval
  const anomaly = INJECT_ANOMALY;

  for (let t = 0; t < durationS; t += STEP) {
    const ts = new Date(startMs + t * 1000).toISOString();

    const sig = signalStrength(t, anomaly, anomalyStart);
    const locked = uplinkLocked(t);
    const ber = bitErrorRate(t);
    const margin = linkMargin(t, anomaly, anomalyStart);

    const inContact = sig > -98;
    points.push({ time: ts, parameterName: "signal_strength_dbm", valueNumeric: sig,    quality: quality(sig, [-90, -55]) });
    points.push({ time: ts, parameterName: "uplink_locked",       valueNumeric: locked, quality: "GOOD" });
    points.push({ time: ts, parameterName: "bit_error_rate_log",  valueNumeric: inContact ? ber : undefined, quality: quality(ber, [-12, -5]) });
    points.push({ time: ts, parameterName: "link_margin_db",      valueNumeric: margin,  quality: quality(margin, [0, 25]) });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║         SpaceGuard Telemetry Simulator                    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`  Duration  : ${HOURS} hour${HOURS !== 1 ? "s" : ""}`);
  console.log(`  Anomalies : ${INJECT_ANOMALY ? "ENABLED" : "disabled"}`);
  console.log(`  API       : ${API}\n`);

  // ---- Step 1: Find target organization ----

  console.log("▶ Finding target organization...");
  const orgsRes = await apiFetch<{ data: Array<{ id: string; name: string }> }>("/organizations");
  if (orgsRes.data.length === 0) {
    console.error("✗ No organizations found. Create one in the UI first.");
    process.exit(1);
  }

  // Prefer "Proba Space Systems" if realistic data was seeded; otherwise use any org
  let targetOrg = orgsRes.data.find((o) => o.name.includes("Proba")) ?? null;

  // ---- Step 2: Find a LEO satellite ----

  console.log("▶ Finding a LEO satellite...");
  let satellite: { id: string; name: string } | null = null;

  // If we have a preferred org, try it first
  if (targetOrg) {
    const res = await apiFetch<{ data: Array<{ id: string; name: string }> }>(
      `/assets?organizationId=${targetOrg.id}&type=LEO_SATELLITE`
    );
    satellite = res.data[0] ?? null;
  }

  // Fall back: scan all orgs for any LEO_SATELLITE
  if (!satellite) {
    for (const org of orgsRes.data) {
      const res = await apiFetch<{ data: Array<{ id: string; name: string }> }>(
        `/assets?organizationId=${org.id}&type=LEO_SATELLITE`
      );
      if (res.data.length > 0) {
        targetOrg = org;
        satellite = res.data[0];
        break;
      }
    }
  }

  if (!targetOrg || !satellite) {
    console.error("✗ No LEO_SATELLITE asset found in any organization.");
    console.error("  Add a LEO satellite asset in the Assets page, then re-run.");
    process.exit(1);
  }

  console.log(`  ✓ Org       : ${targetOrg.name} (${targetOrg.id})`);
  console.log(`  ✓ Satellite : ${satellite.name} (${satellite.id})`);

  // Keep a single variable name for the rest of the script
  const probaOrg = targetOrg;

  // ---- Step 3: Create telemetry streams ----

  console.log("▶ Creating telemetry streams...");
  const [hkStream, aocsStream, commsStream] = await Promise.all([
    createStream(probaOrg.id, satellite.id, `${satellite.name} Housekeeping TM`, 100, 1),
    createStream(probaOrg.id, satellite.id, `${satellite.name} AOCS TM`, 200, 10),
    createStream(probaOrg.id, satellite.id, `${satellite.name} COMMS TM`, 300, 0.1),
  ]);
  console.log(`  ✓ HK   stream  ${hkStream.id}`);
  console.log(`  ✓ AOCS stream  ${aocsStream.id}`);
  console.log(`  ✓ COMMS stream ${commsStream.id}`);

  // ---- Step 4: Generate data ----

  const durationS = Math.round(HOURS * 3600);
  const startMs = Date.now() - durationS * 1000; // backfill from now
  const anomalyStart = durationS / 2;            // anomaly at halfway mark

  console.log(`\n▶ Generating ${HOURS}h of telemetry data (t₀ = ${new Date(startMs).toISOString()})...`);
  if (INJECT_ANOMALY) {
    console.log(`  ⚠ Anomaly injection at t+${(anomalyStart / 60).toFixed(0)} min:`);
    console.log("    • Battery voltage cell failure");
    console.log("    • OBC thermal runaway (+10 min)");
    console.log("    • Reaction wheel-1 bearing degradation (+20 min)");
    console.log("    • Comms signal interference (+30 min)");
  }

  const hkPoints    = generateHkPoints(startMs, durationS, anomalyStart);
  const aocsPoints  = generateAocsPoints(startMs, durationS);
  const commsPoints = generateCommsPoints(startMs, durationS, anomalyStart + 1800);

  console.log(`  HK:    ${hkPoints.length.toLocaleString().padStart(9)} points (7 params × ${durationS} s)`);
  console.log(`  AOCS:  ${aocsPoints.length.toLocaleString().padStart(9)} points (9 params × ${(durationS * 10).toLocaleString()} samples)`);
  console.log(`  COMMS: ${commsPoints.length.toLocaleString().padStart(9)} points (4 params × ${Math.floor(durationS / 10)} samples)`);

  // ---- Step 5: Ingest all streams concurrently ----

  console.log("\n▶ Ingesting into API (streams run concurrently)...\n");
  const t0 = Date.now();

  await Promise.all([
    ingestStream(hkStream,    hkPoints,    100),
    ingestStream(aocsStream,  aocsPoints,  500), // larger batches for high-freq AOCS
    ingestStream(commsStream, commsPoints, 100),
  ]);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const totalPts = hkPoints.length + aocsPoints.length + commsPoints.length;

  // ---- Step 6: Summary ----

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  Ingestion Complete                                       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`  Total points : ${totalPts.toLocaleString()}`);
  console.log(`  Duration     : ${HOURS}h of simulated time`);
  console.log(`  Elapsed      : ${elapsed}s`);
  console.log(`  Throughput   : ${Math.round(totalPts / parseFloat(elapsed)).toLocaleString()} pts/s`);
  console.log("");
  console.log("  View in the UI:");
  console.log(`  → Select org  : "${probaOrg.name}" in the top header dropdown`);
  console.log(`  → Navigate to : http://localhost:3000/telemetry`);
  console.log("");
  console.log("  Query the data:");
  console.log(`  GET ${API}/telemetry/points?streamId=${hkStream.id}&from=<ISO>&to=<ISO>&parameterName=battery_voltage_v`);
  if (INJECT_ANOMALY) {
    console.log("\n  ⚠ Anomaly window:");
    const anomalyMs = startMs + anomalyStart * 1000;
    console.log(`    From: ${new Date(anomalyMs).toISOString()}`);
    console.log(`    To  : ${new Date(anomalyMs + 3600 * 1000).toISOString()}`);
    console.log("    Look for: battery_voltage_v < 28V, temperature_obc_c > 40°C,");
    console.log("              reaction_wheel_1_rpm > 3000, signal_strength_dbm < -80dBm");
  }
  console.log("");
}

main().catch((err: unknown) => {
  console.error("\n✗ Simulator failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
