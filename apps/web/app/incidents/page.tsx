"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Zap,
  Plus,
  RefreshCw,
  ChevronRight,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getIncidents, createIncident, getAssets } from "@/lib/api";
import type { IncidentResponse, AssetResponse } from "@/lib/api";
import { useOrg } from "@/lib/context";

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

type Severity = IncidentResponse["severity"];
type Status = IncidentResponse["status"];

const SEVERITY_BADGE: Record<Severity, string> = {
  CRITICAL: "bg-red-500/20 text-red-300 border border-red-500/40",
  HIGH:     "bg-amber-500/20 text-amber-300 border border-amber-500/40",
  MEDIUM:   "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40",
  LOW:      "bg-blue-500/20 text-blue-300 border border-blue-500/40",
};

const STATUS_BADGE: Record<Status, string> = {
  DETECTED:      "bg-red-500/20 text-red-300 border border-red-500/40",
  TRIAGING:      "bg-orange-500/20 text-orange-300 border border-orange-500/40",
  INVESTIGATING: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
  CONTAINING:    "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40",
  ERADICATING:   "bg-purple-500/20 text-purple-300 border border-purple-500/40",
  RECOVERING:    "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40",
  CLOSED:        "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
  FALSE_POSITIVE:"bg-slate-500/20 text-slate-400 border border-slate-500/30",
};

const STATUS_LABEL: Record<Status, string> = {
  DETECTED:      "Detected",
  TRIAGING:      "Triaging",
  INVESTIGATING: "Investigating",
  CONTAINING:    "Containing",
  ERADICATING:   "Eradicating",
  RECOVERING:    "Recovering",
  CLOSED:        "Closed",
  FALSE_POSITIVE:"False Positive",
};

const ACTIVE_STATUSES: Status[] = [
  "DETECTED", "TRIAGING", "INVESTIGATING",
  "CONTAINING", "ERADICATING", "RECOVERING",
];

function SeverityIcon({ s }: { s: Severity }) {
  switch (s) {
    case "CRITICAL": return <Zap size={12} className="text-red-400" />;
    case "HIGH":     return <AlertTriangle size={12} className="text-amber-400" />;
    case "MEDIUM":   return <AlertCircle size={12} className="text-yellow-400" />;
    default:         return <Info size={12} className="text-blue-400" />;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)    return "just now";
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Create incident dialog
// ---------------------------------------------------------------------------

function CreateIncidentDialog({
  open,
  orgId,
  assets,
  onClose,
  onCreate,
}: {
  open: boolean;
  orgId: string;
  assets: AssetResponse[];
  onClose: () => void;
  onCreate: (i: IncidentResponse) => void;
}) {
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity]       = useState<Severity>("HIGH");
  const [nis2, setNis2]               = useState<"SIGNIFICANT" | "NON_SIGNIFICANT">("NON_SIGNIFICANT");
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  function reset() {
    setTitle(""); setDescription(""); setSeverity("HIGH");
    setNis2("NON_SIGNIFICANT"); setSelectedAssets([]); setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const incident = await createIncident({
        organizationId: orgId,
        title: title.trim(),
        description: description.trim(),
        severity,
        nis2Classification: nis2,
        affectedAssetIds: selectedAssets,
        detectedAt: new Date().toISOString(),
      });
      reset();
      onCreate(incident);
    } catch {
      setError("Failed to create incident. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggleAsset(id: string) {
    setSelectedAssets((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Create Incident</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              placeholder="Anomalous uplink activity detected..."
              maxLength={500}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Describe the incident..."
            />
          </div>

          {/* Severity + NIS2 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Severity</label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                  {(["CRITICAL","HIGH","MEDIUM","LOW"] as Severity[]).map((s) => (
                    <SelectItem key={s} value={s} className="focus:bg-slate-700">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">NIS2</label>
              <Select value={nis2} onValueChange={(v) => setNis2(v as typeof nis2)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                  <SelectItem value="SIGNIFICANT"     className="focus:bg-slate-700">Significant</SelectItem>
                  <SelectItem value="NON_SIGNIFICANT" className="focus:bg-slate-700">Non-Significant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Affected assets */}
          {assets.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Affected Assets</label>
              <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-800 rounded border border-slate-700 p-2">
                {assets.slice(0, 20).map((a) => (
                  <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedAssets.includes(a.id)}
                      onChange={() => toggleAsset(a.id)}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-slate-300">{a.name}</span>
                    <span className="text-[10px] text-slate-500 ml-auto">{a.assetType.replace(/_/g," ")}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { reset(); onClose(); }}
              className="text-slate-400 hover:text-slate-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? "Creating..." : "Create Incident"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IncidentsPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [incidents, setIncidents]     = useState<IncidentResponse[]>([]);
  const [total, setTotal]             = useState(0);
  const [assets, setAssets]           = useState<AssetResponse[]>([]);
  const [loading, setLoading]         = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus]     = useState<string>("all");
  const [createOpen, setCreateOpen]   = useState(false);
  const [newIds, setNewIds]           = useState<Set<string>>(new Set());
  const seenIds = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const query: Parameters<typeof getIncidents>[0] = {
        organizationId: orgId,
        perPage: 50,
      };
      if (filterSeverity !== "all") query.severity = filterSeverity;
      if (filterStatus   !== "all") query.status   = filterStatus;

      const result = await getIncidents(query);
      if (!mountedRef.current) return;

      // Detect freshly arrived incidents for highlight animation
      const fresh = new Set<string>();
      for (const inc of result.data) {
        if (seenIds.current.size > 0 && !seenIds.current.has(inc.id)) {
          fresh.add(inc.id);
        }
        seenIds.current.add(inc.id);
      }
      setNewIds(fresh);
      if (fresh.size > 0) {
        setTimeout(() => {
          if (mountedRef.current) setNewIds(new Set());
        }, 3000);
      }

      setIncidents(result.data);
      setTotal(result.total);
    } catch {
      // silent
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [orgId, filterSeverity, filterStatus]);

  // Load assets for create dialog
  useEffect(() => {
    if (!orgId) return;
    getAssets({ organizationId: orgId, perPage: 100 })
      .then((r) => { if (mountedRef.current) setAssets(r.data); })
      .catch(() => {});
  }, [orgId]);

  useEffect(() => {
    if (!orgLoading) void load();
  }, [orgLoading, load]);

  function handleCreated(inc: IncidentResponse) {
    setCreateOpen(false);
    setIncidents((prev) => [inc, ...prev]);
    setTotal((t) => t + 1);
    setNewIds(new Set([inc.id]));
    setTimeout(() => setNewIds(new Set()), 3000);
  }

  const activeCount = incidents.filter((i) =>
    ACTIVE_STATUSES.includes(i.status)
  ).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Incidents</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} total &middot; {activeCount} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
          {orgId && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <Plus size={14} />
              Create Incident
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-slate-300 h-8 text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-300">
            <SelectItem value="all"      className="focus:bg-slate-700 text-xs">All Severities</SelectItem>
            <SelectItem value="CRITICAL" className="focus:bg-slate-700 text-xs">Critical</SelectItem>
            <SelectItem value="HIGH"     className="focus:bg-slate-700 text-xs">High</SelectItem>
            <SelectItem value="MEDIUM"   className="focus:bg-slate-700 text-xs">Medium</SelectItem>
            <SelectItem value="LOW"      className="focus:bg-slate-700 text-xs">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44 bg-slate-800 border-slate-700 text-slate-300 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-300">
            <SelectItem value="all"           className="focus:bg-slate-700 text-xs">All Statuses</SelectItem>
            <SelectItem value="DETECTED"      className="focus:bg-slate-700 text-xs">Detected</SelectItem>
            <SelectItem value="TRIAGING"      className="focus:bg-slate-700 text-xs">Triaging</SelectItem>
            <SelectItem value="INVESTIGATING" className="focus:bg-slate-700 text-xs">Investigating</SelectItem>
            <SelectItem value="CONTAINING"    className="focus:bg-slate-700 text-xs">Containing</SelectItem>
            <SelectItem value="ERADICATING"   className="focus:bg-slate-700 text-xs">Eradicating</SelectItem>
            <SelectItem value="RECOVERING"    className="focus:bg-slate-700 text-xs">Recovering</SelectItem>
            <SelectItem value="CLOSED"        className="focus:bg-slate-700 text-xs">Closed</SelectItem>
            <SelectItem value="FALSE_POSITIVE" className="focus:bg-slate-700 text-xs">False Positive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400 text-xs font-semibold">Title</TableHead>
                <TableHead className="text-slate-400 text-xs font-semibold">Severity</TableHead>
                <TableHead className="text-slate-400 text-xs font-semibold">Status</TableHead>
                <TableHead className="text-slate-400 text-xs font-semibold">NIS2</TableHead>
                <TableHead className="text-slate-400 text-xs font-semibold">Assets</TableHead>
                <TableHead className="text-slate-400 text-xs font-semibold">Detected</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && incidents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500 py-10 text-sm">
                    Loading...
                  </TableCell>
                </TableRow>
              )}
              {!loading && incidents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500 py-10 text-sm">
                    No incidents found.
                  </TableCell>
                </TableRow>
              )}
              {incidents.map((inc) => {
                const isNew = newIds.has(inc.id);
                return (
                  <TableRow
                    key={inc.id}
                    className={[
                      "border-slate-800 cursor-pointer group transition-colors",
                      isNew
                        ? "bg-blue-500/10 animate-pulse"
                        : "hover:bg-slate-800/50",
                    ].join(" ")}
                  >
                    <TableCell className="py-3">
                      <Link href={`/incidents/${inc.id}`} className="block group-hover:text-blue-400 transition-colors">
                        <span className="text-sm font-medium text-slate-200 line-clamp-1">
                          {inc.title}
                        </span>
                        <span className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                          {inc.description}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${SEVERITY_BADGE[inc.severity]}`}>
                        <SeverityIcon s={inc.severity} />
                        {inc.severity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_BADGE[inc.status]}`}>
                        {STATUS_LABEL[inc.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-[11px] font-medium ${
                        inc.nis2Classification === "SIGNIFICANT"
                          ? "text-amber-400"
                          : "text-slate-500"
                      }`}>
                        {inc.nis2Classification === "SIGNIFICANT" ? "Significant" : "Non-Significant"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-400">
                        {inc.affectedAssetIds.length > 0
                          ? `${inc.affectedAssetIds.length} asset${inc.affectedAssetIds.length !== 1 ? "s" : ""}`
                          : <span className="text-slate-600">—</span>
                        }
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {inc.detectedAt ? relativeTime(inc.detectedAt) : relativeTime(inc.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Link href={`/incidents/${inc.id}`}>
                        <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      {orgId && (
        <CreateIncidentDialog
          open={createOpen}
          orgId={orgId}
          assets={assets}
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreated}
        />
      )}
    </div>
  );
}
