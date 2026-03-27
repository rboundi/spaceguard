"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, SlidersHorizontal, Satellite } from "lucide-react";
import {
  AssetType,
  AssetStatus,
  assetTypeLabels,
} from "@spaceguard/shared";
import type { AssetResponse } from "@spaceguard/shared";
import { getAssets, getAssetRisk } from "@/lib/api";
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

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "muted" | "outline"
> = {
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
    <Badge
      variant={STATUS_VARIANT[status] ?? "muted"}
      className="text-[10px] px-1.5 py-0 font-normal"
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const CRIT_VARIANT: Record<
  string,
  "danger" | "warning" | "default" | "muted"
> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "default",
  LOW: "muted",
};

function criticalityBadge(crit: string) {
  return (
    <Badge
      variant={CRIT_VARIANT[crit] ?? "muted"}
      className="text-[10px] px-1.5 py-0 font-normal"
    >
      {crit}
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
          <div
            className={`h-3 w-${w} animate-pulse rounded bg-slate-800`}
            style={{ width: `${w * 4}px` }}
          />
        </TableCell>
      ))}
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
  const [riskScores, setRiskScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadAssets = useCallback(async () => {
    if (!orgId) return;
    try {
      const result = await getAssets({
        organizationId: orgId,
        ...(typeFilter !== "all" ? { type: typeFilter as AssetType } : {}),
        ...(statusFilter !== "all"
          ? { status: statusFilter as AssetStatus }
          : {}),
        perPage: 100,
      });
      setAssets(result.data);
      setError(null);
      // Fire-and-forget risk score loading for each asset
      result.data.forEach((asset) => {
        getAssetRisk(asset.id)
          .then((risk) => setRiskScores((prev) => ({ ...prev, [asset.id]: risk.risk.overall })))
          .catch(() => {});
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    }
  }, [orgId, typeFilter, statusFilter]);

  // Reload whenever org or filters change
  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      setAssets([]);
      return;
    }
    setLoading(true);
    loadAssets().finally(() => setLoading(false));
  }, [orgId, orgLoading, typeFilter, statusFilter, loadAssets]);

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
  }

  const filtersActive = typeFilter !== "all" || statusFilter !== "all";

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
      <div className="flex items-center gap-3 mb-4">
        <SlidersHorizontal size={14} className="text-slate-500 shrink-0" />

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44 h-8 text-xs bg-slate-900 border-slate-700 text-slate-300">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-200 focus:bg-slate-700 text-xs">
              All types
            </SelectItem>
            {Object.values(AssetType).map((t) => (
              <SelectItem
                key={t}
                value={t}
                className="text-slate-200 focus:bg-slate-700 text-xs"
              >
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
            <SelectItem value="all" className="text-slate-200 focus:bg-slate-700 text-xs">
              All statuses
            </SelectItem>
            {Object.values(AssetStatus).map((s) => (
              <SelectItem
                key={s}
                value={s}
                className="text-slate-200 focus:bg-slate-700 text-xs"
              >
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 px-2 text-xs text-slate-400 hover:text-slate-200 gap-1"
          >
            <RotateCcw size={12} />
            Clear
          </Button>
        )}

        {!loading && (
          <span className="ml-auto text-xs text-slate-600">
            {assets.length} asset{assets.length !== 1 ? "s" : ""}
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
              <TableHead className="text-slate-500 text-xs font-medium">
                Name
              </TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">
                Type
              </TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">
                Status
              </TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">
                Criticality
              </TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">
                Risk
              </TableHead>
              <TableHead className="text-slate-500 text-xs font-medium">
                Created
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))
            ) : assets.length === 0 ? (
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableCell colSpan={6} className="py-16 text-center">
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
            ) : (
              assets.map((asset) => (
                <TableRow
                  key={asset.id}
                  onClick={() => handleRowClick(asset.id)}
                  className="border-slate-800 hover:bg-slate-800/60 cursor-pointer transition-colors"
                >
                  <TableCell className="py-3 font-medium text-slate-200 text-sm">
                    {asset.name}
                  </TableCell>
                  <TableCell className="py-3">
                    {assetTypeBadge(asset.assetType)}
                  </TableCell>
                  <TableCell className="py-3">
                    {assetStatusBadge(asset.status)}
                  </TableCell>
                  <TableCell className="py-3">
                    {criticalityBadge(asset.criticality)}
                  </TableCell>
                  <TableCell className="py-3">
                    {riskBadge(riskScores[asset.id])}
                  </TableCell>
                  <TableCell className="py-3 text-xs text-slate-500">
                    {new Date(asset.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
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
          <SheetContent
            side="right"
            className="w-full sm:max-w-md bg-slate-900 border-slate-800 overflow-y-auto"
          >
            <SheetHeader className="mb-4">
              <SheetTitle className="text-slate-100">New Space Asset</SheetTitle>
              <SheetDescription className="text-slate-500">
                Register a new satellite, ground station, or infrastructure
                component.
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
