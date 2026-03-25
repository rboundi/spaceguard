"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Crosshair,
  Eye,
  ExternalLink,
  Grid3X3,
  List,
  RefreshCw,
  Search,
  Shield,
  Target,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getIntelList,
  getAlerts,
  searchSpartaTechniques,
  getTechniqueDetail,
  type IntelResponse,
  type AlertResponse,
  type TechniqueDetail,
} from "@/lib/api";
import { useOrg } from "@/lib/context";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StixTechnique {
  x_mitre_id?: string;
  x_sparta_id?: string;
  x_sparta_tactic?: string;
  x_sparta_is_subtechnique?: boolean;
  x_detection_guidance?: string;
  x_mitigation_guidance?: string;
  x_related_nis2?: string[];
  kill_chain_phases?: { kill_chain_name: string; phase_name: string }[];
  x_nist_rev5?: string | string[];
  x_sparta_category?: string;
  x_sparta_deployment?: string;
  [key: string]: unknown;
}

interface TacticGroup {
  phaseName: string;          // e.g. "reconnaissance"
  displayName: string;        // e.g. "Reconnaissance"
  shortCode: string;          // e.g. "REC"
  techniques: IntelResponse[];
}

// ---------------------------------------------------------------------------
// Constants and helpers
// ---------------------------------------------------------------------------

// Maps kill_chain phase_name -> display name + colour classes
const TACTIC_META: Record<string, { display: string; headerCls: string; dotCls: string; badgeCls: string }> = {
  "reconnaissance":        { display: "Reconnaissance",      headerCls: "border-violet-500/40 bg-violet-500/10", dotCls: "bg-violet-400",  badgeCls: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  "resource-development":  { display: "Resource Dev.",       headerCls: "border-cyan-500/40 bg-cyan-500/10",     dotCls: "bg-cyan-400",     badgeCls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  "initial-access":        { display: "Initial Access",      headerCls: "border-amber-500/40 bg-amber-500/10",   dotCls: "bg-amber-400",    badgeCls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  "execution":             { display: "Execution",           headerCls: "border-red-500/40 bg-red-500/10",       dotCls: "bg-red-400",      badgeCls: "bg-red-500/20 text-red-300 border-red-500/30" },
  "persistence":           { display: "Persistence",         headerCls: "border-orange-500/40 bg-orange-500/10", dotCls: "bg-orange-400",   badgeCls: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  "privilege-escalation":  { display: "Priv. Escalation",   headerCls: "border-pink-500/40 bg-pink-500/10",     dotCls: "bg-pink-400",     badgeCls: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  "defense-evasion":       { display: "Defense Evasion",    headerCls: "border-yellow-500/40 bg-yellow-500/10", dotCls: "bg-yellow-400",   badgeCls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  "lateral-movement":      { display: "Lateral Movement",   headerCls: "border-teal-500/40 bg-teal-500/10",     dotCls: "bg-teal-400",     badgeCls: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
  "exfiltration":          { display: "Exfiltration",        headerCls: "border-rose-500/40 bg-rose-500/10",     dotCls: "bg-rose-400",     badgeCls: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  "impact":                { display: "Impact",              headerCls: "border-red-700/40 bg-red-900/20",       dotCls: "bg-red-600",      badgeCls: "bg-red-700/20 text-red-300 border-red-700/30" },
  "command-and-control":   { display: "C2",                  headerCls: "border-indigo-500/40 bg-indigo-500/10", dotCls: "bg-indigo-400",   badgeCls: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  "collection":            { display: "Collection",          headerCls: "border-slate-500/40 bg-slate-500/10",   dotCls: "bg-slate-400",    badgeCls: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
};

const FALLBACK_META = { display: "Unknown", headerCls: "border-slate-600/40 bg-slate-800/30", dotCls: "bg-slate-500", badgeCls: "bg-slate-600/20 text-slate-400 border-slate-600/30" };

function tacticMeta(phaseName: string) {
  return TACTIC_META[phaseName] ?? FALLBACK_META;
}

function getStix(intel: IntelResponse): StixTechnique {
  return intel.data as StixTechnique;
}

function getMitreId(intel: IntelResponse): string | null {
  const d = getStix(intel);
  return (d.x_mitre_id ?? d.x_sparta_id ?? null) as string | null;
}

function isSubtechnique(intel: IntelResponse): boolean {
  const id = getMitreId(intel);
  if (id && id.includes(".")) return true;
  return !!(getStix(intel).x_sparta_is_subtechnique);
}

function getPhaseName(intel: IntelResponse): string {
  const phases = getStix(intel).kill_chain_phases;
  return phases?.[0]?.phase_name ?? "unknown";
}

/** Coverage tier: 2 = both guidance, 1 = one guidance, 0 = none */
function coverageTier(intel: IntelResponse): 0 | 1 | 2 {
  const d = getStix(intel);
  const hasDet = !!(d.x_detection_guidance);
  const hasMit = !!(d.x_mitigation_guidance);
  if (hasDet && hasMit) return 2;
  if (hasDet || hasMit) return 1;
  return 0;
}

const COVERAGE_CELL: Record<0 | 1 | 2, string> = {
  2: "border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10",
  1: "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10",
  0: "border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60",
};

const COVERAGE_ACTIVE: Record<0 | 1 | 2, string> = {
  2: "border-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-400/30",
  1: "border-amber-400 bg-amber-500/15 ring-1 ring-amber-400/30",
  0: "border-blue-400 bg-blue-500/15 ring-1 ring-blue-400/30",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Coverage legend
// ---------------------------------------------------------------------------

function CoverageLegend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-slate-500">
      <span className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-sm border border-emerald-500/60 bg-emerald-500/10" />
        Full coverage
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-sm border border-amber-500/50 bg-amber-500/10" />
        Partial
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-sm border border-slate-600/50 bg-slate-800/30" />
        Gap
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Technique cell (grid)
// ---------------------------------------------------------------------------

function TechniqueCell({
  intel,
  selected,
  onSelect,
}: {
  intel: IntelResponse;
  selected: boolean;
  onSelect: (intel: IntelResponse) => void;
}) {
  const tier = coverageTier(intel);
  const mitreId = getMitreId(intel);

  return (
    <button
      onClick={() => onSelect(intel)}
      className={[
        "w-full text-left rounded border px-2 py-1.5 transition-all",
        selected ? COVERAGE_ACTIVE[tier] : COVERAGE_CELL[tier],
      ].join(" ")}
      title={intel.name}
    >
      {mitreId && (
        <div className="text-[9px] font-mono text-slate-600 leading-none mb-0.5">
          {mitreId}
        </div>
      )}
      <div className={`text-[10px] leading-snug font-medium line-clamp-2 ${selected ? "text-slate-100" : "text-slate-300"}`}>
        {intel.name}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tactic column (grid)
// ---------------------------------------------------------------------------

function TacticColumn({
  group,
  selectedId,
  onSelect,
}: {
  group: TacticGroup;
  selectedId: string | null;
  onSelect: (intel: IntelResponse) => void;
}) {
  const meta = tacticMeta(group.phaseName);

  return (
    <div className="flex flex-col min-w-[140px] max-w-[160px] shrink-0">
      {/* Header */}
      <div className={`rounded-t border border-b-0 px-2 py-2 ${meta.headerCls}`}>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotCls}`} />
          <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wide leading-tight">
            {meta.display}
          </span>
        </div>
        <div className="text-[9px] text-slate-600 mt-0.5 font-mono">
          {group.shortCode} · {group.techniques.length}
        </div>
      </div>

      {/* Cells */}
      <div className="flex flex-col gap-1 border border-t-0 border-slate-700/50 rounded-b bg-slate-900/30 p-1.5">
        {group.techniques.map((t) => (
          <TechniqueCell
            key={t.id}
            intel={t}
            selected={selectedId === t.id}
            onSelect={onSelect}
          />
        ))}
        {group.techniques.length === 0 && (
          <div className="text-[10px] text-slate-700 italic text-center py-2">
            No techniques
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search result row
// ---------------------------------------------------------------------------

function SearchResultRow({
  intel,
  selected,
  onSelect,
}: {
  intel: IntelResponse;
  selected: boolean;
  onSelect: (intel: IntelResponse) => void;
}) {
  const tier = coverageTier(intel);
  const mitreId = getMitreId(intel);
  const phase = getPhaseName(intel);
  const meta = tacticMeta(phase);
  const isSub = isSubtechnique(intel);

  return (
    <button
      onClick={() => onSelect(intel)}
      className={[
        "w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 transition-colors",
        selected
          ? "bg-blue-500/10 border-l-2 border-blue-400"
          : "border-l-2 border-transparent hover:bg-slate-800/40",
      ].join(" ")}
    >
      {/* Coverage dot */}
      <span
        className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${tier === 2 ? "bg-emerald-400" : tier === 1 ? "bg-amber-400" : "bg-slate-600"}`}
        title={tier === 2 ? "Full coverage" : tier === 1 ? "Partial coverage" : "Gap"}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium leading-snug ${selected ? "text-blue-200" : "text-slate-200"}`}>
            {intel.name}
          </span>
          {isSub && (
            <span className="text-[9px] font-mono text-slate-600 bg-slate-800 border border-slate-700 px-1 py-0.5 rounded">
              sub
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {mitreId && (
            <span className="text-[9px] font-mono text-slate-600">{mitreId}</span>
          )}
          <span className={`inline-flex items-center text-[9px] font-semibold px-1 py-0.5 rounded border ${meta.badgeCls}`}>
            {meta.display}
          </span>
        </div>
        {intel.description && (
          <p className="text-[10px] text-slate-600 mt-1 line-clamp-1">
            {intel.description}
          </p>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sub-technique accordion item
// ---------------------------------------------------------------------------

function SubTechniqueItem({ intel }: { intel: IntelResponse }) {
  const [open, setOpen] = useState(false);
  const d = getStix(intel);
  const mitreId = getMitreId(intel);

  return (
    <div className="rounded border border-slate-800 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/60 hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown size={11} className="text-slate-600 shrink-0" />
          ) : (
            <ChevronRight size={11} className="text-slate-600 shrink-0" />
          )}
          <span className="text-xs text-slate-300 font-medium leading-snug text-left">
            {intel.name}
          </span>
        </div>
        {mitreId && (
          <span className="text-[9px] font-mono text-slate-600 shrink-0 ml-2">
            {mitreId}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 py-2.5 space-y-2 bg-slate-950/40 border-t border-slate-800">
          {intel.description && (
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {intel.description}
            </p>
          )}
          {d.x_detection_guidance && (
            <div className="flex gap-1.5">
              <Eye size={10} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                {String(d.x_detection_guidance)}
              </p>
            </div>
          )}
          {d.x_mitigation_guidance && (
            <div className="flex gap-1.5">
              <Shield size={10} className="text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                {String(d.x_mitigation_guidance)}
              </p>
            </div>
          )}
          {!intel.description && !d.x_detection_guidance && !d.x_mitigation_guidance && (
            <p className="text-[10px] text-slate-600 italic">No additional detail available.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Countermeasure card
// ---------------------------------------------------------------------------

function CountermeasureCard({ intel }: { intel: IntelResponse }) {
  const d = getStix(intel);
  const nistRaw = d.x_nist_rev5;
  const nistList: string[] = Array.isArray(nistRaw)
    ? (nistRaw as string[])
    : typeof nistRaw === "string" && nistRaw
    ? nistRaw.split(/[,;]\s*/).filter(Boolean)
    : [];

  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-200 font-medium leading-snug">
            {intel.name}
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {d.x_sparta_category && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border bg-slate-800/60 text-slate-400 border-slate-700">
                {String(d.x_sparta_category)}
              </span>
            )}
            {d.x_sparta_deployment && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
                {String(d.x_sparta_deployment)}
              </span>
            )}
          </div>
        </div>
        {nistList.length > 0 && (
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            {nistList.slice(0, 3).map((n) => (
              <span
                key={n}
                className="text-[9px] font-mono font-medium px-1 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20"
              >
                {n}
              </span>
            ))}
            {nistList.length > 3 && (
              <span className="text-[9px] text-slate-600">+{nistList.length - 3}</span>
            )}
          </div>
        )}
      </div>
      {intel.description && (
        <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
          {intel.description}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  accentBorder?: string;
  children: React.ReactNode;
  count?: number;
}

function Section({ icon, title, accentBorder = "border-slate-700", children, count }: SectionProps) {
  return (
    <div className={`rounded-lg border ${accentBorder} bg-slate-900/50 px-4 py-3`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {title}
          </h3>
        </div>
        {count !== undefined && (
          <span className="text-[10px] font-mono text-slate-600">{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function DetailPanel({
  selected,
  detail,
  detailLoading,
  orgId,
  alerts,
  alertsLoading,
  onClose,
  onMapToCompliance,
}: {
  selected: IntelResponse;
  detail: TechniqueDetail | null;
  detailLoading: boolean;
  orgId: string | null;
  alerts: AlertResponse[];
  alertsLoading: boolean;
  onClose: () => void;
  onMapToCompliance: () => void;
}) {
  const d = getStix(selected);
  const mitreId = getMitreId(selected);
  const phase = getPhaseName(selected);
  const meta = tacticMeta(phase);
  const tier = coverageTier(selected);

  const nis2Articles: string[] = Array.isArray(d.x_related_nis2)
    ? (d.x_related_nis2 as string[])
    : [];

  const tierBadge = tier === 2
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
    : tier === 1
    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
    : "bg-slate-700/40 text-slate-500 border-slate-600/40";

  const tierLabel = tier === 2 ? "Fully covered" : tier === 1 ? "Partially covered" : "Coverage gap";

  return (
    <div className="h-full flex flex-col overflow-hidden border-l border-slate-800 bg-slate-950/60">
      {/* Header */}
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-slate-800">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="mt-0.5 w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center shrink-0">
              <Crosshair size={12} className="text-blue-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100 leading-snug">
                {selected.name}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {mitreId && (
                  <span className="text-[9px] font-mono text-slate-500 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded">
                    {mitreId}
                  </span>
                )}
                <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border ${meta.badgeCls}`}>
                  {meta.display}
                </span>
                <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded border ${tierBadge}`}>
                  {tier === 2 ? <CheckCircle2 size={8} /> : tier === 1 ? <Circle size={8} /> : <Target size={8} />}
                  {tierLabel}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 mt-0.5 text-slate-600 hover:text-slate-400 transition-colors"
            aria-label="Close detail panel"
          >
            <X size={14} />
          </button>
        </div>

        {/* Description */}
        {selected.description && (
          <p className="mt-2.5 text-[11px] text-slate-400 leading-relaxed">
            {selected.description}
          </p>
        )}

        {/* Map to Compliance */}
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2.5 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
            onClick={onMapToCompliance}
          >
            <ExternalLink size={10} className="mr-1" />
            Map to Compliance
          </Button>
          {nis2Articles.length > 0 && (
            <span className="text-[9px] text-slate-600">
              NIS2: {nis2Articles.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {detailLoading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <RefreshCw size={14} className="text-blue-500 animate-spin" />
            <span className="text-xs text-slate-600">Loading details...</span>
          </div>
        ) : (
          <>
            {/* Sub-techniques */}
            {detail && detail.subTechniques.length > 0 && (
              <Section
                icon={<Crosshair size={12} className="text-violet-400" />}
                title="Sub-techniques"
                accentBorder="border-violet-500/20"
                count={detail.subTechniques.length}
              >
                <div className="space-y-1.5">
                  {detail.subTechniques.map((s) => (
                    <SubTechniqueItem key={s.id} intel={s} />
                  ))}
                </div>
              </Section>
            )}

            {/* Countermeasures */}
            {detail && (
              <Section
                icon={<Shield size={12} className="text-emerald-400" />}
                title="Countermeasures"
                accentBorder="border-emerald-500/20"
                count={detail.countermeasures.length}
              >
                {detail.countermeasures.length === 0 ? (
                  <p className="text-[11px] text-slate-600 italic">
                    No countermeasures mapped to this technique.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detail.countermeasures.map((cm) => (
                      <CountermeasureCard key={cm.id} intel={cm} />
                    ))}
                  </div>
                )}
              </Section>
            )}

            {/* Detection guidance */}
            {d.x_detection_guidance && (
              <Section
                icon={<Eye size={12} className="text-amber-400" />}
                title="Detection Guidance"
                accentBorder="border-amber-500/20"
              >
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {String(d.x_detection_guidance)}
                </p>
              </Section>
            )}

            {/* Mitigation guidance */}
            {d.x_mitigation_guidance && (
              <Section
                icon={<Shield size={12} className="text-blue-400" />}
                title="Mitigation Guidance"
                accentBorder="border-blue-500/20"
              >
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {String(d.x_mitigation_guidance)}
                </p>
              </Section>
            )}

            {/* NIS2 articles */}
            {nis2Articles.length > 0 && (
              <Section
                icon={<BookOpen size={12} className="text-blue-400" />}
                title="Related NIS2 Articles"
                accentBorder="border-blue-500/20"
              >
                <div className="flex flex-wrap gap-1.5">
                  {nis2Articles.map((a) => (
                    <span
                      key={a}
                      className="text-[10px] font-medium px-2 py-0.5 rounded border bg-blue-500/10 text-blue-300 border-blue-500/30"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Related alerts */}
            <Section
              icon={<AlertTriangle size={12} className="text-red-400" />}
              title="Related Alerts"
              accentBorder="border-red-500/20"
              count={alerts.length || undefined}
            >
              {alertsLoading ? (
                <div className="flex items-center gap-2 py-1">
                  <RefreshCw size={11} className="text-blue-500 animate-spin" />
                  <span className="text-[11px] text-slate-600">Loading...</span>
                </div>
              ) : alerts.length === 0 ? (
                <p className="text-[11px] text-slate-600 italic">
                  {orgId
                    ? "No alerts matched this technique."
                    : "Select an organisation to see related alerts."}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {alerts.map((alert) => (
                    <li
                      key={alert.id}
                      className="flex items-start gap-2 rounded bg-slate-800/50 border border-slate-800 px-3 py-2"
                    >
                      <span
                        className={[
                          "inline-flex shrink-0 items-center text-[8px] font-bold px-1 py-0.5 rounded border mt-0.5",
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
                        <p className="text-[11px] text-slate-200 font-medium leading-snug">
                          {alert.title}
                        </p>
                        <p className="text-[9px] text-slate-600 mt-0.5">
                          {relativeTime(alert.triggeredAt)} ·{" "}
                          <span
                            className={
                              alert.status === "NEW"
                                ? "text-red-400"
                                : alert.status === "INVESTIGATING"
                                ? "text-amber-400"
                                : "text-slate-600"
                            }
                          >
                            {alert.status.replaceAll("_", " ")}
                          </span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty detail state
// ---------------------------------------------------------------------------

function EmptyDetail() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8 bg-slate-950/30 border-l border-slate-800">
      <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mb-4">
        <Crosshair size={22} className="text-slate-600" />
      </div>
      <p className="text-sm font-medium text-slate-400">Select a technique</p>
      <p className="text-xs text-slate-600 mt-1.5 max-w-xs leading-relaxed">
        Click any technique in the matrix to view detection guidance, countermeasures, and related alerts.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-sm">
        <Stat label="Detection" icon={<Eye size={14} className="text-amber-400" />} />
        <Stat label="Countermeasures" icon={<Shield size={14} className="text-emerald-400" />} />
        <Stat label="NIS2 Links" icon={<BookOpen size={14} className="text-blue-400" />} />
      </div>
    </div>
  );
}

function Stat({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded border border-slate-800 bg-slate-900/40 px-2 py-3">
      {icon}
      <span className="text-[9px] text-slate-600 text-center leading-tight">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar({
  parentCount,
  subCount,
  cmCount,
  detectionCount,
  mitigationCount,
  loading,
}: {
  parentCount: number;
  subCount: number;
  cmCount: number;
  detectionCount: number;
  mitigationCount: number;
  loading: boolean;
}) {
  const gapCount = parentCount - detectionCount;

  const items = [
    { label: "Parent techniques", value: parentCount, color: "text-slate-200" },
    { label: "Sub-techniques", value: subCount, color: "text-slate-400" },
    { label: "Countermeasures", value: cmCount, color: "text-emerald-400" },
    { label: "With detection", value: detectionCount, color: "text-amber-400" },
    { label: "Coverage gaps", value: gapCount, color: "text-red-400" },
  ];

  return (
    <div className="flex items-center gap-6 px-6 py-2.5 border-b border-slate-800 bg-slate-900/30">
      {loading ? (
        <div className="flex items-center gap-2">
          <RefreshCw size={12} className="text-blue-500 animate-spin" />
          <span className="text-xs text-slate-600">Loading matrix...</span>
        </div>
      ) : (
        items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className={`text-sm font-bold font-mono ${item.color}`}>
              {item.value}
            </span>
            <span className="text-[10px] text-slate-600">{item.label}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Load all attack-patterns (pagination)
// ---------------------------------------------------------------------------

async function loadAllTechniques(): Promise<IntelResponse[]> {
  const all: IntelResponse[] = [];
  let page = 1;
  let total = Infinity;

  while (all.length < total) {
    const result = await getIntelList({
      stixType: "attack-pattern",
      source: "SPARTA",
      page,
      perPage: 100,
    });
    all.push(...result.data);
    total = result.total;
    page++;
    if (result.data.length < 100) break;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IntelPage() {
  const { orgId } = useOrg();
  const router = useRouter();

  // All techniques (parent + sub)
  const [allTechniques, setAllTechniques] = useState<IntelResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<IntelResponse[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Countermeasure count (loaded once for stats)
  const [cmCount, setCmCount] = useState(0);

  // Selected technique
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TechniqueDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Related alerts for selected technique
  const [relatedAlerts, setRelatedAlerts] = useState<AlertResponse[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  // Load all techniques on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const techniques = await loadAllTechniques();
        if (!cancelled) setAllTechniques(techniques);

        // Load countermeasure count separately
        const cmResult = await getIntelList({
          stixType: "course-of-action",
          source: "SPARTA",
          perPage: 1,
        });
        if (!cancelled) setCmCount(cmResult.total);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load SPARTA matrix");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  // Derived: parent techniques and sub-techniques
  const parentTechniques = useMemo(
    () => allTechniques.filter((t) => !isSubtechnique(t)),
    [allTechniques]
  );

  const subTechniques = useMemo(
    () => allTechniques.filter((t) => isSubtechnique(t)),
    [allTechniques]
  );

  // Stats
  const detectionCount = useMemo(
    () => parentTechniques.filter((t) => !!(getStix(t).x_detection_guidance)).length,
    [parentTechniques]
  );

  const mitigationCount = useMemo(
    () => parentTechniques.filter((t) => !!(getStix(t).x_mitigation_guidance)).length,
    [parentTechniques]
  );

  // Group parent techniques by tactic, ordered by tactic key
  const tacticGroups = useMemo((): TacticGroup[] => {
    const map = new Map<string, IntelResponse[]>();

    for (const t of parentTechniques) {
      const phase = getPhaseName(t);
      if (!map.has(phase)) map.set(phase, []);
      map.get(phase)!.push(t);
    }

    // Sort tactics in a meaningful order (known order first)
    const ORDER = [
      "reconnaissance",
      "resource-development",
      "initial-access",
      "execution",
      "persistence",
      "privilege-escalation",
      "defense-evasion",
      "lateral-movement",
      "collection",
      "exfiltration",
      "command-and-control",
      "impact",
    ];

    const groups: TacticGroup[] = [];

    for (const phase of ORDER) {
      if (map.has(phase)) {
        const meta = tacticMeta(phase);
        const techs = map.get(phase)!;
        // Extract short code from first technique's x_mitre_id prefix
        const firstId = getMitreId(techs[0]) ?? "";
        const shortCode = firstId.split("-")[0] ?? phase.toUpperCase().slice(0, 3);
        groups.push({
          phaseName: phase,
          displayName: meta.display,
          shortCode,
          techniques: techs.sort((a, b) => {
            const ai = getMitreId(a) ?? a.name;
            const bi = getMitreId(b) ?? b.name;
            return ai.localeCompare(bi);
          }),
        });
      }
    }

    // Any remaining phases not in ORDER
    for (const [phase, techs] of map.entries()) {
      if (!ORDER.includes(phase)) {
        const meta = tacticMeta(phase);
        const firstId = getMitreId(techs[0]) ?? "";
        const shortCode = firstId.split("-")[0] ?? phase.toUpperCase().slice(0, 3);
        groups.push({
          phaseName: phase,
          displayName: meta.display,
          shortCode,
          techniques: techs,
        });
      }
    }

    return groups;
  }, [parentTechniques]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const result = await searchSpartaTechniques(searchQuery.trim(), 80);
        setSearchResults(result.data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery]);

  // Determine display mode: search overrides grid/list
  const isSearchActive = searchQuery.trim().length > 0;

  // Selected technique object
  const selectedIntel = useMemo(
    () => allTechniques.find((t) => t.id === selectedId) ?? null,
    [allTechniques, selectedId]
  );

  // Load detail when technique is selected
  useEffect(() => {
    if (!selectedId || !selectedIntel) {
      setDetail(null);
      return;
    }
    let cancelled = false;

    async function load() {
      if (!selectedIntel) return;
      setDetailLoading(true);
      setDetail(null);
      try {
        // Use stixId for lookup if available
        const lookupId = selectedIntel.stixId || selectedIntel.id;
        const d = await getTechniqueDetail(lookupId);
        if (!cancelled) setDetail(d);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [selectedId, selectedIntel]);

  // Load related alerts when technique or org changes
  useEffect(() => {
    if (!selectedIntel || !orgId) {
      setRelatedAlerts([]);
      return;
    }
    let cancelled = false;

    async function load() {
      if (!selectedIntel || !orgId) return;
      setAlertsLoading(true);
      try {
        const result = await getAlerts({
          organizationId: orgId,
          spartaTechnique: selectedIntel.name,
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
    return () => { cancelled = true; };
  }, [selectedId, orgId, selectedIntel]);

  const handleSelect = useCallback((intel: IntelResponse) => {
    setSelectedId((prev) => (prev === intel.id ? null : intel.id));
  }, []);

  const handleClose = useCallback(() => setSelectedId(null), []);

  const handleMapToCompliance = useCallback(() => {
    router.push("/compliance");
  }, [router]);

  const displayItems = isSearchActive ? searchResults : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 px-6 py-3.5 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-100">
            SPARTA Matrix Navigator
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Space attack techniques, countermeasures and coverage gaps
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CoverageLegend />
          {/* View mode toggle (only visible when not searching) */}
          {!isSearchActive && (
            <div className="flex items-center rounded border border-slate-700 overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-slate-700 text-slate-200" : "text-slate-600 hover:text-slate-400"}`}
                title="Matrix grid view"
              >
                <Grid3X3 size={13} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-slate-700 text-slate-200" : "text-slate-600 hover:text-slate-400"}`}
                title="List view"
              >
                <List size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar
        parentCount={parentTechniques.length}
        subCount={subTechniques.length}
        cmCount={cmCount}
        detectionCount={detectionCount}
        mitigationCount={mitigationCount}
        loading={loading}
      />

      {/* Search bar */}
      <div className="shrink-0 px-4 py-2.5 border-b border-slate-800 bg-slate-900/20">
        <div className="relative max-w-lg">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search techniques by name, SPARTA ID, or description..."
            className="pl-7 pr-8 h-8 text-xs bg-slate-800/60 border-slate-700 text-slate-300 placeholder:text-slate-600 focus-visible:ring-blue-500/40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {isSearchActive && (
          <p className="text-[10px] text-slate-600 mt-1 px-0.5">
            {searching ? "Searching..." : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 mx-4 mt-3 rounded border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-red-400 text-xs">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Matrix or search results */}
        <div className={`flex flex-col overflow-hidden transition-all ${selectedId ? "flex-1" : "w-full"}`}>
          {isSearchActive ? (
            // Search results list
            <div className="flex-1 overflow-y-auto">
              {searching ? (
                <div className="flex items-center justify-center py-12 gap-2">
                  <RefreshCw size={14} className="text-blue-500 animate-spin" />
                  <span className="text-xs text-slate-600">Searching...</span>
                </div>
              ) : displayItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                  <Search size={20} className="mb-2" />
                  <p className="text-sm">No techniques found</p>
                </div>
              ) : (
                displayItems.map((intel) => (
                  <SearchResultRow
                    key={intel.id}
                    intel={intel}
                    selected={selectedId === intel.id}
                    onSelect={handleSelect}
                  />
                ))
              )}
            </div>
          ) : viewMode === "grid" ? (
            // Matrix grid
            <div className="flex-1 overflow-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center py-20 gap-2">
                  <RefreshCw size={16} className="text-blue-500 animate-spin" />
                  <span className="text-sm text-slate-600">Loading SPARTA matrix...</span>
                </div>
              ) : (
                <div className="flex gap-3 min-w-max pb-2">
                  {tacticGroups.map((group) => (
                    <TacticColumn
                      key={group.phaseName}
                      group={group}
                      selectedId={selectedId}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Flat list view (parent techniques, grouped by tactic)
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12 gap-2">
                  <RefreshCw size={14} className="text-blue-500 animate-spin" />
                  <span className="text-xs text-slate-600">Loading...</span>
                </div>
              ) : (
                tacticGroups.map((group) => (
                  <div key={group.phaseName}>
                    <div className={`sticky top-0 z-10 px-4 py-1.5 border-b border-slate-800 flex items-center gap-2 ${tacticMeta(group.phaseName).headerCls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tacticMeta(group.phaseName).dotCls}`} />
                      <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wide">
                        {group.displayName}
                      </span>
                      <span className="text-[9px] text-slate-600 font-mono">
                        {group.techniques.length}
                      </span>
                    </div>
                    {group.techniques.map((intel) => (
                      <SearchResultRow
                        key={intel.id}
                        intel={intel}
                        selected={selectedId === intel.id}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right: Detail panel */}
        {selectedId && selectedIntel && (
          <div className="w-[400px] shrink-0 overflow-hidden">
            <DetailPanel
              selected={selectedIntel}
              detail={detail}
              detailLoading={detailLoading}
              orgId={orgId}
              alerts={relatedAlerts}
              alertsLoading={alertsLoading}
              onClose={handleClose}
              onMapToCompliance={handleMapToCompliance}
            />
          </div>
        )}

        {/* Empty state when no selection */}
        {!selectedId && !isSearchActive && !loading && (
          <div className="hidden" />
        )}
      </div>
    </div>
  );
}
