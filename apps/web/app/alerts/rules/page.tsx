"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Shield,
  Search,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Loader2,
  BookOpen,
  ExternalLink,
  Filter,
} from "lucide-react";
import { getDetectionRules, type DetectionRuleResponse } from "@/lib/api";

// ---------------------------------------------------------------------------
// Category metadata (derived from sourceFile)
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  "telemetry-anomalies.yaml": { label: "Telemetry Anomalies", color: "text-blue-400" },
  "command-security.yaml": { label: "Command Security", color: "text-red-400" },
  "data-integrity.yaml": { label: "Data Link Integrity", color: "text-amber-400" },
  "ground-segment.yaml": { label: "Ground Segment", color: "text-emerald-400" },
  "link-security.yaml": { label: "RF Link Security", color: "text-violet-400" },
  "spacecraft-health.yaml": { label: "Spacecraft Health", color: "text-cyan-400" },
  "access-control.yaml": { label: "Access Control", color: "text-orange-400" },
  "data-exfiltration.yaml": { label: "Data Exfiltration", color: "text-rose-400" },
  "persistence-evasion.yaml": { label: "Persistence & Evasion", color: "text-pink-400" },
};

function categoryLabel(sourceFile: string | null): string {
  if (!sourceFile) return "Unknown";
  return CATEGORY_META[sourceFile]?.label ?? sourceFile.replace(".yaml", "");
}

function categoryColor(sourceFile: string | null): string {
  if (!sourceFile) return "text-slate-400";
  return CATEGORY_META[sourceFile]?.color ?? "text-slate-400";
}

// ---------------------------------------------------------------------------
// Severity styling
// ---------------------------------------------------------------------------

function severityBg(severity: string): string {
  switch (severity) {
    case "CRITICAL": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "HIGH": return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "MEDIUM": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "LOW": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    default: return "bg-slate-500/15 text-slate-400 border-slate-500/30";
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RuleLibraryPage() {
  const [rules, setRules] = useState<DetectionRuleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Expanded rule IDs
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getDetectionRules()
      .then((res) => setRules(res.rules))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load rules"))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const r of rules) {
      cats.add(r.sourceFile ?? "unknown");
    }
    return [...cats].sort();
  }, [rules]);

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (severityFilter && r.severity !== severityFilter) return false;
      if (categoryFilter && r.sourceFile !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          r.id.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.sparta?.tactic?.toLowerCase().includes(q) ?? false) ||
          (r.sparta?.technique?.toLowerCase().includes(q) ?? false) ||
          (r.mitre?.techniqueId?.toLowerCase().includes(q) ?? false) ||
          (r.mitre?.techniqueName?.toLowerCase().includes(q) ?? false) ||
          (r.nis2Articles.some((a) => a.toLowerCase().includes(q)));
        if (!matches) return false;
      }
      return true;
    });
  }, [rules, search, severityFilter, categoryFilter]);

  // Group filtered rules by category
  const grouped = useMemo(() => {
    const map = new Map<string, DetectionRuleResponse[]>();
    for (const r of filtered) {
      const key = r.sourceFile ?? "unknown";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Severity counts
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rules) {
      counts[r.severity] = (counts[r.severity] ?? 0) + 1;
    }
    return counts;
  }, [rules]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-400">
        <Loader2 size={16} className="animate-spin" />
        Loading detection rules...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-400">{error}</div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <BookOpen size={18} className="text-blue-400" />
            Detection Rule Library
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {rules.length} space-specific detection rules mapped to SPARTA, MITRE ATT&CK, and NIS2 Article 21
          </p>
        </div>

        {/* Severity summary pills */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] px-2 py-1 rounded-full bg-red-500/15 text-red-400 font-medium">
            {severityCounts["CRITICAL"] ?? 0} Critical
          </span>
          <span className="text-[10px] px-2 py-1 rounded-full bg-orange-500/15 text-orange-400 font-medium">
            {severityCounts["HIGH"] ?? 0} High
          </span>
          <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">
            {severityCounts["MEDIUM"] ?? 0} Medium
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search rules by name, ID, SPARTA, MITRE, or NIS2..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-slate-500" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-8 px-2 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-8 px-2 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {categoryLabel(cat)}
              </option>
            ))}
          </select>
        </div>
        {(search || severityFilter || categoryFilter) && (
          <button
            onClick={() => {
              setSearch("");
              setSeverityFilter("");
              setCategoryFilter("");
            }}
            className="text-[11px] text-slate-500 hover:text-slate-300 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Showing {filtered.length} of {rules.length} rules
      </p>

      {/* Rule groups */}
      {grouped.map(([category, catRules]) => (
        <section key={category} className="space-y-2">
          <h2 className={`text-xs font-semibold uppercase tracking-wide ${categoryColor(category)} flex items-center gap-2`}>
            <Shield size={12} />
            {categoryLabel(category)}
            <span className="text-slate-600 font-normal normal-case tracking-normal">
              ({catRules.length} rule{catRules.length !== 1 ? "s" : ""})
            </span>
          </h2>

          <div className="bg-slate-900 border border-slate-800 rounded-lg divide-y divide-slate-800">
            {catRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                isExpanded={expanded.has(rule.id)}
                onToggle={() => toggleExpand(rule.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {filtered.length === 0 && (
        <div className="text-center text-sm text-slate-500 py-12">
          No rules match the current filters.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule row component
// ---------------------------------------------------------------------------

function RuleRow({
  rule,
  isExpanded,
  onToggle,
}: {
  rule: DetectionRuleResponse;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown size={14} className="text-slate-500 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-slate-500 shrink-0" />
        )}

        <span className="text-[10px] font-mono text-slate-500 w-20 shrink-0">{rule.id}</span>

        <span className="text-xs text-slate-200 flex-1 min-w-0 truncate">{rule.name}</span>

        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${severityBg(rule.severity)}`}>
          {rule.severity}
        </span>

        {rule.sparta && (
          <span className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono shrink-0">
            {rule.sparta.technique}
          </span>
        )}

        {rule.mitre && (
          <span className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono shrink-0">
            {rule.mitre.techniqueId}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pl-11 space-y-3">
          <p className="text-[11px] text-slate-400 leading-relaxed">{rule.description}</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* SPARTA mapping */}
            {rule.sparta && (
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">SPARTA</div>
                <div className="text-xs text-slate-300">
                  <span className="text-slate-500">Tactic: </span>{rule.sparta.tactic}
                </div>
                <div className="text-xs text-slate-300">
                  <span className="text-slate-500">Technique: </span>{rule.sparta.technique}
                </div>
              </div>
            )}

            {/* MITRE mapping */}
            {rule.mitre && (
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">MITRE ATT&CK</div>
                <div className="text-xs text-slate-300 flex items-center gap-1">
                  <span className="font-mono text-blue-400">{rule.mitre.techniqueId}</span>
                  <ExternalLink size={10} className="text-slate-600" />
                </div>
                <div className="text-xs text-slate-300">{rule.mitre.techniqueName}</div>
              </div>
            )}

            {/* NIS2 articles */}
            {rule.nis2Articles.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">NIS2 Relevance</div>
                <div className="flex flex-wrap gap-1">
                  {rule.nis2Articles.map((art) => (
                    <span
                      key={art}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    >
                      {art}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Condition type */}
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span>
              <AlertTriangle size={10} className="inline mr-1" />
              Condition: <span className="text-slate-400 font-mono">{rule.conditionType}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
