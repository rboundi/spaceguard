"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
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
import {
  getDashboard,
  getAlerts,
  getAlertStats,
  getIncidents,
  getTelemetryStreams,
  getDetectionRules,
  getAnomalyBaselines,
  getAnomalyStats,
} from "@/lib/api";
import type { AlertResponse, AlertStats, IncidentResponse, BaselineResponse, AnomalyStatsResponse } from "@/lib/api";
import type { StreamResponse } from "@spaceguard/shared";
import { useOrg } from "@/lib/context";
import type { DashboardResponse } from "@spaceguard/shared";
import {
  ShieldCheck,
  Bell,
  AlertTriangle,
  Waves,
  Satellite,
  Clock,
  ArrowRight,
  Activity,
  CheckCircle2,
  XCircle,
  BookOpen,
  Rocket,
  Link2,
  Brain,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreTextClass(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Format a future deadline as "Xh Ym" or "Xd" remaining. */
function timeUntil(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "muted"> = {
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

function MetricCardSkeleton() {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="px-4 py-4">
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-28" />
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
      <div className="text-5xl">&#x1F6F0;&#xFE0F;</div>
      <h2 className="text-xl font-semibold text-slate-200">
        Welcome to SpaceGuard
      </h2>
      <p className="text-slate-400 text-sm text-center max-w-sm">
        Set up your organization to start tracking NIS2 and ENISA compliance
        for your space infrastructure.
      </p>
      <Link
        href="/onboarding"
        className="mt-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
      >
        Get started
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row 1 - Key Metric Cards
// ---------------------------------------------------------------------------

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtitle: string;
  href?: string;
  accentClass?: string;
}

function MetricCard({ icon, label, value, subtitle, href, accentClass = "text-slate-100" }: MetricCardProps) {
  const content = (
    <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors group">
      <CardContent className="px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {label}
          </span>
          <span className="text-slate-600 group-hover:text-slate-500 transition-colors">
            {icon}
          </span>
        </div>
        <p className={`text-3xl font-bold ${accentClass}`}>{value}</p>
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }
  return content;
}

// ---------------------------------------------------------------------------
// Row 2 Left - Recent Alerts Table
// ---------------------------------------------------------------------------

const SEV_BADGE_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-300 border-red-500/40",
  HIGH:     "bg-amber-500/20 text-amber-300 border-amber-500/40",
  MEDIUM:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  LOW:      "bg-blue-500/20 text-blue-300 border-blue-500/40",
};

const ALERT_STATUS_STYLE: Record<string, string> = {
  NEW:            "bg-red-500/20 text-red-300 border-red-500/40",
  INVESTIGATING:  "bg-amber-500/20 text-amber-300 border-amber-500/40",
  RESOLVED:       "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  FALSE_POSITIVE: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function RecentAlertsCard({ alerts }: { alerts: AlertResponse[] }) {
  return (
    <Card className="bg-slate-900 border-slate-800 flex flex-col h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">
            Recent Alerts
          </CardTitle>
          <Link
            href="/alerts"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            View all <ArrowRight size={10} />
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">Latest triggered events</p>
      </CardHeader>
      <CardContent className="px-0 pb-0 flex-1">
        {alerts.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-slate-500 text-sm font-medium">No alerts yet</p>
            <p className="text-slate-600 text-xs mt-1">
              Detection engine is active and monitoring.
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Alert</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Severity</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Status</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((a) => (
                  <TableRow
                    key={a.id}
                    className="border-slate-800 hover:bg-slate-800/40"
                  >
                    <TableCell className="px-4 py-2.5">
                      <Link href="/alerts" className="group">
                        <span className="text-xs text-slate-300 group-hover:text-blue-400 transition-colors line-clamp-1">
                          {a.title}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      <span
                        className={[
                          "inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                          SEV_BADGE_STYLE[a.severity] ?? "",
                        ].join(" ")}
                      >
                        {a.severity}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      <span
                        className={[
                          "inline-flex items-center text-[9px] font-medium px-1 py-0 rounded border",
                          ALERT_STATUS_STYLE[a.status] ?? "",
                        ].join(" ")}
                      >
                        {a.status.replaceAll("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right">
                      <span className="text-[11px] text-slate-500">
                        {relTime(a.triggeredAt)}
                      </span>
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
// Row 2 Right - NIS2 Deadlines / Incident Overview
// ---------------------------------------------------------------------------

const INCIDENT_STATUS_ACTIVE = new Set([
  "DETECTED", "TRIAGING", "INVESTIGATING", "CONTAINING", "ERADICATING", "RECOVERING",
]);

function IncidentOverviewCard({ incidents }: { incidents: IncidentResponse[] }) {
  const active = incidents.filter((i) => INCIDENT_STATUS_ACTIVE.has(i.status));
  const significant = active.filter((i) => i.nis2Classification === "SIGNIFICANT");

  // NIS2 regulatory deadlines from detected date:
  //   Early warning: 24h, Incident notification: 72h, Final report: 30 days
  interface Deadline {
    incidentTitle: string;
    label: string;
    deadlineTime: Date;
    overdue: boolean;
  }

  const deadlines: Deadline[] = [];
  for (const inc of significant.slice(0, 5)) {
    const detected = inc.detectedAt ? new Date(inc.detectedAt) : new Date(inc.createdAt);
    const rules = [
      { label: "Early warning (24h)", hoursOffset: 24 },
      { label: "Notification (72h)", hoursOffset: 72 },
      { label: "Final report (30d)", hoursOffset: 30 * 24 },
    ];
    for (const rule of rules) {
      const dl = new Date(detected.getTime() + rule.hoursOffset * 60 * 60 * 1000);
      if (dl.getTime() > Date.now()) {
        deadlines.push({
          incidentTitle: inc.title,
          label: rule.label,
          deadlineTime: dl,
          overdue: false,
        });
      } else {
        deadlines.push({
          incidentTitle: inc.title,
          label: rule.label,
          deadlineTime: dl,
          overdue: true,
        });
      }
    }
  }
  // Sort by deadline (soonest first)
  deadlines.sort((a, b) => a.deadlineTime.getTime() - b.deadlineTime.getTime());
  // Show only upcoming or overdue (not past and completed)
  const relevantDeadlines = deadlines.slice(0, 6);

  return (
    <Card className="bg-slate-900 border-slate-800 flex flex-col h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">
            Incidents & NIS2 Deadlines
          </CardTitle>
          <Link
            href="/incidents"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            View all <ArrowRight size={10} />
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {active.length} active incident{active.length !== 1 ? "s" : ""},
          {" "}{significant.length} NIS2-significant
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 space-y-3">
        {/* Active incident severity breakdown */}
        <div className="grid grid-cols-4 gap-2">
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
            const ct = active.filter((i) => i.severity === sev).length;
            const styles: Record<string, { bg: string; text: string }> = {
              CRITICAL: { bg: "bg-red-500/10", text: "text-red-400" },
              HIGH: { bg: "bg-amber-500/10", text: "text-amber-400" },
              MEDIUM: { bg: "bg-yellow-500/10", text: "text-yellow-400" },
              LOW: { bg: "bg-blue-500/10", text: "text-blue-400" },
            };
            const s = styles[sev];
            return (
              <div key={sev} className={`rounded-md px-2 py-1.5 ${s.bg} text-center`}>
                <p className={`text-lg font-bold ${s.text}`}>{ct}</p>
                <p className={`text-[9px] font-semibold uppercase tracking-wider ${s.text} opacity-70`}>{sev}</p>
              </div>
            );
          })}
        </div>

        {/* Regulatory deadlines */}
        {relevantDeadlines.length > 0 ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">
              Regulatory Deadlines
            </p>
            <div className="space-y-1.5">
              {relevantDeadlines.map((d, i) => (
                <div
                  key={i}
                  className={[
                    "flex items-center justify-between rounded-md border px-3 py-1.5",
                    d.overdue
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-slate-700/50 bg-slate-800/30",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock size={12} className={d.overdue ? "text-red-400 shrink-0" : "text-slate-500 shrink-0"} />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300 truncate">{d.incidentTitle}</p>
                      <p className="text-[10px] text-slate-500">{d.label}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium shrink-0 ml-2 ${d.overdue ? "text-red-400" : "text-slate-400"}`}>
                    {d.overdue ? "OVERDUE" : timeUntil(d.deadlineTime)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : significant.length === 0 ? (
          <div className="text-center py-4">
            <CheckCircle2 size={20} className="mx-auto text-emerald-500 mb-1" />
            <p className="text-xs text-slate-500">No NIS2-significant incidents</p>
          </div>
        ) : (
          <div className="text-center py-4">
            <CheckCircle2 size={20} className="mx-auto text-emerald-500 mb-1" />
            <p className="text-xs text-slate-500">All deadlines met</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 3 Left - Category bar chart
// ---------------------------------------------------------------------------

interface CatBarEntry {
  category: string;
  shortCategory: string;
  compliant: number;
  remaining: number;
  score: number;
}

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

  const renderLabel = (props: {
    x: number;
    y: number;
    width: number;
    height: number;
    value: number;
  }): React.ReactElement => {
    const { x, y, width, height, value } = props;
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
    <Card className="bg-slate-900 border-slate-800 h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">
            Compliance by Category
          </CardTitle>
          <Link
            href="/compliance"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            Details <ArrowRight size={10} />
          </Link>
        </div>
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
            <XAxis type="number" domain={[0, 100]} hide />
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
// Row 3 Right - Telemetry Health
// ---------------------------------------------------------------------------

function TelemetryHealthCard({ streams }: { streams: StreamResponse[] }) {
  const active = streams.filter((s) => s.status === "ACTIVE");
  const paused = streams.filter((s) => s.status === "PAUSED");
  const error = streams.filter((s) => s.status === "ERROR");

  return (
    <Card className="bg-slate-900 border-slate-800 h-full flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">
            Telemetry Health
          </CardTitle>
          <Link
            href="/telemetry"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            Details <ArrowRight size={10} />
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {streams.length} stream{streams.length !== 1 ? "s" : ""} configured
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 space-y-3">
        {/* Status summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Activity size={12} className="text-emerald-400" />
              <span className="text-lg font-bold text-emerald-400">{active.length}</span>
            </div>
            <p className="text-[9px] uppercase tracking-wider text-emerald-500">Active</p>
          </div>
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Clock size={12} className="text-amber-400" />
              <span className="text-lg font-bold text-amber-400">{paused.length}</span>
            </div>
            <p className="text-[9px] uppercase tracking-wider text-amber-500">Paused</p>
          </div>
          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <XCircle size={12} className="text-red-400" />
              <span className="text-lg font-bold text-red-400">{error.length}</span>
            </div>
            <p className="text-[9px] uppercase tracking-wider text-red-500">Error</p>
          </div>
        </div>

        {/* Stream list (last 5) */}
        {streams.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Recent Streams
            </p>
            {streams.slice(0, 5).map((s) => {
              const statusStyles: Record<string, string> = {
                ACTIVE: "text-emerald-400",
                PAUSED: "text-amber-400",
                ERROR: "text-red-400",
                DISABLED: "text-slate-500",
              };
              const dotStyles: Record<string, string> = {
                ACTIVE: "bg-emerald-400",
                PAUSED: "bg-amber-400",
                ERROR: "bg-red-400",
                DISABLED: "bg-slate-500",
              };
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStyles[s.status] ?? "bg-slate-500"}`} />
                    <span className="text-xs text-slate-300 truncate">{s.name}</span>
                  </div>
                  <span className={`text-[10px] font-medium shrink-0 ml-2 ${statusStyles[s.status] ?? "text-slate-500"}`}>
                    {s.status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4">
            <Waves size={20} className="mx-auto text-slate-600 mb-1" />
            <p className="text-xs text-slate-500">No telemetry streams configured</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 4 - Gap Analysis table (full width)
// ---------------------------------------------------------------------------

function GapTable({ gaps }: { gaps: DashboardResponse["gaps"] }) {
  const filtered = gaps.filter(
    (g) => g.status === "NON_COMPLIANT" || g.status === "NOT_ASSESSED"
  );

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-200">
              Gap Analysis
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length} requirement{filtered.length !== 1 ? "s" : ""}{" "}
              requiring attention
            </p>
          </div>
          <Link
            href="/compliance"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            View compliance <ArrowRight size={10} />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2" />
            <p className="text-emerald-400 font-medium text-sm">
              All requirements addressed
            </p>
            <p className="text-slate-500 text-xs mt-1">
              No compliance gaps identified
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
                    <TableCell className="px-4 py-2.5 text-xs text-slate-300 max-w-[300px]">
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
// Getting Started cards (shown when data is sparse)
// ---------------------------------------------------------------------------

interface GettingStartedProps {
  assetCount: number;
  streamCount: number;
  complianceScore: number;
}

function GettingStartedCards({ assetCount, streamCount, complianceScore }: GettingStartedProps) {
  const cards = [
    {
      done: assetCount >= 1,
      icon: <Satellite size={18} />,
      title: "Register your satellites",
      desc: "Add your space assets to the registry for compliance tracking and threat monitoring.",
      href: "/assets",
      cta: "Add assets",
    },
    {
      done: streamCount >= 1,
      icon: <Waves size={18} />,
      title: "Connect telemetry",
      desc: "Set up a telemetry stream to start ingesting housekeeping data from your spacecraft.",
      href: "/telemetry",
      cta: "Configure stream",
    },
    {
      done: complianceScore > 0,
      icon: <ShieldCheck size={18} />,
      title: "Complete compliance assessments",
      desc: "Work through NIS2 and ENISA requirements to improve your compliance posture.",
      href: "/compliance",
      cta: "Open mapper",
    },
    {
      done: false, // supply chain is never "done" in this basic check
      icon: <Link2 size={18} />,
      title: "Map your supply chain",
      desc: "Register suppliers and track third-party risk for NIS2 Article 21(2)(d) compliance.",
      href: "/supply-chain",
      cta: "Add suppliers",
    },
  ];

  // If all primary tasks are done, don't show the section
  const pendingCards = cards.filter((c) => !c.done);
  if (pendingCards.length === 0) return null;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-blue-400" />
          <CardTitle className="text-sm font-semibold text-slate-200">
            Getting Started
          </CardTitle>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Complete these steps to get the most out of SpaceGuard
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`group rounded-lg border p-3 transition-colors ${
                card.done
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-slate-700/50 bg-slate-800/30 hover:border-blue-500/30 hover:bg-blue-500/5"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={
                    card.done ? "text-emerald-400" : "text-slate-500 group-hover:text-blue-400"
                  }
                >
                  {card.done ? <CheckCircle2 size={18} /> : card.icon}
                </span>
                <span
                  className={`text-xs font-medium ${
                    card.done ? "text-emerald-400" : "text-slate-300 group-hover:text-blue-400"
                  } transition-colors`}
                >
                  {card.title}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mb-2">
                {card.desc}
              </p>
              {!card.done && (
                <span className="text-[10px] font-medium text-blue-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {card.cta} <ArrowRight size={10} />
                </span>
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row - AI Detection Card
// ---------------------------------------------------------------------------

interface AiDetectionCardProps {
  streams: StreamResponse[];
  aiData: Map<string, { baselines: BaselineResponse[]; stats: AnomalyStatsResponse | null }>;
}

function AiDetectionCard({ streams, aiData }: AiDetectionCardProps) {
  // Aggregate anomaly data across all streams
  let totalAnomalies = 0;
  let totalBaselines = 0;
  let totalParams = 0;
  let trainedBaselines = 0;
  let mostAnomalousParam = "";
  let highestAnomalyCount = 0;

  for (const [, data] of aiData) {
    totalBaselines += data.baselines.length;
    trainedBaselines += data.baselines.filter((b) => b.sampleCount >= 1000).length;
    totalParams += data.baselines.length;

    if (data.stats) {
      for (const p of data.stats.topAnomalousParameters) {
        totalAnomalies += p.anomalyCount;
        if (p.anomalyCount > highestAnomalyCount) {
          highestAnomalyCount = p.anomalyCount;
          mostAnomalousParam = p.parameterName;
        }
      }
    }
  }

  return (
    <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors group">
      <CardContent className="px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            AI Detection
          </span>
          <span className="text-slate-600 group-hover:text-slate-500 transition-colors">
            <Brain size={16} />
          </span>
        </div>
        <p className={`text-3xl font-bold ${totalAnomalies > 0 ? "text-violet-400" : "text-emerald-400"}`}>
          {totalAnomalies}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          anomalies today
        </p>
        <div className="mt-2 space-y-1">
          {mostAnomalousParam && (
            <p className="text-[10px] text-slate-500 truncate">
              Top: <span className="text-slate-400 font-mono">{mostAnomalousParam}</span>
            </p>
          )}
          <p className="text-[10px] text-slate-500">
            Baselines: {trainedBaselines}/{totalBaselines} trained
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { orgId, orgName, loading: orgLoading } = useOrg();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<AlertResponse[]>([]);
  const [incidents, setIncidents] = useState<IncidentResponse[]>([]);
  const [streams, setStreams] = useState<StreamResponse[]>([]);
  const [rulesCount, setRulesCount] = useState(0);
  const [aiData, setAiData] = useState<Map<string, { baselines: BaselineResponse[]; stats: AnomalyStatsResponse | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      setDashboard(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [dash, stats, recent, inc, str, rulesRes] = await Promise.all([
          getDashboard(orgId!),
          getAlertStats(orgId!).catch(() => null),
          getAlerts({ organizationId: orgId!, perPage: 8 }).catch(() => ({ data: [], total: 0 })),
          getIncidents({ organizationId: orgId!, perPage: 20 }).catch(() => ({ data: [], total: 0 })),
          getTelemetryStreams(orgId!).catch(() => ({ data: [], total: 0 })),
          getDetectionRules().catch(() => ({ rules: [], total: 0 })),
        ]);
        if (cancelled) return;
        setDashboard(dash);
        setAlertStats(stats);
        setRecentAlerts(recent.data);
        setIncidents(inc.data);
        setStreams(str.data);
        setRulesCount(rulesRes.total);

        // Fetch anomaly data for each active stream (fire and forget, non-blocking)
        const activeStreams = str.data.filter((s) => s.status === "ACTIVE").slice(0, 10);
        if (activeStreams.length > 0) {
          const aiResults = await Promise.all(
            activeStreams.map(async (s) => {
              const [bl, st] = await Promise.all([
                getAnomalyBaselines(s.id).catch(() => ({ data: [] as BaselineResponse[], total: 0 })),
                getAnomalyStats(s.id).catch(() => null),
              ]);
              return { streamId: s.id, baselines: bl.data, stats: st };
            })
          ).catch(() => []);
          if (!cancelled) {
            const map = new Map<string, { baselines: BaselineResponse[]; stats: AnomalyStatsResponse | null }>();
            for (const r of aiResults) {
              map.set(r.streamId, { baselines: r.baselines, stats: r.stats });
            }
            setAiData(map);
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orgId, orgLoading]);

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="p-6 space-y-5">
        <div className="mb-4">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-3"><Skeleton className="h-72 rounded-lg" /></div>
          <div className="col-span-2"><Skeleton className="h-72 rounded-lg" /></div>
        </div>
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-3"><Skeleton className="h-80 rounded-lg" /></div>
          <div className="col-span-2"><Skeleton className="h-80 rounded-lg" /></div>
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  // ---- No org ----
  if (!orgLoading && !orgId) return <SetupPrompt />;

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

  // Derived values for metric cards
  const openAlerts = alertStats
    ? (alertStats.byStatus["NEW"] ?? 0) + (alertStats.byStatus["INVESTIGATING"] ?? 0)
    : 0;
  const openIncidents = incidents.filter((i) =>
    INCIDENT_STATUS_ACTIVE.has(i.status)
  ).length;
  const activeStreams = streams.filter((s) => s.status === "ACTIVE").length;

  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {orgName} &mdash; Operational overview
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

      {/* Compliance by Regulation */}
      {dashboard && dashboard.byRegulation && dashboard.byRegulation.length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-slate-200">
              Compliance by Regulation
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Individual scores for each regulatory framework
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Overall Score */}
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">
                    Overall Score
                  </span>
                  <span className={`text-2xl font-bold ${scoreTextClass(dashboard.overallScore)}`}>
                    {dashboard.overallScore}%
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      dashboard.overallScore >= 70
                        ? "bg-emerald-500"
                        : dashboard.overallScore >= 40
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${dashboard.overallScore}%` }}
                  />
                </div>
              </div>

              {/* Per-regulation scores */}
              {dashboard.byRegulation.map((reg) => {
                const regLabel =
                  reg.regulation === "NIS2"
                    ? "NIS2"
                    : reg.regulation === "ENISA_SPACE"
                    ? "ENISA Space"
                    : reg.regulation;
                const score = reg.total > 0 ? Math.round((reg.compliant / reg.total) * 100) : 0;
                return (
                  <div key={reg.regulation} className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                        {regLabel}
                      </span>
                      <span className={`text-2xl font-bold ${scoreTextClass(score)}`}>
                        {score}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          score >= 70
                            ? "bg-emerald-500"
                            : score >= 40
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {reg.compliant} of {reg.total} requirements
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Getting Started cards (shown when data is sparse) */}
      <GettingStartedCards
        assetCount={dashboard.assetsSummary.total}
        streamCount={streams.length}
        complianceScore={dashboard.overallScore}
      />

      {/* Row 1 - Key metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
        <MetricCard
          icon={<ShieldCheck size={16} />}
          label="Compliance Score"
          value={
            <span className={scoreTextClass(dashboard.overallScore)}>
              {dashboard.overallScore}%
            </span>
          }
          subtitle={
            dashboard.overallScore >= 70
              ? "Good posture"
              : dashboard.overallScore >= 40
              ? "Needs improvement"
              : "Critical gaps"
          }
          href="/compliance"
          accentClass={scoreTextClass(dashboard.overallScore)}
        />
        <MetricCard
          icon={<Bell size={16} />}
          label="Active Alerts"
          value={openAlerts}
          subtitle={
            alertStats
              ? `${alertStats.openCritical} critical, ${alertStats.openHigh} high`
              : "No alert data"
          }
          href="/alerts"
          accentClass={openAlerts > 0 ? "text-red-400" : "text-emerald-400"}
        />
        <MetricCard
          icon={<AlertTriangle size={16} />}
          label="Open Incidents"
          value={openIncidents}
          subtitle={`${incidents.filter((i) => i.nis2Classification === "SIGNIFICANT" && INCIDENT_STATUS_ACTIVE.has(i.status)).length} NIS2-significant`}
          href="/incidents"
          accentClass={openIncidents > 0 ? "text-amber-400" : "text-emerald-400"}
        />
        <MetricCard
          icon={<BookOpen size={16} />}
          label="Detection Rules"
          value={rulesCount}
          subtitle="9 categories, SPARTA mapped"
          href="/alerts/rules"
          accentClass="text-blue-400"
        />
        <MetricCard
          icon={<Waves size={16} />}
          label="Telemetry Streams"
          value={activeStreams}
          subtitle={`${streams.length} total configured`}
          href="/telemetry"
          accentClass={activeStreams > 0 ? "text-blue-400" : "text-slate-400"}
        />
        <MetricCard
          icon={<Satellite size={16} />}
          label="Total Assets"
          value={dashboard.assetsSummary.total}
          subtitle={`${dashboard.assetsSummary.byCriticality?.CRITICAL ?? 0} critical assets`}
          href="/assets"
        />
        <Link href="/alerts" className="block">
          <AiDetectionCard streams={streams} aiData={aiData} />
        </Link>
      </div>

      {/* Row 2 - Recent Alerts (60%) + Incidents/Deadlines (40%) */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <RecentAlertsCard alerts={recentAlerts} />
        </div>
        <div className="col-span-2">
          <IncidentOverviewCard incidents={incidents} />
        </div>
      </div>

      {/* Row 3 - Compliance by category (60%) + Telemetry health (40%) */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <CategoryChart byCategory={dashboard.byCategory} />
        </div>
        <div className="col-span-2">
          <TelemetryHealthCard streams={streams} />
        </div>
      </div>

      {/* Row 4 - Full-width Gap Analysis */}
      <GapTable gaps={dashboard.gaps} />
    </div>
  );
}
