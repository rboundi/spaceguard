"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Orbit,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ChevronRight,
} from "lucide-react";
import {
  LifecyclePhase,
  lifecyclePhaseLabels,
  assetTypeLabels,
  AssetType,
} from "@spaceguard/shared";
import {
  getFleetLifecycle,
  getTlptSchedule,
  type FleetLifecycleEntry,
  type TlptScheduleEntry,
} from "@/lib/api";
import { useOrg } from "@/lib/context";
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
// Phase timeline config
// ---------------------------------------------------------------------------

const PHASES = [
  { key: "PHASE_0_MISSION_ANALYSIS", short: "0", label: "Mission Analysis", color: "bg-slate-500" },
  { key: "PHASE_A_FEASIBILITY", short: "A", label: "Feasibility", color: "bg-blue-500" },
  { key: "PHASE_B_DEFINITION", short: "B", label: "Definition", color: "bg-cyan-500" },
  { key: "PHASE_C_QUALIFICATION", short: "C", label: "Qualification", color: "bg-teal-500" },
  { key: "PHASE_D_PRODUCTION", short: "D", label: "Production", color: "bg-amber-500" },
  { key: "PHASE_E_OPERATIONS", short: "E", label: "Operations", color: "bg-emerald-500" },
  { key: "PHASE_F_DISPOSAL", short: "F", label: "Disposal", color: "bg-red-500" },
];

const PHASE_INDEX: Record<string, number> = {};
PHASES.forEach((p, i) => { PHASE_INDEX[p.key] = i; });

const CRIT_VARIANT: Record<string, "danger" | "warning" | "default" | "muted"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "default",
  LOW: "muted",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LifecyclePage() {
  const router = useRouter();
  const { orgId, loading: orgLoading } = useOrg();

  const [fleet, setFleet] = useState<FleetLifecycleEntry[]>([]);
  const [tlpt, setTlpt] = useState<TlptScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [fleetData, tlptData] = await Promise.all([
        getFleetLifecycle(orgId),
        getTlptSchedule(orgId),
      ]);
      setFleet(fleetData.data);
      setTlpt(tlptData.data);
    } catch {
      // silently handle
    }
  }, [orgId]);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [orgId, orgLoading, loadData]);

  // Phase distribution
  const phaseGroups = new Map<string, FleetLifecycleEntry[]>();
  for (const a of fleet) {
    const group = phaseGroups.get(a.lifecyclePhase) ?? [];
    group.push(a);
    phaseGroups.set(a.lifecyclePhase, group);
  }

  const overdueCount = tlpt.filter((t) => t.overdue).length;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Satellite Lifecycle</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            ECSS lifecycle phase tracking, security milestones, and TLPT scheduling
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Fleet Assets</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-slate-200">{fleet.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Operational</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-emerald-400">
              {fleet.filter((a) => a.lifecyclePhase === "PHASE_E_OPERATIONS").length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Pre-Launch</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-blue-400">
              {fleet.filter((a) => (PHASE_INDEX[a.lifecyclePhase] ?? 5) < 5).length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">TLPT Overdue</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${overdueCount > 0 ? "text-red-400" : "text-slate-400"}`}>
              {overdueCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList className="bg-slate-800 border-slate-700 mb-4">
          <TabsTrigger value="timeline" className="data-[state=active]:bg-slate-700 text-xs gap-1.5">
            <Orbit size={13} />
            Phase Timeline
          </TabsTrigger>
          <TabsTrigger value="tlpt" className="data-[state=active]:bg-slate-700 text-xs gap-1.5">
            <Clock size={13} />
            TLPT Schedule
            {overdueCount > 0 && (
              <span className="text-red-400 ml-1">({overdueCount})</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          {/* Phase lane header */}
          <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden mb-4">
            <div className="grid grid-cols-7 border-b border-slate-800">
              {PHASES.map((p) => (
                <div key={p.key} className="px-3 py-2 text-center border-r border-slate-800 last:border-r-0">
                  <div className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${p.color} mb-1`}>
                    {p.short}
                  </div>
                  <p className="text-[10px] text-slate-500">{p.label}</p>
                </div>
              ))}
            </div>

            {/* Asset rows on timeline */}
            {loading ? (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">Loading fleet data...</div>
            ) : fleet.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Orbit size={28} className="mx-auto text-blue-500 mb-2" />
                <p className="text-slate-200 text-sm font-medium">No assets found</p>
              </div>
            ) : (
              fleet.map((asset) => {
                const phaseIdx = PHASE_INDEX[asset.lifecyclePhase] ?? 5;
                return (
                  <div
                    key={asset.id}
                    onClick={() => router.push(`/assets/${asset.id}`)}
                    className="grid grid-cols-7 border-b border-slate-800 last:border-b-0 hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    {PHASES.map((p, i) => (
                      <div key={p.key} className="px-2 py-2.5 border-r border-slate-800 last:border-r-0 flex items-center justify-center min-h-[44px]">
                        {i === phaseIdx && (
                          <div className="flex items-center gap-1.5 max-w-full">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${p.color}`} />
                            <span className="text-xs text-slate-200 truncate">{asset.name}</span>
                            <Badge variant={CRIT_VARIANT[asset.criticality] ?? "muted"} className="text-[8px] px-1 py-0 shrink-0">
                              {asset.criticality[0]}
                            </Badge>
                          </div>
                        )}
                        {i < phaseIdx && (
                          <div className="w-full h-0.5 bg-slate-700 rounded" />
                        )}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Phase breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PHASES.map((p) => {
              const assets = phaseGroups.get(p.key) ?? [];
              if (assets.length === 0) return null;
              return (
                <Card key={p.key} className="bg-slate-900 border-slate-800">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${p.color}`} />
                      <CardTitle className="text-xs font-semibold text-slate-200">
                        Phase {p.short} - {p.label}
                      </CardTitle>
                      <span className="text-[10px] text-slate-500 ml-auto">{assets.length}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-1.5">
                      {assets.map((a) => (
                        <div
                          key={a.id}
                          onClick={() => router.push(`/assets/${a.id}`)}
                          className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          <ChevronRight size={10} className="text-slate-600" />
                          <span>{a.name}</span>
                          <Badge variant="default" className="text-[8px] px-1 py-0 ml-auto">
                            {assetTypeLabels[a.assetType as AssetType]?.split(" ")[0] ?? a.assetType}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* TLPT Tab */}
        <TabsContent value="tlpt">
          <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs">Asset</TableHead>
                  <TableHead className="text-slate-500 text-xs">Type</TableHead>
                  <TableHead className="text-slate-500 text-xs">Last Conducted</TableHead>
                  <TableHead className="text-slate-500 text-xs">Next Due</TableHead>
                  <TableHead className="text-slate-500 text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow className="border-slate-800">
                    <TableCell colSpan={5} className="py-8 text-center text-slate-500 text-sm">Loading...</TableCell>
                  </TableRow>
                ) : tlpt.length === 0 ? (
                  <TableRow className="border-slate-800">
                    <TableCell colSpan={5} className="py-12 text-center">
                      <Clock size={28} className="mx-auto text-blue-500 mb-2" />
                      <p className="text-slate-200 text-sm">No operational assets for TLPT scheduling</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  tlpt.map((entry) => (
                    <TableRow
                      key={entry.assetId}
                      onClick={() => router.push(`/assets/${entry.assetId}`)}
                      className={`border-slate-800 hover:bg-slate-800/40 cursor-pointer ${entry.overdue ? "bg-red-500/5" : ""}`}
                    >
                      <TableCell className="py-2.5 text-sm text-slate-200 font-medium">{entry.assetName}</TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          {assetTypeLabels[entry.assetType as AssetType] ?? entry.assetType}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-400">
                        {entry.lastConducted
                          ? new Date(entry.lastConducted).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                          : "Never"}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs">
                        <span className={entry.overdue ? "text-red-400 font-medium" : "text-slate-400"}>
                          {entry.nextDue
                            ? new Date(entry.nextDue).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                            : "Not scheduled"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        {entry.overdue ? (
                          <Badge className="text-[10px] px-1.5 py-0 border text-red-400 bg-red-500/10 border-red-500/20">
                            <AlertTriangle size={9} className="mr-1" />
                            Overdue
                          </Badge>
                        ) : entry.lastConducted ? (
                          <Badge className="text-[10px] px-1.5 py-0 border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                            <CheckCircle2 size={9} className="mr-1" />
                            Current
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] px-1.5 py-0 border text-amber-400 bg-amber-500/10 border-amber-500/20">
                            <Circle size={9} className="mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
