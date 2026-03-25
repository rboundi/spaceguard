"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Zap,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Shield,
  Eye,
  BookOpen,
  Download,
  ShieldCheck,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAlerts, updateAlert, getAsset, enrichAlert, exportAlertsCsv } from "@/lib/api";
import type { AlertEnrichment, AlertResponse } from "@/lib/api";
import { useOrg } from "@/lib/context";

// ---------------------------------------------------------------------------
// Helpers / constants
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<AlertResponse["severity"], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const SEVERITY_BADGE_CLASS: Record<AlertResponse["severity"], string> = {
  CRITICAL: "bg-red-500/20 text-red-300 border-red-500/40",
  HIGH:     "bg-amber-500/20 text-amber-300 border-amber-500/40",
  MEDIUM:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  LOW:      "bg-blue-500/20 text-blue-300 border-blue-500/40",
};

const STATUS_BADGE_CLASS: Record<AlertResponse["status"], string> = {
  NEW:            "bg-red-500/20 text-red-300 border-red-500/40",
  INVESTIGATING:  "bg-amber-500/20 text-amber-300 border-amber-500/40",
  RESOLVED:       "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  FALSE_POSITIVE: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const STATUS_LABEL: Record<AlertResponse["status"], string> = {
  NEW:            "New",
  INVESTIGATING:  "Investigating",
  RESOLVED:       "Resolved",
  FALSE_POSITIVE: "False Positive",
};

function SeverityIcon({ severity }: { severity: AlertResponse["severity"] }) {
  switch (severity) {
    case "CRITICAL": return <Zap size={13} className="text-red-400 shrink-0" />;
    case "HIGH":     return <AlertTriangle size={13} className="text-amber-400 shrink-0" />;
    case "MEDIUM":   return <AlertCircle size={13} className="text-yellow-400 shrink-0" />;
    default:         return <Info size={13} className="text-blue-400 shrink-0" />;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}


// ---------------------------------------------------------------------------
// STIX 2.1 export
// ---------------------------------------------------------------------------

function buildStixBundle(alerts: AlertResponse[]): string {
  const objects = alerts.map((a) => ({
    type: "indicator",
    spec_version: "2.1",
    id: `indicator--${a.id}`,
    created: a.createdAt,
    modified: a.updatedAt,
    name: a.title,
    description: a.description,
    indicator_types: ["anomalous-activity"],
    pattern: `[x-spaceguard:rule_id = '${a.ruleId}']`,
    pattern_type: "stix",
    valid_from: a.triggeredAt,
    severity: a.severity.toLowerCase(),
    labels: [
      `severity:${a.severity.toLowerCase()}`,
      `status:${a.status.toLowerCase()}`,
      ...(a.spartaTactic ? [`sparta-tactic:${a.spartaTactic}`] : []),
      ...(a.spartaTechnique ? [`sparta-technique:${a.spartaTechnique}`] : []),
    ],
    ...(a.spartaTactic && {
      kill_chain_phases: [
        {
          kill_chain_name: "sparta",
          phase_name: a.spartaTactic.toLowerCase().replace(/\s+/g, "-"),
        },
      ],
    }),
    x_spaceguard_alert_id: a.id,
    x_spaceguard_rule_id: a.ruleId,
    x_spaceguard_affected_asset_id: a.affectedAssetId,
  }));

  const bundle = {
    type: "bundle",
    id: `bundle--${crypto.randomUUID()}`,
    objects,
  };

  return JSON.stringify(bundle, null, 2);
}

function downloadStixBundle(alerts: AlertResponse[]) {
  const json = buildStixBundle(alerts);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spaceguard-stix-bundle-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Intel context card (shown inside ExpandedRow when alert has SPARTA fields)
// ---------------------------------------------------------------------------

interface IntelContextCardProps {
  alertId: string;
}

function IntelContextCard({ alertId }: IntelContextCardProps) {
  const [enrichment, setEnrichment] = useState<AlertEnrichment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await enrichAlert(alertId);
        if (!cancelled) setEnrichment(data);
      } catch {
        if (!cancelled) setError("Unable to load intelligence context.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [alertId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        <span className="text-xs text-slate-600">Loading intelligence context...</span>
      </div>
    );
  }

  if (error || !enrichment || enrichment.matchedIntel.length === 0) {
    return (
      <p className="text-xs text-slate-600 italic py-1">
        {error ?? "No matched SPARTA techniques found in the intel store."}
      </p>
    );
  }

  const technique = enrichment.matchedIntel[0];
  const data = technique.data as Record<string, unknown>;

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 space-y-3">
      {/* Technique header */}
      <div className="flex items-start gap-2">
        <Shield size={13} className="text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-blue-300 leading-snug">{technique.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {enrichment.spartaTactic && (
              <span className="text-[10px] text-slate-500">{enrichment.spartaTactic}</span>
            )}
            {typeof data.x_sparta_id === "string" && (
              <span className="text-[10px] font-mono text-slate-600 bg-slate-800 border border-slate-700 px-1 py-0.5 rounded">
                {data.x_sparta_id}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Detection tips */}
      {enrichment.detectionTips.length > 0 && (
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Eye size={11} className="text-amber-400" aria-hidden="true" />
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Detection Guidance</p>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{enrichment.detectionTips[0]}</p>
        </div>
      )}

      {/* Mitigations */}
      {enrichment.mitigations.length > 0 && (
        <div>
          <div className="flex items-center gap-1 mb-1">
            <BookOpen size={11} className="text-emerald-400" aria-hidden="true" />
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Recommended Mitigation</p>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{enrichment.mitigations[0]}</p>
        </div>
      )}

      {enrichment.matchedIntel.length > 1 && (
        <p className="text-[10px] text-slate-600">
          +{enrichment.matchedIntel.length - 1} additional technique{enrichment.matchedIntel.length > 2 ? "s" : ""} matched.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row expansion component
// ---------------------------------------------------------------------------

interface ExpandedRowProps {
  alert: AlertResponse;
  onAction: (id: string, status: AlertResponse["status"]) => Promise<void>;
  actionLoading: boolean;
  assetName: string | null;
}

function ExpandedRow({ alert, onAction, actionLoading, assetName }: ExpandedRowProps) {
  const isOpen = alert.status === "NEW" || alert.status === "INVESTIGATING";

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Description */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Description</p>
        <p className="text-xs text-slate-300 leading-relaxed">{alert.description}</p>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-0.5">Rule ID</p>
          <p className="text-xs font-mono text-slate-400">{alert.ruleId}</p>
        </div>
        {alert.spartaTactic && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-0.5">SPARTA Tactic</p>
            <p className="text-xs text-slate-400">{alert.spartaTactic}</p>
          </div>
        )}
        {alert.spartaTechnique && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-0.5">SPARTA Technique</p>
            <p className="text-xs text-slate-400">{alert.spartaTechnique}</p>
          </div>
        )}
        {assetName && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-0.5">Affected Asset</p>
            <p className="text-xs text-slate-400">{assetName}</p>
          </div>
        )}
        {alert.triggeredAt && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-0.5">Triggered</p>
            <p className="text-xs text-slate-400">
              {new Date(alert.triggeredAt).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "medium",
              })}
            </p>
          </div>
        )}
        {alert.resolvedAt && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-0.5">Resolved</p>
            <p className="text-xs text-slate-400">
              {new Date(alert.resolvedAt).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "medium",
              })}
              {alert.resolvedBy && ` by ${alert.resolvedBy}`}
            </p>
          </div>
        )}
        {alert.streamId && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-0.5">Stream ID</p>
            <p className="text-xs font-mono text-slate-500 truncate">{alert.streamId}</p>
          </div>
        )}
      </div>

      {/* Trigger metadata */}
      {alert.metadata && Object.keys(alert.metadata).length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Trigger Context</p>
          <div className="rounded bg-slate-950 border border-slate-800 px-3 py-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
            {Object.entries(alert.metadata).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-600 font-mono">{key}:</span>
                <span className="text-[10px] text-slate-300 font-mono">
                  {typeof val === "object"
                    ? (() => { try { return JSON.stringify(val); } catch { return "[object]"; } })()
                    : String(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intelligence Context */}
      {(alert.spartaTactic || alert.spartaTechnique) && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-2 font-semibold">
            Intelligence Context
          </p>
          <IntelContextCard alertId={alert.id} />
        </div>
      )}

      {/* Actions */}
      {isOpen && (
        <div className="flex items-center gap-2 pt-1">
          {alert.status === "NEW" && (
            <Button
              size="sm"
              variant="outline"
              disabled={actionLoading}
              onClick={() => onAction(alert.id, "INVESTIGATING")}
              className="h-7 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              Investigate
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={actionLoading}
            onClick={() => onAction(alert.id, "RESOLVED")}
            className="h-7 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
          >
            Resolve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={actionLoading}
            onClick={() => onAction(alert.id, "FALSE_POSITIVE")}
            className="h-7 text-xs border-slate-500/40 text-slate-400 hover:bg-slate-700/40"
          >
            False Positive
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const SEVERITY_OPTIONS = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const STATUS_OPTIONS = ["", "NEW", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"] as const;

export default function AlertsPage() {
  const { orgId, loading: orgLoading } = useOrg();

  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assetNames, setAssetNames] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Tracks asset IDs for which a fetch has already been dispatched.
  // Using a ref avoids making loadAssetName depend on assetNames state,
  // which would cause it to be recreated on every fetch completion.
  const fetchedAssetIds = useRef<Set<string>>(new Set());

  // Clear stale asset name cache and fetched-IDs set on org change
  useEffect(() => {
    fetchedAssetIds.current = new Set();
    setAssetNames({});
  }, [orgId]);

  // ---------------------------------------------------------------------------
  // Fetch alerts
  // ---------------------------------------------------------------------------

  const fetchAlerts = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await getAlerts({
        organizationId: orgId,
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
        perPage: 50,
      });
      if (!mountedRef.current) return;
      setAlerts(result.data);
      setTotal(result.total);
      // Clear stale selections that may reference alerts no longer in the list
      setSelectedIds(new Set());
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [orgId, severityFilter, statusFilter]);

  useEffect(() => {
    if (!orgLoading) void fetchAlerts();
  }, [orgLoading, fetchAlerts]);

  // ---------------------------------------------------------------------------
  // Load asset names for expanded rows
  // ---------------------------------------------------------------------------

  const loadAssetName = useCallback(async (assetId: string) => {
    if (fetchedAssetIds.current.has(assetId)) return;
    fetchedAssetIds.current.add(assetId);
    try {
      const asset = await getAsset(assetId);
      if (mountedRef.current) {
        setAssetNames((prev) => ({ ...prev, [assetId]: asset.name }));
      }
    } catch {
      // Allow retry on next click by removing from the fetched set
      fetchedAssetIds.current.delete(assetId);
    }
  }, []);

  const handleRowClick = (id: string, assetId: string | null) => {
    setExpandedId((prev) => (prev === id ? null : id));
    if (assetId) void loadAssetName(assetId);
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((a) => a.id)));
    }
  };

  const handleExportStix = () => {
    const toExport = selectedIds.size > 0
      ? alerts.filter((a) => selectedIds.has(a.id))
      : alerts;
    downloadStixBundle(toExport);
  };

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleAction = async (id: string, status: AlertResponse["status"]) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await updateAlert(id, { status });
      setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update alert";
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived: sorted
  // ---------------------------------------------------------------------------

  const sorted = [...alerts].sort((a, b) => {
    // Sort NEW/INVESTIGATING first, then by severity, then by time desc
    const statusWeight = (s: AlertResponse["status"]) =>
      s === "NEW" ? 0 : s === "INVESTIGATING" ? 1 : 2;
    const sw = statusWeight(a.status) - statusWeight(b.status);
    if (sw !== 0) return sw;
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime();
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (orgLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-7 w-48 rounded bg-slate-800 animate-pulse" />
        <div className="h-64 rounded-lg bg-slate-800 animate-pulse" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-12 text-center">
          <ShieldCheck size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-300 text-sm font-medium">Select an organization</p>
          <p className="text-slate-500 text-xs mt-1">
            Choose an organization from the switcher above to view security alerts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Alerts</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Security events detected by the monitoring engine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/alerts/rules">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-slate-700 text-slate-400 hover:text-slate-200"
            >
              <BookOpen size={13} />
              Rule Library
            </Button>
          </Link>
          {alerts.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => orgId && void exportAlertsCsv(orgId)}
                className="gap-1.5 text-xs border-slate-700 text-slate-400 hover:text-slate-200"
              >
                <Download size={13} />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportStix}
                className="gap-1.5 text-xs border-slate-700 text-slate-400 hover:text-slate-200"
              >
                <Download size={13} />
                STIX
                {selectedIds.size > 0 && (
                  <span className="text-[10px] text-blue-400 ml-0.5">({selectedIds.size})</span>
                )}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchAlerts()}
            disabled={loading}
            className="gap-1.5 text-xs border-slate-700 text-slate-400 hover:text-slate-200"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Severity</span>
            <Select
              value={severityFilter}
              onValueChange={(v) => setSeverityFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger className="h-7 w-32 text-xs bg-slate-800 border-slate-700 text-slate-300">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-xs text-slate-300">All</SelectItem>
                {SEVERITY_OPTIONS.slice(1).map((s) => (
                  <SelectItem key={s} value={s} className="text-xs text-slate-300">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Status</span>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger className="h-7 w-36 text-xs bg-slate-800 border-slate-700 text-slate-300">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-xs text-slate-300">All</SelectItem>
                {STATUS_OPTIONS.slice(1).map((s) => (
                  <SelectItem key={s} value={s} className="text-xs text-slate-300">
                    {STATUS_LABEL[s as AlertResponse["status"]]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="ml-auto text-xs text-slate-600">
            {total} alert{total !== 1 ? "s" : ""}
            {(severityFilter || statusFilter) ? " (filtered)" : ""}
          </span>
        </CardContent>
      </Card>

      {/* Errors */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}
      {actionError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-400 text-xs flex items-center justify-between">
          <span><strong>Action failed:</strong> {actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-amber-500 hover:text-amber-300 text-xs ml-4 shrink-0"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-0 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-slate-200">
            Alert List
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {loading && alerts.length === 0 ? (
            <div className="p-8 text-center">
              <div className="inline-block h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-12 text-center">
              <ShieldCheck size={36} className="mx-auto text-emerald-500 mb-3" />
              <p className="text-slate-200 font-medium text-sm">No alerts detected</p>
              <p className="text-slate-500 text-xs mt-1.5 max-w-xs mx-auto">
                {severityFilter || statusFilter
                  ? "No alerts match your current filters. Try adjusting them."
                  : "Your space systems are looking good. The detection engine is actively monitoring telemetry for anomalies."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="w-8 px-2">
                    <input
                      type="checkbox"
                      checked={sorted.length > 0 && selectedIds.size === sorted.length}
                      onChange={toggleSelectAll}
                      className="accent-blue-500"
                      aria-label="Select all alerts"
                    />
                  </TableHead>
                  <TableHead className="w-6 px-4" />
                  <TableHead className="text-slate-500 text-xs font-medium px-3 py-2.5">
                    Severity
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-3 py-2.5">
                    Title
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-3 py-2.5">
                    Status
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-3 py-2.5">
                    SPARTA Technique
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-3 py-2.5 text-right">
                    Triggered
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((alert) => {
                  const expanded = expandedId === alert.id;
                  return (
                    <React.Fragment key={alert.id}>
                      <TableRow
                        className={[
                          "border-slate-800 cursor-pointer transition-colors",
                          expanded
                            ? "bg-slate-800/70"
                            : "hover:bg-slate-800/40",
                        ].join(" ")}
                        onClick={() => handleRowClick(alert.id, alert.affectedAssetId)}
                        aria-expanded={expanded}
                      >
                        {/* Checkbox */}
                        <TableCell className="px-2 py-2.5 w-8" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(alert.id)}
                            onChange={() => {}}
                            onClick={(e) => toggleSelect(alert.id, e)}
                            className="accent-blue-500"
                            aria-label={`Select ${alert.title}`}
                          />
                        </TableCell>

                        {/* Expand chevron */}
                        <TableCell className="px-4 py-2.5 w-6">
                          {expanded ? (
                            <ChevronDown size={14} className="text-slate-500" />
                          ) : (
                            <ChevronRight size={14} className="text-slate-600" />
                          )}
                        </TableCell>

                        {/* Severity */}
                        <TableCell className="px-3 py-2.5">
                          <span
                            className={[
                              "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5",
                              "rounded border",
                              SEVERITY_BADGE_CLASS[alert.severity],
                            ].join(" ")}
                          >
                            <SeverityIcon severity={alert.severity} />
                            {alert.severity}
                          </span>
                        </TableCell>

                        {/* Title */}
                        <TableCell className="px-3 py-2.5">
                          <span className="text-xs text-slate-200 font-medium line-clamp-1">
                            {alert.title}
                          </span>
                          {alert.affectedAssetId && assetNames[alert.affectedAssetId] && (
                            <span className="text-[10px] text-slate-500 block mt-0.5">
                              {assetNames[alert.affectedAssetId]}
                            </span>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="px-3 py-2.5">
                          <span
                            className={[
                              "inline-flex items-center text-[10px] font-medium px-1.5 py-0.5",
                              "rounded border",
                              STATUS_BADGE_CLASS[alert.status],
                            ].join(" ")}
                          >
                            {STATUS_LABEL[alert.status]}
                          </span>
                        </TableCell>

                        {/* SPARTA Technique */}
                        <TableCell className="px-3 py-2.5">
                          <span className="text-[11px] text-slate-500">
                            {alert.spartaTechnique ?? alert.spartaTactic ?? ""}
                          </span>
                        </TableCell>

                        {/* Triggered At */}
                        <TableCell className="px-3 py-2.5 text-right">
                          <span
                            className="text-[11px] text-slate-500"
                            title={new Date(alert.triggeredAt).toLocaleString()}
                          >
                            {relativeTime(alert.triggeredAt)}
                          </span>
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail row */}
                      {expanded && (
                        <TableRow className="border-slate-800 bg-slate-800/40">
                          <TableCell colSpan={7} className="px-0 py-0">
                            <ExpandedRow
                              alert={alert}
                              onAction={handleAction}
                              actionLoading={actionLoading}
                              assetName={
                                alert.affectedAssetId
                                  ? (assetNames[alert.affectedAssetId] ?? null)
                                  : null
                              }
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
