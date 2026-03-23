"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertCircle,
  Activity,
  Clock,
  Pause,
  Play,
} from "lucide-react";
import type { StreamResponse } from "@spaceguard/shared";
import { getTelemetryStream, getTelemetryPoints } from "@/lib/api";
import type { TelemetryDataPoint } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  "#60a5fa", // blue-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#f87171", // red-400
  "#a78bfa", // violet-400
  "#22d3ee", // cyan-400
  "#fb923c", // orange-400
  "#e879f9", // fuchsia-400
];

const PARAM_UNITS: Record<string, string> = {
  battery_voltage_v:       "V",
  solar_current_a:         "A",
  temperature_obc_c:       "°C",
  temperature_batt_c:      "°C",
  reaction_wheel_0_rpm:    "RPM",
  reaction_wheel_1_rpm:    "RPM",
  reaction_wheel_2_rpm:    "RPM",
  attitude_q1:             "",
  attitude_q2:             "",
  attitude_q3:             "",
  attitude_q4:             "",
  angular_rate_x_deg_s:    "°/s",
  angular_rate_y_deg_s:    "°/s",
  angular_rate_z_deg_s:    "°/s",
  star_tracker_status:     "",
  gps_altitude_km:         "km",
  signal_strength_dbm:     "dBm",
  uplink_locked:           "",
  bit_error_rate_log:      "log₁₀",
  link_margin_db:          "dB",
};

const TIME_RANGES = [
  { label: "1h",  hours: 1 },
  { label: "6h",  hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d",  hours: 168 },
] as const;

type TimeRange = (typeof TIME_RANGES)[number]["label"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rangeToWindow(hours: number): { from: Date; to: Date } {
  const to   = new Date();
  const from = new Date(to.getTime() - hours * 3_600_000);
  return { from, to };
}

/** Pivot flat [{time, parameterName, valueNumeric}] into [{time, p1, p2, ...}] for Recharts */
function pivotData(
  points: TelemetryDataPoint[],
  params: string[]
): Record<string, number | string>[] {
  const byTime = new Map<string, Record<string, number | string>>();
  for (const pt of points) {
    if (!params.includes(pt.parameterName)) continue;
    if (pt.valueNumeric === null) continue;
    let row = byTime.get(pt.time);
    if (!row) {
      row = { time: pt.time };
      byTime.set(pt.time, row);
    }
    row[pt.parameterName] = pt.valueNumeric;
  }
  return Array.from(byTime.values()).sort((a, b) =>
    String(a.time) < String(b.time) ? -1 : 1
  );
}

function fmtAxisTime(iso: string, hours: number): string {
  const d = new Date(iso);
  if (hours <= 1) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (hours <= 24) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtVal(v: number | undefined, unit: string): string {
  if (v === undefined || v === null) return "—";
  return `${v.toPrecision(5).replace(/\.?0+$/, "")} ${unit}`.trim();
}

// ---------------------------------------------------------------------------
// Latest values table row
// ---------------------------------------------------------------------------

interface ParamStat {
  name: string;
  latest: number | undefined;
  min: number | undefined;
  max: number | undefined;
  unit: string;
  quality: string;
}

function computeStats(points: TelemetryDataPoint[], params: string[]): ParamStat[] {
  const stats: Record<string, { vals: number[]; latest: number | undefined; quality: string }> = {};
  for (const param of params) {
    stats[param] = { vals: [], latest: undefined, quality: "GOOD" };
  }
  // Points are ordered by time ASC; last one = latest
  for (const pt of points) {
    if (!params.includes(pt.parameterName)) continue;
    if (pt.valueNumeric === null) continue;
    stats[pt.parameterName].vals.push(pt.valueNumeric);
    stats[pt.parameterName].latest = pt.valueNumeric;
    stats[pt.parameterName].quality = pt.quality;
  }
  return params.map((p) => ({
    name:    p,
    latest:  stats[p]?.latest,
    min:     stats[p]?.vals.length ? Math.min(...stats[p].vals) : undefined,
    max:     stats[p]?.vals.length ? Math.max(...stats[p].vals) : undefined,
    unit:    PARAM_UNITS[p] ?? "",
    quality: stats[p]?.quality ?? "GOOD",
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QualityDot({ quality }: { quality: string }) {
  const cls =
    quality === "GOOD"    ? "bg-emerald-400" :
    quality === "SUSPECT" ? "bg-amber-400"   :
                            "bg-red-400";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls}`} />;
}

interface ParamToggleProps {
  params: string[];
  selected: string[];
  onToggle: (p: string) => void;
  colorMap: Record<string, string>;
}

function ParamToggles({ params, selected, onToggle, colorMap }: ParamToggleProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {params.map((p) => {
        const active = selected.includes(p);
        const color  = colorMap[p] ?? "#60a5fa";
        return (
          <button
            key={p}
            onClick={() => onToggle(p)}
            className={[
              "px-2 py-0.5 rounded text-[11px] font-mono transition-all border",
              active
                ? "text-slate-900 border-transparent"
                : "text-slate-500 bg-transparent border-slate-700 hover:border-slate-500",
            ].join(" ")}
            style={active ? { backgroundColor: color, borderColor: color } : undefined}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TelemetryStreamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // Stream metadata
  const [stream,      setStream]      = useState<StreamResponse | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  // All parameter names available in the current window
  const [allParams,  setAllParams]    = useState<string[]>([]);
  // Currently plotted parameters
  const [selected,   setSelected]     = useState<string[]>([]);
  // Raw fetched points
  const [rawPoints,  setRawPoints]    = useState<TelemetryDataPoint[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError,   setDataError]   = useState<string | null>(null);

  const [timeRange,  setTimeRange]    = useState<TimeRange>("1h");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Load stream metadata once ----
  useEffect(() => {
    if (!id) return;
    getTelemetryStream(id)
      .then(setStream)
      .catch((e: unknown) => setStreamError(e instanceof Error ? e.message : "Failed to load stream"));
  }, [id]);

  // ---- Fetch data when timeRange or id changes ----
  const fetchData = useCallback(async () => {
    if (!id) return;
    const hours = TIME_RANGES.find((r) => r.label === timeRange)?.hours ?? 1;
    const { from, to } = rangeToWindow(hours);
    setLoadingData(true);
    setDataError(null);
    try {
      // Step 1: discovery fetch — small result, no param filter — to learn what params exist
      const discovery = await getTelemetryPoints({
        streamId: id,
        from: from.toISOString(),
        to:   to.toISOString(),
        perPage: 50,
      });
      const discovered = Array.from(new Set(discovery.data.map((p) => p.parameterName))).sort();
      setAllParams(discovered);

      // Decide which params to fetch fully
      let toFetch: string[];
      if (selected.length === 0 && discovered.length > 0) {
        // First load: default to first 2 params
        const defaults = discovered.slice(0, 2);
        setSelected(defaults);
        toFetch = defaults;
      } else {
        toFetch = selected;
      }

      if (toFetch.length === 0) {
        setRawPoints([]);
        return;
      }

      // Step 2: fetch each selected param separately with full perPage (5000 max)
      // 5000 covers: 1Hz × 1h = 3600 pts, 0.1Hz × 7d = 604 pts; AOCS (10Hz) is downsampled server-side for 7d
      const perParamResults = await Promise.all(
        toFetch.map((parameterName) =>
          getTelemetryPoints({
            streamId: id,
            from: from.toISOString(),
            to:   to.toISOString(),
            parameterName,
            perPage: 5000,
          })
        )
      );
      setRawPoints(perParamResults.flatMap((r) => r.data));
    } catch (e: unknown) {
      setDataError(e instanceof Error ? e.message : "Failed to load telemetry data");
    } finally {
      setLoadingData(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, timeRange]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // ---- Auto-refresh ----
  useEffect(() => {
    if (autoRefresh) {
      refreshTimerRef.current = setInterval(() => { void fetchData(); }, 5000);
    } else {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    }
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [autoRefresh, fetchData]);

  // ---- Derived data ----
  const hours      = TIME_RANGES.find((r) => r.label === timeRange)?.hours ?? 1;
  const colorMap   = Object.fromEntries(allParams.map((p, i) => [p, CHART_COLORS[i % CHART_COLORS.length]]));
  const chartData  = pivotData(rawPoints, selected);
  const stats      = computeStats(rawPoints, selected);

  // Fetch full data for a specific set of params (used when user toggles a param on)
  const fetchParamData = useCallback(async (params: string[]) => {
    if (!id || params.length === 0) return;
    const hours = TIME_RANGES.find((r) => r.label === timeRange)?.hours ?? 1;
    const { from, to } = rangeToWindow(hours);
    try {
      const results = await Promise.all(
        params.map((parameterName) =>
          getTelemetryPoints({ streamId: id, from: from.toISOString(), to: to.toISOString(), parameterName, perPage: 5000 })
        )
      );
      setRawPoints((prev) => {
        // Remove old data for these params, then append fresh data
        const otherPoints = prev.filter((pt) => !params.includes(pt.parameterName));
        return [...otherPoints, ...results.flatMap((r) => r.data)];
      });
    } catch {
      // non-critical; chart just won't show this param
    }
  }, [id, timeRange]);

  function toggleParam(p: string) {
    setSelected((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
      // If adding a param that has no data yet, fetch it
      if (!prev.includes(p)) {
        const alreadyLoaded = rawPoints.some((pt) => pt.parameterName === p);
        if (!alreadyLoaded) void fetchParamData([p]);
      }
      return next;
    });
  }

  // ---- Render ----
  if (streamError) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={16} />
          {streamError}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Back button + header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push("/telemetry")}
          className="mt-1 text-slate-500 hover:text-slate-300 transition-colors"
          aria-label="Back to streams"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-50 truncate">
              {stream?.name ?? <span className="text-slate-600">Loading…</span>}
            </h1>
            {stream && (
              <Badge
                variant={stream.status === "ACTIVE" ? "success" : "warning"}
                className="gap-1 text-[10px] shrink-0"
              >
                {stream.status === "ACTIVE" ? <Wifi size={9} /> : <WifiOff size={9} />}
                {stream.status}
              </Badge>
            )}
          </div>
          {stream && (
            <p className="text-slate-500 text-xs mt-0.5 font-mono">
              {stream.protocol}
              {stream.apid != null && <> · APID {stream.apid}</>}
              {stream.sampleRateHz != null && <> · {stream.sampleRateHz} Hz</>}
              <span className="ml-2 text-slate-600">{stream.id}</span>
            </p>
          )}
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Time range */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setTimeRange(r.label)}
              className={[
                "px-3 py-1 rounded text-xs font-medium transition-colors",
                timeRange === r.label
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-500 hover:text-slate-300",
              ].join(" ")}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchData()}
          disabled={loadingData}
          className="border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200 h-8"
        >
          <RefreshCw size={13} className={loadingData ? "animate-spin" : ""} />
        </Button>

        {/* Auto-refresh toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAutoRefresh((v) => !v)}
          className={[
            "border-slate-700 h-8 gap-1.5 text-xs",
            autoRefresh
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-slate-900 text-slate-400 hover:text-slate-200",
          ].join(" ")}
        >
          {autoRefresh ? <Pause size={12} /> : <Play size={12} />}
          {autoRefresh ? "Live" : "Auto"}
        </Button>

        {loadingData && (
          <span className="text-slate-500 text-xs flex items-center gap-1.5">
            <Activity size={12} className="animate-pulse" />
            Loading…
          </span>
        )}
      </div>

      {/* Parameter toggles */}
      {allParams.length > 0 && (
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-slate-500 shrink-0">Parameters:</span>
              <ParamToggles
                params={allParams}
                selected={selected}
                onToggle={toggleParam}
                colorMap={colorMap}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="pb-2 border-b border-slate-800">
          <CardTitle className="text-sm font-semibold text-slate-300">
            Time-Series Chart
            {rawPoints.length > 0 && (
              <span className="ml-2 text-slate-600 font-normal text-xs">
                {rawPoints.length.toLocaleString()} points
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 pb-2">
          {dataError ? (
            <div className="flex items-center gap-2 py-8 text-red-400 text-sm justify-center">
              <AlertCircle size={16} />
              {dataError}
            </div>
          ) : selected.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-slate-600 text-sm">
              Select one or more parameters above to plot
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-slate-600 text-sm">
              No data in the selected time window
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(v) => fmtAxisTime(String(v), hours)}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={false}
                  minTickGap={60}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v: number) => v.toPrecision(4).replace(/\.?0+$/, "")}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: "6px",
                    fontSize: "11px",
                    color: "#e2e8f0",
                  }}
                  labelFormatter={(label) => new Date(String(label)).toLocaleString()}
                  formatter={(value: number, name: string) => [
                    `${value.toPrecision(5).replace(/\.?0+$/, "")} ${PARAM_UNITS[name] ?? ""}`.trim(),
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px", color: "#94a3b8", paddingTop: "8px" }}
                />
                {selected.map((param) => (
                  <Line
                    key={param}
                    type="monotone"
                    dataKey={param}
                    stroke={colorMap[param]}
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Latest values table */}
      {stats.length > 0 && (
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader className="pb-2 border-b border-slate-800">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Clock size={13} className="text-blue-400" />
              Latest Values
              <span className="text-slate-600 font-normal text-xs">over {timeRange}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left text-[10px] font-medium uppercase tracking-widest text-slate-600 px-4 py-2">Parameter</th>
                  <th className="text-right text-[10px] font-medium uppercase tracking-widest text-slate-600 px-4 py-2">Latest</th>
                  <th className="text-right text-[10px] font-medium uppercase tracking-widest text-slate-600 px-4 py-2">Min</th>
                  <th className="text-right text-[10px] font-medium uppercase tracking-widest text-slate-600 px-4 py-2">Max</th>
                  <th className="text-right text-[10px] font-medium uppercase tracking-widest text-slate-600 px-4 py-2">Quality</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => (
                  <tr key={s.name} className={i % 2 === 0 ? "" : "bg-slate-800/20"}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: colorMap[s.name] ?? "#60a5fa" }}
                        />
                        <span className="text-slate-300 font-mono text-xs">{s.name}</span>
                        {s.unit && (
                          <span className="text-slate-600 text-[10px]">{s.unit}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-200 font-mono text-xs">
                      {fmtVal(s.latest, s.unit)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-400 font-mono text-xs">
                      {fmtVal(s.min, s.unit)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-400 font-mono text-xs">
                      {fmtVal(s.max, s.unit)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <QualityDot quality={s.quality} />
                        <span className="text-xs text-slate-500">{s.quality}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
