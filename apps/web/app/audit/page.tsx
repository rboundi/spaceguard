"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  AlertTriangle,
  Search,
  X,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { getAuditLogs, getAuditTrailPdf, type AuditLogEntry } from "@/lib/api";
import { useOrg } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const ACTION_OPTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "VIEW",
  "EXPORT",
  "LOGIN",
  "LOGOUT",
  "STATUS_CHANGE",
  "REPORT_GENERATED",
  "ALERT_ACKNOWLEDGED",
  "INCIDENT_CREATED",
  "MAPPING_CHANGED",
] as const;

const RESOURCE_TYPE_OPTIONS = [
  "organization",
  "asset",
  "compliance_mapping",
  "incident",
  "alert",
  "supplier",
  "report",
  "threat_intel",
];

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  UPDATE: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  DELETE: "bg-red-500/15 text-red-300 border-red-500/30",
  VIEW: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  EXPORT: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  LOGIN: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  LOGOUT: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  STATUS_CHANGE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  REPORT_GENERATED: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  ALERT_ACKNOWLEDGED: "bg-green-500/15 text-green-300 border-green-500/30",
  INCIDENT_CREATED: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  MAPPING_CHANGED: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

const CRITICAL_ACTIONS = new Set([
  "DELETE",
  "STATUS_CHANGE",
  "INCIDENT_CREATED",
  "MAPPING_CHANGED",
]);

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

function fmtTimestamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function shortId(id: string | null): string {
  if (!id) return "-";
  return id.slice(0, 8) + "...";
}

function exportCsv(entries: AuditLogEntry[], filename: string) {
  const header = ["Timestamp", "Actor", "Action", "Resource Type", "Resource ID", "IP Address", "Details"];
  const rows = entries.map((e) => [
    e.timestamp,
    e.actor,
    e.action,
    e.resourceType ?? "",
    e.resourceId ?? "",
    e.ipAddress ?? "",
    e.details ? JSON.stringify(e.details).replace(/"/g, '""') : "",
  ]);
  const csvContent = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ---------------------------------------------------------------------------
// Expandable row component
// ---------------------------------------------------------------------------

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { date, time } = fmtTimestamp(entry.timestamp);
  const isCritical = CRITICAL_ACTIONS.has(entry.action);
  const actionColor = ACTION_COLORS[entry.action] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";

  return (
    <>
      <tr
        className={[
          "border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors cursor-pointer",
          isCritical ? "border-l-2 border-l-amber-500" : "",
        ].join(" ")}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Expand toggle */}
        <td className="pl-4 pr-2 py-3 text-slate-600 w-6">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </td>

        {/* Timestamp */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-xs text-slate-300 font-mono">{date}</span>
          <span className="block text-[10px] text-slate-600 font-mono">{time}</span>
        </td>

        {/* Actor */}
        <td className="px-3 py-3 max-w-[140px]">
          <span className="text-xs text-slate-200 truncate block">{entry.actor}</span>
        </td>

        {/* Action badge */}
        <td className="px-3 py-3">
          <span
            className={[
              "inline-block text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide",
              actionColor,
            ].join(" ")}
          >
            {entry.action.replace(/_/g, " ")}
          </span>
        </td>

        {/* Resource type */}
        <td className="px-3 py-3">
          <span className="text-xs text-slate-400">
            {entry.resourceType ?? <span className="text-slate-700 italic">none</span>}
          </span>
        </td>

        {/* Resource ID */}
        <td className="px-3 py-3">
          <span
            className="text-[10px] font-mono text-slate-500"
            title={entry.resourceId ?? undefined}
          >
            {shortId(entry.resourceId)}
          </span>
        </td>

        {/* Details summary */}
        <td className="px-3 py-3 max-w-[200px]">
          <span className="text-[11px] text-slate-500 truncate block">
            {entry.details
              ? Object.entries(entry.details)
                  .slice(0, 2)
                  .map(([k, v]) => `${k}: ${String(v)}`)
                  .join(", ")
              : "-"}
          </span>
        </td>
      </tr>

      {/* Expanded row */}
      {expanded && (
        <tr className="border-b border-slate-800/60 bg-slate-900/60">
          <td colSpan={7} className="px-8 py-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Left: metadata */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-3">
                  Event Details
                </p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-3">
                    <span className="w-28 text-slate-600 shrink-0">Event ID</span>
                    <span className="font-mono text-slate-400">{entry.id}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-28 text-slate-600 shrink-0">Timestamp</span>
                    <span className="font-mono text-slate-400">{entry.timestamp}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-28 text-slate-600 shrink-0">Actor</span>
                    <span className="text-slate-300">{entry.actor}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-28 text-slate-600 shrink-0">Action</span>
                    <span className="text-slate-300">{entry.action}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-28 text-slate-600 shrink-0">Resource Type</span>
                    <span className="text-slate-300">{entry.resourceType ?? "-"}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-28 text-slate-600 shrink-0">Resource ID</span>
                    <span className="font-mono text-slate-400">{entry.resourceId ?? "-"}</span>
                  </div>
                  {entry.ipAddress && (
                    <div className="flex gap-3">
                      <span className="w-28 text-slate-600 shrink-0">IP Address</span>
                      <span className="font-mono text-slate-400">{entry.ipAddress}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: JSON details */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-3">
                  Payload
                </p>
                {entry.details ? (
                  <pre className="text-[11px] font-mono text-slate-400 bg-slate-950 rounded-md p-3 overflow-x-auto max-h-40">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-slate-600 italic">No details recorded</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PER_PAGE = 25;

export default function AuditPage() {
  const { orgId } = useOrg();

  // Filters
  const [fromDate, setFromDate] = useState(nDaysAgo(30));
  const [toDate, setToDate] = useState(today());
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("_all");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("_all");
  const [page, setPage] = useState(1);

  // Data
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Export PDF
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // CSV export (current page)
  const [csvLoading, setCsvLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getAuditLogs({
        organizationId: orgId,
        from: fromDate,
        to: toDate,
        actor: actorFilter || undefined,
        action: actionFilter === "_all" ? undefined : actionFilter,
        resourceType: resourceTypeFilter === "_all" ? undefined : resourceTypeFilter,
        page,
        perPage: PER_PAGE,
      });
      setEntries(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [orgId, fromDate, toDate, actorFilter, actionFilter, resourceTypeFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, actorFilter, actionFilter, resourceTypeFilter, orgId]);

  async function handleExportPdf() {
    if (!orgId) return;
    setPdfLoading(true);
    setPdfError(null);
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
      setPdfError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      if (document.body.contains(a)) document.body.removeChild(a);
      if (url) {
        const urlToRevoke = url;
        setTimeout(() => URL.revokeObjectURL(urlToRevoke), 100);
      }
      setPdfLoading(false);
    }
  }

  async function handleExportCsv() {
    if (!orgId) return;
    setCsvLoading(true);
    try {
      // Fetch all for the current filter window (up to 1000)
      const result = await getAuditLogs({
        organizationId: orgId,
        from: fromDate,
        to: toDate,
        actor: actorFilter || undefined,
        action: actionFilter === "_all" ? undefined : actionFilter,
        resourceType: resourceTypeFilter === "_all" ? undefined : resourceTypeFilter,
        page: 1,
        perPage: 1000,
      });
      exportCsv(result.data, `spaceguard-audit-${fromDate}-to-${toDate}.csv`);
    } catch {
      // silent - user can retry
    } finally {
      setCsvLoading(false);
    }
  }

  function clearFilters() {
    setFromDate(nDaysAgo(30));
    setToDate(today());
    setActorFilter("");
    setActionFilter("_all");
    setResourceTypeFilter("_all");
  }

  const hasActiveFilters =
    actorFilter !== "" ||
    actionFilter !== "_all" ||
    resourceTypeFilter !== "_all";

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-400">
            <ClipboardList size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Audit Trail</h1>
            <p className="text-slate-400 mt-0.5 text-sm">
              Tamper-evident log of all platform actions and compliance changes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!orgId || csvLoading || entries.length === 0}
            className="border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-700 text-xs"
          >
            {csvLoading ? (
              <Loader2 size={13} className="mr-1.5 animate-spin" />
            ) : (
              <Download size={13} className="mr-1.5" />
            )}
            Export CSV
          </Button>

          <Button
            size="sm"
            onClick={handleExportPdf}
            disabled={!orgId || pdfLoading}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
          >
            {pdfLoading ? (
              <Loader2 size={13} className="mr-1.5 animate-spin" />
            ) : (
              <Download size={13} className="mr-1.5" />
            )}
            Export PDF
          </Button>
        </div>
      </div>

      {pdfError && (
        <div className="flex items-center gap-2 mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle size={12} className="shrink-0" />
          {pdfError}
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
          {/* From date */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">From</Label>
            <div className="relative">
              <Calendar size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              <Input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="pl-7 h-8 text-xs bg-slate-800 border-slate-700 text-slate-300"
              />
            </div>
          </div>

          {/* To date */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">To</Label>
            <div className="relative">
              <Calendar size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
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

          {/* Actor search */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">Actor</Label>
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              <Input
                placeholder="Filter by actor..."
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                className="pl-7 h-8 text-xs bg-slate-800 border-slate-700 text-slate-300 placeholder:text-slate-600"
              />
            </div>
          </div>

          {/* Action filter */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">Action</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-300">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="_all" className="text-xs text-slate-300">All actions</SelectItem>
                {ACTION_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a} className="text-xs text-slate-300">
                    {a.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Resource type filter */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">Resource</Label>
            <Select value={resourceTypeFilter} onValueChange={setResourceTypeFilter}>
              <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-300">
                <SelectValue placeholder="All resources" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="_all" className="text-xs text-slate-300">All resources</SelectItem>
                {RESOURCE_TYPE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs text-slate-300">
                    {r.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear + Refresh */}
          <div className="flex gap-2">
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="h-8 border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 text-xs px-2"
              >
                <X size={12} className="mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="h-8 border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 text-xs px-2"
            >
              {loading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Results info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {loading ? "Loading..." : `${total.toLocaleString()} events`}
          </span>
          {hasActiveFilters && (
            <Badge variant="muted" className="text-[10px]">
              Filtered
            </Badge>
          )}
        </div>
        <span className="text-xs text-slate-600">
          Page {page} of {totalPages}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle size={12} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50">
                <th className="w-6 pl-4"></th>
                <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Timestamp
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Actor
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Action
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Resource Type
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Resource ID
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-600">
                    <Loader2 size={22} className="animate-spin mx-auto mb-2 text-slate-700" />
                    <span className="text-xs">Loading audit events...</span>
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <ClipboardList size={28} className="mx-auto mb-2 text-slate-700" />
                    <p className="text-sm text-slate-600">No audit events found</p>
                    <p className="text-xs text-slate-700 mt-1">
                      Try adjusting the date range or clearing filters
                    </p>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => <AuditRow key={entry.id} entry={entry} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 text-xs h-8"
            >
              Previous
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={[
                      "w-8 h-8 rounded text-xs font-medium transition-colors",
                      pageNum === page
                        ? "bg-blue-600 text-white"
                        : "text-slate-500 hover:bg-slate-800 hover:text-slate-300",
                    ].join(" ")}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 text-xs h-8"
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-[10px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 border-l-2 border-amber-500 rounded-sm" />
          Critical event
        </span>
        <span>Click any row to expand full details</span>
      </div>
    </div>
  );
}
