"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Play,
  Pause,
  Trash2,
  ChevronDown,
  ChevronRight,
  Workflow,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  GripVertical,
  Bell,
  FileText,
  Webhook,
  Timer,
  UserCheck,
  StickyNote,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { useOrg } from "@/lib/context";
import {
  getPlaybooks,
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
  executePlaybookApi,
  getPlaybookExecutions,
  type PlaybookApi,
  type PlaybookStepApi,
  type PlaybookTriggerApi,
  type PlaybookExecutionApi,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Step type metadata
// ---------------------------------------------------------------------------

const STEP_TYPES = [
  { type: "notify", label: "Send Notification", icon: Bell, color: "text-blue-400" },
  { type: "create_incident", label: "Create Incident", icon: ShieldAlert, color: "text-red-400" },
  { type: "change_alert_status", label: "Change Alert Status", icon: Zap, color: "text-amber-400" },
  { type: "generate_report", label: "Generate Report", icon: FileText, color: "text-emerald-400" },
  { type: "webhook_action", label: "Webhook Action", icon: Webhook, color: "text-purple-400" },
  { type: "wait", label: "Wait", icon: Timer, color: "text-slate-400" },
  { type: "human_approval", label: "Human Approval", icon: UserCheck, color: "text-cyan-400" },
  { type: "add_note", label: "Add Note", icon: StickyNote, color: "text-orange-400" },
] as const;

function stepIcon(type: string) {
  const meta = STEP_TYPES.find((s) => s.type === type);
  if (!meta) return <Workflow size={14} className="text-slate-500" />;
  const Icon = meta.icon;
  return <Icon size={14} className={meta.color} />;
}

function stepLabel(type: string) {
  return STEP_TYPES.find((s) => s.type === type)?.label ?? type;
}

// ---------------------------------------------------------------------------
// Execution status badge
// ---------------------------------------------------------------------------

function execStatusBadge(status: string) {
  const map: Record<string, { variant: "success" | "warning" | "danger" | "muted"; label: string }> = {
    RUNNING: { variant: "warning", label: "Running" },
    COMPLETED: { variant: "success", label: "Completed" },
    FAILED: { variant: "danger", label: "Failed" },
    CANCELLED: { variant: "muted", label: "Cancelled" },
  };
  const s = map[status] ?? { variant: "muted" as const, label: status };
  return <Badge variant={s.variant} className="text-[10px] px-1.5 py-0">{s.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Step editor row
// ---------------------------------------------------------------------------

function StepRow({
  step,
  index,
  onUpdate,
  onRemove,
}: {
  step: PlaybookStepApi;
  index: number;
  onUpdate: (index: number, step: PlaybookStepApi) => void;
  onRemove: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-700 rounded-lg bg-slate-800/50">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-800"
        onClick={() => setExpanded(!expanded)}
      >
        <GripVertical size={14} className="text-slate-600 shrink-0" />
        <span className="text-xs text-slate-500 font-mono w-5">{index + 1}</span>
        {stepIcon(step.type)}
        <span className="text-sm text-slate-200 flex-1">{step.label || stepLabel(step.type)}</span>
        {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          className="text-slate-600 hover:text-red-400 transition-colors p-1"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-700 space-y-2">
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Step Label</label>
            <input
              value={step.label}
              onChange={(e) => onUpdate(index, { ...step, label: e.target.value })}
              className="mt-1 w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Step Type</label>
            <select
              value={step.type}
              onChange={(e) => onUpdate(index, { ...step, type: e.target.value, config: {} })}
              className="mt-1 w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {STEP_TYPES.map((t) => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
          </div>
          {/* Type-specific config fields */}
          {step.type === "notify" && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Recipients (comma-separated)</label>
              <input
                value={((step.config.recipients ?? []) as string[]).join(", ")}
                onChange={(e) => onUpdate(index, { ...step, config: { ...step.config, recipients: e.target.value.split(",").map((s) => s.trim()).filter(Boolean), channels: ["email"] } })}
                placeholder="ops@example.com, soc@example.com"
                className="mt-1 w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
          {step.type === "change_alert_status" && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">New Status</label>
              <select
                value={(step.config.newStatus as string) ?? "INVESTIGATING"}
                onChange={(e) => onUpdate(index, { ...step, config: { ...step.config, newStatus: e.target.value } })}
                className="mt-1 w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="INVESTIGATING">Investigating</option>
                <option value="RESOLVED">Resolved</option>
                <option value="FALSE_POSITIVE">False Positive</option>
              </select>
            </div>
          )}
          {step.type === "wait" && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Wait (minutes)</label>
              <input
                type="number"
                value={(step.config.minutes as number) ?? 30}
                onChange={(e) => onUpdate(index, { ...step, config: { ...step.config, minutes: parseInt(e.target.value) || 5 } })}
                className="mt-1 w-24 h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
          {step.type === "generate_report" && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Report Type</label>
              <select
                value={(step.config.reportType as string) ?? "EARLY_WARNING"}
                onChange={(e) => onUpdate(index, { ...step, config: { ...step.config, reportType: e.target.value } })}
                className="mt-1 w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="EARLY_WARNING">NIS2 Early Warning</option>
                <option value="INCIDENT_NOTIFICATION">Incident Notification</option>
                <option value="INTERMEDIATE_REPORT">Intermediate Report</option>
                <option value="FINAL_REPORT">Final Report</option>
              </select>
            </div>
          )}
          {step.type === "human_approval" && (
            <>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Approvers (comma-separated)</label>
                <input
                  value={((step.config.approvers ?? []) as string[]).join(", ")}
                  onChange={(e) => onUpdate(index, { ...step, config: { ...step.config, approvers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                  className="mt-1 w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Timeout (minutes)</label>
                <input
                  type="number"
                  value={(step.config.timeoutMinutes as number) ?? 60}
                  onChange={(e) => onUpdate(index, { ...step, config: { ...step.config, timeoutMinutes: parseInt(e.target.value) || 60 } })}
                  className="mt-1 w-24 h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}
          {step.type === "add_note" && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Note Template</label>
              <textarea
                value={(step.config.noteTemplate as string) ?? ""}
                onChange={(e) => onUpdate(index, { ...step, config: { ...step.config, noteTemplate: e.target.value } })}
                rows={2}
                className="mt-1 w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          )}
          {step.type === "webhook_action" && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Webhook URL</label>
              <input
                value={(step.config.url as string) ?? ""}
                onChange={(e) => onUpdate(index, { ...step, config: { ...step.config, url: e.target.value } })}
                placeholder="https://hooks.example.com/webhook"
                className="mt-1 w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
          {step.type === "create_incident" && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Severity</label>
              <select
                value={(step.config.severity as string) ?? "HIGH"}
                onChange={(e) => onUpdate(index, { ...step, config: { ...step.config, severity: e.target.value } })}
                className="mt-1 w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playbook builder sheet
// ---------------------------------------------------------------------------

function PlaybookBuilder({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string; trigger: PlaybookTriggerApi; steps: PlaybookStepApi[] }) => void;
  initial?: PlaybookApi | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [autoTrigger, setAutoTrigger] = useState(initial?.trigger.auto ?? false);
  const [severities, setSeverities] = useState<string[]>(initial?.trigger.conditions.severity ?? []);
  const [steps, setSteps] = useState<PlaybookStepApi[]>(initial?.steps ?? []);

  // Reset when initial changes
  useEffect(() => {
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setAutoTrigger(initial?.trigger.auto ?? false);
    setSeverities(initial?.trigger.conditions.severity ?? []);
    setSteps(initial?.steps ?? []);
  }, [initial]);

  function addStep() {
    setSteps([...steps, {
      id: crypto.randomUUID(),
      type: "notify",
      label: "New Step",
      config: {},
    }]);
  }

  function updateStep(index: number, step: PlaybookStepApi) {
    const next = [...steps];
    next[index] = step;
    setSteps(next);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (!name.trim()) return;
    if (steps.length === 0) return;
    onSave({
      name,
      description,
      trigger: { auto: autoTrigger, conditions: { severity: severities.length > 0 ? severities : undefined } },
      steps,
    });
  }

  function toggleSeverity(sev: string) {
    setSeverities((prev) => prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]);
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-slate-900 border-slate-800 overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-slate-100">{initial ? "Edit Playbook" : "New Playbook"}</SheetTitle>
          <SheetDescription className="text-slate-500">Define response steps and trigger conditions</SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs text-slate-400 font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Critical Satellite Alert Response"
              className="mt-1 w-full h-9 px-3 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-slate-400 font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Trigger */}
          <div className="border border-slate-700 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Auto-Trigger</span>
              <button
                onClick={() => setAutoTrigger(!autoTrigger)}
                className={`w-9 h-5 rounded-full transition-colors ${autoTrigger ? "bg-blue-600" : "bg-slate-700"} relative`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${autoTrigger ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            {autoTrigger && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Trigger on severity</label>
                <div className="flex gap-2 mt-1">
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((sev) => (
                    <button
                      key={sev}
                      onClick={() => toggleSeverity(sev)}
                      className={`px-2 py-1 text-[10px] rounded border ${
                        severities.includes(sev)
                          ? "bg-blue-600/20 border-blue-500 text-blue-300"
                          : "bg-slate-800 border-slate-700 text-slate-500"
                      } transition-colors`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Steps ({steps.length})</span>
              <Button size="sm" variant="ghost" onClick={addStep} className="h-7 text-xs text-blue-400 hover:text-blue-300">
                <Plus size={13} className="mr-1" /> Add Step
              </Button>
            </div>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <StepRow key={step.id} step={step} index={i} onUpdate={updateStep} onRemove={removeStep} />
              ))}
              {steps.length === 0 && (
                <div className="text-center py-8 text-slate-600 text-xs">
                  No steps added yet. Click "Add Step" to begin.
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={!name.trim() || steps.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
            >
              {initial ? "Save Changes" : "Create Playbook"}
            </Button>
            <Button variant="ghost" onClick={onClose} className="text-slate-400">
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Execution log viewer
// ---------------------------------------------------------------------------

function ExecutionLog({ execution }: { execution: PlaybookExecutionApi }) {
  return (
    <div className="space-y-1.5">
      {execution.log.map((entry, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span className="text-slate-600 font-mono w-4 shrink-0 text-right">{entry.stepIndex + 1}</span>
          {entry.status === "success" ? (
            <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />
          ) : entry.status === "failed" ? (
            <XCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
          ) : entry.status === "waiting" ? (
            <Clock size={13} className="text-amber-500 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={13} className="text-slate-500 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <span className="text-slate-300">{entry.message}</span>
            <span className="text-slate-600 ml-2">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      ))}
      {execution.log.length === 0 && (
        <div className="text-slate-600 text-xs">No log entries</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlaybooksPage() {
  const { orgId, loading: orgLoading } = useOrg();

  const [playbooks, setPlaybooks] = useState<PlaybookApi[]>([]);
  const [executions, setExecutions] = useState<PlaybookExecutionApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Builder sheet
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<PlaybookApi | null>(null);

  // Expanded execution
  const [expandedExec, setExpandedExec] = useState<string | null>(null);

  // Selected playbook for execution filter
  const [selectedPb, setSelectedPb] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [pbRes, execRes] = await Promise.all([
        getPlaybooks(orgId),
        getPlaybookExecutions(orgId),
      ]);
      setPlaybooks(pbRes.data);
      setExecutions(execRes.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load playbooks");
    }
  }, [orgId]);

  useEffect(() => {
    if (orgLoading || !orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [orgId, orgLoading, loadData]);

  async function handleSave(data: { name: string; description: string; trigger: PlaybookTriggerApi; steps: PlaybookStepApi[] }) {
    if (!orgId) return;
    try {
      if (editing) {
        await updatePlaybook(editing.id, data);
      } else {
        await createPlaybook({ ...data, organizationId: orgId });
      }
      setBuilderOpen(false);
      setEditing(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleToggleActive(pb: PlaybookApi) {
    try {
      await updatePlaybook(pb.id, { isActive: !pb.isActive });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePlaybook(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleExecute(id: string) {
    try {
      await executePlaybookApi(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
    }
  }

  function openEdit(pb: PlaybookApi) {
    setEditing(pb);
    setBuilderOpen(true);
  }

  function openNew() {
    setEditing(null);
    setBuilderOpen(true);
  }

  const filteredExecs = selectedPb
    ? executions.filter((e) => e.playbookId === selectedPb)
    : executions;

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={14} className="animate-spin" /> Loading playbooks...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Response Playbooks</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Automated response procedures triggered by alerts or run manually
          </p>
        </div>
        {orgId && (
          <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5">
            <Plus size={15} /> New Playbook
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Playbook list */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300">Playbooks ({playbooks.length})</h2>
        {playbooks.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900 px-6 py-12 text-center">
            <Workflow size={32} className="mx-auto text-blue-500 mb-3" />
            <p className="text-slate-200 font-medium text-sm">No playbooks configured</p>
            <p className="text-slate-500 text-xs mt-1 max-w-xs mx-auto">
              Create playbooks to automate incident response procedures when alerts fire.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {playbooks.map((pb) => (
              <div
                key={pb.id}
                className="rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(pb)} className="text-slate-100 font-medium text-sm hover:text-blue-400 transition-colors text-left">
                        {pb.name}
                      </button>
                      {!pb.organizationId && (
                        <Badge variant="default" className="text-[9px] px-1 py-0">TEMPLATE</Badge>
                      )}
                      {pb.trigger.auto && (
                        <Badge variant="warning" className="text-[9px] px-1 py-0">AUTO</Badge>
                      )}
                      {!pb.isActive && (
                        <Badge variant="muted" className="text-[9px] px-1 py-0">PAUSED</Badge>
                      )}
                    </div>
                    {pb.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{pb.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span>{pb.steps.length} step{pb.steps.length !== 1 ? "s" : ""}</span>
                      <span>{pb.executionCount} execution{pb.executionCount !== 1 ? "s" : ""}</span>
                      {pb.lastExecuted && (
                        <span>Last run: {new Date(pb.lastExecuted).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                      )}
                      {pb.trigger.auto && pb.trigger.conditions.severity && (
                        <span>Triggers: {pb.trigger.conditions.severity.join(", ")}</span>
                      )}
                    </div>
                    {/* Step preview */}
                    <div className="flex items-center gap-1 mt-2">
                      {pb.steps.slice(0, 6).map((s, i) => (
                        <div key={i} className="flex items-center gap-1 bg-slate-800 rounded px-1.5 py-0.5">
                          {stepIcon(s.type)}
                          <span className="text-[10px] text-slate-400">{s.label || stepLabel(s.type)}</span>
                        </div>
                      ))}
                      {pb.steps.length > 6 && (
                        <span className="text-[10px] text-slate-600">+{pb.steps.length - 6} more</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExecute(pb.id)}
                      className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-400"
                      title="Run Now"
                    >
                      <Play size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleActive(pb)}
                      className={`h-8 w-8 p-0 ${pb.isActive ? "text-amber-500 hover:text-amber-400" : "text-blue-500 hover:text-blue-400"}`}
                      title={pb.isActive ? "Pause" : "Resume"}
                    >
                      {pb.isActive ? <Pause size={14} /> : <Play size={14} />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(pb.id)}
                      className="h-8 w-8 p-0 text-slate-600 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Execution history */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">
            Execution History ({filteredExecs.length})
          </h2>
          {selectedPb && (
            <button onClick={() => setSelectedPb(null)} className="text-xs text-blue-400 hover:text-blue-300">
              Clear filter
            </button>
          )}
        </div>
        {filteredExecs.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">No executions yet</div>
        ) : (
          <div className="space-y-2">
            {filteredExecs.map((exec) => (
              <div
                key={exec.id}
                className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden"
              >
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/50"
                  onClick={() => setExpandedExec(expandedExec === exec.id ? null : exec.id)}
                >
                  {expandedExec === exec.id
                    ? <ChevronDown size={14} className="text-slate-500 shrink-0" />
                    : <ChevronRight size={14} className="text-slate-500 shrink-0" />}
                  <span className="text-sm text-slate-200 flex-1">{exec.playbookName ?? "Unknown"}</span>
                  {execStatusBadge(exec.status)}
                  <span className="text-xs text-slate-500">
                    {exec.stepsCompleted}/{exec.stepsTotal} steps
                  </span>
                  <span className="text-xs text-slate-600">
                    {exec.triggeredBy === "auto" ? "Auto" : exec.triggeredBy}
                  </span>
                  <span className="text-xs text-slate-600">
                    {new Date(exec.startedAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {expandedExec === exec.id && (
                  <div className="border-t border-slate-800 px-4 py-3">
                    <ExecutionLog execution={exec} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Builder sheet */}
      <PlaybookBuilder
        open={builderOpen}
        onClose={() => { setBuilderOpen(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
      />
    </div>
  );
}
