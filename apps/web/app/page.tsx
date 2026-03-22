"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrganizations, getDashboard } from "@/lib/api";
import type { DashboardResponse } from "@spaceguard/shared";
import { assetTypeLabels } from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 70) return "#10b981"; // emerald
  if (score >= 40) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

function scoreTextClass(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

const STATUS_BADGE: Record<
  string,
  "success" | "warning" | "danger" | "muted"
> = {
  COMPLIANT: "success",
  PARTIALLY_COMPLIANT: "warning",
  NON_COMPLIANT: "danger",
  NOT_ASSESSED: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  COMPLIANT: "Compliant",
  PARTIALLY_COMPLIANT: "Partial",
  NON_COMPLIANT: "Non-Compliant",
  NOT_ASSESSED: "Not Assessed",
};

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-800 ${className}`}
      aria-hidden="true"
    />
  );
}

function StatCardSkeleton() {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <Skeleton className="h-3 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-10 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Setup prompt (no org)
// ---------------------------------------------------------------------------

function SetupPrompt() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
      <div className="text-5xl">🛰️</div>
      <h2 className="text-xl font-semibold text-slate-200">
        Welcome to SpaceGuard
      </h2>
      <p className="text-slate-400 text-sm text-center max-w-sm">
        Set up your organization to start tracking NIS2 compliance for your
        space infrastructure.
      </p>
      <Link
        href="/assets"
        className="mt-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
      >
        Get started
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row 1 stat cards
// ---------------------------------------------------------------------------

function ScoreCard({ score }: { score: number }) {
  const color = scoreColor(score);
  const pieData = [
    { name: "Compliant", value: score },
    { name: "Remaining", value: 100 - score },
  ];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-0 pt-4 px-4">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-slate-500">
          Compliance Score
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex items-center gap-3">
        <div className="relative w-20 h-20 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                innerRadius={26}
                outerRadius={36}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                strokeWidth={0}
              >
                <Cell fill={color} />
                <Cell fill="#1e293b" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <span
            className="absolute inset-0 flex items-center justify-center text-sm font-bold"
            style={{ color }}
          >
            {score}%
          </span>
        </div>
        <div>
          <p className={`text-3xl font-bold ${scoreTextClass(score)}`}>
            {score}%
          </p>
          <p className="text-xs text-slate-500 mt-0.5">NIS2 Article 21</p>
          <p className="text-xs text-slate-600 mt-1">
            {score >= 70
              ? "Good posture"
              : score >= 40
              ? "Needs improvement"
              : "Critical gaps"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function AssetsCard({ summary }: { summary: DashboardResponse["assetsSummary"] }) {
  // Build a readable breakdown string (top 3 types)
  const topTypes = Object.entries(summary.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => {
      const label =
        assetTypeLabels[type as keyof typeof assetTypeLabels] ?? type;
      return `${count} ${label.toLowerCase()}${count !== 1 ? "s" : ""}`;
    });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-0 pt-4 px-4">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-slate-500">
          Total Assets
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-4xl font-bold text-slate-100">{summary.total}</p>
        {topTypes.length > 0 ? (
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {topTypes.join(", ")}
          </p>
        ) : (
          <p className="text-xs text-slate-600 mt-1">No assets registered</p>
        )}
      </CardContent>
    </Card>
  );
}

function GapsCard({
  byStatus,
}: {
  byStatus: DashboardResponse["byStatus"];
}) {
  const gaps =
    (byStatus.NOT_ASSESSED ?? 0) + (byStatus.NON_COMPLIANT ?? 0);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-0 pt-4 px-4">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-slate-500">
          Open Gaps
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p
          className={`text-4xl font-bold ${
            gaps > 0 ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {gaps}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {byStatus.NON_COMPLIANT ?? 0} non-compliant,{" "}
          {byStatus.NOT_ASSESSED ?? 0} not assessed
        </p>
      </CardContent>
    </Card>
  );
}

function AssessedCard({
  byStatus,
  total,
}: {
  byStatus: DashboardResponse["byStatus"];
  total: number;
}) {
  const assessed =
    (byStatus.COMPLIANT ?? 0) +
    (byStatus.NON_COMPLIANT ?? 0) +
    (byStatus.PARTIALLY_COMPLIANT ?? 0);
  const pct = total > 0 ? Math.round((assessed / total) * 100) : 0;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-0 pt-4 px-4">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-slate-500">
          Assessed
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-4xl font-bold text-slate-100">
          {assessed}
          <span className="text-xl text-slate-500 font-normal">
            {" "}
            of {total}
          </span>
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1">{pct}% reviewed</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 2 - Category bar chart
// ---------------------------------------------------------------------------

interface CatBarEntry {
  category: string;
  shortCategory: string;
  compliant: number;
  remaining: number;
  score: number;
}

// Truncate long category names for axis display
function shortCat(cat: string): string {
  const map: Record<string, string> = {
    "Risk Management": "Risk Mgmt",
    "Incident Handling": "Incidents",
    "Business Continuity": "Continuity",
    "Supply Chain Security": "Supply Chain",
    "Network Security": "Network Sec.",
    "Access Control": "Access Ctrl",
    "Cryptography": "Crypto",
    "Physical Security": "Physical",
    "Vulnerability Management": "Vuln. Mgmt",
    "Policies & Governance": "Governance",
  };
  return map[cat] ?? cat;
}

function CategoryChart({ byCategory }: { byCategory: DashboardResponse["byCategory"] }) {
  const data: CatBarEntry[] = byCategory.map((c) => ({
    category: c.category,
    shortCategory: shortCat(c.category),
    compliant: c.score,
    remaining: 100 - c.score,
    score: c.score,
  }));

  // Custom label rendered inside the compliant bar.
  // Recharts requires the label renderer to always return a ReactElement (not null),
  // so we return an empty <g> when the bar is too narrow to fit the text.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = (props: any): React.ReactElement => {
    const { x, y, width, height, value } = props as {
      x: number;
      y: number;
      width: number;
      height: number;
      value: number;
    };
    if (width < 30) return <g />;
    return (
      <text
        x={x + width / 2}
        y={y + height / 2 + 4}
        fill="#fff"
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
      >
        {value}%
      </text>
    );
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-slate-200">
          Compliance by Category
        </CardTitle>
        <p className="text-xs text-slate-500 mt-0.5">
          NIS2 Article 21 domain scores
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
            barSize={16}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              hide
            />
            <YAxis
              type="category"
              dataKey="shortCategory"
              width={110}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 6,
                fontSize: 12,
                color: "#e2e8f0",
              }}
              formatter={(value: number, name: string) =>
                name === "compliant"
                  ? [`${value}%`, "Compliant"]
                  : [`${value}%`, "Remaining"]
              }
            />
            <Bar
              dataKey="compliant"
              name="compliant"
              stackId="a"
              fill="#10b981"
              radius={[3, 0, 0, 3]}
              label={renderLabel}
            />
            <Bar
              dataKey="remaining"
              name="remaining"
              stackId="a"
              fill="#1e293b"
              radius={[0, 3, 3, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 3 left - Gap Analysis table
// ---------------------------------------------------------------------------

function GapTable({ gaps }: { gaps: DashboardResponse["gaps"] }) {
  const filtered = gaps.filter(
    (g) => g.status === "NON_COMPLIANT" || g.status === "NOT_ASSESSED"
  );

  return (
    <Card className="bg-slate-900 border-slate-800 flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-slate-200">
          Gap Analysis
        </CardTitle>
        <p className="text-xs text-slate-500 mt-0.5">
          {filtered.length} requirement{filtered.length !== 1 ? "s" : ""}{" "}
          requiring attention
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-0 flex-1">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-emerald-400 font-medium text-sm">
              All requirements addressed
            </p>
            <p className="text-slate-500 text-xs mt-1">
              No gaps identified
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-72">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">
                    Requirement
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">
                    Category
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2 text-right">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((gap) => (
                  <TableRow
                    key={gap.requirementId}
                    className="border-slate-800 hover:bg-slate-800/40"
                  >
                    <TableCell className="px-4 py-2.5 text-xs text-slate-300 max-w-[200px]">
                      <span className="line-clamp-2">{gap.title}</span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-xs text-slate-500">
                      {gap.category}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right">
                      <Badge
                        variant={STATUS_BADGE[gap.status] ?? "muted"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {STATUS_LABEL[gap.status] ?? gap.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 3 right - Asset summary
// ---------------------------------------------------------------------------

const ASSET_TYPE_ICONS: Record<string, string> = {
  LEO_SATELLITE: "🛰️",
  MEO_SATELLITE: "🛰️",
  GEO_SATELLITE: "🛰️",
  GROUND_STATION: "📡",
  CONTROL_CENTER: "🖥️",
  UPLINK: "📶",
  DOWNLINK: "📶",
  INTER_SATELLITE_LINK: "🔗",
  DATA_CENTER: "🗄️",
  NETWORK_SEGMENT: "🌐",
};

const CRIT_BADGE: Record<string, "danger" | "warning" | "default" | "muted"> =
  {
    CRITICAL: "danger",
    HIGH: "warning",
    MEDIUM: "default",
    LOW: "muted",
  };

function AssetSummary({
  summary,
}: {
  summary: DashboardResponse["assetsSummary"];
}) {
  const types = Object.entries(summary.byType).sort((a, b) => b[1] - a[1]);
  const crits = Object.entries(summary.byCriticality).sort(
    (a, b) =>
      ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(a[0]) -
      ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(b[0])
  );

  return (
    <Card className="bg-slate-900 border-slate-800 flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-slate-200">
          Assets
        </CardTitle>
        <p className="text-xs text-slate-500 mt-0.5">
          {summary.total} registered asset{summary.total !== 1 ? "s" : ""}
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex flex-col gap-4">
        {/* By type */}
        {types.length > 0 ? (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">
              By Type
            </p>
            <div className="space-y-1.5">
              {types.map(([type, count]) => {
                const label =
                  assetTypeLabels[type as keyof typeof assetTypeLabels] ??
                  type;
                const icon = ASSET_TYPE_ICONS[type] ?? "📦";
                return (
                  <div
                    key={type}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs text-slate-400 flex items-center gap-1.5">
                      <span>{icon}</span>
                      {label}
                    </span>
                    <span className="text-xs font-semibold text-slate-300">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-600 py-4 text-center">
            No assets registered yet
          </p>
        )}

        {/* By criticality */}
        {crits.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">
              By Criticality
            </p>
            <div className="flex flex-wrap gap-2">
              {crits.map(([crit, count]) => (
                <div key={crit} className="flex items-center gap-1">
                  <Badge
                    variant={CRIT_BADGE[crit] ?? "muted"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {crit}
                  </Badge>
                  <span className="text-xs text-slate-400">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [noOrg, setNoOrg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch first organization
        const { data: orgs } = await getOrganizations();
        if (orgs.length === 0) {
          setNoOrg(true);
          return;
        }
        const org = orgs[0];
        setOrgId(org.id);
        setOrgName(org.name);

        // 2. Fetch dashboard for that org
        const dash = await getDashboard(org.id);
        setDashboard(dash);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard"
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="mb-4">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-3">
            <Skeleton className="h-72 rounded-lg" />
          </div>
          <div className="col-span-2">
            <Skeleton className="h-72 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // ---- No org ----
  if (noOrg) return <SetupPrompt />;

  // ---- Error ----
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  // ---- Data ----
  if (!dashboard) return null;

  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {orgName} &mdash; NIS2 compliance posture
          </p>
        </div>
        <span className="text-xs text-slate-600 mt-1">
          {new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      {/* Row 1 - Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ScoreCard score={dashboard.overallScore} />
        <AssetsCard summary={dashboard.assetsSummary} />
        <GapsCard byStatus={dashboard.byStatus} />
        <AssessedCard
          byStatus={dashboard.byStatus}
          total={dashboard.totalRequirements}
        />
      </div>

      {/* Row 2 - Category chart */}
      <CategoryChart byCategory={dashboard.byCategory} />

      {/* Row 3 - Gap table + Asset summary */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <GapTable gaps={dashboard.gaps} />
        </div>
        <div className="col-span-2">
          <AssetSummary summary={dashboard.assetsSummary} />
        </div>
      </div>
    </div>
  );
}
