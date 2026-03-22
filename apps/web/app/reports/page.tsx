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
} from "lucide-react";
import { getDashboard, getCompliancePdf } from "@/lib/api";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

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
          <Badge
            variant="muted"
            className="text-[10px] px-2 shrink-0"
          >
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
        /* silently fall through — page still renders without stats */
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
      // Always clean up the anchor and object URL, even if an error occurred
      if (document.body.contains(a)) document.body.removeChild(a);
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 100);
      setDownloading(false);
    }
  }

  // Derived stats
  const gapsCount =
    dashboard?.gaps?.length ??
    ((dashboard?.byStatus?.NOT_ASSESSED ?? 0) +
      (dashboard?.byStatus?.NON_COMPLIANT ?? 0));

  const lastAssessedDates = dashboard?.gaps
    ? null
    : null; // placeholder — no per-mapping date on dashboard
  void lastAssessedDates;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50">Reports</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Generate and download compliance reports for your organization
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
                    Full Article 21 compliance status — PDF
                  </p>
                </div>
              </div>
              <Badge variant="success" className="text-[10px] px-2 shrink-0">
                Available
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Description */}
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
                {/* Score */}
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                    Overall Score
                  </p>
                  <p
                    className={`text-2xl font-bold ${scoreColor(
                      dashboard.overallScore
                    )}`}
                  >
                    {dashboard.overallScore}%
                  </p>
                </div>

                {/* Gaps */}
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                    Open Gaps
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      gapsCount > 0 ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {gapsCount}
                  </p>
                </div>

                {/* Requirements */}
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

            {/* What's included */}
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

            {/* Download button + error */}
            {downloadError && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertTriangle size={12} className="shrink-0" />
                {downloadError}
              </div>
            )}

            <Button
              onClick={handleDownload}
              disabled={!orgId || downloading || loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Generating PDF…
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
        {/* Placeholder cards */}
        {/* ---------------------------------------------------------------- */}
        <PlaceholderCard
          icon={<AlertTriangle size={18} />}
          title="Incident Summary Report"
          description="Aggregated view of all cybersecurity incidents affecting your space infrastructure, including timelines, severity, response actions, and regulatory notification status."
        />

        <PlaceholderCard
          icon={<Layers size={18} />}
          title="Threat Landscape Briefing"
          description="Curated threat intelligence briefing covering active threat actors targeting space operators, SPARTA technique mapping, and recommended mitigations for your asset profile."
        />

        <PlaceholderCard
          icon={<ShieldCheck size={18} />}
          title="Supply Chain Risk Assessment"
          description="Analysis of third-party dependencies in your space systems — ground segment vendors, component suppliers, and software integrations — against known vulnerability databases."
        />

        <PlaceholderCard
          icon={<Clock size={18} />}
          title="Audit Trail Report"
          description="Timestamped log of all compliance changes, asset updates, incident actions, and user activity for regulatory audit purposes and internal governance reviews."
        />
      </div>
    </div>
  );
}
