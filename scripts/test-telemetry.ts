/**
 * Integration smoke test for the telemetry ingestion API.
 *
 * 1. Finds the first asset at Proba Space Systems (EO constellation)
 * 2. Creates a telemetry stream for that asset
 * 3. Ingests 100 housekeeping telemetry points (temp, battery, attitude)
 * 4. Queries them back with a time range
 * 5. Prints a summary
 *
 * Run from project root: npx tsx scripts/test-telemetry.ts
 * (or: node --experimental-strip-types scripts/test-telemetry.ts)
 */

const API = "http://localhost:3001/api/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${path}`, json);
    process.exit(1);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Step 1: find Proba Space Systems and its first satellite asset
// ---------------------------------------------------------------------------

console.log("\n=== Step 1: Find Proba Space Systems ===");
const orgsRes = (await apiFetch("/organizations")) as {
  data: Array<{ id: string; name: string }>;
};
const probaOrg = orgsRes.data.find((o) => o.name.includes("Proba"));
if (!probaOrg) {
  console.error("Proba Space Systems not found. Run npm run db:realistic-data first.");
  process.exit(1);
}
console.log(`Found org: ${probaOrg.name} (${probaOrg.id})`);

const assetsRes = (await apiFetch(
  `/assets?organizationId=${probaOrg.id}&type=LEO_SATELLITE`
)) as { data: Array<{ id: string; name: string }> };

if (assetsRes.data.length === 0) {
  console.error("No LEO_SATELLITE assets found for Proba Space Systems.");
  process.exit(1);
}
const asset = assetsRes.data[0];
console.log(`Using asset: ${asset.name} (${asset.id})`);

// ---------------------------------------------------------------------------
// Step 2: Create a telemetry stream
// ---------------------------------------------------------------------------

console.log("\n=== Step 2: Create telemetry stream ===");
const stream = (await apiFetch("/telemetry/streams", {
  method: "POST",
  body: JSON.stringify({
    organizationId: probaOrg.id,
    assetId: asset.id,
    name: `${asset.name} Housekeeping TM`,
    protocol: "CCSDS_TM",
    apid: 100,
    sampleRateHz: 1,
    status: "ACTIVE",
  }),
})) as { id: string; apiKey: string; name: string };

console.log(`Created stream: ${stream.name}`);
console.log(`  Stream ID: ${stream.id}`);
console.log(`  API Key:   ${stream.apiKey}`);

// ---------------------------------------------------------------------------
// Step 3: Ingest 100 telemetry points
// ---------------------------------------------------------------------------

console.log("\n=== Step 3: Ingest 100 telemetry points ===");

// Generate 100 points spread over the last hour, one per 36 seconds
const now = Date.now();
const points = [];
for (let i = 0; i < 100; i++) {
  const time = new Date(now - (100 - i) * 36_000).toISOString(); // 36s apart = 60min span

  // Temperature OBC (°C) oscillating 18-32°C with slight drift
  points.push({
    time,
    parameterName: "temperature_obc_c",
    valueNumeric: +(20 + 6 * Math.sin(i / 10) + (Math.random() - 0.5) * 0.5).toFixed(3),
    quality: "GOOD",
  });

  // Battery voltage (V) 3.6-4.2V charging cycle
  points.push({
    time,
    parameterName: "battery_voltage_v",
    valueNumeric: +(3.6 + 0.6 * ((i % 50) / 50) + (Math.random() - 0.5) * 0.02).toFixed(4),
    quality: "GOOD",
  });

  // Solar power (W) follow a sun/shadow cycle
  const inSunlight = (i % 30) < 22;
  points.push({
    time,
    parameterName: "solar_power_w",
    valueNumeric: inSunlight
      ? +(85 + 15 * Math.random()).toFixed(2)
      : +(2 + Math.random()).toFixed(2),
    quality: "GOOD",
  });

  // CPU load (%)
  points.push({
    time,
    parameterName: "cpu_load_pct",
    valueNumeric: +(25 + 10 * Math.random() + (i > 60 ? 15 : 0)).toFixed(1),
    quality: i > 85 ? "SUSPECT" : "GOOD", // mark last few as SUSPECT to test quality field
  });
}

console.log(`Prepared ${points.length} data points across 4 parameters...`);

const ingestResult = (await apiFetch(`/telemetry/ingest/${stream.id}`, {
  method: "POST",
  headers: { "X-API-Key": stream.apiKey },
  body: JSON.stringify({ streamId: stream.id, points }),
})) as { inserted: number; streamId: string };

console.log(`Ingested: ${ingestResult.inserted} points`);

// ---------------------------------------------------------------------------
// Step 4: Query points back
// ---------------------------------------------------------------------------

console.log("\n=== Step 4: Query telemetry points ===");

// Query the full hour we just ingested (raw, no downsampling)
const fromTime = new Date(now - 100 * 36_000 - 60_000).toISOString(); // a bit before first point
const toTime = new Date(now + 60_000).toISOString();

const queryResult = (await apiFetch(
  `/telemetry/points?streamId=${stream.id}&from=${encodeURIComponent(fromTime)}&to=${encodeURIComponent(toTime)}&perPage=20`
)) as {
  streamId: string;
  from: string;
  to: string;
  downsampled: boolean;
  total: number;
  data: Array<{
    time: string;
    parameterName: string;
    valueNumeric: number | null;
    quality: string;
  }>;
};

console.log(`Total points in DB:   ${queryResult.total}`);
console.log(`Downsampled:          ${queryResult.downsampled}`);
console.log(`Showing first ${queryResult.data.length} of ${queryResult.total}:`);
console.log("");

// Group by parameter to show a compact summary
const byParam: Record<string, number[]> = {};
for (const pt of queryResult.data) {
  if (pt.valueNumeric !== null) {
    (byParam[pt.parameterName] ??= []).push(pt.valueNumeric);
  }
}

for (const [param, values] of Object.entries(byParam)) {
  const min = Math.min(...values).toFixed(3);
  const max = Math.max(...values).toFixed(3);
  console.log(`  ${param.padEnd(30)} min=${min}  max=${max}  (${values.length} pts in first page)`);
}

// Step 4b: Filter by specific parameter
console.log("\n--- Filtered query: temperature_obc_c only ---");
const tempResult = (await apiFetch(
  `/telemetry/points?streamId=${stream.id}&from=${encodeURIComponent(fromTime)}&to=${encodeURIComponent(toTime)}&parameterName=temperature_obc_c&perPage=5`
)) as { total: number; data: Array<{ time: string; valueNumeric: number; quality: string }> };

console.log(`temperature_obc_c: ${tempResult.total} points total, first 5:`);
for (const pt of tempResult.data) {
  console.log(`  ${pt.time}  value=${pt.valueNumeric}  quality=${pt.quality}`);
}

console.log("\n=== All tests passed ===\n");
