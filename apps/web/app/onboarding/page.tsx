"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createOrganization,
  createAsset,
  createTelemetryStream,
  initializeCompliance,
  getAssets,
} from "@/lib/api";
import type { CreateOrganization, CreateAsset, CreateStream } from "@spaceguard/shared";
import { useAuth } from "@/lib/auth-context";
import { useOrg } from "@/lib/context";
import {
  Rocket,
  Building2,
  Satellite,
  ShieldCheck,
  Waves,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Copy,
  Check,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EU_COUNTRIES = [
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "ES", name: "Spain" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "GR", name: "Greece" },
  { code: "HR", name: "Croatia" },
  { code: "HU", name: "Hungary" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "LV", name: "Latvia" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SE", name: "Sweden" },
  { code: "SI", name: "Slovenia" },
  { code: "SK", name: "Slovakia" },
];

const ASSET_TYPES = [
  { value: "LEO_SATELLITE", label: "LEO Satellite" },
  { value: "MEO_SATELLITE", label: "MEO Satellite" },
  { value: "GEO_SATELLITE", label: "GEO Satellite" },
  { value: "GROUND_STATION", label: "Ground Station" },
  { value: "CONTROL_CENTER", label: "Control Center" },
  { value: "UPLINK", label: "Uplink" },
  { value: "DOWNLINK", label: "Downlink" },
  { value: "INTER_SATELLITE_LINK", label: "Inter-Satellite Link" },
  { value: "DATA_CENTER", label: "Data Center" },
  { value: "NETWORK_SEGMENT", label: "Network Segment" },
];

const CRITICALITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

// ---------------------------------------------------------------------------
// Steps indicator
// ---------------------------------------------------------------------------

interface StepDef {
  label: string;
  icon: React.ReactNode;
}

const STEPS: StepDef[] = [
  { label: "Organization", icon: <Building2 size={18} /> },
  { label: "Assets", icon: <Satellite size={18} /> },
  { label: "Compliance", icon: <ShieldCheck size={18} /> },
  { label: "Monitoring", icon: <Waves size={18} /> },
  { label: "Ready", icon: <Rocket size={18} /> },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <div
                className={`hidden sm:block w-8 h-px ${
                  done ? "bg-blue-500" : "bg-slate-700"
                }`}
              />
            )}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                  : done
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-800 text-slate-500 border border-slate-700"
              }`}
            >
              {done ? <CheckCircle2 size={14} /> : step.icon}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Create Organization
// ---------------------------------------------------------------------------

interface OrgFormData {
  name: string;
  contactName: string;
  contactEmail: string;
  country: string;
  nis2Classification: "ESSENTIAL" | "IMPORTANT";
}

function Step1Organization({
  onComplete,
  initialEmail,
}: {
  onComplete: (orgId: string) => void;
  initialEmail: string;
}) {
  const [form, setForm] = useState<OrgFormData>({
    name: "",
    contactName: "",
    contactEmail: initialEmail,
    country: "DE",
    nis2Classification: "ESSENTIAL",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof OrgFormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.name.trim()) {
      setError("Organization name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const org = await createOrganization({
        name: form.name.trim(),
        contactName: form.contactName.trim() || form.name.trim(),
        contactEmail: form.contactEmail.trim(),
        country: form.country,
        nis2Classification: form.nis2Classification,
      } as CreateOrganization);
      onComplete(org.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">&#x1F680;</div>
        <h2 className="text-2xl font-bold text-slate-50">Welcome to SpaceGuard</h2>
        <p className="text-slate-400 text-sm mt-2">
          Let&apos;s set up your organization to start tracking NIS2 and ENISA
          compliance for your space infrastructure.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Organization Name *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. AstroSecure GmbH"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Contact Name
            </label>
            <input
              type="text"
              value={form.contactName}
              onChange={(e) => update("contactName", e.target.value)}
              placeholder="Jane Smith"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Contact Email
            </label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => update("contactEmail", e.target.value)}
              placeholder="admin@example.com"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Country
            </label>
            <select
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              {EU_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              NIS2 Classification
            </label>
            <select
              value={form.nis2Classification}
              onChange={(e) =>
                update("nis2Classification", e.target.value)
              }
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="ESSENTIAL">Essential Entity</option>
              <option value="IMPORTANT">Important Entity</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 transition-colors"
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              Create Organization
              <ChevronRight size={16} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Add Assets
// ---------------------------------------------------------------------------

interface AssetFormData {
  name: string;
  assetType: string;
  description: string;
  criticality: string;
}

const EMPTY_ASSET: AssetFormData = {
  name: "",
  assetType: "LEO_SATELLITE",
  description: "",
  criticality: "MEDIUM",
};

function Step2Assets({
  orgId,
  onComplete,
}: {
  orgId: string;
  onComplete: () => void;
}) {
  const [assets, setAssets] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [form, setForm] = useState<AssetFormData>({ ...EMPTY_ASSET });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof AssetFormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const addAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Asset name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const asset = await createAsset({
        organizationId: orgId,
        name: form.name.trim(),
        assetType: form.assetType,
        description: form.description.trim() || undefined,
        criticality: form.criticality,
      } as CreateAsset);
      setAssets((prev) => [...prev, { id: asset.id, name: asset.name, type: asset.assetType }]);
      setForm({ ...EMPTY_ASSET });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create asset");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">&#x1F6F0;&#xFE0F;</div>
        <h2 className="text-2xl font-bold text-slate-50">Add Your Space Assets</h2>
        <p className="text-slate-400 text-sm mt-2">
          Register satellites, ground stations, and other infrastructure.
          You can add more later.
        </p>
      </div>

      {/* Added assets list */}
      {assets.length > 0 && (
        <div className="mb-4 space-y-2">
          {assets.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/20"
            >
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              <span className="text-sm text-slate-200">{a.name}</span>
              <Badge variant="muted" className="text-[10px] ml-auto">
                {ASSET_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addAsset} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Asset Name *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. ASTRO-SAT-1"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Asset Type
            </label>
            <select
              value={form.assetType}
              onChange={(e) => update("assetType", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Criticality
            </label>
            <select
              value={form.criticality}
              onChange={(e) => update("criticality", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              {CRITICALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Description (optional)
          </label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Brief description of this asset..."
            rows={2}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm font-medium px-4 py-2.5 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <Satellite size={14} />
                Add Asset
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onComplete}
            disabled={assets.length === 0}
            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            Continue
            <ChevronRight size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Compliance Baseline
// ---------------------------------------------------------------------------

function Step3Compliance({
  orgId,
  onComplete,
}: {
  orgId: string;
  onComplete: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ created: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const res = await initializeCompliance(orgId);
      setResult(res);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize compliance");
      setStatus("error");
    }
  }, [orgId]);

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">&#x1F6E1;&#xFE0F;</div>
        <h2 className="text-2xl font-bold text-slate-50">Compliance Baseline</h2>
        <p className="text-slate-400 text-sm mt-2">
          We&apos;ll create compliance mappings for all NIS2 and ENISA Space
          requirements, setting each to &quot;Not Assessed&quot; so you can work
          through them at your own pace.
        </p>
      </div>

      <Card className="bg-slate-900 border-slate-800 mb-4">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-slate-300 space-y-1">
              <p>This will create mappings for:</p>
              <ul className="list-disc ml-4 text-slate-400 text-xs space-y-0.5">
                <li>18 NIS2 Article 21 requirements (space-specific)</li>
                <li>125 ENISA Space Threat Landscape controls</li>
              </ul>
              <p className="text-xs text-slate-500 mt-2">
                All mappings start as &quot;Not Assessed&quot;. You can update
                each one in the Compliance Mapper.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {status === "idle" && (
        <button
          onClick={initialize}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 transition-colors"
        >
          <ShieldCheck size={16} />
          Initialize Compliance Baseline
        </button>
      )}

      {status === "loading" && (
        <div className="flex items-center justify-center gap-3 py-4">
          <Loader2 size={20} className="animate-spin text-blue-400" />
          <span className="text-sm text-slate-400">
            Creating compliance mappings...
          </span>
        </div>
      )}

      {status === "done" && result && (
        <div className="space-y-4">
          <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-300">
                Compliance baseline created
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {result.created} new mappings created ({result.total} total requirements tracked)
              </p>
            </div>
          </div>
          <button
            onClick={onComplete}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            Continue
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            {error}
          </p>
          <button
            onClick={initialize}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Set Up Monitoring
// ---------------------------------------------------------------------------

function Step4Monitoring({
  orgId,
  onComplete,
}: {
  orgId: string;
  onComplete: () => void;
}) {
  const [name, setName] = useState("Primary Telemetry");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [assets, setAssets] = useState<Array<{ id: string; name: string }>>([]);
  const [streamCreated, setStreamCreated] = useState(false);
  const [streamKey, setStreamKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getAssets({ organizationId: orgId })
      .then((res) => {
        setAssets(res.data.map((a) => ({ id: a.id, name: a.name })));
        if (res.data.length > 0) {
          setAssetId(res.data[0].id);
        }
      })
      .catch(() => {
        // ignore
      });
  }, [orgId]);

  const createStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !assetId) {
      setError("Stream name and asset are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const stream = await createTelemetryStream({
        organizationId: orgId,
        assetId,
        name: name.trim(),
        protocol: "CCSDS_TM",
        status: "ACTIVE",
      } as CreateStream);
      setStreamCreated(true);
      setStreamKey(stream.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create stream");
    } finally {
      setSubmitting(false);
    }
  };

  const curlExample = `curl -X POST http://localhost:3001/api/v1/telemetry/ingest \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -d '{
    "streamId": "${streamKey ?? "<STREAM_ID>"}",
    "frames": [{
      "time": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "frameType": "HK",
      "parameters": {
        "battery_voltage_v": 28.5,
        "solar_power_w": 120.3,
        "cpu_load_pct": 45,
        "temperature_obc_c": 22.1
      }
    }]
  }'`;

  const handleCopy = () => {
    navigator.clipboard.writeText(curlExample).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">&#x1F4E1;</div>
        <h2 className="text-2xl font-bold text-slate-50">Set Up Monitoring</h2>
        <p className="text-slate-400 text-sm mt-2">
          Create a telemetry stream to start ingesting data from your
          satellites and ground stations.
        </p>
      </div>

      {!streamCreated ? (
        <form onSubmit={createStream} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Stream Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Primary Telemetry"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Target Asset
            </label>
            <select
              value={assetId ?? ""}
              onChange={(e) => setAssetId(e.target.value || null)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              {assets.length === 0 && <option value="">No assets found</option>}
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting || assets.length === 0}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 transition-colors"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Waves size={14} />
                  Create Stream
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="px-4 py-2.5 rounded-md border border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-600 text-sm transition-colors"
            >
              Skip for now
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-300">
                Telemetry stream created
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Stream ID: <code className="text-slate-300">{streamKey}</code>
              </p>
            </div>
          </div>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium text-slate-400">
                  Example: Send telemetry data
                </CardTitle>
                <button
                  onClick={handleCopy}
                  className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <pre className="text-[11px] text-slate-400 bg-slate-950 rounded-md p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                {curlExample}
              </pre>
            </CardContent>
          </Card>

          <button
            onClick={onComplete}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            Continue
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: You're Ready
// ---------------------------------------------------------------------------

function Step5Ready() {
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="text-5xl mb-4">&#x1F389;</div>
      <h2 className="text-2xl font-bold text-slate-50 mb-2">
        You&apos;re All Set!
      </h2>
      <p className="text-slate-400 text-sm mb-8 max-w-sm mx-auto">
        Your organization is configured and ready to go. Head to the dashboard
        to see your compliance overview and start monitoring.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {[
          {
            label: "Compliance Mapper",
            desc: "Assess each requirement",
            href: "/compliance",
            icon: <ShieldCheck size={16} />,
          },
          {
            label: "Asset Registry",
            desc: "Manage your infrastructure",
            href: "/assets",
            icon: <Satellite size={16} />,
          },
          {
            label: "Telemetry",
            desc: "Monitor live data streams",
            href: "/telemetry",
            icon: <Waves size={16} />,
          },
          {
            label: "Threat Intel",
            desc: "SPARTA techniques & IOCs",
            href: "/intel",
            icon: <Building2 size={16} />,
          },
        ].map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className="flex items-start gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600 text-left transition-colors group"
          >
            <span className="text-blue-400 mt-0.5">{item.icon}</span>
            <div>
              <p className="text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors">
                {item.label}
              </p>
              <p className="text-xs text-slate-500">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => router.push("/")}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-6 py-2.5 transition-colors"
      >
        Go to Dashboard
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Onboarding Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const { user } = useAuth();
  const { reload: reloadOrgs } = useOrg();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [orgId, setOrgId] = useState<string | null>(null);

  // If user already has an org with assets, redirect to dashboard
  const { orgId: existingOrgId, orgs, loading: orgLoading } = useOrg();

  useEffect(() => {
    if (orgLoading) return;
    // If user already has orgs, check if they have assets
    if (existingOrgId) {
      getAssets({ organizationId: existingOrgId })
        .then((res) => {
          if (res.data.length > 0) {
            router.replace("/");
          }
        })
        .catch(() => {
          // ignore errors, let user use onboarding
        });
    }
  }, [existingOrgId, orgLoading, router]);

  const handleOrgCreated = (newOrgId: string) => {
    setOrgId(newOrgId);
    reloadOrgs();
    setStep(1);
  };

  const handleAssetsComplete = () => setStep(2);
  const handleComplianceComplete = () => setStep(3);
  const handleMonitoringComplete = () => setStep(4);

  // Use existing org if available and user is being redirected from dashboard
  const activeOrgId = orgId ?? existingOrgId;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
            <ShieldCheck size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-200">
            SpaceGuard
          </span>
        </div>
        {user && (
          <span className="text-xs text-slate-500">{user.email}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center px-6 py-10">
        <StepIndicator current={step} />

        {step === 0 && (
          <Step1Organization
            onComplete={handleOrgCreated}
            initialEmail={user?.email ?? ""}
          />
        )}
        {step === 1 && activeOrgId && (
          <Step2Assets orgId={activeOrgId} onComplete={handleAssetsComplete} />
        )}
        {step === 2 && activeOrgId && (
          <Step3Compliance
            orgId={activeOrgId}
            onComplete={handleComplianceComplete}
          />
        )}
        {step === 3 && activeOrgId && (
          <Step4Monitoring
            orgId={activeOrgId}
            onComplete={handleMonitoringComplete}
          />
        )}
        {step === 4 && <Step5Ready />}
      </div>
    </div>
  );
}
