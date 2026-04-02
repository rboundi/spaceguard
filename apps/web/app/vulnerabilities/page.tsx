"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Bug,
  Shield,
  AlertTriangle,
  Upload,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Clock,
} from "lucide-react";
import {
  ComponentType,
  ComponentSource,
  VulnerabilitySeverity,
  VulnerabilityStatus,
  componentTypeLabels,
  componentSourceLabels,
  vulnerabilityStatusLabels,
} from "@spaceguard/shared";
import type {
  ComponentResponse,
  VulnerabilityResponse,
  VulnerabilityStats,
  AssetResponse,
} from "@spaceguard/shared";
import {
  getVulnerabilityComponents,
  getVulnerabilities,
  getVulnerabilityStats,
  updateVulnerabilityApi,
  importSbomApi,
  createComponentApi,
  getAssets,
} from "@/lib/api";
import { useOrg } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const SEV_VARIANT: Record<string, "danger" | "warning" | "default" | "muted" | "destructive"> = {
  CRITICAL: "destructive",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "default",
  NONE: "muted",
};

function severityBadge(sev: string) {
  return (
    <Badge variant={SEV_VARIANT[sev] ?? "muted"} className="text-[10px] px-1.5 py-0 font-normal">
      {sev}
    </Badge>
  );
}

const VULN_STATUS_COLORS: Record<string, string> = {
  IDENTIFIED: "text-red-400 bg-red-500/10 border-red-500/20",
  ASSESSING: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  RISK_ACCEPTED: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  REMEDIATION_PLANNED: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  REMEDIATION_IN_PROGRESS: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  VERIFIED_FIXED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  NOT_APPLICABLE: "text-slate-500 bg-slate-600/10 border-slate-600/20",
};

function vulnStatusBadge(status: string) {
  return (
    <Badge className={`text-[10px] px-1.5 py-0 font-normal border ${VULN_STATUS_COLORS[status] ?? ""}`}>
      {vulnerabilityStatusLabels[status as VulnerabilityStatus] ?? status}
    </Badge>
  );
}

function typeBadge(type: string) {
  return (
    <Badge variant="default" className="text-[10px] px-1.5 py-0 font-normal">
      {componentTypeLabels[type as ComponentType] ?? type}
    </Badge>
  );
}

const SOURCE_COLORS: Record<string, string> = {
  OPEN_SOURCE: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  COTS: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  PROPRIETARY: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  CUSTOM: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

function sourceBadge(source: string) {
  return (
    <Badge className={`text-[10px] px-1.5 py-0 font-normal border ${SOURCE_COLORS[source] ?? ""}`}>
      {componentSourceLabels[source as ComponentSource] ?? source}
    </Badge>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <TableRow className="border-slate-800 hover:bg-transparent">
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i} className="py-3">
          <div className="h-3 animate-pulse rounded bg-slate-800" style={{ width: `${(i * 20 + 60)}px` }} />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VulnerabilitiesPage() {
  const { orgId, loading: orgLoading } = useOrg();

  const [stats, setStats] = useState<VulnerabilityStats | null>(null);
  const [components, setComponents] = useState<ComponentResponse[]>([]);
  const [vulns, setVulns] = useState<VulnerabilityResponse[]>([]);
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [compTotal, setCompTotal] = useState(0);
  const [vulnTotal, setVulnTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("components");

  // Filters
  const [compTypeFilter, setCompTypeFilter] = useState("all");
  const [compSourceFilter, setCompSourceFilter] = useState("all");
  const [vulnSevFilter, setVulnSevFilter] = useState("all");
  const [vulnStatusFilter, setVulnStatusFilter] = useState("all");

  // Dialogs
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFormat, setImportFormat] = useState("CYCLONEDX");
  const [importAsset, setImportAsset] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Asset lookup map
  const assetMap = new Map(assets.map((a) => [a.id, a.name]));

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [statsData, compData, vulnData, assetData] = await Promise.all([
        getVulnerabilityStats(orgId),
        getVulnerabilityComponents({
          organizationId: orgId,
          ...(compTypeFilter !== "all" ? { componentType: compTypeFilter as ComponentType } : {}),
          ...(compSourceFilter !== "all" ? { source: compSourceFilter as ComponentSource } : {}),
          perPage: 100,
        }),
        getVulnerabilities({
          organizationId: orgId,
          ...(vulnSevFilter !== "all" ? { severity: vulnSevFilter as VulnerabilitySeverity } : {}),
          ...(vulnStatusFilter !== "all" ? { status: vulnStatusFilter as VulnerabilityStatus } : {}),
          perPage: 100,
        }),
        getAssets({ organizationId: orgId, perPage: 100 }),
      ]);
      setStats(statsData);
      setComponents(compData.data);
      setCompTotal(compData.total);
      setVulns(vulnData.data);
      setVulnTotal(vulnData.total);
      setAssets(assetData.data);
    } catch {
      // silently handle
    }
  }, [orgId, compTypeFilter, compSourceFilter, vulnSevFilter, vulnStatusFilter]);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [orgId, orgLoading, loadData]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleImport() {
    if (!importFile || !orgId) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await importFile.text();
      let content: string | Record<string, unknown> = text;
      if (importFormat !== "CSV") {
        content = JSON.parse(text);
      }
      const result = await importSbomApi({
        organizationId: orgId,
        assetId: importAsset || null,
        filename: importFile.name,
        format: importFormat,
        content,
      });
      setImportResult(`Imported ${result.import.componentCount} components from ${importFile.name}`);
      loadData();
    } catch (err) {
      setImportResult(`Error: ${err instanceof Error ? err.message : "Import failed"}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleStatusChange(vulnId: string, newStatus: string) {
    try {
      await updateVulnerabilityApi(vulnId, { status: newStatus as VulnerabilityStatus });
      loadData();
    } catch {
      // silently handle
    }
  }

  function clearCompFilters() {
    setCompTypeFilter("all");
    setCompSourceFilter("all");
  }

  function clearVulnFilters() {
    setVulnSevFilter("all");
    setVulnStatusFilter("all");
  }

  // Check if deadline is overdue
  function isOverdue(deadline: string | null | undefined, status: string): boolean {
    if (!deadline) return false;
    if (["VERIFIED_FIXED", "NOT_APPLICABLE", "RISK_ACCEPTED"].includes(status)) return false;
    return new Date(deadline) < new Date();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const critHighOpen = stats
    ? (stats.bySeverity.CRITICAL ?? 0) + (stats.bySeverity.HIGH ?? 0)
      - (stats.byStatus.VERIFIED_FIXED ?? 0) - (stats.byStatus.NOT_APPLICABLE ?? 0)
    : 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Vulnerability Management</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            SBOM tracking, CVE management, and CRA compliance
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5"
          >
            <Upload size={14} />
            Import SBOM
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Components</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-slate-200">{stats.totalComponents}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Open Vulns</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-2xl font-bold ${stats.openCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {stats.openCount}
              </p>
              <div className="flex gap-2 mt-1">
                {stats.bySeverity.CRITICAL ? (
                  <span className="text-[10px] text-red-400">{stats.bySeverity.CRITICAL} critical</span>
                ) : null}
                {stats.bySeverity.HIGH ? (
                  <span className="text-[10px] text-amber-400">{stats.bySeverity.HIGH} high</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Overdue</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-2xl font-bold ${stats.overdueCount > 0 ? "text-red-400" : "text-slate-400"}`}>
                {stats.overdueCount}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Risk Accepted</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-slate-400">
                {stats.byStatus.RISK_ACCEPTED ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800 border-slate-700 mb-4">
          <TabsTrigger value="components" className="data-[state=active]:bg-slate-700 text-xs gap-1.5">
            <Shield size={13} />
            Software Components
            {compTotal > 0 && <span className="text-slate-500 ml-1">({compTotal})</span>}
          </TabsTrigger>
          <TabsTrigger value="vulnerabilities" className="data-[state=active]:bg-slate-700 text-xs gap-1.5">
            <Bug size={13} />
            Vulnerabilities
            {vulnTotal > 0 && (
              <span className={`ml-1 ${critHighOpen > 0 ? "text-red-400" : "text-slate-500"}`}>
                ({vulnTotal})
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Components Tab */}
        <TabsContent value="components">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <SlidersHorizontal size={14} className="text-slate-500 shrink-0" />
            <Select value={compTypeFilter} onValueChange={setCompTypeFilter}>
              <SelectTrigger className="w-40 h-8 text-xs bg-slate-900 border-slate-700 text-slate-300">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-slate-200 focus:bg-slate-700 text-xs">All types</SelectItem>
                {Object.values(ComponentType).map((t) => (
                  <SelectItem key={t} value={t} className="text-slate-200 focus:bg-slate-700 text-xs">
                    {componentTypeLabels[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={compSourceFilter} onValueChange={setCompSourceFilter}>
              <SelectTrigger className="w-36 h-8 text-xs bg-slate-900 border-slate-700 text-slate-300">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-slate-200 focus:bg-slate-700 text-xs">All sources</SelectItem>
                {Object.values(ComponentSource).map((s) => (
                  <SelectItem key={s} value={s} className="text-slate-200 focus:bg-slate-700 text-xs">
                    {componentSourceLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(compTypeFilter !== "all" || compSourceFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={clearCompFilters}
                className="h-8 px-2 text-xs text-slate-400 hover:text-slate-200 gap-1">
                <RotateCcw size={12} /> Clear
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs">Name</TableHead>
                  <TableHead className="text-slate-500 text-xs">Version</TableHead>
                  <TableHead className="text-slate-500 text-xs">Type</TableHead>
                  <TableHead className="text-slate-500 text-xs">Source</TableHead>
                  <TableHead className="text-slate-500 text-xs">Asset</TableHead>
                  <TableHead className="text-slate-500 text-xs">Vendor</TableHead>
                  <TableHead className="text-slate-500 text-xs">License</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                ) : components.length === 0 ? (
                  <TableRow className="border-slate-800">
                    <TableCell colSpan={7} className="py-12 text-center">
                      <Shield size={28} className="mx-auto text-blue-500 mb-2" />
                      <p className="text-slate-200 text-sm font-medium">No software components tracked</p>
                      <p className="text-slate-500 text-xs mt-1">Import an SBOM or add components manually.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  components.map((comp) => (
                    <TableRow key={comp.id} className="border-slate-800 hover:bg-slate-800/40">
                      <TableCell className="py-2.5 text-sm text-slate-200 font-medium">{comp.name}</TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-400 font-mono">{comp.version ?? "-"}</TableCell>
                      <TableCell className="py-2.5">{typeBadge(comp.componentType)}</TableCell>
                      <TableCell className="py-2.5">{sourceBadge(comp.source)}</TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-500">
                        {comp.assetId ? assetMap.get(comp.assetId) ?? comp.assetId.slice(0, 8) : "-"}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-500">{comp.vendor ?? "-"}</TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-500">{comp.license ?? "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Vulnerabilities Tab */}
        <TabsContent value="vulnerabilities">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <SlidersHorizontal size={14} className="text-slate-500 shrink-0" />
            <Select value={vulnSevFilter} onValueChange={setVulnSevFilter}>
              <SelectTrigger className="w-36 h-8 text-xs bg-slate-900 border-slate-700 text-slate-300">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-slate-200 focus:bg-slate-700 text-xs">All severities</SelectItem>
                {Object.values(VulnerabilitySeverity).map((s) => (
                  <SelectItem key={s} value={s} className="text-slate-200 focus:bg-slate-700 text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={vulnStatusFilter} onValueChange={setVulnStatusFilter}>
              <SelectTrigger className="w-48 h-8 text-xs bg-slate-900 border-slate-700 text-slate-300">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-slate-200 focus:bg-slate-700 text-xs">All statuses</SelectItem>
                {Object.values(VulnerabilityStatus).map((s) => (
                  <SelectItem key={s} value={s} className="text-slate-200 focus:bg-slate-700 text-xs">
                    {vulnerabilityStatusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(vulnSevFilter !== "all" || vulnStatusFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={clearVulnFilters}
                className="h-8 px-2 text-xs text-slate-400 hover:text-slate-200 gap-1">
                <RotateCcw size={12} /> Clear
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs">CVE</TableHead>
                  <TableHead className="text-slate-500 text-xs">Title</TableHead>
                  <TableHead className="text-slate-500 text-xs">Severity</TableHead>
                  <TableHead className="text-slate-500 text-xs">CVSS</TableHead>
                  <TableHead className="text-slate-500 text-xs">Status</TableHead>
                  <TableHead className="text-slate-500 text-xs">Assigned</TableHead>
                  <TableHead className="text-slate-500 text-xs">Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                ) : vulns.length === 0 ? (
                  <TableRow className="border-slate-800">
                    <TableCell colSpan={7} className="py-12 text-center">
                      <Bug size={28} className="mx-auto text-emerald-500 mb-2" />
                      <p className="text-slate-200 text-sm font-medium">No vulnerabilities recorded</p>
                      <p className="text-slate-500 text-xs mt-1">Import an SBOM and link CVEs to start tracking.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  vulns.map((vuln) => {
                    const overdue = isOverdue(vuln.remediationDeadline, vuln.status);
                    return (
                      <TableRow key={vuln.id} className={`border-slate-800 hover:bg-slate-800/40 ${overdue ? "bg-red-500/5" : ""}`}>
                        <TableCell className="py-2.5 text-xs font-mono text-blue-400">
                          {vuln.cveId ?? "-"}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm text-slate-200 max-w-[240px]">
                          <span className="line-clamp-1">{vuln.title}</span>
                        </TableCell>
                        <TableCell className="py-2.5">{severityBadge(vuln.severity)}</TableCell>
                        <TableCell className="py-2.5 text-xs text-slate-400 font-mono tabular-nums">
                          {vuln.cvssScore?.toFixed(1) ?? "-"}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Select
                            value={vuln.status}
                            onValueChange={(v) => handleStatusChange(vuln.id, v)}
                          >
                            <SelectTrigger className="h-6 w-44 text-[10px] bg-transparent border-none p-0 focus:ring-0">
                              {vulnStatusBadge(vuln.status)}
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              {Object.values(VulnerabilityStatus).map((s) => (
                                <SelectItem key={s} value={s} className="text-slate-200 focus:bg-slate-700 text-xs">
                                  {vulnerabilityStatusLabels[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-slate-500">
                          {vuln.assignedTo ?? "-"}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">
                          {vuln.remediationDeadline ? (
                            <span className={`flex items-center gap-1 ${overdue ? "text-red-400 font-medium" : "text-slate-500"}`}>
                              {overdue && <Clock size={10} />}
                              {new Date(vuln.remediationDeadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                          ) : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* SBOM Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Import SBOM</DialogTitle>
            <DialogDescription className="text-slate-500">
              Upload a CycloneDX, SPDX, or CSV file to import software components.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Format</Label>
              <Select value={importFormat} onValueChange={setImportFormat}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="CYCLONEDX" className="text-slate-200 focus:bg-slate-700">CycloneDX (JSON)</SelectItem>
                  <SelectItem value="SPDX" className="text-slate-200 focus:bg-slate-700">SPDX (JSON)</SelectItem>
                  <SelectItem value="CSV" className="text-slate-200 focus:bg-slate-700">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Target Asset (optional)</Label>
              <Select value={importAsset || "none"} onValueChange={(v) => setImportAsset(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Select an asset" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 max-h-48">
                  <SelectItem value="none" className="text-slate-200 focus:bg-slate-700">No specific asset</SelectItem>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-slate-200 focus:bg-slate-700">
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">File</Label>
              <Input
                type="file"
                accept=".json,.csv"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="bg-slate-800 border-slate-700 text-slate-100 file:text-slate-400 file:bg-slate-700 file:border-0 file:rounded file:px-2 file:py-1 file:mr-2 file:text-xs"
              />
            </div>
            {importResult && (
              <div className={`rounded-md border px-3 py-2 text-sm ${
                importResult.startsWith("Error")
                  ? "border-red-500/30 bg-red-500/10 text-red-400"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              }`}>
                {importResult}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleImport}
                disabled={!importFile || importing}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white gap-1.5"
              >
                {importing ? "Importing..." : "Import"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setImportOpen(false); setImportResult(null); }}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
