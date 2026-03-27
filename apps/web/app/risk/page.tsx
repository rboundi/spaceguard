"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Satellite,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { useOrg } from "@/lib/context";
import {
  getRiskOverview as fetchRiskOverview,
  storeRiskSnapshot,
  type RiskOverviewApi,
  type AssetRiskApi,
} from "@/lib/api";
import { assetTypeLabels, AssetType } from "@spaceguard/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskColor(score: number): string {
  if (score > 60) return "text-red-400";
  if (score > 30) return "text-amber-400";
  return "text-emerald-400";
}

function riskBg(score: number): string {
  if (score > 60) return "bg-red-500";
  if (score > 30) return "bg-amber-500";
  return "bg-emerald-500";
}

function riskBadge(score: number) {
  const variant = score > 60 ? "destructive" : score > 30 ? "warning" : "success";
  return (
    <Badge variant={variant} className="text-[10px] px-1.5 font-bold tabular-nums">
      {score}
    </Badge>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "IMPROVING") return <TrendingDown size={14} className="text-emerald-400" />;
  if (trend === "DEGRADING") return <TrendingUp size={14} className="text-red-400" />;
  return <Minus size={14} className="text-slate-500" />;
}

function trendLabel(trend: string): string {
  if (trend === "IMPROVING") return "Improving";
  if (trend === "DEGRADING") return "Degrading";
  return "Stable";
}

// ---------------------------------------------------------------------------
// Gauge component
// ---------------------------------------------------------------------------

function RiskGauge({ score, size = 160 }: { score: number; size?: number }) {
  const radius = (size - 20) / 2;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const startAngle = -210;
  const endAngle = 30;
  const range = endAngle - startAngle;
  const valueAngle = startAngle + (score / 100) * range;

  function polarToXY(angle: number, r: number) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const arcStart = polarToXY(startAngle, radius);
  const arcEnd = polarToXY(endAngle, radius);
  const arcValue = polarToXY(valueAngle, radius);
  const largeArc = valueAngle - startAngle > 180 ? 1 : 0;
  const largeArcBg = range > 180 ? 1 : 0;

  const color = score > 60 ? "#ef4444" : score > 30 ? "#f59e0b" : "#10b981";

  return (
    <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`}>
      {/* Background arc */}
      <path
        d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 ${largeArcBg} 1 ${arcEnd.x} ${arcEnd.y}`}
        fill="none"
        stroke="#334155"
        strokeWidth={10}
        strokeLinecap="round"
      />
      {/* Value arc */}
      {score > 0 && (
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 ${largeArc} 1 ${arcValue.x} ${arcValue.y}`}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
        />
      )}
      {/* Score text */}
      <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize={32} fontWeight="bold">
        {score}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#94a3b8" fontSize={11}>
        Risk Score
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RiskPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [data, setData] = useState<RiskOverviewApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshotting, setSnapshotting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!orgId) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const overview = await fetchRiskOverview(orgId);
      setData(overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load risk data");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgLoading) loadData();
  }, [orgLoading, loadData]);

  async function handleSnapshot() {
    if (!orgId) return;
    setSnapshotting(true);
    try {
      await storeRiskSnapshot(orgId);
      await loadData();
    } catch {
      // ignore
    } finally {
      setSnapshotting(false);
    }
  }

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-slate-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertTriangle size={16} />
          {error}
        </div>
      </div>
    );
  }

  if (!data || !orgId) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">
          Set up your organization to view risk scores.
        </p>
      </div>
    );
  }

  const { organization: org, assets, history } = data;

  // Radar chart data
  const radarData = [
    { dimension: "Compliance", value: org.breakdown.compliance },
    { dimension: "Threats", value: org.breakdown.threat },
    { dimension: "Alerts", value: org.breakdown.alerts },
    { dimension: "Supply Chain", value: org.breakdown.supplyChain },
    { dimension: "Config", value: org.breakdown.config },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Risk Overview</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Quantified risk scores across your space infrastructure
          </p>
        </div>
        <Button
          onClick={handleSnapshot}
          disabled={snapshotting}
          variant="ghost"
          className="text-xs text-slate-400 hover:text-slate-200"
          size="sm"
        >
          {snapshotting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
          Save Snapshot
        </Button>
      </div>

      {/* Top row: Gauge + Radar + Trend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Org Risk Gauge */}
        <Card className="border-slate-700 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">Organization Risk</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <RiskGauge score={org.overall} />
            <div className="flex items-center gap-2 mt-2">
              <TrendIcon trend={org.trend} />
              <span className="text-xs text-slate-400">{trendLabel(org.trend)}</span>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs">
              <div className="text-center">
                <p className="text-slate-500">Assets</p>
                <p className="text-slate-200 font-bold">{org.assetCount}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-500">High Risk</p>
                <p className="text-red-400 font-bold">{org.highRiskAssetCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Radar Breakdown */}
        <Card className="border-slate-700 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">Risk Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  dataKey="value"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Trend Chart */}
        <Card className="border-slate-700 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">Risk Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-[200px]">
                <p className="text-xs text-slate-600">
                  No historical data yet. Save a snapshot to start tracking.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={history}>
                  <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 9 }} width={30} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "11px" }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Risks */}
      {org.topRisks.length > 0 && (
        <Card className="border-slate-700 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">Top Risk Factors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {org.topRisks.map((risk, i) => (
                <div key={i} className="flex items-start gap-3 py-1.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[10px] font-bold text-red-400">
                    {i + 1}
                  </span>
                  <span className="text-xs text-slate-300">{risk}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Asset Risk Ranking */}
      <Card className="border-slate-700 bg-slate-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-300">Asset Risk Ranking</CardTitle>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No active assets.</p>
          ) : (
            <div className="space-y-2">
              {assets.map((a) => (
                <Link key={a.assetId} href={`/assets/${a.assetId}`} className="block">
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-800/50 transition-colors">
                    {/* Score bar */}
                    <div className="w-10 text-right">
                      {riskBadge(a.risk.overall)}
                    </div>
                    {/* Bar */}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-200">{a.assetName}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-[9px] px-1.5 py-0 font-normal">
                            {assetTypeLabels[a.assetType as AssetType] ?? a.assetType}
                          </Badge>
                          <TrendIcon trend={a.risk.trend} />
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${riskBg(a.risk.overall)}`}
                          style={{ width: `${a.risk.overall}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
