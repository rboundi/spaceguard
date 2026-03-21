"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import {
  assetTypeLabels,
  complianceStatusLabels,
} from "@spaceguard/shared";
import type {
  AssetResponse,
  MappingResponse,
  ComplianceRequirement,
} from "@spaceguard/shared";
import { getAsset, getMappings, getRequirements } from "@/lib/api";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AssetForm } from "@/components/assets/AssetForm";

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
const CRIT_VARIANT: Record<string, "danger" | "warning" | "default" | "muted"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "default",
  LOW: "muted",
};
const COMPLIANCE_VARIANT: Record<string, "success" | "warning" | "danger" | "muted"> = {
  COMPLIANT: "success",
  PARTIALLY_COMPLIANT: "warning",
  NON_COMPLIANT: "danger",
  NOT_ASSESSED: "muted",
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-800 ${className}`} />;
}

export default function AssetDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [asset, setAsset] = useState<AssetResponse | null>(null);
  const [mappings, setMappings] = useState<MappingResponse[]>([]);
  const [requirements, setRequirements] = useState<ComplianceRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const reqById = new Map(requirements.map((r) => [r.id, r]));

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [assetData, mappingsData, requirementsData] = await Promise.all([
        getAsset(id),
        getMappings({ assetId: id }),
        getRequirements(),
      ]);
      setAsset(assetData);
      setMappings(mappingsData.data);
      setRequirements(requirementsData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load asset");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-4xl">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64 mt-2" />
        <div className="flex gap-2 mt-2">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="p-6">
        <Link href="/assets" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-4">
          <ArrowLeft size={12} /> Back to Assets
        </Link>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error ?? "Asset not found"}
        </div>
      </div>
    );
  }

  const metaEntries = asset.metadata
    ? Object.entries(asset.metadata as Record<string, unknown>).filter(([, v]) => v !== null && String(v).trim() !== "")
    : [];

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <Link href="/assets" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
        <ArrowLeft size={12} />
        Back to Assets
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">{asset.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="default" className="text-xs">
              {assetTypeLabels[asset.assetType as keyof typeof assetTypeLabels] ?? asset.assetType}
            </Badge>
            <Badge variant={STATUS_VARIANT[asset.status] ?? "muted"} className="text-xs">
              {STATUS_LABEL[asset.status] ?? asset.status}
            </Badge>
            <Badge variant={CRIT_VARIANT[asset.criticality] ?? "muted"} className="text-xs">
              {asset.criticality}
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}
          className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5 shrink-0">
          <Pencil size={13} />
          Edit
        </Button>
      </div>

      {asset.description && (
        <p className="text-slate-400 text-sm leading-relaxed -mt-2">{asset.description}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Organization ID</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xs font-mono text-slate-500 break-all">{asset.organizationId}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Registered</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-sm text-slate-300">
              {new Date(asset.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Last Updated</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-sm text-slate-300">
              {new Date(asset.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </CardContent>
        </Card>
      </div>

      {metaEntries.length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-slate-200">Technical Details</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
              {metaEntries.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[10px] font-medium uppercase tracking-widest text-slate-600 mb-1">
                    {key.replace(/_/g, " ")}
                  </dt>
                  <dd className="text-sm text-slate-300 font-mono">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-slate-200">Compliance Status</CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">NIS2 requirements mapped to this asset</p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {mappings.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-slate-500 text-sm">No compliance mappings for this asset yet.</p>
              <p className="text-slate-600 text-xs mt-1">
                Assign requirements in the{" "}
                <Link href="/compliance" className="text-blue-500 hover:text-blue-400">Compliance</Link> page.
              </p>
            </div>
          ) : (
            <div className="overflow-auto rounded-b-lg">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Requirement</TableHead>
                    <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Category</TableHead>
                    <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Status</TableHead>
                    <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((mapping) => {
                    const req = reqById.get(mapping.requirementId);
                    return (
                      <TableRow key={mapping.id} className="border-slate-800 hover:bg-slate-800/40">
                        <TableCell className="px-4 py-2.5 text-xs text-slate-300 max-w-[220px]">
                          <span className="line-clamp-2">
                            {req?.title ?? mapping.requirementId.slice(0, 8) + "…"}
                          </span>
                          {req?.articleReference && (
                            <span className="block text-slate-600 text-[10px] mt-0.5">{req.articleReference}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-xs text-slate-500">{req?.category ?? "—"}</TableCell>
                        <TableCell className="px-4 py-2.5">
                          <Badge variant={COMPLIANCE_VARIANT[mapping.status] ?? "muted"} className="text-[10px] px-1.5 py-0">
                            {complianceStatusLabels[mapping.status as keyof typeof complianceStatusLabels] ?? mapping.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-xs text-slate-500 max-w-[200px]">
                          <span className="line-clamp-2">{mapping.evidenceDescription ?? "—"}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md bg-slate-900 border-slate-800 overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-slate-100">Edit Asset</SheetTitle>
            <SheetDescription className="text-slate-500">Update the details for {asset.name}.</SheetDescription>
          </SheetHeader>
          <AssetForm
            mode="edit"
            asset={asset}
            organizationId={asset.organizationId}
            onSuccess={() => { setEditOpen(false); loadData(); }}
            onClose={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
