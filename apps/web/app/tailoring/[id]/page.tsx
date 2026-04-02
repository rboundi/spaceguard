"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Crosshair,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
} from "lucide-react";
import {
  getTailoringBaseline,
  generateTailoredBaseline,
  type ThreatProfileResponse,
  type TailoredBaselineResponse,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADV_BADGE: Record<string, string> = {
  OPPORTUNISTIC: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  ORGANIZED_CRIME: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  NATION_STATE_TIER2: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  NATION_STATE_TIER1: "text-red-400 bg-red-500/10 border-red-500/20",
};

const ADV_LABELS: Record<string, string> = {
  OPPORTUNISTIC: "Opportunistic",
  ORGANIZED_CRIME: "Organized Crime",
  NATION_STATE_TIER2: "Nation-State (Tier 2)",
  NATION_STATE_TIER1: "Nation-State (Tier 1)",
};

const MISSION_LABELS: Record<string, string> = {
  EARTH_OBSERVATION: "Earth Observation",
  COMMUNICATIONS: "Communications",
  NAVIGATION: "Navigation",
  IOT: "IoT",
  SSA: "SSA",
  SCIENCE: "Science",
  DEFENSE: "Defense",
  OTHER: "Other",
};

function relevanceColor(score: number): string {
  if (score >= 0.7) return "bg-red-500";
  if (score >= 0.5) return "bg-orange-500";
  if (score >= 0.3) return "bg-amber-500";
  return "bg-blue-500";
}

function relevanceText(score: number): string {
  if (score >= 0.7) return "text-red-400";
  if (score >= 0.5) return "text-orange-400";
  if (score >= 0.3) return "text-amber-400";
  return "text-blue-400";
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-800 ${className}`} />;
}

// Group NIST controls by family (first 2 chars)
function groupByFamily(controls: Array<{ controlId: string; alreadyCompliant: boolean; countermeasures: string[] }>) {
  const families = new Map<string, typeof controls>();
  for (const c of controls) {
    const family = c.controlId.split("-")[0] ?? "XX";
    const list = families.get(family) ?? [];
    list.push(c);
    families.set(family, list);
  }
  return [...families.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const NIST_FAMILIES: Record<string, string> = {
  AC: "Access Control",
  AT: "Awareness and Training",
  AU: "Audit and Accountability",
  CA: "Assessment, Authorization, Monitoring",
  CM: "Configuration Management",
  CP: "Contingency Planning",
  IA: "Identification and Authentication",
  IR: "Incident Response",
  MA: "Maintenance",
  MP: "Media Protection",
  PE: "Physical and Environmental",
  PL: "Planning",
  PM: "Program Management",
  PS: "Personnel Security",
  PT: "PII Processing and Transparency",
  RA: "Risk Assessment",
  SA: "System and Services Acquisition",
  SC: "System and Communications Protection",
  SI: "System and Information Integrity",
  SR: "Supply Chain Risk Management",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TailoringResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [baseline, setBaseline] = useState<TailoredBaselineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const data = await getTailoringBaseline(id);
      setBaseline(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load baseline");
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const data = await generateTailoredBaseline(id);
      setBaseline(data);
    } catch { /* */ }
    setRegenerating(false);
  }

  function exportCsv() {
    if (!baseline) return;
    const rows = baseline.controlBaseline.controls.map((c) =>
      [c.controlId, c.alreadyCompliant ? "Compliant" : "Gap", c.countermeasures.join("; "), c.sources.join("; ")].join(",")
    );
    const csv = "Control ID,Status,Countermeasures,Sources\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tailored-baseline-${id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (error || !baseline) {
    return (
      <div className="p-6">
        <Link href="/tailoring" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-4">
          <ArrowLeft size={12} /> Back to Tailoring
        </Link>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error ?? "No baseline generated yet. Go back and click Generate."}
        </div>
      </div>
    );
  }

  const ps = baseline.profileSummary;
  const tc = baseline.techniqueCount;
  const cb = baseline.controlBaseline;
  const techniques = baseline.applicableTechniques ?? [];
  const countermeasures = baseline.countermeasures ?? [];
  const recommendations = baseline.recommendations ?? [];
  const controls = cb.controls ?? [];

  // Group techniques by tactic
  const tacticGroups = new Map<string, typeof techniques>();
  for (const t of techniques) {
    const list = tacticGroups.get(t.tactic) ?? [];
    list.push(t);
    tacticGroups.set(t.tactic, list);
  }

  const compliancePercent = cb.total > 0 ? Math.round((cb.alreadyCompliant / cb.total) * 100) : 0;

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/tailoring" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4">
        <ArrowLeft size={12} /> Back to Tailoring
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">{ps.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="default" className="text-xs">{MISSION_LABELS[ps.missionType] ?? ps.missionType}</Badge>
            <Badge variant="default" className="text-xs">{ps.orbitRegime}</Badge>
            <Badge className={`text-xs border ${ADV_BADGE[ps.adversaryCapability] ?? ""}`}>
              {ADV_LABELS[ps.adversaryCapability] ?? ps.adversaryCapability}
            </Badge>
            <span className="text-xs text-slate-600">
              Generated {new Date(ps.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={exportCsv}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5">
            <Download size={13} /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5">
            {regenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Regenerate
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="px-3 py-3">
            <p className="text-[10px] text-slate-500 uppercase">Techniques</p>
            <p className="text-xl font-bold text-slate-200">
              {tc.applicable}<span className="text-sm text-slate-600">/{tc.total}</span>
            </p>
            <p className="text-[10px] text-slate-600">{tc.highRelevance} high relevance</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="px-3 py-3">
            <p className="text-[10px] text-slate-500 uppercase">Countermeasures</p>
            <p className="text-xl font-bold text-slate-200">{countermeasures.length}</p>
            <p className="text-[10px] text-slate-600">{countermeasures.filter(c => c.feasible).length} feasible</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="px-3 py-3">
            <p className="text-[10px] text-slate-500 uppercase">Control Baseline</p>
            <p className="text-xl font-bold text-blue-400">{cb.total}</p>
            <p className="text-[10px] text-slate-600">NIST 800-53 controls</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="px-3 py-3">
            <p className="text-[10px] text-slate-500 uppercase">Compliance</p>
            <p className="text-xl font-bold text-emerald-400">
              {cb.alreadyCompliant}<span className="text-sm text-slate-600">/{cb.total}</span>
            </p>
            <p className="text-[10px] text-slate-600">{compliancePercent}% covered</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="px-3 py-3">
            <p className="text-[10px] text-slate-500 uppercase">New Gaps</p>
            <p className={`text-xl font-bold ${cb.newGaps > 0 ? "text-red-400" : "text-emerald-400"}`}>{cb.newGaps}</p>
            <p className="text-[10px] text-slate-600">{cb.notFeasible} not feasible</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="techniques">
        <TabsList className="bg-slate-800 border-slate-700 mb-4">
          <TabsTrigger value="techniques" className="data-[state=active]:bg-slate-700 text-xs gap-1.5">
            <Crosshair size={13} /> Techniques ({tc.applicable})
          </TabsTrigger>
          <TabsTrigger value="countermeasures" className="data-[state=active]:bg-slate-700 text-xs gap-1.5">
            <Shield size={13} /> Countermeasures ({countermeasures.length})
          </TabsTrigger>
          <TabsTrigger value="controls" className="data-[state=active]:bg-slate-700 text-xs gap-1.5">
            Controls ({cb.total})
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="data-[state=active]:bg-slate-700 text-xs gap-1.5">
            <AlertTriangle size={13} /> Actions ({recommendations.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Techniques */}
        <TabsContent value="techniques">
          <div className="space-y-4">
            {[...tacticGroups.entries()].map(([tactic, techs]) => (
              <Card key={tactic} className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                    {tactic}
                    <span className="text-slate-600 font-normal">({techs.length} techniques)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex flex-wrap gap-1.5">
                    {techs.sort((a, b) => b.relevanceScore - a.relevanceScore).map((t, ti) => (
                      <div
                        key={`${t.spartaId}-${ti}`}
                        className="group relative rounded border border-slate-700 px-2 py-1 hover:border-slate-600 transition-colors"
                        title={`${t.name} (${t.spartaId})\nRelevance: ${(t.relevanceScore * 100).toFixed(0)}%`}
                      >
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${relevanceColor(t.relevanceScore)}`} />
                          <span className="text-[10px] text-slate-400 font-mono">{t.spartaId}</span>
                          <span className={`text-[10px] font-bold tabular-nums ${relevanceText(t.relevanceScore)}`}>
                            {(t.relevanceScore * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Countermeasures */}
        <TabsContent value="countermeasures">
          <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs">ID</TableHead>
                  <TableHead className="text-slate-500 text-xs">Name</TableHead>
                  <TableHead className="text-slate-500 text-xs">Priority</TableHead>
                  <TableHead className="text-slate-500 text-xs">Techniques</TableHead>
                  <TableHead className="text-slate-500 text-xs">Feasibility</TableHead>
                  <TableHead className="text-slate-500 text-xs">NIST Controls</TableHead>
                  <TableHead className="text-slate-500 text-xs">Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {countermeasures.slice(0, 50).map((cm, i) => (
                  <TableRow
                    key={cm.spartaId}
                    className={`border-slate-800 hover:bg-slate-800/40 ${i === 0 ? "bg-blue-500/5" : ""}`}
                  >
                    <TableCell className="py-2 text-xs font-mono text-blue-400">{cm.spartaId}</TableCell>
                    <TableCell className="py-2 text-xs text-slate-200 max-w-[200px]">
                      <span className="line-clamp-1">{cm.name}</span>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge className={`text-[10px] px-1.5 py-0 border ${
                        cm.priority > 50 ? "text-red-400 bg-red-500/10 border-red-500/20"
                          : cm.priority > 20 ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                          : "text-slate-400 bg-slate-500/10 border-slate-500/20"
                      }`}>{cm.priority}</Badge>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-slate-400 tabular-nums">{cm.techniquesAddressed}</TableCell>
                    <TableCell className="py-2">
                      {cm.feasible ? (
                        <Badge className="text-[10px] px-1.5 py-0 border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                          <CheckCircle2 size={9} className="mr-0.5" /> Feasible
                        </Badge>
                      ) : (
                        <Badge className="text-[10px] px-1.5 py-0 border text-red-400 bg-red-500/10 border-red-500/20">
                          <XCircle size={9} className="mr-0.5" /> Infeasible
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-[10px] text-slate-500 font-mono max-w-[120px]">
                      <span className="line-clamp-1">{cm.nistControls.slice(0, 3).join(", ")}{cm.nistControls.length > 3 ? ` +${cm.nistControls.length - 3}` : ""}</span>
                    </TableCell>
                    <TableCell className="py-2 text-[10px] text-slate-500">{cm.category}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab 3: Controls */}
        <TabsContent value="controls">
          <div className="space-y-3">
            {groupByFamily(controls).map(([family, ctrls]) => (
              <Card key={family} className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                    <span>{family} - {NIST_FAMILIES[family] ?? "Other"}</span>
                    <span className="text-slate-600 font-normal">
                      {ctrls.filter(c => c.alreadyCompliant).length}/{ctrls.length} compliant
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex flex-wrap gap-1">
                    {ctrls.map((c, idx) => (
                      <span
                        key={`${c.controlId}-${idx}`}
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          c.alreadyCompliant
                            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                            : "text-red-400 bg-red-500/10 border-red-500/20"
                        }`}
                        title={`${c.controlId}: ${c.alreadyCompliant ? "Compliant" : "Gap"}\nCountermeasures: ${c.countermeasures.join(", ")}`}
                      >
                        {c.controlId}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 4: Recommendations */}
        <TabsContent value="recommendations">
          <div className="space-y-3">
            {recommendations.map((r, i) => (
              <Card key={i} className={`bg-slate-900 border-slate-800 ${i === 0 ? "border-blue-500/30" : ""}`}>
                <CardContent className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                      i === 0 ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-slate-800 text-slate-500"
                    }`}>
                      {r.priority}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200">{r.action}</p>
                      {r.nistControls.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {r.nistControls.map((c, ci) => (
                            <span key={`${c}-${ci}`} className="text-[9px] font-mono text-slate-500 bg-slate-800 rounded px-1 py-0.5">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Badge className={`text-[10px] px-1.5 py-0 border shrink-0 ${
                      r.effort === "HIGH" ? "text-red-400 bg-red-500/10 border-red-500/20"
                        : r.effort === "MEDIUM" ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    }`}>{r.effort} effort</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
