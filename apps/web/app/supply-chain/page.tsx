"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Link as LinkIcon,
  Globe,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Building2,
  Loader2,
  Trash2,
  Pencil,
  BarChart2,
} from "lucide-react";
import {
  getSuppliers,
  createSupplierApi,
  updateSupplierApi,
  deleteSupplierApi,
  getSupplierRiskSummary,
  type SupplierResponse,
  type SupplierRiskSummary,
  type SupplierSecurityAssessment,
} from "@/lib/api";
import { useOrg } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPLIER_TYPES = [
  { value: "COMPONENT_MANUFACTURER", label: "Component Manufacturer" },
  { value: "GROUND_STATION_OPERATOR", label: "Ground Station Operator" },
  { value: "LAUNCH_PROVIDER", label: "Launch Provider" },
  { value: "CLOUD_PROVIDER", label: "Cloud Provider" },
  { value: "SOFTWARE_VENDOR", label: "Software Vendor" },
  { value: "INTEGRATION_PARTNER", label: "Integration Partner" },
  { value: "DATA_RELAY_PROVIDER", label: "Data Relay Provider" },
] as const;

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  SUPPLIER_TYPES.map((t) => [t.value, t.label])
);

const CRITICALITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const CRIT_VARIANT: Record<string, "danger" | "warning" | "default" | "muted"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "default",
  LOW: "muted",
};

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function critBadge(crit: string) {
  return (
    <Badge variant={CRIT_VARIANT[crit] ?? "muted"} className="text-[10px] px-1.5 py-0 font-normal">
      {crit}
    </Badge>
  );
}

function riskScoreBadge(score: number | undefined) {
  if (score === undefined || score === null) {
    return <span className="text-xs text-slate-600">N/A</span>;
  }
  const color =
    score >= 7
      ? "bg-red-500/20 text-red-400 border-red-500/30"
      : score >= 4
        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
        : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  return (
    <span className={`inline-flex items-center justify-center w-7 h-5 rounded text-xs font-bold border ${color}`}>
      {score}
    </span>
  );
}

function certBadge(label: string, certified: boolean) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
        certified
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          : "bg-slate-800 text-slate-600 border-slate-700"
      }`}
    >
      {certified ? <ShieldCheck size={10} /> : null}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Risk Summary Cards
// ---------------------------------------------------------------------------

function RiskSummaryCards({ summary }: { summary: SupplierRiskSummary | null }) {
  if (!summary) return null;

  const countries = Object.entries(summary.countryDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
            Total Suppliers
          </p>
          <p className="text-2xl font-bold text-slate-100">
            {summary.totalSuppliers}
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
            High Risk
          </p>
          <p className={`text-2xl font-bold ${summary.highRiskCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {summary.highRiskCount}
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
            Overdue Reviews
          </p>
          <p className={`text-2xl font-bold ${summary.overdueAssessments > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            {summary.overdueAssessments}
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
            Countries
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {countries.length === 0 ? (
              <span className="text-slate-600 text-xs">None</span>
            ) : (
              countries.map(([code, cnt]) => (
                <span
                  key={code}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                >
                  {code} ({cnt})
                </span>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier Form
// ---------------------------------------------------------------------------

interface SupplierFormProps {
  initial?: SupplierResponse | null;
  orgId: string;
  onSave: () => void;
  onCancel: () => void;
}

function SupplierForm({ initial, orgId, onSave, onCancel }: SupplierFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic fields
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "SOFTWARE_VENDOR");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [criticality, setCriticality] = useState(initial?.criticality ?? "MEDIUM");
  const [description, setDescription] = useState(initial?.description ?? "");

  // Security assessment
  const sa = initial?.securityAssessment;
  const [lastAssessed, setLastAssessed] = useState(sa?.lastAssessed ?? "");
  const [nextReview, setNextReview] = useState(sa?.nextReview ?? "");
  const [iso27001, setIso27001] = useState(sa?.iso27001Certified ?? false);
  const [soc2, setSoc2] = useState(sa?.soc2Certified ?? false);
  const [nis2, setNis2] = useState(sa?.nis2Compliant ?? false);
  const [riskScore, setRiskScore] = useState(sa?.riskScore ?? 5);
  const [notes, setNotes] = useState(sa?.notes ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const data: Record<string, unknown> = {
      name,
      type,
      country: country.toUpperCase(),
      criticality,
      description: description || undefined,
      securityAssessment: {
        lastAssessed: lastAssessed || null,
        nextReview: nextReview || null,
        iso27001Certified: iso27001,
        soc2Certified: soc2,
        nis2Compliant: nis2,
        riskScore,
        notes: notes || null,
      },
    };

    try {
      if (initial) {
        await updateSupplierApi(initial.id, data);
      } else {
        await createSupplierApi({ ...data, organizationId: orgId });
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-400">Supplier Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="bg-slate-800 border-slate-700 text-slate-200"
          placeholder="e.g. KSAT, OHB SE"
        />
      </div>

      {/* Type + Country */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-400">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPLIER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-400">Country (ISO)</Label>
          <Input
            value={country}
            onChange={(e) => setCountry(e.target.value.slice(0, 2))}
            required
            maxLength={2}
            className="bg-slate-800 border-slate-700 text-slate-200 uppercase"
            placeholder="DE"
          />
        </div>
      </div>

      {/* Criticality */}
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-400">Criticality</Label>
        <Select value={criticality} onValueChange={setCriticality}>
          <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRITICALITIES.map((c) => (
              <SelectItem key={c} value={c} className="text-xs">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-400">Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="bg-slate-800 border-slate-700 text-slate-200 text-xs"
          placeholder="Brief description of the supplier relationship"
        />
      </div>

      {/* Security Assessment Section */}
      <div className="border-t border-slate-700 pt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
          Security Assessment
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Last Assessed</Label>
            <Input
              type="date"
              value={lastAssessed}
              onChange={(e) => setLastAssessed(e.target.value)}
              className="bg-slate-800 border-slate-700 text-slate-200 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Next Review</Label>
            <Input
              type="date"
              value={nextReview}
              onChange={(e) => setNextReview(e.target.value)}
              className="bg-slate-800 border-slate-700 text-slate-200 text-xs"
            />
          </div>
        </div>

        {/* Risk Score */}
        <div className="mt-3 space-y-1.5">
          <Label className="text-xs text-slate-400">
            Risk Score (1-10): <span className="text-slate-200 font-bold">{riskScore}</span>
          </Label>
          <input
            type="range"
            min={1}
            max={10}
            value={riskScore}
            onChange={(e) => setRiskScore(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>

        {/* Certifications */}
        <div className="mt-3 space-y-2">
          <Label className="text-xs text-slate-400">Certifications</Label>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={iso27001}
                onChange={(e) => setIso27001(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 accent-emerald-500"
              />
              ISO 27001
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={soc2}
                onChange={(e) => setSoc2(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 accent-emerald-500"
              />
              SOC 2
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={nis2}
                onChange={(e) => setNis2(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 accent-emerald-500"
              />
              NIS2 Compliant
            </label>
          </div>
        </div>

        {/* Assessment Notes */}
        <div className="mt-3 space-y-1.5">
          <Label className="text-xs text-slate-400">Assessment Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="bg-slate-800 border-slate-700 text-slate-200 text-xs"
            placeholder="Findings, concerns, action items..."
          />
        </div>
      </div>

      {/* Error + Buttons */}
      {error && (
        <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle size={12} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="border-slate-700 text-slate-400"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={saving || !name || !country}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          {saving ? (
            <><Loader2 size={14} className="mr-1.5 animate-spin" /> Saving...</>
          ) : initial ? (
            "Update Supplier"
          ) : (
            "Add Supplier"
          )}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SupplyChainPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [riskSummary, setRiskSummary] = useState<SupplierRiskSummary | null>(null);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierResponse | null>(null);

  const loadData = useCallback(async () => {
    if (!orgId) {
      setSuppliers([]);
      setTotal(0);
      setRiskSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [suppResult, summaryResult] = await Promise.all([
        getSuppliers({ organizationId: orgId, perPage: 100 }),
        getSupplierRiskSummary(orgId),
      ]);
      setSuppliers(suppResult.data);
      setTotal(suppResult.total);
      setRiskSummary(summaryResult);
    } catch {
      // silently fall through
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgLoading) return;
    loadData();
  }, [orgLoading, loadData]);

  function handleAdd() {
    setEditingSupplier(null);
    setSheetOpen(true);
  }

  function handleEdit(s: SupplierResponse) {
    setEditingSupplier(s);
    setSheetOpen(true);
  }

  async function handleDelete(id: string) {
    try {
      await deleteSupplierApi(id);
      loadData();
    } catch {
      // ignore
    }
  }

  function handleSaved() {
    setSheetOpen(false);
    setEditingSupplier(null);
    loadData();
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50 flex items-center gap-2.5">
            <LinkIcon size={22} className="text-cyan-400" />
            Supply Chain
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Manage third-party suppliers and assess supply chain security risk
          </p>
        </div>
        <Button
          onClick={handleAdd}
          disabled={!orgId}
          className="bg-blue-600 hover:bg-blue-500 text-white"
          size="sm"
        >
          <Plus size={14} className="mr-1.5" />
          Add Supplier
        </Button>
      </div>

      {/* Risk Summary Cards */}
      {!loading && <RiskSummaryCards summary={riskSummary} />}

      {/* Supplier Table */}
      <Card className="border-slate-700 bg-slate-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-300">
            Supplier Inventory
            {!loading && (
              <span className="ml-2 text-slate-500 font-normal">
                ({total} supplier{total !== 1 ? "s" : ""})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading suppliers...
            </div>
          ) : suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Building2 size={32} className="mb-3 text-slate-600" />
              <p className="text-sm">No suppliers registered yet.</p>
              <p className="text-xs text-slate-600 mt-1">
                Add suppliers to track your supply chain risk posture.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs">Name</TableHead>
                  <TableHead className="text-slate-500 text-xs">Type</TableHead>
                  <TableHead className="text-slate-500 text-xs">Country</TableHead>
                  <TableHead className="text-slate-500 text-xs">Criticality</TableHead>
                  <TableHead className="text-slate-500 text-xs">Last Assessed</TableHead>
                  <TableHead className="text-slate-500 text-xs">Risk Score</TableHead>
                  <TableHead className="text-slate-500 text-xs">Certifications</TableHead>
                  <TableHead className="text-slate-500 text-xs w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => {
                  const sa = s.securityAssessment;
                  const assessed = sa?.lastAssessed
                    ? new Date(sa.lastAssessed).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : null;
                  const overdue =
                    sa?.nextReview && new Date(sa.nextReview) < new Date();

                  return (
                    <TableRow
                      key={s.id}
                      className="border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                      onClick={() => handleEdit(s)}
                    >
                      <TableCell className="font-medium text-slate-200 text-sm">
                        {s.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 font-normal">
                          {TYPE_LABELS[s.type] ?? s.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs text-slate-300">
                          <Globe size={12} className="text-slate-500" />
                          {s.country}
                        </span>
                      </TableCell>
                      <TableCell>{critBadge(s.criticality)}</TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          {assessed ?? <span className="text-slate-600">Never</span>}
                          {overdue && (
                            <span title="Review overdue">
                              <Clock size={12} className="text-amber-400" />
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{riskScoreBadge(sa?.riskScore)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {certBadge("ISO", sa?.iso27001Certified ?? false)}
                          {certBadge("SOC2", sa?.soc2Certified ?? false)}
                          {certBadge("NIS2", sa?.nis2Compliant ?? false)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(s);
                            }}
                            className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(s.id);
                            }}
                            className="p-1.5 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-slate-900 border-slate-700 w-[420px] sm:w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-slate-100">
              {editingSupplier ? "Edit Supplier" : "Add Supplier"}
            </SheetTitle>
            <SheetDescription className="text-slate-500">
              {editingSupplier
                ? "Update supplier details and security assessment."
                : "Register a new supply chain partner and document their security posture."}
            </SheetDescription>
          </SheetHeader>
          {orgId && (
            <SupplierForm
              key={editingSupplier?.id ?? "new"}
              initial={editingSupplier}
              orgId={orgId}
              onSave={handleSaved}
              onCancel={() => setSheetOpen(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
