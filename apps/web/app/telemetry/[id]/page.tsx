"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  ReferenceLine,
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
  Brain,
  Eye,
  EyeOff,
  Zap,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import type { StreamResponse } from "@spaceguard/shared";
import { getTelemetryStream, getTelemetryPoints, getAnomalyBaselines, getAnomalyStats } from "@/lib/api";
import type { TelemetryDataPoint, BaselineResponse, AnomalyStatsResponse } from "@/lib/api";
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
  temperature_obc_c:       "C",
  temperature_batt_c:      "C",
  reaction_wheel_0_rpm:    "RPM",
  reaction_wheel_1_rpm:    "RPM",
  reaction_wheel_2_rpm:    "RPM",
  attitude_q1:             "",
  attitude_q2:             "",
  attitude_q3:             "",
  attitude_q4:             "",
  angular_rate_x_deg_s:    "deg/s",
  angular_rate_y_deg_s:    "deg/s",
  angular_rate_z_deg_s:    "deg/s",
  star_tracker_status:     "",
  gps_altitude_km:         "km",
  signal_strength_dbm:     "dBm",
  uplink_locked:           "",
  bit_error_rate_log:      "log10",
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

/** Add baseline envelope columns to pivoted chart data */
function addBaselineEnvelope(
  chartRows: Record<string, number | string>[],
  baselines: BaselineResponse[],
  params: string[],
): Record<string, number | string>[] {
  // Build a lookup: paramName -> baseline
  const blMap = new Map<string, BaselineResponse>();
  for (const bl of baselines) {
    blMap.set(bl.parameterName, bl);
  }

  return chartRows.map((row) => {
    const newRow = { ...row };
    for (const param of params) {
      const bl = blMap.get(param);
      if (!bl || bl.sampleCount < 30) continue;
      const upper = bl.mean + 3 * bl.stdDeviation;
      const lower = bl.mean - 3 * bl.stdDeviation;
      newRow[`${param}__upper`] = upper;
      newRow[`${param}__lower`] = lower;
      newRow[`${param}__range`] = [lower, upper] as unknown as number;

      // Check if point is anomalous (outside 3-sigma)
      const val = row[param] as number | undefined;
      if (val !== undefined && (val > upper || val < lower)) {
        newRow[`${param}__anomaly`] = val;
        const zScore = bl.stdDeviation > 0
          ? Math.abs(val - bl.mean) / bl.stdDeviation
          : 0;
        newRow[`${param}__zscore`] = Number(zScore.toFixed(2));
        newRow[`${param}__expected_low`] = Number(lower.toPrecision(5));
        newRow[`${param}__expected_high`] = Number(upper.toPrecision(5));
        const devPct = bl.mean !== 0
          ? Math.abs(((val - bl.mean) / bl.mean) * 100)
          : 0;
        newRow[`${param}__dev_pct`] = Number(devPct.toFixed(1));
      }
    }
    return newRow;
  });
}

function fmtAxisTime(iso: string, hours: number): string {
  const d = new Date(iso);
  if (hours <= 1) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (hours <= 24) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtVal(v: number | undefined, unit: string): string {
  if (v === undefined || v === null) return "-";
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
// Baseline Health Indicator
// ---------------------------------------------------------------------------

function BaselineHealthDot({ sampleCount }: { sampleCount: number }) {
  let cls: string;
  let label: string;
  if (sampleCount >= 1000) {
    cls = "bg-emerald-400";
    label = "Trained";
  } else if (sampleCount >= 100) {
    cls = "bg-amber-400";
    label = "Learning";
  } else {
    cls = "bg-red-400";
    label = "Insufficient";
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />
      <span className="text-[10px] text-slate-500">{label} ({sampleCount.toLocaleString()})</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anomaly Overview Card
// ---------------------------------------------------------------------------

interface AnomalyOverviewProps {
  baselines: BaselineResponse[];
  anomalyStats: AnomalyStatsResponse | null;
  loading: boolean;
}

function AnomalyOverviewCard({ baselines, anomalyStats, loading }: AnomalyOverviewProps) {
  if (loading) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="pb-2 border-b border-slate-800">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Brain size={13} className="text-violet-400" />
            AI Anomaly Detection
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-800 rounded w-3/4" />
            <div className="h-4 bg-slate-800 rounded w-1/2" />
            <div className="h-4 bg-slate-800 rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isLearning = anomalyStats?.learningMode ?? false;
  const anomalyRate = anomalyStats?.anomalyRate ?? 0;
  const topParams = anomalyStats?.topAnomalousParameters ?? [];

  // Sort baselines by anomaly frequency from topParams
  const paramRanking = topParams.length > 0
    ? topParams
    : baselines
        .filter((b) => b.sampleCount >= 30)
        .map((b) => ({ parameterName: b.parameterName, anomalyCount: 0, lastZScore: 0 }));

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader className="pb-2 border-b border-slate-800">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Brain size={13} className="text-violet-400" />
          AI Anomaly Detection
          {isLearning && (
            <Badge variant="warning" className="text-[10px] ml-2 gap-1">
              <Activity size={9} className="animate-pulse" />
              Learning Mode
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-center">
            <p className="text-lg font-bold text-violet-400">{baselines.length}</p>
            <p className="text-[9px] uppercase tracking-wider text-slate-500">Baselines</p>
          </div>
          <div className="rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-center">
            <p className={`text-lg font-bold ${anomalyRate > 5 ? "text-red-400" : anomalyRate > 1 ? "text-amber-400" : "text-emerald-400"}`}>
              {anomalyRate.toFixed(1)}%
            </p>
            <p className="text-[9px] uppercase tracking-wider text-slate-500">Anomaly Rate</p>
          </div>
          <div className="rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-center">
            <p className="text-lg font-bold text-blue-400">
              {baselines.filter((b) => b.sampleCount >= 1000).length}/{baselines.length}
            </p>
            <p className="text-[9px] uppercase tracking-wider text-slate-500">Trained</p>
          </div>
        </div>

        {/* Parameter ranking by anomaly frequency */}
        {paramRanking.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">
              Parameters by Anomaly Frequency (24h)
            </p>
            <div className="space-y-1.5">
              {paramRanking.slice(0, 8).map((p) => {
                const bl = baselines.find((b) => b.parameterName === p.parameterName);
                return (
                  <div
                    key={p.parameterName}
                    className="flex items-center justify-between rounded-md border border-slate-700/50 bg-slate-800/20 px-3 py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs text-slate-300 font-mono truncate">{p.parameterName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {p.anomalyCount > 0 && (
                        <span className="text-[10px] text-red-400 font-medium">
                          {p.anomalyCount} anomalies
                        </span>
                      )}
                      {p.lastZScore > 0 && (
                        <span className="text-[10px] font-mono text-amber-400">
                          z={p.lastZScore.toFixed(1)}
                        </span>
                      )}
                      {bl && <BaselineHealthDot sampleCount={bl.sampleCount} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {baselines.length === 0 && !isLearning && (
          <div className="text-center py-4">
            <Brain size={24} className="mx-auto text-slate-600 mb-2" />
            <p className="text-xs text-slate-500">No baselines established yet.</p>
            <p className="text-[10px] text-slate-600 mt-1">
              Baselines are built automatically as telemetry flows in.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip for anomaly data
// ---------------------------------------------------------------------------

interface AnomalyTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string; color: string; payload: Record<string, unknown> }>;
  label?: string;
  baselines: BaselineResponse[];
  showBaseline: boolean;
}

function AnomalyTooltip({ active, payload, label, baselines, showBaseline }: AnomalyTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload ?? {};

  // Filter to main data lines only (not envelope/anomaly scatter)
  const mainEntries = payload.filter((p) =>
    !p.dataKey.includes("__") && p.dataKey !== "time"
  );

  return (
    <div className="bg-[#0f172a] border border-slate-700 rounded-md px-3 py-2 text-[11px] shadow-lg max-w-xs">
      <p className="text-slate-400 mb-1.5">{label ? new Date(String(label)).toLocaleString() : ""}</p>
      {mainEntries.map((entry) => {
        const paramName = entry.dataKey;
        const val = entry.value;
        const unit = PARAM_UNITS[paramName] ?? "";
        const zscore = row[`${paramName}__zscore`] as number | undefined;
        const isAnomaly = zscore !== undefined;

        return (
          <div key={paramName} className="mb-1">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className={`font-mono ${isAnomaly ? "text-red-400 font-semibold" : "text-slate-200"}`}>
                {paramName}: {val?.toPrecision(5).replace(/\.?0+$/, "")} {unit}
              </span>
            </div>
            {isAnomaly && showBaseline && (
              <div className="ml-4 mt-0.5 space-y-0.5">
                <p className="text-red-400">
                  Z-score: {zscore?.toFixed(2)} | Deviation: {row[`${paramName}__dev_pct`] as number}%
                </p>
                <p className="text-slate-500">
                  Expected: [{row[`${paramName}__expected_low`] as number} .. {row[`${paramName}__expected_high`] as number}] {unit}
                </p>
              </div>
            )}
          </div>
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
  const fetchAbortRef = useRef<AbortController | null>(null);
  const selectedRef = useRef<string[]>(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // Anomaly detection state
  const [baselines, setBaselines] = useState<BaselineResponse[]>([]);
  const [anomalyStats, setAnomalyStats] = useState<AnomalyStatsResponse | null>(null);
  const [loadingAnomaly, setLoadingAnomaly] = useState(false);
  const [showBaseline, setShowBaseline] = useState(true);
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);

  // ---- Load stream metadata once ----
  useEffect(() => {
    if (!id) return;
    getTelemetryStream(id)
      .then(setStream)
      .catch((e: unknown) => setStreamError(e instanceof Error ? e.message : "Failed to load stream"));
  }, [id]);

  // ---- Fetch anomaly baselines and stats ----
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadAnomaly() {
      setLoadingAnomaly(true);
      try {
        const [bl, stats] = await Promise.all([
          getAnomalyBaselines(id!).catch(() => ({ data: [], total: 0 })),
          getAnomalyStats(id!).catch(() => null),
        ]);
        if (cancelled) return;
        setBaselines(bl.data);
        setAnomalyStats(stats);
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setLoadingAnomaly(false);
      }
    }
    void loadAnomaly();
    return () => { cancelled = true; };
  }, [id]);

  // ---- Fetch data when timeRange or id changes ----
  const fetchData = useCallback(async () => {
    if (!id) return;

    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    const hours = TIME_RANGES.find((r) => r.label === timeRange)?.hours ?? 1;
    const { from, to } = rangeToWindow(hours);
    setLoadingData(true);
    setDataError(null);
    try {
      // Step 1: discovery fetch
      const discovery = await getTelemetryPoints({
        streamId: id,
        from: from.toISOString(),
        to:   to.toISOString(),
        perPage: 50,
      });

      if (controller.signal.aborted) return;

      const discovered = Array.from(new Set(discovery.data.map((p) => p.parameterName))).sort();
      setAllParams(discovered);

      const currentSelected = selectedRef.current;
      let toFetch: string[];
      if (currentSelected.length === 0 && discovered.length > 0) {
        const defaults = discovered.slice(0, 2);
        setSelected(defaults);
        toFetch = defaults;
      } else {
        toFetch = currentSelected;
      }

      if (toFetch.length === 0) {
        setRawPoints([]);
        return;
      }

      // Step 2: fetch each selected param
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

      if (controller.signal.aborted) return;

      setRawPoints(perParamResults.flatMap((r) => r.data));
    } catch (e: unknown) {
      if (controller.signal.aborted) return;
      setDataError(e instanceof Error ? e.message : "Failed to load telemetry data");
    } finally {
      setLoadingData(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, timeRange]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    return () => { fetchAbortRef.current?.abort(); };
  }, []);

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

  const rawChartData = useMemo(() => pivotData(rawPoints, selected), [rawPoints, selected]);

  // Add baseline envelope data
  const chartDataWithBaseline = useMemo(() => {
    if (!showBaseline || baselines.length === 0) return rawChartData;
    return addBaselineEnvelope(rawChartData, baselines, selected);
  }, [rawChartData, baselines, selected, showBaseline]);

  // Filter to anomalies only if toggle is on
  const chartData = useMemo(() => {
    if (!showAnomaliesOnly) return chartDataWithBaseline;
    return chartDataWithBaseline.filter((row) =>
      selected.some((param) => row[`${param}__anomaly`] !== undefined)
    );
  }, [chartDataWithBaseline, showAnomaliesOnly, selected]);

  const stats = computeStats(rawPoints, selected);

  // Count anomalous points in current view
  const anomalyCount = useMemo(() => {
    let count = 0;
    for (const row of chartDataWithBaseline) {
      for (const param of selected) {
        if (row[`${param}__anomaly`] !== undefined) count++;
      }
    }
    return count;
  }, [chartDataWithBaseline, selected]);

  // Fetch full data for a specific set of params
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
      if (!mountedRef.current) return;
      setRawPoints((prev) => {
        const otherPoints = prev.filter((pt) => !params.includes(pt.parameterName));
        return [...otherPoints, ...results.flatMap((r) => r.data)];
      });
    } catch {
      // non-critical
    }
  }, [id, timeRange]);

  function toggleParam(p: string) {
    setSelected((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
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
              {stream?.name ?? <span className="text-slate-600">Loading...</span>}
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
              {stream.apid != null && <> | APID {stream.apid}</>}
              {stream.sampleRateHz != null && <> | {stream.sampleRateHz} Hz</>}
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

        {/* Separator */}
        <div className="w-px h-6 bg-slate-700" />

        {/* Show Baseline toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowBaseline((v) => !v)}
          className={[
            "h-8 gap-1.5 text-xs border-slate-700",
            showBaseline
              ? "bg-violet-500/10 text-violet-400 border-violet-500/30"
              : "bg-slate-900 text-slate-400 hover:text-slate-200",
          ].join(" ")}
        >
          {showBaseline ? <Eye size={12} /> : <EyeOff size={12} />}
          Baseline
        </Button>

        {/* Show Anomalies Only toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAnomaliesOnly((v) => !v)}
          className={[
            "h-8 gap-1.5 text-xs border-slate-700",
            showAnomaliesOnly
              ? "bg-red-500/10 text-red-400 border-red-500/30"
              : "bg-slate-900 text-slate-400 hover:text-slate-200",
          ].join(" ")}
        >
          <Zap size={12} />
          Anomalies Only
          {anomalyCount > 0 && (
            <span className="text-[10px] bg-red-500/20 text-red-300 px-1 rounded">
              {anomalyCount}
            </span>
          )}
        </Button>

        {loadingData && (
          <span className="text-slate-500 text-xs flex items-center gap-1.5">
            <Activity size={12} className="animate-pulse" />
            Loading...
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
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <BarChart3 size={13} className="text-blue-400" />
            Time-Series Chart
            {rawPoints.length > 0 && (
              <span className="ml-2 text-slate-600 font-normal text-xs">
                {rawPoints.length.toLocaleString()} points
              </span>
            )}
            {anomalyCount > 0 && showBaseline && (
              <span className="ml-2 text-red-400 font-normal text-xs flex items-center gap-1">
                <Zap size={10} />
                {anomalyCount} anomalies detected
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
              {showAnomaliesOnly
                ? "No anomalies found in the selected time window"
                : "No data in the selected time window"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
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
                  content={<AnomalyTooltip baselines={baselines} showBaseline={showBaseline} />}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px", color: "#94a3b8", paddingTop: "8px" }}
                />
                {/* Baseline envelope (shaded area between lower and upper) */}
                {showBaseline && selected.map((param) => {
                  const bl = baselines.find((b) => b.parameterName === param);
                  if (!bl || bl.sampleCount < 30) return null;
                  const color = colorMap[param] ?? "#60a5fa";
                  return (
                    <Area
                      key={`${param}__envelope`}
                      type="monotone"
                      dataKey={`${param}__upper`}
                      stroke="none"
                      fill={color}
                      fillOpacity={0.08}
                      baseLine={bl.mean - 3 * bl.stdDeviation}
                      isAnimationActive={false}
                      legendType="none"
                      tooltipType="none"
                    />
                  );
                })}
                {/* Main data lines */}
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
                {/* Anomaly scatter points (red dots) */}
                {showBaseline && selected.map((param) => {
                  const bl = baselines.find((b) => b.parameterName === param);
                  if (!bl || bl.sampleCount < 30) return null;
                  return (
                    <Scatter
                      key={`${param}__anomaly_scatter`}
                      dataKey={`${param}__anomaly`}
                      fill="#ef4444"
                      shape="circle"
                      isAnimationActive={false}
                      legendType="none"
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Anomaly Overview + Latest Values side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Anomaly Overview (2 cols) */}
        <div className="lg:col-span-2">
          <AnomalyOverviewCard
            baselines={baselines}
            anomalyStats={anomalyStats}
            loading={loadingAnomaly}
          />
        </div>

        {/* Latest values table (3 cols) */}
        <div className="lg:col-span-3">
          {stats.length > 0 && (
            <Card className="border-slate-800 bg-slate-900 h-full">
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
                      {showBaseline && (
                        <th className="text-right text-[10px] font-medium uppercase tracking-widest text-slate-600 px-4 py-2">Baseline</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s, i) => {
                      const bl = baselines.find((b) => b.parameterName === s.name);
                      return (
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
                          {showBaseline && (
                            <td className="px-4 py-2.5 text-right">
                              {bl ? (
                                <BaselineHealthDot sampleCount={bl.sampleCount} />
                              ) : (
                                <span className="text-[10px] text-slate-600">N/A</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
