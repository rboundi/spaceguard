"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  AlertCircle,
  Info,
  Zap,
  Clock,
  FileText,
  MessageSquare,
  Bell,
  Satellite,
  CheckCircle2,
  Send,
  Plus,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getIncident,
  updateIncident,
  getIncidentNotes,
  addIncidentNote,
  getIncidentAlerts,
  getIncidentReports,
  generateIncidentReport,
  submitIncidentReport,
  getAlert,
  getAsset,
} from "@/lib/api";
import type {
  IncidentResponse,
  IncidentNoteResponse,
  IncidentAlertLinkResponse,
  IncidentReportResponse,
  AlertResponse,
  AssetResponse,
  TimelineEntry,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = IncidentResponse["severity"];
type Status   = IncidentResponse["status"];
type ReportType = IncidentReportResponse["reportType"];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_ORDER: Status[] = [
  "DETECTED", "TRIAGING", "INVESTIGATING",
  "CONTAINING", "ERADICATING", "RECOVERING", "CLOSED",
];

// Which statuses can follow the current one
const STATUS_TRANSITIONS: Record<Status, Status[]> = {
  DETECTED:      ["TRIAGING", "FALSE_POSITIVE"],
  TRIAGING:      ["INVESTIGATING", "FALSE_POSITIVE"],
  INVESTIGATING: ["CONTAINING", "FALSE_POSITIVE"],
  CONTAINING:    ["ERADICATING"],
  ERADICATING:   ["RECOVERING"],
  RECOVERING:    ["CLOSED"],
  CLOSED:        [],
  FALSE_POSITIVE:[],
};

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

const ALERT_SEVERITY_BADGE: Record<AlertResponse["severity"], string> = {
  CRITICAL: "bg-red-500/20 text-red-300 border border-red-500/40",
  HIGH:     "bg-amber-500/20 text-amber-300 border border-amber-500/40",
  MEDIUM:   "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40",
  LOW:      "bg-blue-500/20 text-blue-300 border border-blue-500/40",
};

const REPORT_LABEL: Record<ReportType, string> = {
  EARLY_WARNING:         "Early Warning",
  INCIDENT_NOTIFICATION: "Incident Notification",
  INTERMEDIATE_REPORT:   "Intermediate Report",
  FINAL_REPORT:          "Final Report",
};

// NIS2 Article 23 deadlines from incident creation
const REPORT_DEADLINE_MS: Record<ReportType, number> = {
  EARLY_WARNING:         24 * 3600 * 1000,
  INCIDENT_NOTIFICATION: 72 * 3600 * 1000,
  INTERMEDIATE_REPORT:   7 * 24 * 3600 * 1000,
  FINAL_REPORT:          30 * 24 * 3600 * 1000,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SeverityIcon({ s }: { s: Severity }) {
  switch (s) {
    case "CRITICAL": return <Zap size={13} className="text-red-400" />;
    case "HIGH":     return <AlertTriangle size={13} className="text-amber-400" />;
    case "MEDIUM":   return <AlertCircle size={13} className="text-yellow-400" />;
    default:         return <Info size={13} className="text-blue-400" />;
  }
}

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Format a countdown: positive = remaining, negative = overdue.
 * Returns { label, urgent, overdue }
 */
function formatCountdown(deadlineIso: string): {
  label: string;
  urgent: boolean;
  overdue: boolean;
} {
  const msLeft = new Date(deadlineIso).getTime() - Date.now();
  const overdue = msLeft < 0;
  const abs = Math.abs(msLeft);
  const days   = Math.floor(abs / 86_400_000);
  const hours  = Math.floor((abs % 86_400_000) / 3_600_000);
  const mins   = Math.floor((abs % 3_600_000) / 60_000);

  let label: string;
  if (days > 0)        label = `${days}d ${hours}h`;
  else if (hours > 0)  label = `${hours}h ${mins}m`;
  else                 label = `${mins}m`;

  const urgent = !overdue && msLeft < 6 * 3_600_000; // < 6 hours

  return {
    label: overdue ? `${label} overdue` : `Due in ${label}`,
    urgent,
    overdue,
  };
}

// ---------------------------------------------------------------------------
// NIS2 Deadline card
// ---------------------------------------------------------------------------

function Nis2DeadlineCard({
  incident,
  reports,
  onGenerate,
}: {
  incident: IncidentResponse;
  reports: IncidentReportResponse[];
  onGenerate: (type: ReportType) => void;
}) {
  // Tick every 60 s so countdown labels stay current without a full page reload
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const reportTypes: ReportType[] = [
    "EARLY_WARNING",
    "INCIDENT_NOTIFICATION",
    "INTERMEDIATE_REPORT",
    "FINAL_REPORT",
  ];

  const reportByType = new Map(reports.map((r) => [r.reportType, r]));

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Clock size={15} className="text-blue-400" />
          NIS2 Article 23 Deadlines
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-3">
        {reportTypes.map((type) => {
          const deadlineMs =
            new Date(incident.createdAt).getTime() + REPORT_DEADLINE_MS[type];
          const deadlineIso = new Date(deadlineMs).toISOString();
          const { label, urgent, overdue } = formatCountdown(deadlineIso);
          const existingReport = reportByType.get(type);
          const submitted = !!existingReport?.submittedAt;

          return (
            <div
              key={type}
              className={[
                "flex items-center justify-between rounded-lg px-3 py-2.5",
                submitted
                  ? "bg-emerald-500/10 border border-emerald-500/20"
                  : overdue
                  ? "bg-red-500/10 border border-red-500/30"
                  : urgent
                  ? "bg-amber-500/10 border border-amber-500/30"
                  : "bg-slate-800/60 border border-slate-700/50",
              ].join(" ")}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-200">
                  {REPORT_LABEL[type]}
                </p>
                <p
                  className={[
                    "text-[11px] mt-0.5 font-medium",
                    submitted
                      ? "text-emerald-400"
                      : overdue
                      ? "text-red-400"
                      : urgent
                      ? "text-amber-400"
                      : "text-slate-500",
                  ].join(" ")}
                >
                  {submitted
                    ? `Submitted to ${existingReport.submittedTo ?? "authority"}`
                    : existingReport
                    ? "Draft generated"
                    : label}
                </p>
              </div>

              <div className="flex items-center gap-2 ml-3">
                {submitted ? (
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onGenerate(type)}
                    className={[
                      "h-7 text-[11px] px-2.5 border shrink-0",
                      overdue
                        ? "border-red-500/40 text-red-300 hover:bg-red-500/10"
                        : "border-slate-600 text-slate-300 hover:bg-slate-700",
                    ].join(" ")}
                  >
                    <FileText size={11} className="mr-1" />
                    {existingReport ? "Regenerate" : "Generate"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <p className="text-[10px] text-slate-600 pt-1">
          Deadlines calculated from incident creation per NIS2 Article 23.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Status workflow
// ---------------------------------------------------------------------------

function StatusWorkflow({
  current,
  onTransition,
  loading,
}: {
  current: Status;
  onTransition: (s: Status) => void;
  loading: boolean;
}) {
  const nextStates = STATUS_TRANSITIONS[current] ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Show the linear workflow steps */}
      {STATUS_ORDER.map((s, i) => {
        const idx = STATUS_ORDER.indexOf(current);
        const isPast    = i < idx;
        const isCurrent = s === current;
        const isNext    = nextStates.includes(s);
        return (
          <React.Fragment key={s}>
            {i > 0 && (
              <span className="text-slate-700 text-xs">/</span>
            )}
            <button
              disabled={!isNext || loading}
              onClick={() => isNext && onTransition(s)}
              className={[
                "text-[11px] font-semibold px-2.5 py-1 rounded border transition-colors",
                isCurrent
                  ? `${STATUS_BADGE[s]} cursor-default`
                  : isPast
                  ? "border-slate-800 text-slate-600 cursor-default"
                  : isNext
                  ? "border-blue-500/50 text-blue-300 hover:bg-blue-500/10 cursor-pointer"
                  : "border-slate-800 text-slate-700 cursor-default",
              ].join(" ")}
            >
              {STATUS_LABEL[s]}
            </button>
          </React.Fragment>
        );
      })}
      {/* False positive button outside linear flow */}
      {nextStates.includes("FALSE_POSITIVE") && (
        <>
          <span className="text-slate-700 text-xs">|</span>
          <button
            disabled={loading}
            onClick={() => onTransition("FALSE_POSITIVE")}
            className="text-[11px] font-semibold px-2.5 py-1 rounded border border-slate-600 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
          >
            False Positive
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NIS2 Report generation dialog
// ---------------------------------------------------------------------------

function GenerateReportDialog({
  open,
  incident,
  reportType,
  existingReport,
  onClose,
  onGenerated,
  onSubmitted,
}: {
  open: boolean;
  incident: IncidentResponse;
  reportType: ReportType | null;
  existingReport: IncidentReportResponse | null;
  onClose: () => void;
  onGenerated: (r: IncidentReportResponse) => void;
  onSubmitted: (r: IncidentReportResponse) => void;
}) {
  const [crossBorder, setCrossBorder]         = useState(false);
  const [crossBorderDetail, setCrossBorderDetail] = useState("");
  const [mitigation, setMitigation]           = useState("");
  const [contactInfo, setContactInfo]         = useState("");
  const [submittedTo, setSubmittedTo]         = useState("ENISA");
  const [generating, setGenerating]           = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [generated, setGenerated]             = useState<IncidentReportResponse | null>(existingReport);
  const [error, setError]                     = useState<string | null>(null);

  // Reset when dialog opens for new report type
  useEffect(() => {
    if (open) {
      setGenerated(existingReport);
      setError(null);
      setCrossBorder(false); setCrossBorderDetail(""); setMitigation(""); setContactInfo("");
    }
  }, [open, existingReport]);

  async function handleGenerate() {
    if (!reportType) return;
    setGenerating(true); setError(null);
    try {
      const r = await generateIncidentReport(incident.id, {
        reportType,
        submittedTo: submittedTo || undefined,
      });
      setGenerated(r);
      onGenerated(r);
    } catch {
      setError("Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit() {
    if (!generated) return;
    setSubmitting(true); setError(null);
    try {
      const r = await submitIncidentReport(
        incident.id,
        generated.id,
        submittedTo || "ENISA"
      );
      onSubmitted(r);
      onClose();
    } catch {
      setError("Failed to mark report as submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!reportType) return null;

  const deadlineMs = new Date(incident.createdAt).getTime() + REPORT_DEADLINE_MS[reportType];
  const deadlineIso = new Date(deadlineMs).toISOString();
  const { label: deadlineLabel, overdue } = formatCountdown(deadlineIso);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-100 flex items-center gap-2">
            <FileText size={16} className="text-blue-400" />
            NIS2 Article 23 - {REPORT_LABEL[reportType]}
          </DialogTitle>
          <p className={`text-xs mt-1 ${overdue ? "text-red-400" : "text-slate-500"}`}>
            Deadline: {deadlineLabel}
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Pre-filled incident data (read-only display) */}
          <div className="bg-slate-800/50 rounded-lg p-4 space-y-2.5 border border-slate-700/50">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Pre-filled from Incident Data
            </p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Incident ID"   value={incident.id.slice(0, 8) + "..."} />
              <Field label="Detected At"   value={incident.detectedAt ? formatDatetime(incident.detectedAt) : "-"} />
              <Field label="Severity"      value={incident.severity} />
              <Field label="NIS2 Class"    value={incident.nis2Classification === "SIGNIFICANT" ? "Significant" : "Non-Significant"} />
            </div>

            <div>
              <p className="text-[10px] text-slate-500 mb-1">Nature of Incident</p>
              <p className="text-xs text-slate-300 bg-slate-900/50 rounded p-2 border border-slate-700/40">
                {incident.description}
              </p>
            </div>

            {incident.spartaTechniques.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 mb-1">SPARTA Techniques</p>
                <div className="flex flex-wrap gap-1">
                  {incident.spartaTechniques.map((t, i) => (
                    <span key={i} className="text-[10px] bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-400">
                      {t.tactic} / {t.technique}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Field label="Affected Assets" value={`${incident.affectedAssetIds.length} asset(s)`} />
          </div>

          {/* Editable fields */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Submitted To / Regulatory Authority
            </label>
            <input
              value={submittedTo}
              onChange={(e) => setSubmittedTo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              placeholder="ENISA, BSI, ANSSI, CISA..."
            />
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="cross-border"
              checked={crossBorder}
              onChange={(e) => setCrossBorder(e.target.checked)}
              className="mt-1 accent-blue-500"
            />
            <label htmlFor="cross-border" className="text-sm text-slate-300 cursor-pointer">
              Cross-border impact (affects entities in other EU member states)
            </label>
          </div>

          {crossBorder && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Cross-border details
              </label>
              <textarea
                value={crossBorderDetail}
                onChange={(e) => setCrossBorderDetail(e.target.value)}
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Describe the cross-border impact..."
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Mitigation Measures Taken
            </label>
            <textarea
              value={mitigation}
              onChange={(e) => setMitigation(e.target.value)}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Describe technical and organisational measures..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Point of Contact
            </label>
            <input
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              placeholder="name@organisation.eu  |  +32..."
            />
          </div>

          {generated && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-3 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-300">
                Report generated{generated.submittedAt ? " and submitted" : " - ready to submit"}.
              </span>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <DialogFooter className="mt-4 flex gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            Close
          </Button>
          {!generated && (
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {generating ? "Generating..." : "Generate Report"}
            </Button>
          )}
          {generated && !generated.submittedAt && (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              <Send size={13} />
              {submitting ? "Marking..." : "Mark as Submitted"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-xs text-slate-300 mt-0.5">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline section
// ---------------------------------------------------------------------------

function TimelineSection({
  entries,
  incidentId,
  onEntryAdded,
}: {
  entries: TimelineEntry[];
  incidentId: string;
  onEntryAdded: (entry: TimelineEntry) => void;
}) {
  const [showAdd, setShowAdd]   = useState(false);
  const [eventText, setEventText] = useState("");
  const [actor, setActor]       = useState("");
  const [saving, setSaving]     = useState(false);

  async function handleAdd() {
    if (!eventText.trim()) return;
    setSaving(true);
    try {
      // Timeline entries are appended via notes. We add a note
      // which the service appends to the timeline automatically
      const note = await addIncidentNote(incidentId, {
        author: actor.trim() || "analyst",
        content: `[Manual entry] ${eventText.trim()}`,
      });
      onEntryAdded({
        timestamp: note.createdAt,
        event: `[Manual entry] ${eventText.trim()}`,
        actor: actor.trim() || "analyst",
      });
      setEventText(""); setActor(""); setShowAdd(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Clock size={14} className="text-blue-400" />
          Timeline
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowAdd((v) => !v)}
          className="h-7 text-xs text-slate-400 hover:text-slate-200 gap-1"
        >
          <Plus size={12} />
          Add Event
        </Button>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {showAdd && (
          <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 space-y-2">
            <input
              value={eventText}
              onChange={(e) => setEventText(e.target.value)}
              placeholder="Describe the event..."
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <input
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                placeholder="Actor (optional)"
                className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <Button
                size="sm"
                disabled={saving || !eventText.trim()}
                onClick={handleAdd}
                className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs"
              >
                {saving ? "..." : "Add"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAdd(false)}
                className="h-7 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {sorted.length === 0 && (
          <p className="text-xs text-slate-600">No timeline entries yet.</p>
        )}
        <div className="relative">
          {/* Vertical line */}
          {sorted.length > 1 && (
            <div className="absolute left-[7px] top-3 bottom-3 w-px bg-slate-800" />
          )}
          <ul className="space-y-4">
            {sorted.map((entry, i) => (
              <li key={i} className="flex gap-3 relative">
                <div className="w-3.5 h-3.5 rounded-full bg-slate-700 border-2 border-slate-600 shrink-0 mt-0.5 z-10" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 leading-snug">{entry.event}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {formatDatetime(entry.timestamp)}
                    {entry.actor && ` · ${entry.actor}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Notes section
// ---------------------------------------------------------------------------

function NotesSection({
  notes,
  incidentId,
  onNoteAdded,
}: {
  notes: IncidentNoteResponse[];
  incidentId: string;
  onNoteAdded: (n: IncidentNoteResponse) => void;
}) {
  const [author, setAuthor]   = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving]   = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  async function handleAdd() {
    if (!content.trim()) return;
    setSaving(true);
    setNoteError(null);
    try {
      const note = await addIncidentNote(incidentId, {
        author: author.trim() || "analyst",
        content: content.trim(),
      });
      onNoteAdded(note);
      setContent(""); setAuthor("");
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <MessageSquare size={14} className="text-blue-400" />
          Notes
          <span className="text-xs font-normal text-slate-600">({notes.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        {notes.length === 0 && (
          <p className="text-xs text-slate-600">No notes yet. Add the first one below.</p>
        )}
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-300">{note.author}</span>
                <span className="text-[10px] text-slate-600">{relativeTime(note.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>

        {/* Add note */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Add a note..."
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
          />
          {noteError && (
            <p className="text-xs text-red-400">{noteError}</p>
          )}
          <Button
            size="sm"
            disabled={saving || !content.trim()}
            onClick={handleAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            <MessageSquare size={12} />
            {saving ? "Adding..." : "Add Note"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Related alerts
// ---------------------------------------------------------------------------

function RelatedAlertsSection({ alertLinks }: { alertLinks: IncidentAlertLinkResponse[] }) {
  const [alertDetails, setAlertDetails] = useState<Map<string, AlertResponse>>(new Map());
  const fetchedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const link of alertLinks) {
      if (!fetchedIds.current.has(link.alertId)) {
        fetchedIds.current.add(link.alertId);
        getAlert(link.alertId)
          .then((a) => setAlertDetails((m) => new Map(m).set(a.id, a)))
          .catch(() => { fetchedIds.current.delete(link.alertId); });
      }
    }
  }, [alertLinks]);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Bell size={14} className="text-blue-400" />
          Related Alerts
          <span className="text-xs font-normal text-slate-600">({alertLinks.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {alertLinks.length === 0 ? (
          <p className="text-xs text-slate-600">No alerts linked to this incident.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-500 text-xs">Title</TableHead>
                <TableHead className="text-slate-500 text-xs">Severity</TableHead>
                <TableHead className="text-slate-500 text-xs">Status</TableHead>
                <TableHead className="text-slate-500 text-xs">Triggered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alertLinks.map((link) => {
                const a = alertDetails.get(link.alertId);
                return (
                  <TableRow key={link.id} className="border-slate-800">
                    <TableCell className="py-2">
                      <Link
                        href={`/alerts`}
                        className="text-xs text-slate-300 hover:text-blue-400 transition-colors line-clamp-1"
                      >
                        {a?.title ?? link.alertId.slice(0, 12) + "..."}
                      </Link>
                      {a?.ruleId && (
                        <span className="text-[10px] text-slate-600 block">{a.ruleId}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a && (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded border ${ALERT_SEVERITY_BADGE[a.severity]}`}>
                          {a.severity}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {a?.status ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {a ? relativeTime(a.triggeredAt) : "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Affected assets
// ---------------------------------------------------------------------------

function AffectedAssetsSection({ assetIds }: { assetIds: string[] }) {
  const [assets, setAssets] = useState<Map<string, AssetResponse>>(new Map());
  const fetchedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const id of assetIds) {
      if (!fetchedIds.current.has(id)) {
        fetchedIds.current.add(id);
        getAsset(id)
          .then((a) => setAssets((m) => new Map(m).set(a.id, a)))
          .catch(() => { fetchedIds.current.delete(id); });
      }
    }
  }, [assetIds]);

  if (assetIds.length === 0) return null;

  const STATUS_COLOR: Record<string, string> = {
    OPERATIONAL: "text-emerald-400",
    DEGRADED:    "text-amber-400",
    MAINTENANCE: "text-blue-400",
    DECOMMISSIONED: "text-slate-500",
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Satellite size={14} className="text-blue-400" />
          Affected Assets
          <span className="text-xs font-normal text-slate-600">({assetIds.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="grid grid-cols-2 gap-2">
          {assetIds.map((id) => {
            const a = assets.get(id);
            return (
              <div
                key={id}
                className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50"
              >
                <p className="text-xs font-semibold text-slate-200 truncate">
                  {a?.name ?? id.slice(0, 12) + "..."}
                </p>
                {a && (
                  <>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {a.assetType.replace(/_/g, " ")}
                    </p>
                    <p className={`text-[10px] mt-1 font-medium ${STATUS_COLOR[a.status] ?? "text-slate-400"}`}>
                      {a.status}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main detail page
// ---------------------------------------------------------------------------

export default function IncidentDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const id      = params.id as string;

  const [incident, setIncident]       = useState<IncidentResponse | null>(null);
  const [notes, setNotes]             = useState<IncidentNoteResponse[]>([]);
  const [alertLinks, setAlertLinks]   = useState<IncidentAlertLinkResponse[]>([]);
  const [reports, setReports]         = useState<IncidentReportResponse[]>([]);
  const [loading, setLoading]         = useState(true);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [reportDialog, setReportDialog] = useState<ReportType | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, notesResult, alertsResult, reportsResult] = await Promise.all([
        getIncident(id),
        getIncidentNotes(id),
        getIncidentAlerts(id),
        getIncidentReports(id),
      ]);
      if (!mountedRef.current) return;
      setIncident(inc);
      setNotes(notesResult.data);
      setAlertLinks(alertsResult.data);
      setReports(reportsResult.data);
    } catch {
      // 404 -> redirect
      router.push("/incidents");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  async function handleTransition(newStatus: Status) {
    if (!incident) return;
    setTransitionLoading(true);
    try {
      const updated = await updateIncident(id, { status: newStatus });
      if (mountedRef.current) setIncident(updated);
    } catch {
      // ignore
    } finally {
      if (mountedRef.current) setTransitionLoading(false);
    }
  }

  function handleReportGenerated(r: IncidentReportResponse) {
    setReports((prev) => {
      const existing = prev.findIndex((x) => x.reportType === r.reportType);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = r;
        return next;
      }
      return [...prev, r];
    });
  }

  function handleReportSubmitted(r: IncidentReportResponse) {
    handleReportGenerated(r);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!incident) return null;

  const reportByType = new Map(reports.map((r) => [r.reportType, r]));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Back */}
      <Link
        href="/incidents"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        <ArrowLeft size={13} />
        All Incidents
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-slate-100 leading-snug">
              {incident.title}
            </h1>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              {incident.description}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold ${SEVERITY_BADGE[incident.severity]}`}>
              <SeverityIcon s={incident.severity} />
              {incident.severity}
            </span>
            <span className={`inline-flex px-2.5 py-1 rounded text-[11px] font-bold ${STATUS_BADGE[incident.status]}`}>
              {STATUS_LABEL[incident.status]}
            </span>
            {incident.nis2Classification === "SIGNIFICANT" && (
              <span className="px-2.5 py-1 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                NIS2 Significant
              </span>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span>Detected: {incident.detectedAt ? formatDatetime(incident.detectedAt) : relativeTime(incident.createdAt)}</span>
          {incident.resolvedAt && <span>Resolved: {formatDatetime(incident.resolvedAt)}</span>}
          {incident.timeToRespondMinutes && (
            <span>Time to respond: {incident.timeToRespondMinutes >= 60
              ? `${Math.floor(incident.timeToRespondMinutes / 60)}h ${incident.timeToRespondMinutes % 60}m`
              : `${incident.timeToRespondMinutes}m`}
            </span>
          )}
        </div>

        {/* Status workflow */}
        <div className="pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">
            Status Workflow
          </p>
          <StatusWorkflow
            current={incident.status}
            onTransition={handleTransition}
            loading={transitionLoading}
          />
        </div>
      </div>

      {/* SPARTA techniques */}
      {incident.spartaTechniques.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {incident.spartaTechniques.map((t, i) => (
            <span
              key={i}
              className="text-[11px] bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-slate-400"
            >
              {t.tactic} / {t.technique}
            </span>
          ))}
        </div>
      )}

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-5">
          <TimelineSection
            entries={incident.timeline}
            incidentId={incident.id}
            onEntryAdded={(entry) => {
              setIncident((inc) =>
                inc ? { ...inc, timeline: [...inc.timeline, entry] } : inc
              );
            }}
          />
          <RelatedAlertsSection alertLinks={alertLinks} />
          <NotesSection
            notes={notes}
            incidentId={incident.id}
            onNoteAdded={(n) => setNotes((prev) => [n, ...prev])}
          />
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-5">
          <Nis2DeadlineCard
            incident={incident}
            reports={reports}
            onGenerate={(type) => setReportDialog(type)}
          />
          <AffectedAssetsSection assetIds={incident.affectedAssetIds} />

          {/* Generated reports summary */}
          {reports.length > 0 && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <FileText size={14} className="text-blue-400" />
                  Reports
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-2">
                {reports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-300">{REPORT_LABEL[r.reportType]}</p>
                      <p className="text-[10px] text-slate-600">
                        {r.submittedAt
                          ? `Submitted ${relativeTime(r.submittedAt)}`
                          : `Generated ${relativeTime(r.createdAt)}`}
                      </p>
                    </div>
                    {r.submittedAt
                      ? <CheckCircle2 size={13} className="text-emerald-400" />
                      : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setReportDialog(r.reportType)}
                          className="h-6 text-[10px] px-2 text-slate-400 hover:text-slate-200"
                        >
                          Submit
                        </Button>
                      )
                    }
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* NIS2 Report dialog */}
      {reportDialog && (
        <GenerateReportDialog
          open={reportDialog !== null}
          incident={incident}
          reportType={reportDialog}
          existingReport={reportByType.get(reportDialog) ?? null}
          onClose={() => setReportDialog(null)}
          onGenerated={handleReportGenerated}
          onSubmitted={handleReportSubmitted}
        />
      )}
    </div>
  );
}
