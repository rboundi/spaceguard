"use client";

import { useState, useEffect } from "react";
import {
  AssetType,
  AssetStatus,
  Criticality,
  assetTypeLabels,
} from "@spaceguard/shared";
import type { AssetResponse, CreateAsset, UpdateAsset } from "@spaceguard/shared";
import { createAsset, updateAsset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Metadata field definitions per asset type
// ---------------------------------------------------------------------------

interface MetaField {
  key: string;
  label: string;
  placeholder: string;
}

const METADATA_FIELDS: Partial<Record<AssetType, MetaField[]>> = {
  [AssetType.LEO_SATELLITE]: [
    { key: "altitude_km", label: "Altitude (km)", placeholder: "550" },
    { key: "inclination", label: "Inclination (°)", placeholder: "53.0" },
    { key: "norad_id", label: "NORAD ID", placeholder: "25544" },
  ],
  [AssetType.MEO_SATELLITE]: [
    { key: "altitude_km", label: "Altitude (km)", placeholder: "20200" },
    { key: "inclination", label: "Inclination (°)", placeholder: "55.0" },
    { key: "norad_id", label: "NORAD ID", placeholder: "" },
  ],
  [AssetType.GEO_SATELLITE]: [
    { key: "altitude_km", label: "Altitude (km)", placeholder: "35786" },
    { key: "orbital_slot", label: "Orbital Slot", placeholder: "13.0°E" },
    { key: "norad_id", label: "NORAD ID", placeholder: "" },
  ],
  [AssetType.GROUND_STATION]: [
    { key: "location", label: "Location", placeholder: "Paris, France" },
    { key: "antenna_type", label: "Antenna Type", placeholder: "Parabolic" },
    {
      key: "frequency_bands",
      label: "Frequency Bands",
      placeholder: "S-band, X-band",
    },
  ],
  [AssetType.CONTROL_CENTER]: [
    { key: "location", label: "Location", placeholder: "Berlin, Germany" },
    {
      key: "redundancy_level",
      label: "Redundancy Level",
      placeholder: "Active-Active",
    },
  ],
  [AssetType.DATA_CENTER]: [
    { key: "location", label: "Location", placeholder: "Amsterdam, NL" },
    { key: "tier_level", label: "Tier Level", placeholder: "Tier III" },
  ],
  [AssetType.UPLINK]: [
    { key: "location", label: "Location", placeholder: "Toulouse, France" },
    {
      key: "frequency_bands",
      label: "Frequency Bands",
      placeholder: "Ku-band",
    },
  ],
  [AssetType.DOWNLINK]: [
    { key: "location", label: "Location", placeholder: "Darmstadt, Germany" },
    {
      key: "frequency_bands",
      label: "Frequency Bands",
      placeholder: "X-band",
    },
  ],
};

const STATUS_LABELS: Record<AssetStatus, string> = {
  [AssetStatus.OPERATIONAL]: "Operational",
  [AssetStatus.DEGRADED]: "Degraded",
  [AssetStatus.MAINTENANCE]: "Maintenance",
  [AssetStatus.DECOMMISSIONED]: "Decommissioned",
};

const CRITICALITY_LABELS: Record<Criticality, string> = {
  [Criticality.LOW]: "Low",
  [Criticality.MEDIUM]: "Medium",
  [Criticality.HIGH]: "High",
  [Criticality.CRITICAL]: "Critical",
};

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface AssetFormProps {
  mode: "create" | "edit";
  asset?: AssetResponse;
  organizationId: string;
  onSuccess: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Form component
// ---------------------------------------------------------------------------

export function AssetForm({
  mode,
  asset,
  organizationId,
  onSuccess,
  onClose,
}: AssetFormProps) {
  const [name, setName] = useState(asset?.name ?? "");
  const [assetType, setAssetType] = useState<AssetType>(
    (asset?.assetType as AssetType) ?? AssetType.LEO_SATELLITE
  );
  const [description, setDescription] = useState(asset?.description ?? "");
  const [status, setStatus] = useState<AssetStatus>(
    (asset?.status as AssetStatus) ?? AssetStatus.OPERATIONAL
  );
  const [criticality, setCriticality] = useState<Criticality>(
    (asset?.criticality as Criticality) ?? Criticality.MEDIUM
  );
  const [metadata, setMetadata] = useState<Record<string, string>>(() => {
    if (!asset?.metadata) return {};
    return Object.fromEntries(
      Object.entries(asset.metadata).map(([k, v]) => [k, String(v)])
    );
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form state when the asset prop changes (e.g. switching between edit targets)
  useEffect(() => {
    if (asset) {
      setName(asset.name);
      setAssetType((asset.assetType as AssetType) ?? AssetType.LEO_SATELLITE);
      setDescription(asset.description ?? "");
      setStatus((asset.status as AssetStatus) ?? AssetStatus.OPERATIONAL);
      setCriticality((asset.criticality as Criticality) ?? Criticality.MEDIUM);
      setMetadata(
        asset.metadata
          ? Object.fromEntries(
              Object.entries(asset.metadata).map(([k, v]) => [k, String(v)])
            )
          : {}
      );
    }
  }, [asset]);

  const metadataFields = METADATA_FIELDS[assetType] ?? [];

  function handleTypeChange(value: string) {
    setAssetType(value as AssetType);
    setMetadata({}); // reset metadata when type changes
  }

  function handleMetadata(key: string, value: string) {
    setMetadata((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setError(null);
    setSubmitting(true);

    try {
      const filteredMeta = Object.fromEntries(
        Object.entries(metadata).filter(([, v]) => v.trim() !== "")
      );
      const metaValue =
        Object.keys(filteredMeta).length > 0 ? filteredMeta : undefined;

      if (mode === "create") {
        const data: CreateAsset = {
          organizationId,
          name: name.trim(),
          assetType,
          description: description.trim() || undefined,
          status,
          criticality,
          metadata: metaValue,
        };
        await createAsset(data);
      } else {
        const data: UpdateAsset = {
          name: name.trim(),
          assetType,
          description: description.trim() || undefined,
          status,
          criticality,
          metadata: metaValue,
        };
        await updateAsset(asset!.id, data);
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save asset");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-1">
      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="asset-name" className="text-slate-300 text-xs">
          Name <span className="text-red-400">*</span>
        </Label>
        <Input
          id="asset-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. SENTINEL-1A"
          required
          className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 focus:border-blue-500"
        />
      </div>

      {/* Asset Type */}
      <div className="space-y-1.5">
        <Label className="text-slate-300 text-xs">
          Asset Type <span className="text-red-400">*</span>
        </Label>
        <Select value={assetType} onValueChange={handleTypeChange}>
          <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {Object.values(AssetType).map((t) => (
              <SelectItem
                key={t}
                value={t}
                className="text-slate-200 focus:bg-slate-700"
              >
                {assetTypeLabels[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status */}
      <div className="space-y-1.5">
        <Label className="text-slate-300 text-xs">Status</Label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as AssetStatus)}
        >
          <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {Object.values(AssetStatus).map((s) => (
              <SelectItem
                key={s}
                value={s}
                className="text-slate-200 focus:bg-slate-700"
              >
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Criticality */}
      <div className="space-y-1.5">
        <Label className="text-slate-300 text-xs">Criticality</Label>
        <Select
          value={criticality}
          onValueChange={(v) => setCriticality(v as Criticality)}
        >
          <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {Object.values(Criticality).map((c) => (
              <SelectItem
                key={c}
                value={c}
                className="text-slate-200 focus:bg-slate-700"
              >
                {CRITICALITY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="asset-desc" className="text-slate-300 text-xs">
          Description
        </Label>
        <Textarea
          id="asset-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of this asset..."
          rows={3}
          className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 focus:border-blue-500 resize-none"
        />
      </div>

      {/* Dynamic metadata fields */}
      {metadataFields.length > 0 && (
        <div className="space-y-3 rounded-md border border-slate-700/50 bg-slate-800/40 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {assetTypeLabels[assetType]} Details
          </p>
          {metadataFields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key} className="text-slate-400 text-xs">
                {field.label}
              </Label>
              <Input
                id={field.key}
                value={metadata[field.key] ?? ""}
                onChange={(e) => handleMetadata(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 focus:border-blue-500 h-8 text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          type="submit"
          disabled={submitting || !name.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
        >
          {submitting
            ? "Saving..."
            : mode === "create"
            ? "Create Asset"
            : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
