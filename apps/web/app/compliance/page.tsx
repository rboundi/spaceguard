"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, Shield, Plus, Save, Download } from "lucide-react";
import { ComplianceStatus, complianceStatusLabels } from "@spaceguard/shared";
import type {
  ComplianceRequirement,
  MappingResponse,
  AssetResponse,
} from "@spaceguard/shared";
import {
  getRequirements,
  getMappings,
  getAssets,
  createMapping,
  updateMapping,
  exportComplianceCsv,
} from "@/lib/api";
import { useOrg } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "muted"
> = {
  COMPLIANT: "success",
  PARTIALLY_COMPLIANT: "warning",
  NON_COMPLIANT: "danger",
  NOT_ASSESSED: "muted",
};

const STATUS_OPTIONS = [
  { value: ComplianceStatus.NOT_ASSESSED, label: "Not Assessed" },
  { value: ComplianceStatus.NON_COMPLIANT, label: "Non-Compliant" },
  { value: ComplianceStatus.PARTIALLY_COMPLIANT, label: "Partially Compliant" },
  { value: ComplianceStatus.COMPLIANT, label: "Compliant" },
];

const STATUS_ORDER: Record<string, number> = {
  NON_COMPLIANT: 0,
  PARTIALLY_COMPLIANT: 1,
  NOT_ASSESSED: 2,
  COMPLIANT: 3,
};

// Worst-status aggregation across all mappings for a requirement
function getEffectiveStatus(
  reqId: string,
  mappings: MappingResponse[]
): ComplianceStatus {
  const relevant = mappings.filter((m) => m.requirementId === reqId);
  if (relevant.length === 0) return ComplianceStatus.NOT_ASSESSED;
  return relevant.reduce<ComplianceStatus>((worst, m) => {
    const a = STATUS_ORDER[worst] ?? 2;
    const b = STATUS_ORDER[m.status] ?? 2;
    return b < a ? (m.status as ComplianceStatus) : worst;
  }, ComplianceStatus.NOT_ASSESSED);
}

// ---------------------------------------------------------------------------
// MappingRow: inline per-asset editing
// ---------------------------------------------------------------------------

interface MappingRowProps {
  mapping: MappingResponse;
  asset: AssetResponse | undefined;
  onUpdated: (updated: MappingResponse) => void;
}

function MappingRow({ mapping, asset, onUpdated }: MappingRowProps) {
  const [status, setStatus] = useState(mapping.status);
  const [evidence, setEvidence] = useState(mapping.evidenceDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    status !== mapping.status ||
    evidence !== (mapping.evidenceDescription ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateMapping(mapping.id, {
        status: status as ComplianceStatus,
        evidenceDescription: evidence || undefined,
      });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // revert
      setStatus(mapping.status);
      setEvidence(mapping.evidenceDescription ?? "");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-300 truncate">
          {asset?.name ?? "Organization-level"}
        </span>
        {asset && (
          <span className="text-[10px] text-slate-600 shrink-0">
            {asset.assetType.replace(/_/g, " ")}
          </span>
        )}
      </div>

      <Select value={status} onValueChange={(v) => setStatus(v as ComplianceStatus)}>
        <SelectTrigger className="h-7 text-xs bg-slate-800 border-slate-700 text-slate-200">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700">
          {STATUS_OPTIONS.map((o) => (
            <SelectItem
              key={o.value}
              value={o.value}
              className="text-slate-200 focus:bg-slate-700 text-xs"
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Textarea
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
        placeholder="Evidence description..."
        rows={2}
        className="text-xs bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 focus:border-blue-500 resize-none"
      />

      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="h-6 px-2 text-[10px] bg-blue-600 hover:bg-blue-500 text-white gap-1 disabled:opacity-40"
        >
          <Save size={10} />
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrgLevelStatus: org-wide mapping (no assetId)
// ---------------------------------------------------------------------------

interface OrgLevelStatusProps {
  requirementId: string;
  organizationId: string;
  mappings: MappingResponse[];
  onCreated: (m: MappingResponse) => void;
  onUpdated: (m: MappingResponse) => void;
}

function OrgLevelStatus({
  requirementId,
  organizationId,
  mappings,
  onCreated,
  onUpdated,
}: OrgLevelStatusProps) {
  const orgMapping = mappings.find(
    (m) => m.requirementId === requirementId && !m.assetId
  );
  const [status, setStatus] = useState<string>(
    orgMapping?.status ?? ComplianceStatus.NOT_ASSESSED
  );
  const [busy, setBusy] = useState(false);

  // Sync when mapping changes externally (e.g., initial load)
  useEffect(() => {
    setStatus(orgMapping?.status ?? ComplianceStatus.NOT_ASSESSED);
  }, [orgMapping?.status]);

  async function handleChange(value: string) {
    const prev = status;
    setStatus(value); // optimistic
    setBusy(true);
    try {
      if (orgMapping) {
        const updated = await updateMapping(orgMapping.id, {
          status: value as ComplianceStatus,
        });
        onUpdated(updated);
      } else {
        const created = await createMapping({
          organizationId,
          requirementId,
          status: value as ComplianceStatus,
        });
        onCreated(created);
      }
    } catch {
      setStatus(prev); // revert
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
        Organization-level Status
      </Label>
      <Select value={status} onValueChange={handleChange} disabled={busy}>
        <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700">
          {STATUS_OPTIONS.map((o) => (
            <SelectItem
              key={o.value}
              value={o.value}
              className="text-slate-200 focus:bg-slate-700 text-xs"
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MapAssetDialog
// ---------------------------------------------------------------------------

interface MapAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requirementId: string;
  organizationId: string;
  assets: AssetResponse[];
  mappedAssetIds: string[];
  onCreated: (m: MappingResponse) => void;
}

function MapAssetDialog({
  open,
  onOpenChange,
  requirementId,
  organizationId,
  assets,
  mappedAssetIds,
  onCreated,
}: MapAssetDialogProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const unmapped = assets.filter(
    (a) => !mappedAssetIds.includes(a.id) && a.status !== "DECOMMISSIONED"
  );

  async function handleConfirm() {
    if (!selectedAssetId) return;
    setSaving(true);
    try {
      const created = await createMapping({
        organizationId,
        requirementId,
        assetId: selectedAssetId,
        status: ComplianceStatus.NOT_ASSESSED,
      });
      onCreated(created);
      setSelectedAssetId("");
      onOpenChange(false);
    } catch {
      // ignore: keep dialog open
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-50 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Map Asset</DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            Select an asset to map to this requirement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {unmapped.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">
              All assets are already mapped to this requirement.
            </p>
          ) : (
            <>
              <Select
                value={selectedAssetId}
                onValueChange={setSelectedAssetId}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Select an asset…" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {unmapped.map((a) => (
                    <SelectItem
                      key={a.id}
                      value={a.id}
                      className="text-slate-200 focus:bg-slate-700 text-sm"
                    >
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  onClick={handleConfirm}
                  disabled={!selectedAssetId || saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {saving ? "Mapping…" : "Map Asset"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// RequirementDetail: right panel
// ---------------------------------------------------------------------------

interface RequirementDetailProps {
  requirement: ComplianceRequirement;
  mappings: MappingResponse[];
  assets: AssetResponse[];
  organizationId: string;
  onMappingUpdated: (m: MappingResponse) => void;
  onMappingCreated: (m: MappingResponse) => void;
}

function RequirementDetail({
  requirement,
  mappings,
  assets,
  organizationId,
  onMappingUpdated,
  onMappingCreated,
}: RequirementDetailProps) {
  const [mapDialogOpen, setMapDialogOpen] = useState(false);

  const reqMappings = mappings.filter(
    (m) => m.requirementId === requirement.id
  );
  const assetMappings = reqMappings.filter((m) => m.assetId);
  const mappedAssetIds = assetMappings
    .map((m) => m.assetId)
    .filter(Boolean) as string[];

  const effectiveStatus = getEffectiveStatus(requirement.id, mappings);
  const assetById = new Map(assets.map((a) => [a.id, a]));

  return (
    <div className="p-5 space-y-5">
      {/* Title row */}
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-100 leading-snug">
              {requirement.title}
            </h2>
            {requirement.articleReference && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                {requirement.articleReference}
              </p>
            )}
          </div>
          <Badge
            variant={STATUS_VARIANT[effectiveStatus] ?? "muted"}
            className="text-[10px] px-2 py-0.5 shrink-0"
          >
            {complianceStatusLabels[effectiveStatus as keyof typeof complianceStatusLabels] ?? effectiveStatus}
          </Badge>
        </div>

        {requirement.description && (
          <p className="text-sm text-slate-400 leading-relaxed">
            {requirement.description}
          </p>
        )}
      </div>

      {/* Evidence guidance */}
      {requirement.evidenceGuidance && (
        <Card className="bg-blue-950/30 border-blue-500/20">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-blue-400">
              Evidence Guidance
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              {requirement.evidenceGuidance}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Space sector applicability notes */}
      {requirement.applicabilityNotes && (
        <Card className="bg-amber-950/20 border-amber-500/20">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">
              Space Sector Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              {requirement.applicabilityNotes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Org-level status */}
      <div className="rounded-md border border-slate-700/50 bg-slate-800/20 px-4 py-3">
        <OrgLevelStatus
          requirementId={requirement.id}
          organizationId={organizationId}
          mappings={mappings}
          onCreated={onMappingCreated}
          onUpdated={onMappingUpdated}
        />
      </div>

      {/* Asset mappings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            Asset Mappings ({assetMappings.length})
          </Label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMapDialogOpen(true)}
            className="h-6 px-2 text-[10px] border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 gap-1"
          >
            <Plus size={10} />
            Map Asset
          </Button>
        </div>

        {assetMappings.length === 0 ? (
          <p className="text-xs text-slate-600 py-2">
            No assets mapped yet. Click &ldquo;Map Asset&rdquo; to associate an asset with this requirement.
          </p>
        ) : (
          <div className="space-y-2">
            {assetMappings.map((m) => (
              <MappingRow
                key={m.id}
                mapping={m}
                asset={assetById.get(m.assetId ?? "")}
                onUpdated={onMappingUpdated}
              />
            ))}
          </div>
        )}
      </div>

      <MapAssetDialog
        open={mapDialogOpen}
        onOpenChange={setMapDialogOpen}
        requirementId={requirement.id}
        organizationId={organizationId}
        assets={assets}
        mappedAssetIds={mappedAssetIds}
        onCreated={onMappingCreated}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RequirementCard: left panel item
// ---------------------------------------------------------------------------

interface RequirementCardProps {
  requirement: ComplianceRequirement;
  mappings: MappingResponse[];
  selected: boolean;
  onClick: () => void;
}

function RequirementCard({
  requirement,
  mappings,
  selected,
  onClick,
}: RequirementCardProps) {
  const effectiveStatus = getEffectiveStatus(requirement.id, mappings);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md px-3 py-2.5 transition-colors border ${
        selected
          ? "border-blue-500/50 bg-blue-500/10"
          : "border-transparent hover:bg-slate-800/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-200 line-clamp-2 flex-1 leading-relaxed">
          {requirement.title}
        </p>
        <Badge
          variant={STATUS_VARIANT[effectiveStatus] ?? "muted"}
          className="text-[9px] px-1 py-0 shrink-0 mt-0.5"
        >
          {effectiveStatus === ComplianceStatus.NOT_ASSESSED
            ? "N/A"
            : effectiveStatus === ComplianceStatus.COMPLIANT
            ? "OK"
            : effectiveStatus === ComplianceStatus.PARTIALLY_COMPLIANT
            ? "Partial"
            : "Fail"}
        </Badge>
      </div>
      {requirement.articleReference && (
        <p className="text-[10px] text-slate-600 mt-0.5">
          {requirement.articleReference}
        </p>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// CategorySection: collapsible group
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  category: string;
  requirements: ComplianceRequirement[];
  mappings: MappingResponse[];
  selectedId: string | null;
  onSelect: (req: ComplianceRequirement) => void;
}

function CategorySection({
  category,
  requirements,
  mappings,
  selectedId,
  onSelect,
}: CategorySectionProps) {
  const [open, setOpen] = useState(true);

  const compliantCount = requirements.filter(
    (r) => getEffectiveStatus(r.id, mappings) === ComplianceStatus.COMPLIANT
  ).length;

  const allCompliant = compliantCount === requirements.length;
  const noneCompliant = compliantCount === 0;

  return (
    <div className="border-b border-slate-800 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-800/40 transition-colors"
      >
        {open ? (
          <ChevronDown size={12} className="text-slate-500 shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-slate-500 shrink-0" />
        )}
        <span className="text-xs font-medium text-slate-300 flex-1 text-left">
          {category}
        </span>
        <span
          className={`text-[10px] font-mono shrink-0 ${
            allCompliant
              ? "text-emerald-400"
              : noneCompliant
              ? "text-slate-600"
              : "text-amber-400"
          }`}
        >
          {compliantCount}/{requirements.length}
        </span>
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-0.5">
          {requirements.map((req) => (
            <RequirementCard
              key={req.id}
              requirement={req}
              mappings={mappings}
              selected={selectedId === req.id}
              onClick={() => onSelect(req)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CompliancePage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [requirements, setRequirements] = useState<ComplianceRequirement[]>([]);
  const [mappings, setMappings] = useState<MappingResponse[]>([]);
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReq, setSelectedReq] = useState<ComplianceRequirement | null>(
    null
  );

  // Group requirements by category
  const categoryGroups = useMemo(() => {
    const groups = new Map<string, ComplianceRequirement[]>();
    for (const req of requirements) {
      const cat = req.category ?? "Uncategorized";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(req);
    }
    return groups;
  }, [requirements]);

  // Reload whenever org changes
  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      setMappings([]);
      setAssets([]);
      setSelectedReq(null);
      return;
    }

    // Cancellation flag prevents a stale fetch (from a previous orgId) from
    // overwriting state after the org has already changed to a new one.
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);
        setSelectedReq(null);

        const [reqResult, mappingResult, assetResult] = await Promise.all([
          getRequirements(),
          getMappings({ organizationId: orgId! }),
          getAssets({ organizationId: orgId!, perPage: 100 }),
        ]);

        if (cancelled) return;
        setRequirements(reqResult.data);
        setMappings(mappingResult.data);
        setAssets(assetResult.data);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load compliance data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => { cancelled = true; };
  }, [orgId, orgLoading]);

  const handleMappingUpdated = useCallback((updated: MappingResponse) => {
    setMappings((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m))
    );
  }, []);

  const handleMappingCreated = useCallback((created: MappingResponse) => {
    setMappings((prev) => [...prev, created]);
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-800" />
        <div className="flex gap-0 h-[calc(100vh-8rem)] rounded-lg border border-slate-800 overflow-hidden">
          <div className="w-2/5 border-r border-slate-800 p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-slate-800" />
            ))}
          </div>
          <div className="w-3/5 p-6 space-y-4">
            <div className="h-6 w-3/4 animate-pulse rounded bg-slate-800" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-800" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-slate-800" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-50 mb-4">
          Compliance Mapper
        </h1>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!orgLoading && !orgId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-50 mb-2">
          Compliance Mapper
        </h1>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-slate-500 text-sm">
            Set up your organization first to start mapping compliance
            requirements.
          </p>
        </div>
      </div>
    );
  }

  // Stats for header
  const totalReqs = requirements.length;
  const compliantReqs = requirements.filter(
    (r) => getEffectiveStatus(r.id, mappings) === ComplianceStatus.COMPLIANT
  ).length;
  const score =
    totalReqs > 0 ? Math.round((compliantReqs / totalReqs) * 100) : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-50">
              Compliance Mapper
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">
              NIS2 Article 21 requirements - map to assets and track status
            </p>
          </div>
          <div className="flex items-center gap-4">
            {orgId && (
              <button
                onClick={() => void exportComplianceCsv(orgId)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <Download size={13} />
                Export CSV
              </button>
            )}
            <div className="text-right">
              <p className="text-xs text-slate-500">Compliance Score</p>
              <p
                className={`text-lg font-bold ${
                  score >= 70
                    ? "text-emerald-400"
                    : score >= 40
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {score}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Requirements</p>
              <p className="text-lg font-bold text-slate-200">
                {compliantReqs}
                <span className="text-slate-600 text-sm font-normal">
                  /{totalReqs}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-2/5 border-r border-slate-800 overflow-y-auto">
          {Array.from(categoryGroups.entries()).map(([cat, reqs]) => (
            <CategorySection
              key={cat}
              category={cat}
              requirements={reqs}
              mappings={mappings}
              selectedId={selectedReq?.id ?? null}
              onSelect={setSelectedReq}
            />
          ))}
        </div>

        {/* Right panel */}
        <div className="w-3/5 overflow-y-auto">
          {selectedReq ? (
            <RequirementDetail
              requirement={selectedReq}
              mappings={mappings}
              assets={assets}
              organizationId={orgId!}
              onMappingUpdated={handleMappingUpdated}
              onMappingCreated={handleMappingCreated}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <Shield size={40} className="text-slate-700 mb-3" />
              <p className="text-slate-400 text-sm font-medium">
                Select a requirement
              </p>
              <p className="text-slate-600 text-xs mt-1">
                Choose a NIS2 requirement from the left panel to view details
                and manage compliance mappings.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
