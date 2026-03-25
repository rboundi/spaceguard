"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  FileText,
  Shield,
  AlertTriangle,
  ClipboardList,
  Globe,
  Loader2,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useOrg } from "@/lib/context";
import {
  exportAlertsCsv,
  exportIncidentsCsv,
  exportComplianceCsv,
  exportAuditCsv,
  exportStixBundle,
  type StixExportOptions,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Download history (localStorage)
// ---------------------------------------------------------------------------

interface DownloadEntry {
  type: string;
  format: string;
  timestamp: string;
  orgName: string;
}

const HISTORY_KEY = "spaceguard_export_history";

function getHistory(): DownloadEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as DownloadEntry[]) : [];
  } catch { return []; }
}

function addHistory(entry: DownloadEntry) {
  try {
    const h = getHistory();
    h.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ExportsPage() {
  const { orgId, orgName } = useOrg();

  // Date range
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // STIX options
  const [stixAlerts, setStixAlerts] = useState(true);
  const [stixIncidents, setStixIncidents] = useState(true);
  const [stixIntel, setStixIntel] = useState(true);
  const [stixRelationships, setStixRelationships] = useState(true);

  // Status
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DownloadEntry[]>([]);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const doExport = useCallback(async (
    key: string,
    label: string,
    format: string,
    fn: () => Promise<void>
  ) => {
    if (!orgId) return;
    setLoading(key);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      const entry: DownloadEntry = {
        type: label,
        format,
        timestamp: new Date().toISOString(),
        orgName,
      };
      addHistory(entry);
      setHistory(getHistory());
      setSuccess(key);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(null);
    }
  }, [orgId, orgName]);

  if (!orgId) {
    return (
      <div className="p-6 text-sm text-slate-500">Select an organization to export data.</div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Data Exports</h1>
        <p className="text-xs text-slate-500 mt-1">
          Export your organization&apos;s data as CSV files or STIX 2.1 bundles for sharing with CSIRTs and EU Space ISAC.
        </p>
      </div>

      {/* Date range picker */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 px-2 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 px-2 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
        {(from || to) && (
          <button
            onClick={() => { setFrom(""); setTo(""); }}
            className="text-[11px] text-slate-500 hover:text-slate-300 underline"
          >
            Clear dates
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* CSV export cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ExportCard
          icon={AlertTriangle}
          title="Alerts"
          description="All alerts with severity, SPARTA mappings, and resolution status"
          format="CSV"
          loading={loading === "alerts-csv"}
          done={success === "alerts-csv"}
          onExport={() =>
            doExport("alerts-csv", "Alerts", "CSV", () =>
              exportAlertsCsv(orgId, from || undefined, to || undefined)
            )
          }
        />
        <ExportCard
          icon={Shield}
          title="Incidents"
          description="All incidents with timeline, severity, NIS2 classification"
          format="CSV"
          loading={loading === "incidents-csv"}
          done={success === "incidents-csv"}
          onExport={() =>
            doExport("incidents-csv", "Incidents", "CSV", () =>
              exportIncidentsCsv(orgId, from || undefined, to || undefined)
            )
          }
        />
        <ExportCard
          icon={FileText}
          title="Compliance Mappings"
          description="NIS2 requirement mappings with status, evidence, and responsible party"
          format="CSV"
          loading={loading === "compliance-csv"}
          done={success === "compliance-csv"}
          onExport={() =>
            doExport("compliance-csv", "Compliance", "CSV", () =>
              exportComplianceCsv(orgId)
            )
          }
        />
        <ExportCard
          icon={ClipboardList}
          title="Audit Trail"
          description="Full audit log with actors, actions, and timestamps"
          format="CSV"
          loading={loading === "audit-csv"}
          done={success === "audit-csv"}
          onExport={() =>
            doExport("audit-csv", "Audit Trail", "CSV", () =>
              exportAuditCsv(orgId, from || undefined, to || undefined)
            )
          }
        />
      </div>

      {/* STIX 2.1 Bundle section */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={16} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-slate-200">STIX 2.1 Bundle Export</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Export threat data in STIX 2.1 format for sharing with national CSIRTs, EU Space ISAC, and other
          threat intelligence platforms. Select which data to include in the bundle.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <StixToggle label="Alerts (as Indicators)" checked={stixAlerts} onChange={setStixAlerts} />
          <StixToggle label="Incidents" checked={stixIncidents} onChange={setStixIncidents} />
          <StixToggle label="Threat Intelligence" checked={stixIntel} onChange={setStixIntel} />
          <StixToggle label="Relationships" checked={stixRelationships} onChange={setStixRelationships} />
        </div>

        <Button
          size="sm"
          disabled={loading === "stix" || (!stixAlerts && !stixIncidents && !stixIntel)}
          onClick={() => {
            const opts: StixExportOptions = {
              organizationId: orgId,
              includeAlerts: stixAlerts,
              includeIncidents: stixIncidents,
              includeThreatIntel: stixIntel,
              includeRelationships: stixRelationships,
              from: from || undefined,
              to: to || undefined,
            };
            void doExport("stix", "STIX Bundle", "JSON", () => exportStixBundle(opts));
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          {loading === "stix" ? (
            <Loader2 size={14} className="animate-spin mr-2" />
          ) : success === "stix" ? (
            <CheckCircle size={14} className="mr-2" />
          ) : (
            <Download size={14} className="mr-2" />
          )}
          {loading === "stix" ? "Generating..." : success === "stix" ? "Downloaded" : "Export STIX Bundle"}
        </Button>
      </section>

      {/* Download history */}
      {history.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
            <Clock size={14} className="text-slate-500" />
            Recent Downloads
          </h2>
          <div className="bg-slate-900 border border-slate-800 rounded-lg divide-y divide-slate-800">
            {history.slice(0, 10).map((h, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-slate-300 font-medium">{h.type}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-mono">
                    {h.format}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 shrink-0">
                  <span className="hidden sm:inline">{h.orgName}</span>
                  <span>{new Date(h.timestamp).toLocaleDateString()}</span>
                  <span>{new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export card component
// ---------------------------------------------------------------------------

function ExportCard({
  icon: Icon,
  title,
  description,
  format,
  loading,
  done,
  onExport,
}: {
  icon: React.ComponentType<{ size?: string | number; className?: string }>;
  title: string;
  description: string;
  format: string;
  loading: boolean;
  done: boolean;
  onExport: () => void;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className="text-slate-400" />
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-mono ml-auto">
          {format}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mb-3 flex-1">{description}</p>
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={onExport}
        className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
      >
        {loading ? (
          <Loader2 size={13} className="animate-spin mr-2" />
        ) : done ? (
          <CheckCircle size={13} className="mr-2 text-emerald-400" />
        ) : (
          <Download size={13} className="mr-2" />
        )}
        {loading ? "Exporting..." : done ? "Downloaded" : `Export ${format}`}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STIX checkbox toggle
// ---------------------------------------------------------------------------

function StixToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 p-2 rounded bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:border-slate-600 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0"
      />
      <span className="text-xs text-slate-300">{label}</span>
    </label>
  );
}
