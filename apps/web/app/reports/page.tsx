"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Download,
  Loader2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Layers,
  CalendarDays,
  TrendingDown,
  BarChart2,
  CheckCircle2,
} from "lucide-react";
import {
  getDashboard,
  getCompliancePdf,
  getIncidentSummaryStats,
  getIncidentSummaryPdf,
  type IncidentSummaryStats,
} from "@/lib/api";
import { useOrg } from "@/lib/context";
import type { DashboardResponse } from "@spaceguard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function fmtMinutes(minutes: number | null): string {
  if (minutes === null) return "N/A";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "text-red-400",
  HIGH:     "text-orange-400",
  MEDIUM:   "text-amber-400",
  LOW:      "text-slate-500",
};

// ---------------------------------------------------------------------------
// Placeholder (coming-soon) report card
// ---------------------------------------------------------------------------

interface PlaceholderCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function PlaceholderCard({ icon, title, description }: PlaceholderCardProps) {
  return (
    <Card className="border-slate-800 bg-slate-900/50 opacity-50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-800 p-2 text-slate-500">
              {icon}
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-slate-300">
                {title}
              </CardTitle>
            </div>
          </div>
          <Badge variant="muted" className="text-[10px] px-2 shrink-0">
            Coming Soon
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
        <Button
          disabled
          className="mt-4 w-full bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed"
          size="sm"
        >
          <Download size={14} className="mr-2" />
          Download PDF
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Incident Summary Report card
// ---------------------------------------------------------------------------

function IncidentSummaryCard({ orgId }: { orgId: string | null }) {
  const [fromDate, setFromDate] = useState(nDaysAgo(90));
  const [toDate, setToDate] = useState(today());
  const [stats, setStats] = useState<IncidentSummaryStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Load preview stats whenever orgId or date range changes
  useEffect(() => {
    if (!orgId) { setStats(null); return; }
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    getIncidentSummaryStats({ organizationId: orgId, from: fromDate, to: toDate })
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((err) => { if (!cancelled) setStatsError(err instanceof Error ? err.message : "Failed to load stats"); })
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, fromDate, toDate]);

  async function handleDownload() {
    if (!orgId) return;
    setDownloading(true);
    setDownloadError(null);
    let url: string | null = null;
    const a = document.createElement("a");
    try {
      const blob = await getIncidentSummaryPdf({ organizationId: orgId, from: fromDate, to: toDate });
      url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `spaceguard-incidents-${fromDate}-to-${toDate}.pdf`;
      document.body.appendChild(a);
      a.click();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      if (document.body.contains(a)) document.body.removeChild(a);
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 100);
      setDownloading(false);
    }
  }

  const critHigh = (stats?.bySeverity?.CRITICAL ?? 0) + (stats?.bySeverity?.HIGH ?? 0);

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <AlertTriangle size={20} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-100">
                Incident Summary Report
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Incident trends, MTTD/MTTR, SPARTA mapping - PDF
              </p>
            </div>
          </div>
          <Badge variant="success" className="text-[10px] px-2 shrink-0">
            Available
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-slate-400 leading-relaxed">
          Aggregated view of all cybersecurity incidents in the selected period,
          including severity breakdown, mean time to detect and respond, SPARTA
          technique mapping, trend analysis, and auto-generated recommendations.
          Suitable for management reporting and NIS2 Article 21 evidence.
        </p>

        {/* Date range picker */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">
              From
            </Label>
            <div className="relative">
              <CalendarDays size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              <Input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="pl-7 h-8 text-xs bg-slate-800 border-slate-700 text-slate-300"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">
              To
            </Label>
            <div className="relative">
              <CalendarDays size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              <Input
                type="date"
                value={toDate}
                min={fromDate}
                max={today()}
                onChange={(e) => setToDate(e.target.value)}
                className="pl-7 h-8 text-xs bg-slate-800 border-slate-700 text-slate-300"
              />
            </div>
          </div>
        </div>

        {/* Preview stats */}
        {statsError && (
          <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertTriangle size={12} className="shrink-0" />
            {statsError}
          </div>
        )}

        {statsLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-800" />
            ))}
          </div>
        ) : stats ? (
          <div className="space-y-3">
            {/* Key metrics */}
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Total</p>
                <p className={`text-2xl font-bold ${stats.total > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {stats.total}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Open</p>
                <p className={`text-2xl font-bold ${stats.openCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {stats.openCount}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Avg MTTD</p>
                <p className="text-xl font-bold text-blue-400 leading-tight">
                  {fmtMinutes(stats.mttdMinutes)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Avg MTTR</p>
                <p className="text-xl font-bold text-blue-400 leading-tight">
                  {fmtMinutes(stats.mttrMinutes)}
                </p>
              </div>
            </div>

            {/* Severity + top technique */}
            <div className="grid grid-cols-2 gap-3">
              {/* Severity breakdown */}
              <div className="rounded-lg border border-slate-700/30 bg-slate-800/20 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  By Severity
                </p>
                <div className="space-y-1.5">
                  {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
                    const count = stats.bySeverity[sev] ?? 0;
                    const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                    return (
                      <div key={sev} className="flex items-center gap-2">
                        <span className={`text-[9px] w-14 ${SEVERITY_COLORS[sev]}`}>{sev}</span>
                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              sev === "CRITICAL" ? "bg-red-500" :
                              sev === "HIGH" ? "bg-orange-500" :
                              sev === "MEDIUM" ? "bg-amber-500" : "bg-slate-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-500 w-4 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top techniques */}
              <div className="rounded-lg border border-slate-700/30 bg-slate-800/20 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  Top SPARTA Techniques
                </p>
                {stats.topTechniques.length === 0 ? (
                  <p className="text-[10px] text-slate-600 italic">None recorded</p>
                ) : (
                  <div className="space-y-1.5">
                    {stats.topTechniques.slice(0, 3).map((t) => (
                      <div key={t.name} className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-400 truncate">{t.name}</span>
                        <span className="shrink-0 text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5">
                          {t.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* What's included */}
        <div className="rounded-lg border border-slate-700/30 bg-slate-800/20 px-4 py-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Report Contents
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              "Executive summary + MTTD/MTTR",
              "Severity and status breakdown",
              "Chronological incident timeline",
              "Monthly trend analysis",
              "Top SPARTA techniques + assets",
              "Auto-generated recommendations",
            ].map((item) => (
              <li
                key={item}
                className="text-xs text-slate-400 flex items-center gap-1.5"
              >
                <span className="text-amber-500 text-[10px]">▸</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Download button + error */}
        {downloadError && (
          <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertTriangle size={12} className="shrink-0" />
            {downloadError}
          </div>
        )}

        <Button
          onClick={handleDownload}
          disabled={!orgId || downloading || statsLoading}
          suppressHydrationWarning
          className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium disabled:opacity-50"
        >
          {downloading ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Generating PDF...
            </>
          ) : (
            <>
              <Download size={16} className="mr-2" />
              Download Incident Summary PDF
            </>
          )}
        </Button>

        {!orgId && (
          <p className="text-center text-xs text-slate-600">
            Set up your organization to enable report generation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { orgId, orgName, loading: orgLoading } = useOrg();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      setDashboard(null);
      return;
    }
    setLoading(true);
    getDashboard(orgId)
      .then(setDashboard)
      .catch(() => {
        /* silently fall through - page still renders without stats */
      })
      .finally(() => setLoading(false));
  }, [orgId, orgLoading]);

  async function handleDownload() {
    if (!orgId) return;
    setDownloading(true);
    setDownloadError(null);
    let url: string | null = null;
    const a = document.createElement("a");
    try {
      const blob = await getCompliancePdf(orgId);
      url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `spaceguard-compliance-${today()}.pdf`;
      document.body.appendChild(a);
      a.click();
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Failed to generate report"
      );
    } finally {
      if (document.body.contains(a)) document.body.removeChild(a);
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 100);
      setDownloading(false);
    }
  }

  const gapsCount =
    dashboard?.gaps?.length ??
    ((dashboard?.byStatus?.NOT_ASSESSED ?? 0) +
      (dashboard?.byStatus?.NON_COMPLIANT ?? 0));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50">Reports</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Generate and download compliance and operational reports for your organization
        </p>
      </div>

      {/* Report cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        {/* ---------------------------------------------------------------- */}
        {/* Active: NIS2 Compliance Report */}
        {/* ---------------------------------------------------------------- */}
        <Card className="border-slate-700 bg-slate-900 md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                  <FileText size={20} />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-100">
                    NIS2 Compliance Report
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Full Article 21 compliance status - PDF
                  </p>
                </div>
              </div>
              <Badge variant="success" className="text-[10px] px-2 shrink-0">
                Available
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-slate-400 leading-relaxed">
              A comprehensive NIS2 Article 21 compliance assessment for{" "}
              <span className="text-slate-200 font-medium">
                {loading ? "your organization" : orgName || "your organization"}
              </span>
              . Includes executive summary, compliance matrix, gap analysis,
              and full asset inventory. Suitable for submission to your national
              competent authority or use in internal audit processes.
            </p>

            {/* Preview stats */}
            {loading ? (
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-lg bg-slate-800"
                  />
                ))}
              </div>
            ) : dashboard ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                    Overall Score
                  </p>
                  <p className={`text-2xl font-bold ${scoreColor(dashboard.overallScore)}`}>
                    {dashboard.overallScore}%
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                    Open Gaps
                  </p>
                  <p className={`text-2xl font-bold ${gapsCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {gapsCount}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                    Requirements
                  </p>
                  <p className="text-2xl font-bold text-slate-200">
                    {dashboard.totalRequirements}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-700/30 bg-slate-800/20 px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Report Contents
              </p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  "Title page with org details",
                  "Executive summary",
                  "Compliance score breakdown",
                  "Full requirements matrix",
                  "Gap analysis with priorities",
                  "Asset inventory",
                ].map((item) => (
                  <li
                    key={item}
                    className="text-xs text-slate-400 flex items-center gap-1.5"
                  >
                    <span className="text-blue-500 text-[10px]">▸</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {downloadError && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertTriangle size={12} className="shrink-0" />
                {downloadError}
              </div>
            )}

            <Button
              onClick={handleDownload}
              disabled={!orgId || downloading || loading}
              suppressHydrationWarning
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download size={16} className="mr-2" />
                  Download PDF
                </>
              )}
            </Button>

            {!orgId && !loading && (
              <p className="text-center text-xs text-slate-600">
                Set up your organization to enable report generation.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Active: Incident Summary Report */}
        {/* ---------------------------------------------------------------- */}
        <div className="md:col-span-2">
          <IncidentSummaryCard orgId={orgId} />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Placeholder cards */}
        {/* ---------------------------------------------------------------- */}
        <PlaceholderCard
          icon={<Layers size={18} />}
          title="Threat Landscape Briefing"
          description="Curated threat intelligence briefing covering active threat actors targeting space operators, SPARTA technique mapping, and recommended mitigations for your asset profile."
        />

        <PlaceholderCard
          icon={<ShieldCheck size={18} />}
          title="Supply Chain Risk Assessment"
          description="Analysis of third-party dependencies in your space systems - ground segment vendors, component suppliers, and software integrations - against known vulnerability databases."
        />

        <PlaceholderCard
          icon={<Clock size={18} />}
          title="Audit Trail Report"
          description="Timestamped log of all compliance changes, asset updates, incident actions, and user activity for regulatory audit purposes and internal governance reviews."
        />

        <PlaceholderCard
          icon={<BarChart2 size={18} />}
          title="Telemetry Anomaly Summary"
          description="Statistical overview of telemetry anomalies detected across all assets, detection rule performance metrics, and false-positive rate analysis over time."
        />
      </div>
    </div>
  );
}
