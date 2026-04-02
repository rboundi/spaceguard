"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Satellite,
  ChevronRight,
  ChevronDown,
  TreePine,
  List,
} from "lucide-react";
import {
  AssetType,
  AssetStatus,
  AssetSegment,
  LifecyclePhase,
  assetTypeLabels,
  assetSegmentLabels,
  lifecyclePhaseLabels,
} from "@spaceguard/shared";
import type { AssetResponse, AssetTreeNode } from "@spaceguard/shared";
import { getAssets, getAssetTree, getAssetRisk } from "@/lib/api";
import { useOrg } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AssetForm } from "@/components/assets/AssetForm";

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function assetTypeBadge(type: string) {
  return (
    <Badge variant="default" className="text-[10px] px-1.5 py-0 font-normal">
      {assetTypeLabels[type as AssetType] ?? type}
    </Badge>
  );
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "muted" | "outline"> = {
  OPERATIONAL: "success",
  DEGRADED: "warning",
  MAINTENANCE: "muted",
  DECOMMISSIONED: "outline",
};
const STATUS_LABEL: Record<string, string> = {
  OPERATIONAL: "Operational",
  DEGRADED: "Degraded",
  MAINTENANCE: "Maintenance",
  DECOMMISSIONED: "Decommissioned",
};

function assetStatusBadge(status: string) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "muted"} className="text-[10px] px-1.5 py-0 font-normal">
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const CRIT_VARIANT: Record<string, "danger" | "warning" | "default" | "muted"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "default",
  LOW: "muted",
};

function criticalityBadge(crit: string) {
  return (
    <Badge variant={CRIT_VARIANT[crit] ?? "muted"} className="text-[10px] px-1.5 py-0 font-normal">
      {crit}
    </Badge>
  );
}

const SEGMENT_COLORS: Record<string, string> = {
  SPACE: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  GROUND: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  USER: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  HUMAN_RESOURCES: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

function segmentBadge(segment: string | null) {
  if (!segment) return null;
  return (
    <Badge className={`text-[10px] px-1.5 py-0 font-normal border ${SEGMENT_COLORS[segment] ?? "text-slate-400"}`}>
      {assetSegmentLabels[segment as AssetSegment] ?? segment}
    </Badge>
  );
}

function riskBadge(score: number | undefined) {
  if (score === undefined) {
    return <span className="text-[10px] text-slate-600">--</span>;
  }
  const variant = score > 60 ? "destructive" : score > 30 ? "warning" : "success";
  return (
    <Badge variant={variant} className="text-[10px] px-1.5 py-0 font-bold tabular-nums">
      {score}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <TableRow className="border-slate-800 hover:bg-transparent">
      {[40, 28, 24, 20, 16, 32].map((w, i) => (
        <TableCell key={i} className="py-3">
          <div className="h-3 animate-pulse rounded bg-slate-800" style={{ width: `${w * 4}px` }} />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Tree row (recursive)
// ---------------------------------------------------------------------------

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onClick,
  riskScore,
}: {
  node: AssetTreeNode;
  depth: number;
  expanded: boolean;
  onToggle: (id: string) => void;
  onClick: (id: string) => void;
  riskScore?: number;
}) {
  const hasChildren = node.children.length > 0;
  const indent = depth * 24;

  return (
    <TableRow
      onClick={() => onClick(node.id)}
      className="border-slate-800 hover:bg-slate-800/60 cursor-pointer transition-colors"
    >
      <TableCell className="py-2.5">
        <div className="flex items-center gap-1" style={{ paddingLeft: `${indent}px` }}>
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
              className="p-0.5 rounded hover:bg-slate-700 text-slate-500 shrink-0"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <span className={`text-sm ${depth === 0 ? "font-medium text-slate-200" : "text-slate-400"}`}>
            {node.name}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-2.5">{assetTypeBadge(node.assetType)}</TableCell>
      <TableCell className="py-2.5">{segmentBadge(node.segment)}</TableCell>
      <TableCell className="py-2.5">{assetStatusBadge(node.status)}</TableCell>
      <TableCell className="py-2.5">{criticalityBadge(node.criticality)}</TableCell>
      <TableCell className="py-2.5">{riskBadge(riskScore)}</TableCell>
      <TableCell className="py-2.5 text-xs text-slate-500">
        {node.lifecyclePhase
          ? lifecyclePhaseLabels[node.lifecyclePhase as LifecyclePhase]?.replace(/Phase \w - /, "") ?? ""
          : ""}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AssetsPage() {
  const router = useRouter();
  const { orgId, loading: orgLoading } = useOrg();

  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [treeData, setTreeData] = useState<AssetTreeNode[]>([]);
  const [riskScores, setRiskScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");

  // Tree expansion state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadAssets = useCallback(async () => {
    if (!orgId) return;
    try {
      if (viewMode === "tree") {
        const result = await getAssetTree(orgId);
        setTreeData(result.data);
        // Auto-expand all parents
        const parentIds = new Set<string>();
        function collectParents(nodes: AssetTreeNode[]) {
          for (const n of nodes) {
            if (n.children.length > 0) {
              parentIds.add(n.id);
              collectParents(n.children);
            }
          }
        }
        collectParents(result.data);
        setExpandedIds(parentIds);
        // Load risk scores for all
        function allNodes(nodes: AssetTreeNode[]): AssetTreeNode[] {
          return nodes.flatMap((n) => [n, ...allNodes(n.children)]);
        }
        allNodes(result.data).forEach((node) => {
          getAssetRisk(node.id)
            .then((risk) => setRiskScores((prev) => ({ ...prev, [node.id]: risk.risk.overall })))
            .catch(() => {});
        });
      } else {
        const result = await getAssets({
          organizationId: orgId,
          ...(typeFilter !== "all" ? { type: typeFilter as AssetType } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter as AssetStatus } : {}),
          ...(segmentFilter !== "all" ? { segment: segmentFilter as AssetSegment } : {}),
          perPage: 100,
        });
        setAssets(result.data);
        result.data.forEach((asset) => {
          getAssetRisk(asset.id)
            .then((risk) => setRiskScores((prev) => ({ ...prev, [asset.id]: risk.risk.overall })))
            .catch(() => {});
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    }
  }, [orgId, viewMode, typeFilter, statusFilter, segmentFilter]);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      setAssets([]);
      setTreeData([]);
      return;
    }
    setLoading(true);
    loadAssets().finally(() => setLoading(false));
  }, [orgId, orgLoading, loadAssets]);

  // ---------------------------------------------------------------------------
  // Tree helpers
  // ---------------------------------------------------------------------------

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function filterTree(nodes: AssetTreeNode[]): AssetTreeNode[] {
    return nodes
      .map((n) => {
        const children = filterTree(n.children);
        const matchesType = typeFilter === "all" || n.assetType === typeFilter;
        const matchesStatus = statusFilter === "all" || n.status === statusFilter;
        const matchesSegment = segmentFilter === "all" || n.segment === segmentFilter;
        const selfMatch = matchesType && matchesStatus && matchesSegment;
        if (selfMatch || children.length > 0) {
          return { ...n, children };
        }
        return null;
      })
      .filter(Boolean) as AssetTreeNode[];
  }

  function renderTreeRows(nodes: AssetTreeNode[], depth: number): React.ReactNode[] {
    const rows: React.ReactNode[] = [];
    for (const node of nodes) {
      rows.push(
        <TreeRow
          key={node.id}
          node={node}
          depth={depth}
          expanded={expandedIds.has(node.id)}
          onToggle={toggleExpand}
          onClick={(id) => router.push(`/assets/${id}`)}
          riskScore={riskScores[node.id]}
        />
      );
      if (expandedIds.has(node.id) && node.children.length > 0) {
        rows.push(...renderTreeRows(node.children, depth + 1));
      }
    }
    return rows;
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleRowClick(id: string) {
    router.push(`/assets/${id}`);
  }

  function handleCreateSuccess() {
    setSheetOpen(false);
    loadAssets();
  }

  function clearFilters() {
    setTypeFilter("all");
    setStatusFilter("all");
    setSegmentFilter("all");
  }

  const filtersActive = typeFilter !== "all" || statusFilter !== "all" || segmentFilter !== "all";
  const filteredTree = filtersActive ? filterTree(treeData) : treeData;

  // Count total assets (flat + tree)
  function countNodes(nodes: AssetTreeNode[]): number {
    return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children), 0);
  }
  const totalCount = viewMode === "tree" ? countNodes(filteredTree) : assets.length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Space Assets</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Register and manage your satellite infrastructure
          </p>
        </div>
        {orgId && (
          <Button
            onClick={() => setSheetOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5"
          >
            <Plus size={15} />
            Add Asset
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SlidersHorizontal size={14} className="text-slate-500 shrink-0" />

        {/* View toggle */}
        <div className="flex rounded-md border border-slate-700 overflow-hidden">
          <button
            onClick={() => setViewMode("tree")}
            className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${
              viewMode === "tree" ? "bg-slate-700 text-slate-200" : "bg-slate-900 text-slate-500 hover:text-slate-300"
            }`}
          >
            <TreePine size={12} /> Tree
          </button>
          <button
            onClick={() => setViewMode("flat")}
            className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${
              viewMode === "flat" ? "bg-slate-700 text-slate-200" : "bg-slate-900 text-slate-500 hover:text-slate-300"
            }`}
          >
            <List size={12} /> Flat
          </button>
        </div>

        <Select value={segmentFilter} onValueChange={setSegmentFilter}>
          <SelectTrigger className="w-40 h-8 text-xs bg-slate-900 border-slate-700 text-slate-300">
            <SelectValue placeholder="All segments" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-200 focus:bg-slate-700 text-xs">All segments</SelectItem>
            {Object.values(AssetSegment).map((s) => (
              <SelectItem key={s} value={s} className="text-slate-200 focus:bg-slate-700 text-xs">
                {assetSegmentLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44 h-8 text-xs bg-slate-900 border-slate-700 text-slate-300">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
            <SelectItem value="all" className="text-slate-200 focus:bg-slate-700 text-xs">All types</SelectItem>
            {Object.values(AssetType).map((t) => (
              <SelectItem key={t} value={t} className="text-slate-200 focus:bg-slate-700 text-xs">
                {assetTypeLabels[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-8 text-xs bg-slate-900 border-slate-700 text-slate-300">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-200 focus:bg-slate-700 text-xs">All statuses</SelectItem>
            {Object.values(AssetStatus).map((s) => (
              <SelectItem key={s} value={s} className="text-slate-200 focus:bg-slate-700 text-xs">
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}
            className="h-8 px-2 text-xs text-slate-400 hover:text-slate-200 gap-1">
            <RotateCcw size={12} /> Clear
          </Button>
        )}

        {!loading && (
          <span className="ml-auto text-xs text-slate-600">
            {totalCount} asset{totalCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-500 text-xs font-medium">Name</TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">Type</TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">Segment</TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">Status</TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">Criticality</TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">Risk</TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">Phase</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : totalCount === 0 ? (
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableCell colSpan={7} className="py-16 text-center">
                  <Satellite size={32} className="mx-auto text-blue-500 mb-3" />
                  <p className="text-slate-200 font-medium text-sm">
                    {orgId
                      ? filtersActive
                        ? "No assets match your filters"
                        : "No assets registered yet"
                      : "Set up your organization first"}
                  </p>
                  <p className="text-slate-500 text-xs mt-1 max-w-xs mx-auto">
                    {orgId
                      ? filtersActive
                        ? "Try adjusting your filter criteria to see more results."
                        : "Register your satellites, ground stations, and infrastructure components to begin tracking compliance."
                      : "Create an organization to start managing your space assets."}
                  </p>
                </TableCell>
              </TableRow>
            ) : viewMode === "tree" ? (
              renderTreeRows(filteredTree, 0)
            ) : (
              assets.map((asset) => (
                <TableRow
                  key={asset.id}
                  onClick={() => handleRowClick(asset.id)}
                  className="border-slate-800 hover:bg-slate-800/60 cursor-pointer transition-colors"
                >
                  <TableCell className="py-2.5 font-medium text-slate-200 text-sm">
                    {asset.parentAssetId && <span className="text-slate-600 mr-1">--</span>}
                    {asset.name}
                  </TableCell>
                  <TableCell className="py-2.5">{assetTypeBadge(asset.assetType)}</TableCell>
                  <TableCell className="py-2.5">{segmentBadge(asset.segment)}</TableCell>
                  <TableCell className="py-2.5">{assetStatusBadge(asset.status)}</TableCell>
                  <TableCell className="py-2.5">{criticalityBadge(asset.criticality)}</TableCell>
                  <TableCell className="py-2.5">{riskBadge(riskScores[asset.id])}</TableCell>
                  <TableCell className="py-2.5 text-xs text-slate-500">
                    {asset.lifecyclePhase
                      ? lifecyclePhaseLabels[asset.lifecyclePhase as LifecyclePhase]?.replace(/Phase \w - /, "") ?? ""
                      : ""}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create asset sheet */}
      {orgId && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md bg-slate-900 border-slate-800 overflow-y-auto">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-slate-100">New Space Asset</SheetTitle>
              <SheetDescription className="text-slate-500">
                Register a new satellite, ground station, or infrastructure component.
              </SheetDescription>
            </SheetHeader>
            <AssetForm
              mode="create"
              organizationId={orgId}
              onSuccess={handleCreateSuccess}
              onClose={() => setSheetOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
