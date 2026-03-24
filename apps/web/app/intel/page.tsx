"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Shield,
  AlertTriangle,
  BookOpen,
  Link2,
  Eye,
  Crosshair,
  RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getIntelList, getAlerts, type IntelResponse, type AlertResponse } from "@/lib/api";
import { useOrg } from "@/lib/context";

// ---------------------------------------------------------------------------
// Types derived from the STIX `data` jsonb field
// ---------------------------------------------------------------------------

interface StixAttackPattern {
  x_sparta_tactic?: string;
  x_sparta_id?: string;
  x_related_nis2?: string[];
  x_detection_guidance?: string;
  x_mitigation_guidance?: string;
  kill_chain_phases?: { kill_chain_name: string; phase_name: string }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Display order for tactics
const TACTIC_ORDER = [
  "Reconnaissance",
  "Initial Access",
  "Execution",
  "Persistence",
  "Impact",
];

const TACTIC_COLOR: Record<string, string> = {
  Reconnaissance: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "Initial Access": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Execution: "bg-red-500/20 text-red-300 border-red-500/30",
  Persistence: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  Impact: "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

const TACTIC_DOT: Record<string, string> = {
  Reconnaissance: "bg-violet-400",
  "Initial Access": "bg-amber-400",
  Execution: "bg-red-400",
  Persistence: "bg-orange-400",
  Impact: "bg-rose-400",
};

function tacticBadgeClass(tactic: string): string {
  return (
    TACTIC_COLOR[tactic] ??
    "bg-slate-500/20 text-slate-300 border-slate-500/30"
  );
}

function tacticDot(tactic: string): string {
  return TACTIC_DOT[tactic] ?? "bg-slate-400";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStix(intel: IntelResponse): StixAttackPattern {
  return intel.data as StixAttackPattern;
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
// Left panel: collapsible tactic group
// ---------------------------------------------------------------------------

interface TacticGroupProps {
  tactic: string;
  techniques: IntelResponse[];
  selectedId: string | null;
  onSelect: (intel: IntelResponse) => void;
  defaultOpen: boolean;
}

function TacticGroup({
  tactic,
  techniques,
  selectedId,
  onSelect,
  defaultOpen,
}: TacticGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-800 last:border-b-0">
      {/* Tactic header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-800/40 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${tacticDot(tactic)}`}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-slate-300">{tactic}</span>
          <span className="text-[10px] text-slate-600 font-mono">
            {techniques.length}
          </span>
        </div>
        {open ? (
          <ChevronDown size={13} className="text-slate-600 shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-slate-600 shrink-0" />
        )}
      </button>

      {/* Technique list */}
      {open && (
        <ul className="py-1">
          {techniques.map((intel) => {
            const stix = getStix(intel);
            const active = selectedId === intel.id;
            return (
              <li key={intel.id}>
                <button
                  onClick={() => onSelect(intel)}
                  className={[
                    "w-full text-left px-4 py-2 flex flex-col gap-0.5 transition-colors",
                    active
                      ? "bg-blue-500/15 border-l-2 border-blue-400"
                      : "border-l-2 border-transparent hover:bg-slate-800/40 hover:border-slate-700",
                  ].join(" ")}
                >
                  <span
                    className={`text-xs font-medium leading-snug ${active ? "text-blue-300" : "text-slate-300"}`}
                  >
                    {intel.name}
                  </span>
                  {stix.x_sparta_id && (
                    <span className="text-[10px] font-mono text-slate-600">
                      {stix.x_sparta_id}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel: technique detail
// ---------------------------------------------------------------------------

interface TechniqueDetailProps {
  intel: IntelResponse;
  orgId: string | null;
}

function TechniqueDetail({ intel, orgId }: TechniqueDetailProps) {
  const stix = getStix(intel);
  const [relatedAlerts, setRelatedAlerts] = useState<AlertResponse[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch related alerts whenever the selected technique or org changes
  useEffect(() => {
    if (!orgId) {
      setRelatedAlerts([]);
      return;
    }
    let cancelled = false;

    async function load() {
      setAlertsLoading(true);
      try {
        // Search by technique name (partial match via the service's ilike)
        const result = await getAlerts({
          organizationId: orgId!,
          spartaTechnique: intel.name,
          perPage: 5,
        });
        if (!cancelled) setRelatedAlerts(result.data);
      } catch {
        if (!cancelled) setRelatedAlerts([]);
      } finally {
        if (!cancelled) setAlertsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [intel.id, orgId]);

  const nis2Articles: string[] = Array.isArray(stix.x_related_nis2)
    ? (stix.x_related_nis2 as string[])
    : [];

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-800">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-7 h-7 rounded bg-blue-500/20 flex items-center justify-center shrink-0">
            <Crosshair size={14} className="text-blue-400" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-100 leading-snug">
              {intel.name}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {stix.x_sparta_id && (
                <span className="text-[10px] font-mono text-slate-500 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded">
                  {stix.x_sparta_id}
                </span>
              )}
              {stix.x_sparta_tactic && (
                <span
                  className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tacticBadgeClass(stix.x_sparta_tactic)}`}
                >
                  {stix.x_sparta_tactic}
                </span>
              )}
              <span className="text-[10px] text-slate-600 uppercase tracking-wider">
                {intel.source}
              </span>
              {intel.confidence !== null && (
                <span className="text-[10px] text-slate-600">
                  Confidence {intel.confidence}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="mt-3 text-xs text-slate-400 leading-relaxed">
          {intel.description}
        </p>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Detection Guidance */}
        {stix.x_detection_guidance && (
          <Section
            icon={<Eye size={13} className="text-amber-400" />}
            title="Detection Guidance"
            accent="amber"
          >
            <p className="text-xs text-slate-300 leading-relaxed">
              {stix.x_detection_guidance}
            </p>
          </Section>
        )}

        {/* Mitigation Guidance */}
        {stix.x_mitigation_guidance && (
          <Section
            icon={<Shield size={13} className="text-emerald-400" />}
            title="Mitigation Guidance"
            accent="emerald"
          >
            <p className="text-xs text-slate-300 leading-relaxed">
              {stix.x_mitigation_guidance}
            </p>
          </Section>
        )}

        {/* Related NIS2 Articles */}
        {nis2Articles.length > 0 && (
          <Section
            icon={<BookOpen size={13} className="text-blue-400" />}
            title="Related NIS2 Articles"
            accent="blue"
          >
            <div className="flex flex-wrap gap-1.5">
              {nis2Articles.map((article) => (
                <span
                  key={article}
                  className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded border bg-blue-500/10 text-blue-300 border-blue-500/30"
                >
                  {article}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Related Alerts */}
        <Section
          icon={<AlertTriangle size={13} className="text-red-400" />}
          title="Related Alerts"
          accent="red"
        >
          {alertsLoading ? (
            <div className="flex items-center gap-2 py-1">
              <div className="h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              <span className="text-xs text-slate-600">Loading...</span>
            </div>
          ) : relatedAlerts.length === 0 ? (
            <p className="text-xs text-slate-600 italic">
              {orgId
                ? "No alerts matched this technique yet."
                : "Select an organisation to see related alerts."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {relatedAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className="flex items-start gap-2 rounded bg-slate-800/50 border border-slate-800 px-3 py-2"
                >
                  <span
                    className={[
                      "inline-flex shrink-0 items-center text-[9px] font-bold px-1 py-0.5 rounded border mt-0.5",
                      alert.severity === "CRITICAL"
                        ? "bg-red-500/20 text-red-300 border-red-500/30"
                        : alert.severity === "HIGH"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
                    ].join(" ")}
                  >
                    {alert.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-200 font-medium leading-snug">
                      {alert.title}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {relativeTime(alert.triggeredAt)}
                      {" · "}
                      <span
                        className={
                          alert.status === "NEW"
                            ? "text-red-400"
                            : alert.status === "INVESTIGATING"
                              ? "text-amber-400"
                              : "text-slate-600"
                        }
                      >
                        {alert.status.replace("_", " ")}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* IoCs placeholder */}
        <Section
          icon={<Link2 size={13} className="text-slate-400" />}
          title="Indicators of Compromise"
          accent="slate"
        >
          <p className="text-xs text-slate-600 italic">
            No indicators linked to this technique yet. IoC feeds will be
            imported in a future release.
          </p>
        </Section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable detail section
// ---------------------------------------------------------------------------

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  accent: "amber" | "emerald" | "blue" | "red" | "slate";
  children: React.ReactNode;
}

const ACCENT_BORDER: Record<SectionProps["accent"], string> = {
  amber:   "border-amber-500/30",
  emerald: "border-emerald-500/30",
  blue:    "border-blue-500/30",
  red:     "border-red-500/30",
  slate:   "border-slate-700",
};

function Section({ icon, title, accent, children }: SectionProps) {
  return (
    <div
      className={`rounded-lg border ${ACCENT_BORDER[accent]} bg-slate-900/50 px-4 py-3`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state for the right panel
// ---------------------------------------------------------------------------

function EmptyDetail() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
        <Crosshair size={22} className="text-slate-600" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-slate-400">
        Select a SPARTA technique
      </p>
      <p className="text-xs text-slate-600 mt-1 max-w-xs">
        Choose a technique from the navigator on the left to view detection
        guidance, mitigations, and related alerts.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IntelPage() {
  const { orgId } = useOrg();
  const [techniques, setTechniques] = useState<IntelResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openTactics, setOpenTactics] = useState<Set<string>>(
    new Set(TACTIC_ORDER)
  );

  // Fetch all attack-patterns on mount (30 records, load once)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await getIntelList({
          stixType: "attack-pattern",
          perPage: 100,
        });
        if (!cancelled) setTechniques(result.data);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load intel");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter client-side based on search query
  const filtered = useMemo(() => {
    if (!search.trim()) return techniques;
    const q = search.toLowerCase();
    return techniques.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        ((getStix(t).x_sparta_id ?? "").toLowerCase().includes(q))
    );
  }, [techniques, search]);

  // Group by tactic in display order
  const grouped = useMemo(() => {
    const map = new Map<string, IntelResponse[]>();
    for (const t of filtered) {
      const tactic = getStix(t).x_sparta_tactic ?? "Unknown";
      if (!map.has(tactic)) map.set(tactic, []);
      map.get(tactic)!.push(t);
    }
    // Sort tactics in display order
    const ordered: [string, IntelResponse[]][] = [];
    for (const tactic of TACTIC_ORDER) {
      if (map.has(tactic)) ordered.push([tactic, map.get(tactic)!]);
    }
    // Any tactics not in TACTIC_ORDER go at the end
    for (const [tactic, items] of map.entries()) {
      if (!TACTIC_ORDER.includes(tactic)) ordered.push([tactic, items]);
    }
    return ordered;
  }, [filtered]);

  const selectedIntel = useMemo(
    () => techniques.find((t) => t.id === selectedId) ?? null,
    [techniques, selectedId]
  );

  const handleSelect = useCallback((intel: IntelResponse) => {
    setSelectedId(intel.id);
  }, []);

  // Expand all tactic groups when search is active so results are visible
  useEffect(() => {
    if (search.trim()) {
      setOpenTactics(new Set(TACTIC_ORDER));
    }
  }, [search]);

  const totalFiltered = filtered.length;
  const totalTechniques = techniques.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-100">
            Threat Intelligence
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            SPARTA space attack techniques and countermeasures
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <span className="text-xs text-slate-600">
              {totalTechniques} technique{totalTechniques !== 1 ? "s" : ""}
            </span>
          )}
          {loading && (
            <RefreshCw
              size={14}
              className="text-slate-600 animate-spin"
              aria-label="Loading"
            />
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-xs">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Navigator */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/40">
          {/* Search */}
          <div className="px-3 py-3 border-b border-slate-800">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search techniques..."
                className="pl-7 h-7 text-xs bg-slate-800 border-slate-700 text-slate-300 placeholder:text-slate-600 focus-visible:ring-blue-500/40"
                aria-label="Search SPARTA techniques"
              />
            </div>
            {search && (
              <p className="text-[10px] text-slate-600 mt-1.5 px-0.5">
                {totalFiltered} result{totalFiltered !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* Tactic list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 flex flex-col items-center gap-3">
                <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                <p className="text-xs text-slate-600">Loading...</p>
              </div>
            ) : grouped.length === 0 ? (
              <p className="p-4 text-xs text-slate-600 italic">
                No techniques match your search.
              </p>
            ) : (
              grouped.map(([tactic, items]) => (
                <TacticGroup
                  key={tactic}
                  tactic={tactic}
                  techniques={items}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  defaultOpen={openTactics.has(tactic)}
                />
              ))
            )}
          </div>
        </aside>

        {/* RIGHT: Detail panel */}
        <main className="flex-1 overflow-hidden bg-slate-950/30">
          {selectedIntel ? (
            <TechniqueDetail intel={selectedIntel} orgId={orgId} />
          ) : (
            <EmptyDetail />
          )}
        </main>
      </div>
    </div>
  );
}
