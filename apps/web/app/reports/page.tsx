"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText,
  Download,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Layers,
  CalendarDays,
  TrendingDown,
  BarChart2,
  CheckCircle2,
  Target,
  Link as LinkIcon,
  ClipboardList,
  Clock,
  Play,
  Trash2,
  Plus,
  X,
  Mail,
} from "lucide-react";
import {
  getDashboard,
  getCompliancePdf,
  getIncidentSummaryStats,
  getIncidentSummaryPdf,
  getThreatBriefingPdf,
  getSupplyChainPdf,
  getAuditTrailPdf,
  getScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  runScheduledReportNow,
  type IncidentSummaryStats,
  type ScheduledReportRow,
  type CreateScheduledReportInput,
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

function IncidentSummaryCard({ orgId, schedules, onScheduleCreated }: { orgId: string | null; schedules: ScheduledReportRow[]; onScheduleCreated: () => void }) {
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
      if (url) {
        const urlToRevoke = url;
        setTimeout(() => URL.revokeObjectURL(urlToRevoke), 100);
      }
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

        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownload}
            disabled={!orgId || downloading || statsLoading}
            suppressHydrationWarning
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-medium disabled:opacity-50"
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
          <ScheduleButton orgId={orgId} reportType="INCIDENT_SUMMARY" onCreated={onScheduleCreated} />
        </div>

        {schedules.filter((s) => s.reportType === "INCIDENT_SUMMARY" && s.isActive).map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-[11px] text-amber-400">
            <Clock size={11} />
            Next scheduled: {fmtDate(s.nextRun)}
          </div>
        ))}

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
// Threat Landscape Briefing card
// ---------------------------------------------------------------------------

function ThreatBriefingCard({ orgId, schedules, onScheduleCreated }: { orgId: string | null; schedules: ScheduledReportRow[]; onScheduleCreated: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    if (!orgId) return;
    setDownloading(true);
    setDownloadError(null);
    let url: string | null = null;
    const a = document.createElement("a");
    try {
      const blob = await getThreatBriefingPdf(orgId);
      url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `spaceguard-threat-briefing-${today()}.pdf`;
      document.body.appendChild(a);
      a.click();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      if (document.body.contains(a)) document.body.removeChild(a);
      if (url) {
        const urlToRevoke = url;
        setTimeout(() => URL.revokeObjectURL(urlToRevoke), 100);
      }
      setDownloading(false);
    }
  }

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-500/10 p-2 text-violet-400">
              <Target size={20} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-100">
                Threat Landscape Briefing
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                SPARTA-mapped threats tailored to your asset profile - PDF
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
          Periodic threat intelligence briefing scoped to your organisation's
          specific asset types. Filters the full SPARTA matrix to the techniques
          most relevant to your space and ground segment, scores them by
          detection coverage and recent alert activity, and generates targeted
          countermeasure recommendations with NIST SP 800-53 references.
        </p>

        <div className="rounded-lg border border-slate-700/30 bg-slate-800/20 px-4 py-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Report Contents
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              "Asset profile + segment mapping",
              "Coverage heat map by tactic",
              "Top 10 ranked threats",
              "Detection vs. countermeasure gaps",
              "Alert activity last 30 days",
              "Top 5 recommended actions + NIST",
            ].map((item) => (
              <li key={item} className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="text-violet-500 text-[10px]">▸</span>
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

        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownload}
            disabled={!orgId || downloading}
            suppressHydrationWarning
            className="flex-1 bg-violet-700 hover:bg-violet-600 text-white font-medium disabled:opacity-50"
          >
            {downloading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download size={16} className="mr-2" />
                Download Threat Briefing PDF
              </>
            )}
          </Button>
          <ScheduleButton orgId={orgId} reportType="THREAT_BRIEFING" onCreated={onScheduleCreated} />
        </div>

        {schedules.filter((s) => s.reportType === "THREAT_BRIEFING" && s.isActive).map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-[11px] text-violet-400">
            <Clock size={11} />
            Next scheduled: {fmtDate(s.nextRun)}
          </div>
        ))}

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
// Supply Chain Risk Assessment card
// ---------------------------------------------------------------------------

function SupplyChainCard({ orgId, schedules, onScheduleCreated }: { orgId: string | null; schedules: ScheduledReportRow[]; onScheduleCreated: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    if (!orgId) return;
    setDownloading(true);
    setDownloadError(null);
    let url: string | null = null;
    const a = document.createElement("a");
    try {
      const blob = await getSupplyChainPdf(orgId);
      url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `spaceguard-supply-chain-${today()}.pdf`;
      document.body.appendChild(a);
      a.click();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      if (document.body.contains(a)) document.body.removeChild(a);
      if (url) {
        const urlToRevoke = url;
        setTimeout(() => URL.revokeObjectURL(urlToRevoke), 100);
      }
      setDownloading(false);
    }
  }

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-400">
              <LinkIcon size={20} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-100">
                Supply Chain Risk Assessment
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Supplier inventory, certifications, NIS2 Art. 21(2)(d) status - PDF
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
          Analysis of third-party dependencies in your space systems, including
          ground segment vendors, component suppliers, cloud providers, and
          software integrations. Evaluates certification coverage, risk scores,
          geographic concentration, and NIS2 Article 21(2)(d) compliance status.
        </p>

        <div className="rounded-lg border border-slate-700/30 bg-slate-800/20 px-4 py-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Report Contents
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              "Supplier inventory with risk scores",
              "Criticality + type distribution",
              "Country concentration analysis",
              "ISO 27001, SOC 2, NIS2 cert gaps",
              "Overdue assessment tracking",
              "Recommendations + action items",
            ].map((item) => (
              <li key={item} className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="text-cyan-500 text-[10px]">&#x25B8;</span>
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

        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownload}
            disabled={!orgId || downloading}
            suppressHydrationWarning
            className="flex-1 bg-cyan-700 hover:bg-cyan-600 text-white font-medium disabled:opacity-50"
          >
            {downloading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download size={16} className="mr-2" />
                Download Supply Chain PDF
              </>
            )}
          </Button>
          <ScheduleButton orgId={orgId} reportType="SUPPLY_CHAIN" onCreated={onScheduleCreated} />
        </div>

        {schedules.filter((s) => s.reportType === "SUPPLY_CHAIN" && s.isActive).map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-[11px] text-cyan-400">
            <Clock size={11} />
            Next scheduled: {fmtDate(s.nextRun)}
          </div>
        ))}

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
// Audit Trail Report card
// ---------------------------------------------------------------------------

function AuditTrailCard({ orgId, schedules, onScheduleCreated }: { orgId: string | null; schedules: ScheduledReportRow[]; onScheduleCreated: () => void }) {
  const [fromDate, setFromDate] = useState(nDaysAgo(90));
  const [toDate, setToDate] = useState(today());
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    if (!orgId) return;
    setDownloading(true);
    setDownloadError(null);
    let url: string | null = null;
    const a = document.createElement("a");
    try {
      const blob = await getAuditTrailPdf(orgId, fromDate, toDate);
      url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `spaceguard-audit-trail-${fromDate}-to-${toDate}.pdf`;
      document.body.appendChild(a);
      a.click();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      if (document.body.contains(a)) document.body.removeChild(a);
      if (url) {
        const urlToRevoke = url;
        setTimeout(() => URL.revokeObjectURL(urlToRevoke), 100);
      }
      setDownloading(false);
    }
  }

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-500/10 p-2 text-slate-400">
              <ClipboardList size={20} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-100">
                Audit Trail Report
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Timestamped action log, NIS2 Art. 21(2)(i) evidence - PDF
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
          Complete audit trail of all platform actions including asset changes,
          compliance mapping updates, incident management, alert acknowledgements,
          and supply chain modifications. Actor-attributed and tamper-evident.
          Constitutes regulatory evidence under NIS2 Article 21(2)(i).
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

        <div className="rounded-lg border border-slate-700/30 bg-slate-800/20 px-4 py-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Report Contents
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              "Title page with date range + KPIs",
              "Events by action type (bar chart)",
              "Daily volume timeline",
              "Events by actor breakdown",
              "Critical actions log (DELETE, STATUS_CHANGE)",
              "NIS2 Art. 21(2)(i) compliance statement",
            ].map((item) => (
              <li key={item} className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="text-slate-500 text-[10px]">&#x25B8;</span>
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

        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownload}
            disabled={!orgId || downloading}
            suppressHydrationWarning
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium disabled:opacity-50"
          >
            {downloading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download size={16} className="mr-2" />
                Download Audit Trail PDF
              </>
            )}
          </Button>
          <ScheduleButton orgId={orgId} reportType="AUDIT_TRAIL" onCreated={onScheduleCreated} />
        </div>

        {schedules.filter((s) => s.reportType === "AUDIT_TRAIL" && s.isActive).map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-[11px] text-slate-400">
            <Clock size={11} />
            Next scheduled: {fmtDate(s.nextRun)}
          </div>
        ))}

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
// Report type metadata
// ---------------------------------------------------------------------------

const REPORT_TYPE_META: Record<
  string,
  { label: string; color: string }
> = {
  COMPLIANCE: { label: "NIS2 Compliance", color: "text-blue-400" },
  INCIDENT_SUMMARY: { label: "Incident Summary", color: "text-amber-400" },
  THREAT_BRIEFING: { label: "Threat Briefing", color: "text-violet-400" },
  SUPPLY_CHAIN: { label: "Supply Chain Risk", color: "text-cyan-400" },
  AUDIT_TRAIL: { label: "Audit Trail", color: "text-slate-400" },
};

const SCHEDULE_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Schedule Dialog
// ---------------------------------------------------------------------------

interface ScheduleDialogProps {
  orgId: string;
  reportType: CreateScheduledReportInput["reportType"];
  onClose: () => void;
  onCreated: () => void;
}

function ScheduleDialog({ orgId, reportType, onClose, onCreated }: ScheduleDialogProps) {
  const [schedule, setSchedule] = useState<"WEEKLY" | "MONTHLY" | "QUARTERLY">("WEEKLY");
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recipientInput, setRecipientInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRecipient() {
    const email = recipientInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Invalid email address");
      return;
    }
    if (recipients.includes(email)) {
      setError("Email already added");
      return;
    }
    setRecipients([...recipients, email]);
    setRecipientInput("");
    setError(null);
  }

  function removeRecipient(email: string) {
    setRecipients(recipients.filter((r) => r !== email));
  }

  async function handleSave() {
    if (recipients.length === 0) {
      setError("Add at least one recipient email");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createScheduledReport({
        organizationId: orgId,
        reportType,
        schedule,
        dayOfWeek: schedule === "WEEKLY" ? dayOfWeek : null,
        dayOfMonth: schedule !== "WEEKLY" ? dayOfMonth : null,
        recipients,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  }

  const meta = REPORT_TYPE_META[reportType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Schedule {meta?.label ?? reportType} Report
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Frequency */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">
              Frequency
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(["WEEKLY", "MONTHLY", "QUARTERLY"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSchedule(s)}
                  className={`h-8 rounded-md text-xs font-medium transition-colors ${
                    schedule === s
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {SCHEDULE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Day selector */}
          {schedule === "WEEKLY" ? (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-slate-500">
                Day of Week
              </Label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-200"
              >
                {DAY_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>{name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-slate-500">
                Day of Month
              </Label>
              <select
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-200"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {/* Recipients */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">
              Recipients
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="email"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
                placeholder="email@example.com"
                className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"
              />
              <button
                onClick={addRecipient}
                className="h-8 px-3 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:text-slate-200 shrink-0"
              >
                <Plus size={12} />
              </button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {recipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-400"
                  >
                    <Mail size={10} />
                    {email}
                    <button onClick={() => removeRecipient(email)} className="hover:text-red-400 ml-0.5">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving || recipients.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs"
              size="sm"
            >
              {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Clock size={14} className="mr-1.5" />}
              Create Schedule
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              className="text-xs text-slate-400"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule Button (added to each report card)
// ---------------------------------------------------------------------------

interface ScheduleButtonProps {
  orgId: string | null;
  reportType: CreateScheduledReportInput["reportType"];
  onCreated: () => void;
}

function ScheduleButton({ orgId, reportType, onCreated }: ScheduleButtonProps) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        disabled={!orgId}
        variant="ghost"
        className="text-xs text-slate-400 hover:text-blue-400 gap-1.5"
        size="sm"
      >
        <Clock size={14} />
        Schedule
      </Button>
      {showDialog && orgId && (
        <ScheduleDialog
          orgId={orgId}
          reportType={reportType}
          onClose={() => setShowDialog(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Scheduled Reports section (bottom of page)
// ---------------------------------------------------------------------------

interface ScheduledReportsSectionProps {
  orgId: string | null;
  schedules: ScheduledReportRow[];
  onRefresh: () => void;
}

function ScheduledReportsSection({ orgId, schedules, onRefresh }: ScheduledReportsSectionProps) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleRunNow(id: string) {
    setRunningId(id);
    try {
      await runScheduledReportNow(id);
      onRefresh();
    } catch (err) {
      console.error("Run-now failed:", err);
    } finally {
      setRunningId(null);
    }
  }

  async function handleToggle(row: ScheduledReportRow) {
    setTogglingId(row.id);
    try {
      await updateScheduledReport(row.id, { isActive: !row.isActive });
      onRefresh();
    } catch (err) {
      console.error("Toggle failed:", err);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteScheduledReport(id);
      onRefresh();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  }

  if (!orgId) return null;

  return (
    <div className="mt-8 max-w-4xl">
      <h2 className="text-lg font-semibold text-slate-100 mb-1">Scheduled Reports</h2>
      <p className="text-xs text-slate-500 mb-4">
        Automatic report generation and email delivery
      </p>

      {schedules.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="py-8 text-center">
            <Clock size={24} className="mx-auto mb-2 text-slate-600" />
            <p className="text-sm text-slate-500">No scheduled reports yet.</p>
            <p className="text-xs text-slate-600 mt-1">
              Use the "Schedule" button on any report card above to set up automatic delivery.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => {
            const meta = REPORT_TYPE_META[s.reportType];
            const scheduleDesc = s.schedule === "WEEKLY"
              ? `Every ${DAY_NAMES[s.dayOfWeek ?? 1]}`
              : s.schedule === "MONTHLY"
                ? `Monthly on day ${s.dayOfMonth ?? 1}`
                : `Quarterly on day ${s.dayOfMonth ?? 1}`;

            return (
              <Card key={s.id} className={`border-slate-700/50 bg-slate-900 ${!s.isActive ? "opacity-50" : ""}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold ${meta?.color ?? "text-slate-300"}`}>
                          {meta?.label ?? s.reportType}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                          {SCHEDULE_LABELS[s.schedule]}
                        </span>
                        {!s.isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Paused
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-slate-500">
                        <span>{scheduleDesc}</span>
                        <span>Next: {fmtDate(s.nextRun)}</span>
                        {s.lastGenerated && <span>Last: {fmtDate(s.lastGenerated)}</span>}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {s.recipients.map((email) => (
                          <span
                            key={email}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500"
                          >
                            {email}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Toggle active */}
                      <button
                        onClick={() => handleToggle(s)}
                        disabled={togglingId === s.id}
                        className="relative h-7 px-2 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
                        title={s.isActive ? "Pause" : "Resume"}
                      >
                        {s.isActive ? "Pause" : "Resume"}
                      </button>
                      {/* Run now */}
                      <button
                        onClick={() => handleRunNow(s.id)}
                        disabled={runningId === s.id}
                        className="h-7 px-2 flex items-center gap-1 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
                        title="Generate and send now"
                      >
                        {runningId === s.id ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                        Run Now
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        className="h-7 w-7 flex items-center justify-center rounded bg-slate-800 border border-slate-700 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Delete schedule"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
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
  const [schedules, setSchedules] = useState<ScheduledReportRow[]>([]);

  const loadSchedules = useCallback(async () => {
    if (!orgId) { setSchedules([]); return; }
    try {
      const res = await getScheduledReports(orgId);
      setSchedules(res.data);
    } catch {
      // silently ignore
    }
  }, [orgId]);

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
    loadSchedules();
  }, [orgId, orgLoading, loadSchedules]);

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
      if (url) {
        const urlToRevoke = url;
        setTimeout(() => URL.revokeObjectURL(urlToRevoke), 100);
      }
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

            <div className="flex items-center gap-2">
              <Button
                onClick={handleDownload}
                disabled={!orgId || downloading || loading}
                suppressHydrationWarning
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
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
              <ScheduleButton orgId={orgId} reportType="COMPLIANCE" onCreated={loadSchedules} />
            </div>

            {/* Show next scheduled if exists */}
            {schedules.filter((s) => s.reportType === "COMPLIANCE" && s.isActive).map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-[11px] text-blue-400">
                <Clock size={11} />
                Next scheduled: {fmtDate(s.nextRun)}
              </div>
            ))}

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
          <IncidentSummaryCard orgId={orgId} schedules={schedules} onScheduleCreated={loadSchedules} />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Active: Threat Landscape Briefing */}
        {/* ---------------------------------------------------------------- */}
        <ThreatBriefingCard orgId={orgId} schedules={schedules} onScheduleCreated={loadSchedules} />

        {/* ---------------------------------------------------------------- */}
        {/* Active report cards */}
        {/* ---------------------------------------------------------------- */}
        <SupplyChainCard orgId={orgId} schedules={schedules} onScheduleCreated={loadSchedules} />

        <AuditTrailCard orgId={orgId} schedules={schedules} onScheduleCreated={loadSchedules} />

        <PlaceholderCard
          icon={<BarChart2 size={18} />}
          title="Telemetry Anomaly Summary"
          description="Statistical overview of telemetry anomalies detected across all assets, detection rule performance metrics, and false-positive rate analysis over time."
        />
      </div>

      {/* Scheduled Reports section */}
      <ScheduledReportsSection orgId={orgId} schedules={schedules} onRefresh={loadSchedules} />
    </div>
  );
}
