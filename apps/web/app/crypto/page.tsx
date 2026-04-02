"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Lock,
  ShieldAlert,
  KeyRound,
  AlertTriangle,
  Plus,
  Trash2,
} from "lucide-react";
import {
  getCryptoInventory,
  getCryptoPosture,
  createCryptoEntryApi,
  deleteCryptoEntryApi,
  getAssets,
  type CryptoEntryResponse,
  type CryptoPostureResponse,
} from "@/lib/api";
import type { AssetResponse } from "@spaceguard/shared";
import { useOrg } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MECH_LABELS: Record<string, string> = {
  LINK_ENCRYPTION: "Link Encryption",
  DATA_AT_REST: "Data at Rest",
  DATA_IN_TRANSIT: "Data in Transit",
  KEY_MANAGEMENT: "Key Management",
  AUTHENTICATION: "Authentication",
  DIGITAL_SIGNATURE: "Digital Signature",
  OTAR: "OTAR",
};

const PQC_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "text-red-400 bg-red-500/10 border-red-500/20",
  EVALUATING: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  MIGRATION_PLANNED: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  IN_PROGRESS: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  COMPLETED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  NOT_APPLICABLE: "text-slate-500 bg-slate-600/10 border-slate-600/20",
};

const PQC_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not Started",
  EVALUATING: "Evaluating",
  MIGRATION_PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  NOT_APPLICABLE: "N/A",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CryptoPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [entries, setEntries] = useState<CryptoEntryResponse[]>([]);
  const [posture, setPosture] = useState<CryptoPostureResponse | null>(null);
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  // Form state
  const [fName, setFName] = useState("");
  const [fAsset, setFAsset] = useState("");
  const [fType, setFType] = useState("LINK_ENCRYPTION");
  const [fAlgo, setFAlgo] = useState("");
  const [fKeyLen, setFKeyLen] = useState("");
  const [fProtocol, setFProtocol] = useState("");
  const [fImpl, setFImpl] = useState("");
  const [fPqcVuln, setFPqcVuln] = useState(false);
  const [fPqcStatus, setFPqcStatus] = useState("NOT_APPLICABLE");
  const [fRotationDays, setFRotationDays] = useState("");
  const [fCertExpiry, setFCertExpiry] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [inv, pos, assetData] = await Promise.all([
        getCryptoInventory(orgId),
        getCryptoPosture(orgId),
        getAssets({ organizationId: orgId, perPage: 100 }),
      ]);
      setEntries(inv.data);
      setPosture(pos);
      setAssets(assetData.data);
    } catch { /* */ }
  }, [orgId]);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [orgId, orgLoading, loadData]);

  const assetMap = new Map(assets.map((a) => [a.id, a.name]));

  async function handleAdd() {
    if (!orgId || !fName || !fAlgo) return;
    setSubmitting(true);
    try {
      await createCryptoEntryApi({
        organizationId: orgId,
        assetId: fAsset || null,
        name: fName,
        mechanismType: fType,
        algorithm: fAlgo,
        keyLengthBits: fKeyLen ? parseInt(fKeyLen) : null,
        protocol: fProtocol || null,
        implementation: fImpl || null,
        pqcVulnerable: fPqcVuln,
        pqcMigrationStatus: fPqcVuln ? fPqcStatus : "NOT_APPLICABLE",
        keyRotationIntervalDays: fRotationDays ? parseInt(fRotationDays) : null,
        certificateExpiry: fCertExpiry || null,
      });
      setAddOpen(false);
      loadData();
    } catch { /* */ }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    try { await deleteCryptoEntryApi(id); loadData(); } catch { /* */ }
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Cryptographic Posture</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Inventory, PQC readiness, and key lifecycle management
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5">
          <Plus size={15} /> Add Mechanism
        </Button>
      </div>

      {/* Posture cards */}
      {posture && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="px-3 py-3">
              <p className="text-[10px] text-slate-500 uppercase">Posture Score</p>
              <p className={`text-2xl font-bold ${scoreColor(posture.postureScore)}`}>{posture.postureScore}</p>
              <p className="text-[10px] text-slate-600">/100</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="px-3 py-3">
              <p className="text-[10px] text-slate-500 uppercase">PQC Vulnerable</p>
              <p className={`text-2xl font-bold ${posture.pqcVulnerableCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {posture.pqcVulnerablePercent}%
              </p>
              <p className="text-[10px] text-slate-600">{posture.pqcVulnerableCount} of {posture.activeCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="px-3 py-3">
              <p className="text-[10px] text-slate-500 uppercase">Key Rotation</p>
              <p className={`text-2xl font-bold ${posture.keyRotationOverdue > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {posture.keyRotationOverdue}
              </p>
              <p className="text-[10px] text-slate-600">overdue</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="px-3 py-3">
              <p className="text-[10px] text-slate-500 uppercase">Certs Expiring</p>
              <p className={`text-2xl font-bold ${posture.certsExpiringSoon > 0 ? "text-amber-400" : "text-slate-400"}`}>
                {posture.certsExpiringSoon}
              </p>
              <p className="text-[10px] text-slate-600">within 90 days</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="px-3 py-3">
              <p className="text-[10px] text-slate-500 uppercase">Deprecated</p>
              <p className={`text-2xl font-bold ${posture.deprecatedCount > 0 ? "text-red-400" : "text-slate-400"}`}>
                {posture.deprecatedCount}
              </p>
              <p className="text-[10px] text-slate-600">algorithms</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* PQC Migration Pipeline */}
      {posture && posture.pqcVulnerableCount > 0 && (
        <Card className="bg-slate-900 border-slate-800 mb-6">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <ShieldAlert size={14} className="text-amber-400" />
              Post-Quantum Migration Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex gap-2">
              {["NOT_STARTED", "EVALUATING", "MIGRATION_PLANNED", "IN_PROGRESS", "COMPLETED"].map((s) => {
                const count = posture.pqcByStatus[s] ?? 0;
                return (
                  <div key={s} className="flex-1 text-center">
                    <div className={`text-lg font-bold ${count > 0 && s === "NOT_STARTED" ? "text-red-400" : count > 0 ? "text-slate-200" : "text-slate-700"}`}>
                      {count}
                    </div>
                    <div className={`h-1.5 rounded-full mt-1 ${count > 0 ? PQC_STATUS_COLORS[s]?.split(" ")[0]?.replace("text-", "bg-") ?? "bg-slate-700" : "bg-slate-800"}`} />
                    <p className="text-[9px] text-slate-500 mt-1">{PQC_STATUS_LABELS[s]}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory table */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-500 text-xs">Name</TableHead>
              <TableHead className="text-slate-500 text-xs">Type</TableHead>
              <TableHead className="text-slate-500 text-xs">Algorithm</TableHead>
              <TableHead className="text-slate-500 text-xs">Key</TableHead>
              <TableHead className="text-slate-500 text-xs">Asset</TableHead>
              <TableHead className="text-slate-500 text-xs">PQC</TableHead>
              <TableHead className="text-slate-500 text-xs">Status</TableHead>
              <TableHead className="text-slate-500 text-xs w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-slate-800">
                <TableCell colSpan={8} className="py-8 text-center text-slate-500">Loading...</TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow className="border-slate-800">
                <TableCell colSpan={8} className="py-12 text-center">
                  <Lock size={28} className="mx-auto text-blue-500 mb-2" />
                  <p className="text-slate-200 text-sm font-medium">No cryptographic mechanisms tracked</p>
                  <p className="text-slate-500 text-xs mt-1">Add your encryption, key management, and authentication mechanisms.</p>
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={e.id} className="border-slate-800 hover:bg-slate-800/40">
                  <TableCell className="py-2 text-sm text-slate-200 font-medium">{e.name}</TableCell>
                  <TableCell className="py-2">
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">{MECH_LABELS[e.mechanismType] ?? e.mechanismType}</Badge>
                  </TableCell>
                  <TableCell className="py-2 text-xs font-mono text-slate-300">{e.algorithm}</TableCell>
                  <TableCell className="py-2 text-xs text-slate-400">{e.keyLengthBits ? `${e.keyLengthBits}b` : "-"}</TableCell>
                  <TableCell className="py-2 text-xs text-slate-500">{e.assetId ? assetMap.get(e.assetId) ?? "-" : "-"}</TableCell>
                  <TableCell className="py-2">
                    {e.pqcVulnerable ? (
                      <Badge className={`text-[10px] px-1.5 py-0 border ${PQC_STATUS_COLORS[e.pqcMigrationStatus] ?? ""}`}>
                        {PQC_STATUS_LABELS[e.pqcMigrationStatus] ?? e.pqcMigrationStatus}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-emerald-400">PQC Safe</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge className={`text-[10px] px-1.5 py-0 border ${
                      e.status === "ACTIVE" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : e.status === "DEPRECATED" ? "text-red-400 bg-red-500/10 border-red-500/20"
                        : "text-slate-500 bg-slate-600/10 border-slate-600/20"
                    }`}>{e.status}</Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(e.id)}
                      className="h-6 w-6 p-0 text-slate-600 hover:text-red-400">
                      <Trash2 size={12} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Add Crypto Mechanism</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Name *</Label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. TT&C S-band Link Encryption"
                className="bg-slate-800 border-slate-700 text-slate-100" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Type</Label>
                <Select value={fType} onValueChange={setFType}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {Object.entries(MECH_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-slate-200 focus:bg-slate-700">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Algorithm *</Label>
                <Input value={fAlgo} onChange={(e) => setFAlgo(e.target.value)} placeholder="AES-256-GCM"
                  className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Key Length (bits)</Label>
                <Input type="number" value={fKeyLen} onChange={(e) => setFKeyLen(e.target.value)} placeholder="256"
                  className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Protocol</Label>
                <Input value={fProtocol} onChange={(e) => setFProtocol(e.target.value)} placeholder="SDLS"
                  className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Asset</Label>
              <Select value={fAsset || "none"} onValueChange={(v) => setFAsset(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 max-h-48">
                  <SelectItem value="none" className="text-slate-200 focus:bg-slate-700">None</SelectItem>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-slate-200 focus:bg-slate-700">{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={fPqcVuln} onChange={(e) => setFPqcVuln(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800 text-blue-500" />
                <span className="text-xs text-slate-300">PQC Vulnerable (RSA, ECC, DH)</span>
              </label>
            </div>
            {fPqcVuln && (
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">PQC Migration Status</Label>
                <Select value={fPqcStatus} onValueChange={setFPqcStatus}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {Object.entries(PQC_STATUS_LABELS).filter(([k]) => k !== "NOT_APPLICABLE").map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-slate-200 focus:bg-slate-700">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Rotation Interval (days)</Label>
                <Input type="number" value={fRotationDays} onChange={(e) => setFRotationDays(e.target.value)} placeholder="30"
                  className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Certificate Expiry</Label>
                <Input type="date" value={fCertExpiry} onChange={(e) => setFCertExpiry(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>
            </div>
            <Button onClick={handleAdd} disabled={submitting || !fName || !fAlgo}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white">
              {submitting ? "Adding..." : "Add Mechanism"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
