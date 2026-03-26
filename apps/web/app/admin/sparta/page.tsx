"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database,
  Upload,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileJson,
  Shield,
  ChevronRight,
  ArrowLeft,
  Link2,
  Search,
  Trash2,
  Settings,
} from "lucide-react";
import Link from "next/link";
import {
  getSpartaStatus,
  uploadSpartaBundle,
  fetchSpartaFromServer,
  getSpartaSettings,
  updateSpartaSettings,
  checkSpartaDuplicates,
} from "@/lib/api";
import type {
  SpartaImportDiff,
  SpartaStatusResponse,
  DuplicateCheckResult,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// DiffSummary - shows import results per category
// ---------------------------------------------------------------------------

function DiffSummary({ diff }: { diff: SpartaImportDiff }) {
  const categories = [
    { label: "Techniques", data: diff.techniques },
    { label: "Countermeasures", data: diff.countermeasures },
    { label: "Indicators", data: diff.indicators },
    { label: "Relationships", data: diff.relationships },
  ];

  return (
    <div className="space-y-3">
      {diff.version && (
        <p className="text-sm text-slate-400">
          SPARTA version: <span className="text-slate-200 font-medium">{diff.version}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {categories.map(({ label, data }) => (
          <div
            key={label}
            className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50"
          >
            <p className="text-xs font-medium text-slate-400 mb-2">{label}</p>
            <div className="flex items-center gap-3 text-sm">
              {data.added > 0 && (
                <span className="text-emerald-400">+{data.added}</span>
              )}
              {data.updated > 0 && (
                <span className="text-amber-400">{data.updated} updated</span>
              )}
              {data.unchanged > 0 && (
                <span className="text-slate-500">{data.unchanged} unchanged</span>
              )}
              {data.added === 0 && data.updated === 0 && data.unchanged === 0 && (
                <span className="text-slate-600">none</span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1">{data.total} total in bundle</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusCard - current SPARTA data state
// ---------------------------------------------------------------------------

function StatusCard({ status }: { status: SpartaStatusResponse }) {
  const statItems = [
    { label: "Attack Patterns", value: status.counts.attackPatterns },
    { label: "Countermeasures", value: status.counts.courseOfActions },
    { label: "Indicators", value: status.counts.indicators },
    { label: "Relationships", value: status.counts.relationships },
  ];

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 bg-blue-500/10 rounded-lg flex items-center justify-center">
          <Database size={18} className="text-blue-400" />
        </div>
        <div>
          <h2 className="text-slate-100 font-semibold">Current SPARTA Data</h2>
          <p className="text-xs text-slate-500">
            {status.version
              ? `Version ${status.version}`
              : "No data imported yet"}
            {status.lastImportedAt && (
              <>
                {" "}
                - Last updated{" "}
                {new Date(status.lastImportedAt).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            )}
          </p>
        </div>
      </div>

      {status.counts.total > 0 ? (
        <div className="grid grid-cols-4 gap-3">
          {statItems.map((item) => (
            <div
              key={item.label}
              className="bg-slate-800/50 rounded-lg p-3 text-center"
            >
              <p className="text-lg font-bold text-slate-100">
                {item.value.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-800/30 rounded-lg p-6 text-center">
          <Database size={32} className="mx-auto text-slate-700 mb-2" />
          <p className="text-sm text-slate-500">
            No SPARTA data imported yet. Upload a STIX bundle or fetch from the
            official server to get started.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImportHistory - recent import timeline
// ---------------------------------------------------------------------------

function ImportHistory({ imports }: { imports: SpartaStatusResponse["recentImports"] }) {
  if (imports.length === 0) return null;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <h2 className="text-slate-100 font-semibold mb-4 flex items-center gap-2">
        <Clock size={16} className="text-slate-500" />
        Import History
      </h2>
      <div className="space-y-3">
        {imports.map((imp) => {
          const totalChanges =
            imp.techniquesAdded +
            imp.techniquesUpdated +
            imp.countermeasuresAdded +
            imp.countermeasuresUpdated;
          return (
            <div
              key={imp.id}
              className="flex items-center gap-3 bg-slate-800/30 rounded-lg px-4 py-3"
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  imp.source === "SERVER_FETCH"
                    ? "bg-purple-500/10"
                    : "bg-blue-500/10"
                }`}
              >
                {imp.source === "SERVER_FETCH" ? (
                  <Download size={14} className="text-purple-400" />
                ) : (
                  <Upload size={14} className="text-blue-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300">
                  {imp.source === "SERVER_FETCH"
                    ? "Fetched from SPARTA server"
                    : "File upload"}
                  {imp.version && (
                    <span className="text-slate-500 ml-1">({imp.version})</span>
                  )}
                </p>
                <p className="text-xs text-slate-600">
                  {totalChanges > 0
                    ? `${totalChanges} change${totalChanges !== 1 ? "s" : ""}`
                    : "No changes"}
                </p>
              </div>
              <p className="text-xs text-slate-600 shrink-0">
                {new Date(imp.importedAt).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type Tab = "upload" | "fetch";

export default function SpartaAdminPage() {
  const [status, setStatus] = useState<SpartaStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("upload");

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<SpartaImportDiff | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch state
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<SpartaImportDiff | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Settings state
  const [spartaUrl, setSpartaUrl] = useState("");
  const [spartaUrlDraft, setSpartaUrlDraft] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlSaveMsg, setUrlSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Duplicate check state
  const [checking, setChecking] = useState(false);
  const [dupeResult, setDupeResult] = useState<DuplicateCheckResult | null>(null);
  const [dupeError, setDupeError] = useState<string | null>(null);

  // Load status + settings on mount
  const loadStatus = useCallback(async () => {
    try {
      const [s, settings] = await Promise.all([
        getSpartaStatus(),
        getSpartaSettings(),
      ]);
      setStatus(s);
      setSpartaUrl(settings.spartaUrl);
      setSpartaUrlDraft(settings.spartaUrl);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load SPARTA status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // File upload handler
  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadResult(null);
    setUploadError(null);
    try {
      const result = await uploadSpartaBundle(selectedFile);
      setUploadResult(result);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Refresh status
      loadStatus();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed"
      );
    } finally {
      setUploading(false);
    }
  };

  // Server fetch handler
  const handleFetch = async () => {
    setFetching(true);
    setFetchResult(null);
    setFetchError(null);
    try {
      const result = await fetchSpartaFromServer();
      setFetchResult(result);
      loadStatus();
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Fetch failed"
      );
    } finally {
      setFetching(false);
    }
  };

  // Drag and drop handlers
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".json")) {
      setSelectedFile(file);
      setUploadResult(null);
      setUploadError(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw size={24} className="animate-spin text-slate-500" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-400">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-300 transition-colors">
          Dashboard
        </Link>
        <ChevronRight size={14} />
        <span className="text-slate-300">Admin</span>
        <ChevronRight size={14} />
        <span className="text-slate-300">SPARTA Data</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
            <Shield size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              SPARTA Data Management
            </h1>
            <p className="text-sm text-slate-500">
              Import and manage SPARTA threat intelligence data
            </p>
          </div>
        </div>
        <Link
          href="/intel"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Threat Intel
        </Link>
      </div>

      {/* Status Card */}
      {status && <StatusCard status={status} />}

      {/* Import Section */}
      <div className="bg-slate-900 rounded-xl border border-slate-800">
        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "upload"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            <Upload size={15} />
            Upload File
          </button>
          <button
            onClick={() => setActiveTab("fetch")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "fetch"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            <Download size={15} />
            Fetch from Server
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Upload a STIX 2.1 JSON bundle exported from{" "}
                <span className="text-slate-300">sparta.aerospace.org</span>.
                The import pipeline will compare against existing data and show
                a diff summary.
              </p>

              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  dragOver
                    ? "border-blue-400 bg-blue-500/5"
                    : "border-slate-700 hover:border-slate-600"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                      setUploadResult(null);
                      setUploadError(null);
                    }
                  }}
                />
                <FileJson
                  size={36}
                  className={`mx-auto mb-3 ${
                    dragOver ? "text-blue-400" : "text-slate-600"
                  }`}
                />
                {selectedFile ? (
                  <div>
                    <p className="text-sm text-slate-200 font-medium">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-slate-400">
                      Drag and drop a STIX JSON file here, or click to browse
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      Accepts .json files up to 20 MB
                    </p>
                  </div>
                )}
              </div>

              {/* Upload button */}
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <Upload size={15} />
                )}
                {uploading ? "Importing..." : "Import STIX Bundle"}
              </button>

              {/* Upload result */}
              {uploadResult && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    <p className="text-sm font-medium text-emerald-400">
                      Import successful
                    </p>
                  </div>
                  <DiffSummary diff={uploadResult} />
                </div>
              )}

              {/* Upload error */}
              {uploadError && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-start gap-2">
                  <AlertCircle
                    size={16}
                    className="text-red-400 mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-red-400">
                      Import failed
                    </p>
                    <p className="text-sm text-red-400/70 mt-1">
                      {uploadError}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "fetch" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Fetch the latest STIX 2.1 bundle directly from the official
                SPARTA server at{" "}
                <code className="text-xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                  sparta.aerospace.org
                </code>
                . The server request is made from the SpaceGuard backend, not
                your browser.
              </p>

              <button
                onClick={handleFetch}
                disabled={fetching}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {fetching ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                {fetching ? "Fetching..." : "Fetch Latest from SPARTA"}
              </button>

              {/* Fetch result */}
              {fetchResult && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    <p className="text-sm font-medium text-emerald-400">
                      Fetch and import successful
                    </p>
                  </div>
                  <DiffSummary diff={fetchResult} />
                </div>
              )}

              {/* Fetch error */}
              {fetchError && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-start gap-2">
                  <AlertCircle
                    size={16}
                    className="text-red-400 mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-red-400">
                      Fetch failed
                    </p>
                    <p className="text-sm text-red-400/70 mt-1">
                      {fetchError}
                    </p>
                    <p className="text-xs text-slate-600 mt-2">
                      The SPARTA server may be temporarily unavailable. Try
                      again later or upload a file manually.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center">
            <Settings size={18} className="text-slate-400" />
          </div>
          <div>
            <h2 className="text-slate-100 font-semibold">Settings</h2>
            <p className="text-xs text-slate-500">
              Configure the SPARTA data source URL
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-slate-400 mb-1.5 block">
              SPARTA STIX Download URL
            </span>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
                />
                <input
                  type="url"
                  value={spartaUrlDraft}
                  onChange={(e) => {
                    setSpartaUrlDraft(e.target.value);
                    setUrlSaveMsg(null);
                  }}
                  placeholder="https://sparta.aerospace.org/download/STIX?f=latest"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={async () => {
                  setSavingUrl(true);
                  setUrlSaveMsg(null);
                  try {
                    const result = await updateSpartaSettings(spartaUrlDraft.trim());
                    setSpartaUrl(result.spartaUrl);
                    setSpartaUrlDraft(result.spartaUrl);
                    setUrlSaveMsg({ ok: true, text: "URL saved" });
                  } catch (err) {
                    setUrlSaveMsg({
                      ok: false,
                      text: err instanceof Error ? err.message : "Failed to save",
                    });
                  } finally {
                    setSavingUrl(false);
                  }
                }}
                disabled={savingUrl || spartaUrlDraft.trim() === spartaUrl}
                className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {savingUrl ? "Saving..." : "Save"}
              </button>
              {spartaUrlDraft !== "https://sparta.aerospace.org/download/STIX?f=latest" && (
                <button
                  onClick={() => {
                    setSpartaUrlDraft("https://sparta.aerospace.org/download/STIX?f=latest");
                    setUrlSaveMsg(null);
                  }}
                  className="px-3 py-2.5 rounded-lg bg-slate-800 text-slate-400 text-sm hover:text-slate-200 hover:bg-slate-700 transition-colors shrink-0"
                  title="Reset to default URL"
                >
                  Reset
                </button>
              )}
            </div>
          </label>
          {urlSaveMsg && (
            <p
              className={`text-xs ${
                urlSaveMsg.ok ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {urlSaveMsg.text}
            </p>
          )}
          <p className="text-xs text-slate-600">
            This URL is used when fetching data via the &quot;Fetch from Server&quot; button above.
          </p>
        </div>
      </div>

      {/* Maintenance - Duplicate Check */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center">
            <Search size={18} className="text-slate-400" />
          </div>
          <div>
            <h2 className="text-slate-100 font-semibold">Maintenance</h2>
            <p className="text-xs text-slate-500">
              Check for and clean up duplicate STIX records
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setChecking(true);
                setDupeResult(null);
                setDupeError(null);
                try {
                  const result = await checkSpartaDuplicates(false);
                  setDupeResult(result);
                } catch (err) {
                  setDupeError(
                    err instanceof Error ? err.message : "Check failed"
                  );
                } finally {
                  setChecking(false);
                }
              }}
              disabled={checking}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {checking ? (
                <RefreshCw size={15} className="animate-spin" />
              ) : (
                <Search size={15} />
              )}
              Check for Duplicates
            </button>

            {dupeResult && dupeResult.duplicateGroups > 0 && !dupeResult.cleaned && (
              <button
                onClick={async () => {
                  setChecking(true);
                  setDupeError(null);
                  try {
                    const result = await checkSpartaDuplicates(true);
                    setDupeResult(result);
                    // Refresh status after cleanup
                    loadStatus();
                  } catch (err) {
                    setDupeError(
                      err instanceof Error ? err.message : "Cleanup failed"
                    );
                  } finally {
                    setChecking(false);
                  }
                }}
                disabled={checking}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 size={15} />
                Clean Up Duplicates
              </button>
            )}
          </div>

          {dupeResult && (
            <div
              className={`rounded-xl p-4 border ${
                dupeResult.duplicateGroups === 0
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : dupeResult.cleaned
                    ? "bg-blue-500/5 border-blue-500/20"
                    : "bg-amber-500/5 border-amber-500/20"
              }`}
            >
              {dupeResult.duplicateGroups === 0 && !dupeResult.cleaned && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <p className="text-sm text-emerald-400">
                    No duplicates found. {dupeResult.totalRecords.toLocaleString()} records are clean.
                  </p>
                </div>
              )}
              {dupeResult.duplicateGroups > 0 && !dupeResult.cleaned && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={16} className="text-amber-400" />
                    <p className="text-sm font-medium text-amber-400">
                      Found {dupeResult.duplicateGroups} duplicate group{dupeResult.duplicateGroups !== 1 ? "s" : ""} ({dupeResult.duplicateRows} extra row{dupeResult.duplicateRows !== 1 ? "s" : ""})
                    </p>
                  </div>
                  <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                    {dupeResult.details.map((d) => (
                      <div
                        key={d.stixId}
                        className="flex items-center justify-between text-xs bg-slate-800/50 rounded px-3 py-1.5"
                      >
                        <code className="text-slate-400 truncate mr-3">{d.stixId}</code>
                        <span className="text-amber-400 shrink-0">{d.count} copies</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Click &quot;Clean Up Duplicates&quot; to remove extra rows, keeping the most recently updated copy of each.
                  </p>
                </div>
              )}
              {dupeResult.cleaned && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-blue-400" />
                  <p className="text-sm text-blue-400">
                    Cleaned up {dupeResult.deletedCount} duplicate row{dupeResult.deletedCount !== 1 ? "s" : ""}. Database is now clean.
                  </p>
                </div>
              )}
            </div>
          )}

          {dupeError && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-400">{dupeError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Import History */}
      {status && <ImportHistory imports={status.recentImports} />}
    </div>
  );
}
