"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useOrg } from "@/lib/context";
import {
  getOrganization,
  updateSettingsOrganization,
  updateSettingsNotifications,
  sendTestNotification,
  getSettingsDetectionRules,
  updateDetectionRuleSettings,
  getTelemetryStreams,
  regenerateStreamKey,
  updateStreamRateLimit,
  updateProfile,
} from "@/lib/api";
import type {
  SettingsDetectionRule,
} from "@/lib/api";
import type { OrganizationResponse, StreamResponse } from "@spaceguard/shared";
import {
  Settings,
  Building2,
  Bell,
  BellOff,
  Waves,
  Shield,
  Plug,
  Key,
  Save,
  Check,
  Loader2,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  Send,
  ExternalLink,
  Info,
  Search,
  ChevronDown,
  ChevronRight,
  Zap,
  Globe,
  Lock,
  Webhook,
  MessageSquare,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-2 mb-2">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div>
        <h2 className="text-sm font-medium text-slate-200">{title}</h2>
        {description && <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-400 mb-1">{children}</label>;
}

function ReadonlyField({ value }: { value: string }) {
  return (
    <div className="h-9 px-3 flex items-center rounded-md bg-slate-800/50 border border-slate-700/50 text-sm text-slate-400">
      {value}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full h-9 px-3 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50"
    />
  );
}

function SaveButton({ saving, saved, onClick, disabled }: {
  saving: boolean; saved: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className="flex items-center gap-2 px-4 h-9 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
    >
      {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> {saving ? "Saving..." : "Save changes"}</>}
    </button>
  );
}

function Toggle({ enabled, onChange, size = "default" }: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  size?: "default" | "small";
}) {
  const w = size === "small" ? "w-7 h-4" : "w-9 h-5";
  const dot = size === "small" ? "w-3 h-3" : "w-4 h-4";
  const translate = size === "small" ? "translate-x-3" : "translate-x-4";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative ${w} rounded-full shrink-0 transition-colors ${enabled ? "bg-blue-600" : "bg-slate-700"}`}
    >
      <span className={`absolute top-0.5 ${dot} rounded-full bg-white transition-transform ${enabled ? translate : "translate-x-0.5"}`} />
    </button>
  );
}

function NotificationToggle({ label, description, enabled, onChange }: {
  label: string; description: string; enabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-md bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:border-slate-600 transition-colors"
      onClick={() => onChange(!enabled)}
    >
      <div className="flex items-center gap-3 min-w-0">
        {enabled ? <Bell size={14} className="text-blue-400 shrink-0" /> : <BellOff size={14} className="text-slate-600 shrink-0" />}
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-200">{label}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{description}</div>
        </div>
      </div>
      <Toggle enabled={enabled} onChange={onChange} />
    </div>
  );
}

function severityBg(severity: string): string {
  switch (severity) {
    case "CRITICAL": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "HIGH": return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "MEDIUM": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "LOW": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    default: return "bg-slate-500/15 text-slate-400 border-slate-500/30";
  }
}

// ===========================================================================
// Organization Tab
// ===========================================================================

function OrganizationTab() {
  const { orgId } = useOrg();
  const [org, setOrg] = useState<OrganizationResponse | null>(null);
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [nis2Classification, setNis2Classification] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    getOrganization(orgId)
      .then((o) => {
        setOrg(o);
        setName(o.name);
        setContactEmail(o.contactEmail);
        setContactName(o.contactName);
        setNis2Classification(o.nis2Classification);
        setCountry(o.country);
      })
      .catch(() => setError("Failed to load organization"))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateSettingsOrganization({
        name: name.trim(),
        contactEmail: contactEmail.trim(),
        contactName: contactName.trim(),
        nis2Classification,
        country,
      });
      setOrg(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-5">
      <SectionCard>
        <SectionHeader icon={<Building2 size={15} />} title="Organization Details" description="Core organization information for compliance reporting" />
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel>Organization Name</FieldLabel>
            <TextInput value={name} onChange={setName} />
          </div>
          <div>
            <FieldLabel>Country (ISO 3166-1)</FieldLabel>
            <TextInput value={country} onChange={setCountry} placeholder="DE" />
          </div>
          <div>
            <FieldLabel>Contact Name</FieldLabel>
            <TextInput value={contactName} onChange={setContactName} />
          </div>
          <div>
            <FieldLabel>Contact Email</FieldLabel>
            <TextInput value={contactEmail} onChange={setContactEmail} />
          </div>
          <div>
            <FieldLabel>NIS2 Classification</FieldLabel>
            <select
              value={nis2Classification}
              onChange={(e) => setNis2Classification(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="ESSENTIAL">Essential Entity</option>
              <option value="IMPORTANT">Important Entity</option>
            </select>
          </div>
          <div>
            <FieldLabel>Sector</FieldLabel>
            <ReadonlyField value={org?.sector ?? "space"} />
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader icon={<Building2 size={15} />} title="Organization Logo" description="Upload your logo for PDF reports and the dashboard" />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg bg-slate-800 border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-[10px]">
            Logo
          </div>
          <div>
            <button className="px-3 h-8 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
              Upload image
            </button>
            <p className="text-[10px] text-slate-600 mt-1">PNG or SVG, max 2 MB. Coming soon.</p>
          </div>
        </div>
      </SectionCard>

      <div className="flex items-center gap-3">
        <SaveButton saving={saving} saved={saved} onClick={handleSave} />
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}

// ===========================================================================
// Notifications Tab
// ===========================================================================

function NotificationsTab() {
  const { user, refreshUser } = useAuth();
  const [notifyCriticalAlerts, setNotifyCriticalAlerts] = useState(true);
  const [notifyDeadlines, setNotifyDeadlines] = useState(true);
  const [notifyWeeklyDigest, setNotifyWeeklyDigest] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    if (user) {
      setNotifyCriticalAlerts(user.notifyCriticalAlerts ?? true);
      setNotifyDeadlines(user.notifyDeadlines ?? true);
      setNotifyWeeklyDigest(user.notifyWeeklyDigest ?? true);
    }
  }, [user]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateSettingsNotifications({ notifyCriticalAlerts, notifyDeadlines, notifyWeeklyDigest });
      await updateProfile({ notifyCriticalAlerts, notifyDeadlines, notifyWeeklyDigest });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail() {
    setTestSending(true);
    try {
      await sendTestNotification();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    } catch {
      setError("Failed to send test email");
    } finally {
      setTestSending(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-5">
      <SectionCard>
        <SectionHeader icon={<Bell size={15} />} title="Email Notification Preferences" description="Choose which events trigger email notifications" />
        <div className="space-y-3">
          <NotificationToggle
            label="Critical & High Alerts"
            description="Get emailed when a CRITICAL or HIGH severity alert is triggered"
            enabled={notifyCriticalAlerts}
            onChange={setNotifyCriticalAlerts}
          />
          <NotificationToggle
            label="NIS2 Deadline Warnings"
            description="Get emailed when a regulatory reporting deadline is approaching"
            enabled={notifyDeadlines}
            onChange={setNotifyDeadlines}
          />
          <NotificationToggle
            label="Weekly Digest"
            description="Receive a weekly summary of alerts, incidents, and compliance status"
            enabled={notifyWeeklyDigest}
            onChange={setNotifyWeeklyDigest}
          />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader icon={<Send size={15} />} title="Test Notification" description="Send a test email to verify your notification setup" />
        <div className="flex items-center gap-3">
          <ReadonlyField value={user.email} />
          <button
            onClick={handleTestEmail}
            disabled={testSending}
            className="flex items-center gap-2 px-3 h-9 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50 shrink-0"
          >
            {testSent ? <><Check size={12} className="text-emerald-400" /> Sent</> : <><Send size={12} /> {testSending ? "Sending..." : "Send test email"}</>}
          </button>
        </div>
      </SectionCard>

      <div className="flex items-center gap-3">
        <SaveButton saving={saving} saved={saved} onClick={handleSave} />
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}

// ===========================================================================
// Telemetry Tab
// ===========================================================================

function TelemetryTab() {
  const { orgId } = useOrg();
  const [streams, setStreams] = useState<StreamResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!orgId) return;
    getTelemetryStreams(orgId)
      .then((res) => setStreams(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  function toggleReveal(id: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleRegenerate(id: string) {
    setRegenerating((prev) => new Set(prev).add(id));
    try {
      const result = await regenerateStreamKey(id);
      setStreams((prev) =>
        prev.map((s) => s.id === id ? { ...s, apiKey: result.apiKey } : s)
      );
      setRevealedKeys((prev) => new Set(prev).add(id));
    } catch {
      // silently fail
    } finally {
      setRegenerating((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  if (loading) return <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading streams...</div>;

  return (
    <div className="space-y-5">
      <SectionCard>
        <SectionHeader icon={<Waves size={15} />} title="Telemetry Streams" description={`${streams.length} configured stream${streams.length !== 1 ? "s" : ""}`} />

        {streams.length === 0 ? (
          <p className="text-xs text-slate-500">No telemetry streams configured. Create streams from the Telemetry page.</p>
        ) : (
          <div className="space-y-3">
            {streams.map((stream) => {
              const revealed = revealedKeys.has(stream.id);
              const isRegenerating = regenerating.has(stream.id);
              const maskedKey = stream.apiKey.slice(0, 8) + "\u2022".repeat(24);
              const curlExample = `curl -X POST ${API_URL}/api/v1/telemetry/ingest \\
  -H "X-API-Key: ${revealed ? stream.apiKey : "<YOUR_API_KEY>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"points": [{"parameterName": "battery_voltage_v", "valueNumeric": 28.5, "time": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}]}'`;

              return (
                <div key={stream.id} className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-slate-200">{stream.name}</span>
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${stream.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-600/30 text-slate-500"}`}>
                        {stream.status}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-600 font-mono">{stream.protocol}</span>
                  </div>

                  {/* API Key */}
                  <div>
                    <FieldLabel>API Key</FieldLabel>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-8 px-3 flex items-center rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-400 overflow-hidden">
                        {revealed ? stream.apiKey : maskedKey}
                      </div>
                      <button
                        onClick={() => toggleReveal(stream.id)}
                        className="h-8 w-8 flex items-center justify-center rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                        title={revealed ? "Hide" : "Reveal"}
                      >
                        {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button
                        onClick={() => copyToClipboard(stream.apiKey)}
                        className="h-8 w-8 flex items-center justify-center rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                        title="Copy"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={() => handleRegenerate(stream.id)}
                        disabled={isRegenerating}
                        className="h-8 px-2.5 flex items-center gap-1.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
                        title="Regenerate key"
                      >
                        <RefreshCw size={11} className={isRegenerating ? "animate-spin" : ""} />
                        Regenerate
                      </button>
                    </div>
                  </div>

                  {/* Ingestion endpoint */}
                  <div>
                    <FieldLabel>Ingestion Endpoint</FieldLabel>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 h-8 px-3 flex items-center rounded bg-slate-900 border border-slate-700 text-[11px] font-mono text-blue-400 overflow-x-auto">
                        POST {API_URL}/api/v1/telemetry/ingest
                      </code>
                      <button
                        onClick={() => copyToClipboard(curlExample)}
                        className="h-8 px-2.5 flex items-center gap-1.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-400 hover:text-slate-200 transition-colors shrink-0"
                      >
                        <Copy size={11} />
                        Copy curl
                      </button>
                    </div>
                  </div>

                  {/* Rate limit */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <FieldLabel>Rate Limit (points/min)</FieldLabel>
                      <TextInput
                        value={String(stream.sampleRateHz ? Math.round(stream.sampleRateHz * 60) : 6000)}
                        onChange={() => {}}
                        placeholder="6000"
                      />
                    </div>
                    <div className="pt-5">
                      <span className="text-[10px] text-slate-600">Default: 6000/min</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// Detection Tab
// ===========================================================================

function DetectionTab() {
  const [rules, setRules] = useState<SettingsDetectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSettingsDetectionRules()
      .then((res) => setRules(res.rules))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return rules;
    const q = search.toLowerCase();
    return rules.filter((r) =>
      r.id.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      (r.sparta?.technique?.toLowerCase().includes(q) ?? false)
    );
  }, [rules, search]);

  function toggleExpand(id: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function toggleRule(ruleId: string, enabled: boolean) {
    setUpdating((prev) => new Set(prev).add(ruleId));
    try {
      await updateDetectionRuleSettings(ruleId, { enabled });
      setRules((prev) => prev.map((r) => r.id === ruleId ? { ...r, enabled } : r));
    } catch {
      // revert
    } finally {
      setUpdating((prev) => { const n = new Set(prev); n.delete(ruleId); return n; });
    }
  }

  async function updateThreshold(ruleId: string, value: number | null) {
    setUpdating((prev) => new Set(prev).add(ruleId));
    try {
      await updateDetectionRuleSettings(ruleId, { thresholdOverride: value });
      setRules((prev) => prev.map((r) => r.id === ruleId ? { ...r, thresholdOverride: value } : r));
    } catch {
      // silently fail
    } finally {
      setUpdating((prev) => { const n = new Set(prev); n.delete(ruleId); return n; });
    }
  }

  const enabledCount = rules.filter((r) => r.enabled).length;

  if (loading) return <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading rules...</div>;

  return (
    <div className="space-y-5">
      <SectionCard>
        <SectionHeader
          icon={<Shield size={15} />}
          title="Detection Rules"
          description={`${enabledCount} of ${rules.length} rules enabled`}
        />

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1 max-h-[600px] overflow-y-auto">
          {filtered.map((rule) => {
            const isExpanded = expanded.has(rule.id);
            const isUpdating = updating.has(rule.id);

            return (
              <div key={rule.id} className={`rounded-lg border transition-colors ${rule.enabled ? "bg-slate-800/30 border-slate-700/50" : "bg-slate-800/10 border-slate-800 opacity-60"}`}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Toggle enabled={rule.enabled} onChange={(v) => toggleRule(rule.id, v)} size="small" />

                  <button onClick={() => toggleExpand(rule.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    {isExpanded ? <ChevronDown size={12} className="text-slate-500 shrink-0" /> : <ChevronRight size={12} className="text-slate-500 shrink-0" />}
                    <span className="text-[10px] font-mono text-slate-500 w-20 shrink-0">{rule.id}</span>
                    <span className="text-xs text-slate-200 truncate flex-1">{rule.name}</span>
                  </button>

                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${severityBg(rule.severity)}`}>
                    {rule.severity}
                  </span>

                  {isUpdating && <Loader2 size={12} className="animate-spin text-blue-400 shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pl-16 space-y-3">
                    <p className="text-[11px] text-slate-400 leading-relaxed">{rule.description}</p>

                    {/* Threshold override */}
                    {rule.conditionType === "threshold" && rule.conditionParameter && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <FieldLabel>Threshold Override ({rule.conditionParameter})</FieldLabel>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="any"
                              placeholder={String(rule.conditionValue ?? "")}
                              value={rule.thresholdOverride ?? ""}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : null;
                                setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, thresholdOverride: val } : r));
                              }}
                              className="w-40 h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                            />
                            <button
                              onClick={() => updateThreshold(rule.id, rule.thresholdOverride)}
                              className="h-8 px-2.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              Apply
                            </button>
                            {rule.thresholdOverride !== null && (
                              <button
                                onClick={() => updateThreshold(rule.id, null)}
                                className="text-[11px] text-slate-500 hover:text-slate-300 underline"
                              >
                                Reset to default ({rule.conditionValue})
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {rule.conditionType === "rate_of_change" && rule.conditionParameter && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <FieldLabel>Rate Threshold Override ({rule.conditionParameter}, max change/sec)</FieldLabel>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="any"
                              placeholder={String(rule.conditionValue ?? "")}
                              value={rule.thresholdOverride ?? ""}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : null;
                                setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, thresholdOverride: val } : r));
                              }}
                              className="w-40 h-8 px-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                            />
                            <button
                              onClick={() => updateThreshold(rule.id, rule.thresholdOverride)}
                              className="h-8 px-2.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              Apply
                            </button>
                            {rule.thresholdOverride !== null && (
                              <button
                                onClick={() => updateThreshold(rule.id, null)}
                                className="text-[11px] text-slate-500 hover:text-slate-300 underline"
                              >
                                Reset to default ({rule.conditionValue})
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Mappings */}
                    <div className="flex items-center gap-4 text-[10px] text-slate-500">
                      {rule.sparta && <span>SPARTA: {rule.sparta.technique}</span>}
                      {rule.mitre && <span>MITRE: {rule.mitre.techniqueId}</span>}
                      {rule.nis2Articles.length > 0 && <span>NIS2: {rule.nis2Articles.join(", ")}</span>}
                    </div>

                    {/* Test button */}
                    <button className="flex items-center gap-1.5 h-7 px-2.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-400 hover:text-slate-200 transition-colors">
                      <Zap size={11} />
                      Run against last 24h
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// Integrations Tab (Placeholders)
// ===========================================================================

function IntegrationsTab() {
  return (
    <div className="space-y-5">
      <SectionCard>
        <SectionHeader icon={<Webhook size={15} />} title="Webhook Alert Forwarding" description="Forward alerts to an external endpoint in real-time" />
        <div>
          <FieldLabel>Webhook URL</FieldLabel>
          <div className="flex items-center gap-2">
            <TextInput value="" onChange={() => {}} placeholder="https://your-siem.example.com/api/alerts" />
            <button className="h-9 px-3 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 transition-colors shrink-0">
              Test
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1">POST request with JSON alert payload on every new alert.</p>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader icon={<Globe size={15} />} title="Syslog Output" description="Forward events to your SIEM via syslog protocol" />
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel>Syslog Host</FieldLabel>
            <TextInput value="" onChange={() => {}} placeholder="syslog.example.com" />
          </div>
          <div>
            <FieldLabel>Port</FieldLabel>
            <TextInput value="" onChange={() => {}} placeholder="514" />
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
          <Info size={12} className="text-blue-400 shrink-0" />
          <span className="text-[11px] text-blue-400">Syslog integration coming in a future release.</span>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader icon={<ExternalLink size={15} />} title="STIX/TAXII Feed" description="Publish threat intelligence as a TAXII 2.1 collection" />
        <div className="flex items-center gap-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
          <Info size={12} className="text-blue-400 shrink-0" />
          <span className="text-[11px] text-blue-400">STIX/TAXII feed endpoint coming soon. Use the Exports page for manual STIX bundle export.</span>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader icon={<MessageSquare size={15} />} title="Chat Notifications" description="Send alerts to Slack or Microsoft Teams channels" />
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-300">Slack</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Coming soon</span>
            </div>
            <TextInput value="" onChange={() => {}} placeholder="Webhook URL" disabled />
          </div>
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-300">Microsoft Teams</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Coming soon</span>
            </div>
            <TextInput value="" onChange={() => {}} placeholder="Webhook URL" disabled />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// API Keys Tab
// ===========================================================================

function ApiKeysTab() {
  const [keys, setKeys] = useState<Array<{ id: string; name: string; prefix: string; createdAt: string; lastUsed: string | null; status: string }>>([
    // Demo data since we don't have a real API keys table yet
    { id: "demo-1", name: "CI/CD Pipeline", prefix: "sg_live_a1b2c3d4", createdAt: "2026-03-10T08:00:00Z", lastUsed: "2026-03-25T14:30:00Z", status: "active" },
    { id: "demo-2", name: "Monitoring Dashboard", prefix: "sg_live_e5f6g7h8", createdAt: "2026-03-15T10:00:00Z", lastUsed: "2026-03-24T22:15:00Z", status: "active" },
  ]);

  return (
    <div className="space-y-5">
      <SectionCard>
        <SectionHeader icon={<Key size={15} />} title="API Keys" description="Manage programmatic access to the SpaceGuard API" />

        <button className="flex items-center gap-2 h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors">
          <Key size={12} />
          Create new API key
        </button>

        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-200">{key.name}</div>
                <div className="flex items-center gap-3 mt-1">
                  <code className="text-[10px] font-mono text-slate-500">{key.prefix}...</code>
                  <span className="text-[10px] text-slate-600">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                  </span>
                  {key.lastUsed && (
                    <span className="text-[10px] text-slate-600">
                      Last used {new Date(key.lastUsed).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${key.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                  {key.status}
                </span>
                <button className="h-7 px-2 rounded bg-slate-800 border border-slate-700 text-[11px] text-red-400 hover:text-red-300 hover:border-red-500/30 transition-colors">
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
          <Info size={12} className="text-blue-400 shrink-0" />
          <span className="text-[11px] text-blue-400">Full API key management with usage statistics coming in a future release. Currently showing placeholder data.</span>
        </div>
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// Main Settings Page
// ===========================================================================

export default function SettingsPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Settings size={18} className="text-blue-400" />
          Settings
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure your SpaceGuard instance
        </p>
      </div>

      <Tabs defaultValue="organization" className="w-full">
        <TabsList className="bg-slate-800/50 border border-slate-700/50 p-1 rounded-lg">
          <TabsTrigger value="organization" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400">
            <Building2 size={13} className="mr-1.5" /> Organization
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400">
            <Bell size={13} className="mr-1.5" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="telemetry" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400">
            <Waves size={13} className="mr-1.5" /> Telemetry
          </TabsTrigger>
          <TabsTrigger value="detection" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400">
            <Shield size={13} className="mr-1.5" /> Detection
          </TabsTrigger>
          <TabsTrigger value="integrations" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400">
            <Plug size={13} className="mr-1.5" /> Integrations
          </TabsTrigger>
          <TabsTrigger value="apikeys" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400">
            <Key size={13} className="mr-1.5" /> API Keys
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="mt-5">
          <OrganizationTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-5">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="telemetry" className="mt-5">
          <TelemetryTab />
        </TabsContent>
        <TabsContent value="detection" className="mt-5">
          <DetectionTab />
        </TabsContent>
        <TabsContent value="integrations" className="mt-5">
          <IntegrationsTab />
        </TabsContent>
        <TabsContent value="apikeys" className="mt-5">
          <ApiKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
