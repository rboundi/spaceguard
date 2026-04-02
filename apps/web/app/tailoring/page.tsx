"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Crosshair,
  Plus,
  ChevronRight,
  ChevronLeft,
  Shield,
  Satellite,
  Radio,
  Server,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { AssetResponse } from "@spaceguard/shared";
import {
  getTailoringProfiles,
  createTailoringProfile,
  generateTailoredBaseline,
  deleteTailoringProfile,
  getAssets,
  type ThreatProfileResponse,
  type TailoredBaselineResponse,
} from "@/lib/api";
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
// Config
// ---------------------------------------------------------------------------

const MISSION_TYPES = [
  { value: "EARTH_OBSERVATION", label: "Earth Observation", icon: "🛰" },
  { value: "COMMUNICATIONS", label: "Communications", icon: "📡" },
  { value: "NAVIGATION", label: "Navigation", icon: "🧭" },
  { value: "IOT", label: "IoT", icon: "📶" },
  { value: "SSA", label: "Space Situational Awareness", icon: "🔭" },
  { value: "SCIENCE", label: "Science", icon: "🔬" },
  { value: "DEFENSE", label: "Defense", icon: "🛡" },
  { value: "OTHER", label: "Other", icon: "🚀" },
];

const ORBIT_REGIMES = [
  { value: "LEO", label: "LEO (Low Earth Orbit)" },
  { value: "MEO", label: "MEO (Medium Earth Orbit)" },
  { value: "GEO", label: "GEO (Geostationary)" },
  { value: "HEO", label: "HEO (Highly Elliptical)" },
  { value: "SSO", label: "SSO (Sun-Synchronous)" },
  { value: "CISLUNAR", label: "Cislunar" },
  { value: "GROUND_ONLY", label: "Ground Only" },
];

const ADVERSARY_LEVELS = [
  { value: "OPPORTUNISTIC", label: "Opportunistic", desc: "Script kiddies, automated scanners. Low sophistication.", color: "text-slate-400" },
  { value: "ORGANIZED_CRIME", label: "Organized Crime", desc: "Ransomware groups, financially motivated. Medium sophistication.", color: "text-amber-400" },
  { value: "NATION_STATE_TIER2", label: "Nation-State (Tier 2)", desc: "Regional state actors with moderate space capabilities.", color: "text-orange-400" },
  { value: "NATION_STATE_TIER1", label: "Nation-State (Tier 1)", desc: "Advanced persistent threats with dedicated space programs.", color: "text-red-400" },
];

const ADV_BADGE: Record<string, string> = {
  OPPORTUNISTIC: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  ORGANIZED_CRIME: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  NATION_STATE_TIER2: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  NATION_STATE_TIER1: "text-red-400 bg-red-500/10 border-red-500/20",
};

// ---------------------------------------------------------------------------
// Toggle switch component
// ---------------------------------------------------------------------------

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-slate-700"}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <span className="text-xs text-slate-300">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TailoringPage() {
  const router = useRouter();
  const { orgId, loading: orgLoading } = useOrg();
  const [profiles, setProfiles] = useState<ThreatProfileResponse[]>([]);
  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  // Wizard state
  const [step, setStep] = useState(1);
  const [wName, setWName] = useState("");
  const [wAsset, setWAsset] = useState("");
  const [wMission, setWMission] = useState("EARTH_OBSERVATION");
  const [wOrbit, setWOrbit] = useState("LEO");
  const [wAdversary, setWAdversary] = useState("ORGANIZED_CRIME");
  const [wCrypto, setWCrypto] = useState(true);
  const [wFirmware, setWFirmware] = useState(false);
  const [wISL, setWISL] = useState(false);
  const [wAutonomous, setWAutonomous] = useState(true);
  const [wStorage, setWStorage] = useState(true);
  const [wProcessing, setWProcessing] = useState("MEDIUM");
  const [wSharedGS, setWSharedGS] = useState(true);
  const [wCloud, setWCloud] = useState(false);
  const [wSOC, setWSOC] = useState(false);
  const [wStaff, setWStaff] = useState("25");
  const [wSubmitting, setWSubmitting] = useState(false);
  const [wError, setWError] = useState<string | null>(null);
  const [wResult, setWResult] = useState<TailoredBaselineResponse | null>(null);

  // Result view
  const [viewResult, setViewResult] = useState<TailoredBaselineResponse | null>(null);
  const [viewProfile, setViewProfile] = useState<ThreatProfileResponse | null>(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [profileData, assetData] = await Promise.all([
        getTailoringProfiles(orgId),
        getAssets({ organizationId: orgId, topLevelOnly: true, perPage: 100 }),
      ]);
      setProfiles(profileData.data);
      setAssets(assetData.data);
    } catch { /* */ }
  }, [orgId]);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [orgId, orgLoading, loadData]);

  // ---------------------------------------------------------------------------
  // Wizard handlers
  // ---------------------------------------------------------------------------

  function resetWizard() {
    setStep(1);
    setWName("");
    setWAsset("");
    setWMission("EARTH_OBSERVATION");
    setWOrbit("LEO");
    setWAdversary("ORGANIZED_CRIME");
    setWCrypto(true);
    setWFirmware(false);
    setWISL(false);
    setWAutonomous(true);
    setWStorage(true);
    setWProcessing("MEDIUM");
    setWSharedGS(true);
    setWCloud(false);
    setWSOC(false);
    setWStaff("25");
    setWSubmitting(false);
    setWError(null);
    setWResult(null);
  }

  async function handleGenerate() {
    if (!orgId || !wName.trim()) return;
    setWSubmitting(true);
    setWError(null);
    try {
      const profile = await createTailoringProfile({
        organizationId: orgId,
        assetId: wAsset || null,
        name: wName.trim(),
        missionType: wMission,
        orbitRegime: wOrbit,
        adversaryCapability: wAdversary,
        spacecraftConstraints: {
          has_crypto_capability: wCrypto,
          supports_firmware_update: wFirmware,
          has_inter_satellite_links: wISL,
          supports_autonomous_operations: wAutonomous,
          has_onboard_storage: wStorage,
          processing_power: wProcessing,
        },
        groundSegmentProfile: {
          uses_shared_ground_stations: wSharedGS,
          cloud_hosted_operations: wCloud,
          has_dedicated_soc: wSOC,
          staff_count: parseInt(wStaff) || 25,
        },
      });
      await generateTailoredBaseline(profile.id);
      setWizardOpen(false);
      resetWizard();
      router.push(`/tailoring/${profile.id}`);
    } catch (err) {
      setWError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setWSubmitting(false);
    }
  }

  async function handleRegenerate(profileId: string) {
    setGenerating(profileId);
    try {
      await generateTailoredBaseline(profileId);
      loadData();
    } catch { /* */ }
    setGenerating(null);
  }

  async function handleDelete(profileId: string) {
    try {
      await deleteTailoringProfile(profileId);
      loadData();
    } catch { /* */ }
  }

  function openResults(profile: ThreatProfileResponse) {
    if (profile.generatedBaseline) {
      router.push(`/tailoring/${profile.id}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">SPARTA Control Tailoring</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Generate threat-informed security baselines per TOR-2023-02161
          </p>
        </div>
        <Button
          onClick={() => { resetWizard(); setWizardOpen(true); }}
          className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5"
        >
          <Plus size={15} />
          New Profile
        </Button>
      </div>

      {/* Profile list */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading profiles...</div>
      ) : profiles.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="py-12 text-center">
            <Crosshair size={32} className="mx-auto text-blue-500 mb-3" />
            <p className="text-slate-200 font-medium">No threat profiles yet</p>
            <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
              Create a mission profile to generate a tailored security baseline
              from SPARTA threat intelligence.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {profiles.map((p) => {
            const bl = p.generatedBaseline as unknown as TailoredBaselineResponse | null;
            return (
              <Card
                key={p.id}
                className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
                onClick={() => openResults(p)}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold text-slate-200">{p.name}</CardTitle>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleRegenerate(p.id); }}
                        className="h-6 w-6 p-0 text-slate-500 hover:text-slate-300"
                        disabled={generating === p.id}
                      >
                        {generating === p.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                        className="h-6 w-6 p-0 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">
                      {MISSION_TYPES.find((m) => m.value === p.missionType)?.label ?? p.missionType}
                    </Badge>
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">{p.orbitRegime}</Badge>
                    <Badge className={`text-[10px] px-1.5 py-0 border ${ADV_BADGE[p.adversaryCapability] ?? ""}`}>
                      {ADVERSARY_LEVELS.find((a) => a.value === p.adversaryCapability)?.label ?? p.adversaryCapability}
                    </Badge>
                  </div>
                  {bl ? (
                    <p className="text-[11px] text-slate-500">
                      {bl.techniqueCount?.applicable} applicable techniques, {bl.controlBaseline?.total} controls in baseline
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-600">Not yet generated</p>
                  )}
                  {p.generatedAt && (
                    <p className="text-[10px] text-slate-600 mt-1">
                      Generated {new Date(p.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Results view */}
      {viewResult && viewProfile && (
        <Card className="bg-slate-900 border-slate-800 mb-6">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-200">
                Baseline Results: {viewProfile.name}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setViewResult(null); setViewProfile(null); }}
                className="text-slate-500 hover:text-slate-300 text-xs">Close</Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-md bg-slate-800 px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase">Techniques</p>
                <p className="text-lg font-bold text-slate-200">{viewResult.techniqueCount?.applicable}</p>
                <p className="text-[10px] text-slate-600">{viewResult.techniqueCount?.highRelevance} high relevance</p>
              </div>
              <div className="rounded-md bg-slate-800 px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase">Countermeasures</p>
                <p className="text-lg font-bold text-slate-200">{viewResult.countermeasures?.length}</p>
              </div>
              <div className="rounded-md bg-slate-800 px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase">NIST Controls</p>
                <p className="text-lg font-bold text-blue-400">{viewResult.controlBaseline?.total}</p>
                <p className="text-[10px] text-slate-600">{viewResult.controlBaseline?.newGaps} gaps</p>
              </div>
              <div className="rounded-md bg-slate-800 px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase">Compliant</p>
                <p className="text-lg font-bold text-emerald-400">{viewResult.controlBaseline?.alreadyCompliant}</p>
              </div>
            </div>
            {viewResult.recommendations && viewResult.recommendations.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">Top Recommendations</p>
                <div className="space-y-2">
                  {viewResult.recommendations.slice(0, 5).map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-blue-400 font-bold shrink-0">#{r.priority}</span>
                      <span className="text-slate-300 flex-1">{r.action}</span>
                      <Badge className={`text-[9px] px-1 py-0 border shrink-0 ${
                        r.effort === "HIGH" ? "text-red-400 bg-red-500/10 border-red-500/20"
                          : r.effort === "MEDIUM" ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                          : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                      }`}>{r.effort}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {wResult ? "Baseline Generated" : `Create Threat Profile (Step ${step}/5)`}
            </DialogTitle>
          </DialogHeader>

          {wResult ? (
            /* Results screen */
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 size={20} />
                <span className="text-sm font-medium">Tailored baseline generated successfully</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-slate-800 px-3 py-2 text-center">
                  <p className="text-2xl font-bold text-slate-200">{wResult.techniqueCount?.applicable}</p>
                  <p className="text-[10px] text-slate-500">Applicable Techniques</p>
                </div>
                <div className="rounded-md bg-slate-800 px-3 py-2 text-center">
                  <p className="text-2xl font-bold text-blue-400">{wResult.controlBaseline?.total}</p>
                  <p className="text-[10px] text-slate-500">NIST Controls</p>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                {wResult.countermeasures?.length} countermeasures mapped,{" "}
                {wResult.recommendations?.length} prioritized recommendations generated.
              </p>
              <Button onClick={() => { setWizardOpen(false); resetWizard(); }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white">
                View Results
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Step indicators */}
              <div className="flex gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <div key={s} className={`flex-1 h-1 rounded-full ${s <= step ? "bg-blue-500" : "bg-slate-700"}`} />
                ))}
              </div>

              {wError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{wError}</div>
              )}

              {/* Step 1: Mission Identity */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Satellite size={14} /> Mission Identity
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs">Profile Name *</Label>
                    <Input value={wName} onChange={(e) => setWName(e.target.value)}
                      placeholder="e.g. Proba-EO-1 Mission Profile"
                      className="bg-slate-800 border-slate-700 text-slate-100" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs">Linked Asset (optional)</Label>
                    <Select value={wAsset || "none"} onValueChange={(v) => setWAsset(v === "none" ? "" : v)}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                        <SelectValue placeholder="No specific asset" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 max-h-48">
                        <SelectItem value="none" className="text-slate-200 focus:bg-slate-700">No specific asset</SelectItem>
                        {assets.map((a) => (
                          <SelectItem key={a.id} value={a.id} className="text-slate-200 focus:bg-slate-700">{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs">Mission Type</Label>
                    <Select value={wMission} onValueChange={setWMission}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {MISSION_TYPES.map((m) => (
                          <SelectItem key={m.value} value={m.value} className="text-slate-200 focus:bg-slate-700">
                            {m.icon} {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs">Orbit Regime</Label>
                    <Select value={wOrbit} onValueChange={setWOrbit}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {ORBIT_REGIMES.map((o) => (
                          <SelectItem key={o.value} value={o.value} className="text-slate-200 focus:bg-slate-700">{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Step 2: Threat Landscape */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Shield size={14} /> Threat Landscape
                  </div>
                  <p className="text-xs text-slate-500">Select the adversary capability level that best matches your threat model.</p>
                  <div className="space-y-2">
                    {ADVERSARY_LEVELS.map((a) => (
                      <div
                        key={a.value}
                        onClick={() => setWAdversary(a.value)}
                        className={`rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                          wAdversary === a.value
                            ? "border-blue-500/50 bg-blue-500/10"
                            : "border-slate-700 hover:border-slate-600"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${wAdversary === a.value ? "bg-blue-500" : "bg-slate-600"}`} />
                          <span className={`text-sm font-medium ${a.color}`}>{a.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 ml-4">{a.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Spacecraft Constraints */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Radio size={14} /> Spacecraft Constraints
                  </div>
                  <p className="text-xs text-slate-500">These constraints determine which countermeasures are feasible for your spacecraft.</p>
                  <div className="space-y-3">
                    <Toggle checked={wCrypto} onChange={setWCrypto} label="On-board cryptographic capability" />
                    <Toggle checked={wFirmware} onChange={setWFirmware} label="Supports firmware updates" />
                    <Toggle checked={wISL} onChange={setWISL} label="Inter-satellite links" />
                    <Toggle checked={wAutonomous} onChange={setWAutonomous} label="Supports autonomous operations" />
                    <Toggle checked={wStorage} onChange={setWStorage} label="Has on-board data storage" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs">Processing Power</Label>
                    <Select value={wProcessing} onValueChange={setWProcessing}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="LOW" className="text-slate-200 focus:bg-slate-700">Low (CubeSat / legacy)</SelectItem>
                        <SelectItem value="MEDIUM" className="text-slate-200 focus:bg-slate-700">Medium (GR740 class)</SelectItem>
                        <SelectItem value="HIGH" className="text-slate-200 focus:bg-slate-700">High (modern SBC)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Step 4: Ground Segment */}
              {step === 4 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Server size={14} /> Ground Segment Profile
                  </div>
                  <div className="space-y-3">
                    <Toggle checked={wSharedGS} onChange={setWSharedGS} label="Uses shared ground station network (e.g. KSAT, SSC)" />
                    <Toggle checked={wCloud} onChange={setWCloud} label="Cloud-hosted mission operations" />
                    <Toggle checked={wSOC} onChange={setWSOC} label="Has dedicated Security Operations Center" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs">Operations Staff Count</Label>
                    <Input type="number" value={wStaff} onChange={(e) => setWStaff(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-slate-100 w-32" />
                  </div>
                </div>
              )}

              {/* Step 5: Review & Generate */}
              {step === 5 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">Review your profile and generate the tailored baseline.</p>
                  <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Name</span><span className="text-slate-200">{wName || "-"}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Mission</span><span className="text-slate-200">{MISSION_TYPES.find(m => m.value === wMission)?.label}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Orbit</span><span className="text-slate-200">{wOrbit}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Adversary</span><span className="text-slate-200">{ADVERSARY_LEVELS.find(a => a.value === wAdversary)?.label}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Crypto</span><span className="text-slate-200">{wCrypto ? "Yes" : "No"}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Firmware Update</span><span className="text-slate-200">{wFirmware ? "Yes" : "No"}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Processing</span><span className="text-slate-200">{wProcessing}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Shared Ground</span><span className="text-slate-200">{wSharedGS ? "Yes" : "No"}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Dedicated SOC</span><span className="text-slate-200">{wSOC ? "Yes" : "No"}</span></div>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex gap-2 pt-2">
                {step > 1 && (
                  <Button variant="outline" onClick={() => setStep(step - 1)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-1">
                    <ChevronLeft size={14} /> Back
                  </Button>
                )}
                <div className="flex-1" />
                {step < 5 ? (
                  <Button onClick={() => setStep(step + 1)}
                    disabled={step === 1 && !wName.trim()}
                    className="bg-blue-600 hover:bg-blue-500 text-white gap-1">
                    Next <ChevronRight size={14} />
                  </Button>
                ) : (
                  <Button onClick={handleGenerate} disabled={wSubmitting || !wName.trim()}
                    className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5">
                    {wSubmitting ? (
                      <><Loader2 size={14} className="animate-spin" /> Generating...</>
                    ) : (
                      <><Crosshair size={14} /> Generate Baseline</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
