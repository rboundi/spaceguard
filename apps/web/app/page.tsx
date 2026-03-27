"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  getDashboard,
  getAlerts,
  getAlertStats,
  getIncidents,
  getTelemetryStreams,
  getDetectionRules,
  getAnomalyBaselines,
  getAnomalyStats,
  getOrgRisk,
  getDashboardLayout,
  saveDashboardLayout,
  resetDashboardLayout,
  type OrgRiskApi,
  type AlertResponse,
  type AlertStats,
  type IncidentResponse,
  type BaselineResponse,
  type AnomalyStatsResponse,
  type WidgetConfigApi,
} from "@/lib/api";
import type { StreamResponse, DashboardResponse } from "@spaceguard/shared";
import { useOrg } from "@/lib/context";
import { useAuth } from "@/lib/auth-context";
import {
  Rocket,
  Satellite,
  ShieldCheck,
  Link2,
  Waves,
  CheckCircle2,
  ArrowRight,
  Settings2,
  Save,
  RotateCcw,
  X,
  Plus,
  GripVertical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/components/dashboard/widget-types";
import { WIDGET_CATALOG } from "@/components/dashboard/widget-types";
import { WIDGET_COMPONENTS } from "@/components/dashboard/widget-registry";

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-800 ${className}`} aria-hidden="true" />;
}

function MetricCardSkeleton() {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="px-4 py-4">
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-28" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Setup prompt (no org)
// ---------------------------------------------------------------------------

function SetupPrompt() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
      <div className="text-5xl">&#x1F6F0;&#xFE0F;</div>
      <h2 className="text-xl font-semibold text-slate-200">Welcome to SpaceGuard</h2>
      <p className="text-slate-400 text-sm text-center max-w-sm">
        Set up your organization to start tracking NIS2 and ENISA compliance for your space infrastructure.
      </p>
      <Link
        href="/onboarding"
        className="mt-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
      >
        Get started
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Getting Started cards (shown when data is sparse)
// ---------------------------------------------------------------------------

function GettingStartedCards({ assetCount, streamCount, complianceScore }: {
  assetCount: number; streamCount: number; complianceScore: number;
}) {
  const cards = [
    { done: assetCount >= 1, icon: <Satellite size={18} />, title: "Register your satellites", desc: "Add your space assets to the registry for compliance tracking and threat monitoring.", href: "/assets", cta: "Add assets" },
    { done: streamCount >= 1, icon: <Waves size={18} />, title: "Connect telemetry", desc: "Set up a telemetry stream to start ingesting housekeeping data from your spacecraft.", href: "/telemetry", cta: "Configure stream" },
    { done: complianceScore > 0, icon: <ShieldCheck size={18} />, title: "Complete compliance assessments", desc: "Work through NIS2 and ENISA requirements to improve your compliance posture.", href: "/compliance", cta: "Open mapper" },
    { done: false, icon: <Link2 size={18} />, title: "Map your supply chain", desc: "Register suppliers and track third-party risk for NIS2 Article 21(2)(d) compliance.", href: "/supply-chain", cta: "Add suppliers" },
  ];

  const pendingCards = cards.filter((c) => !c.done);
  if (pendingCards.length === 0) return null;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-blue-400" />
          <CardTitle className="text-sm font-semibold text-slate-200">Getting Started</CardTitle>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">Complete these steps to get the most out of SpaceGuard</p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`group rounded-lg border p-3 transition-colors ${
                card.done
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-slate-700/50 bg-slate-800/30 hover:border-blue-500/30 hover:bg-blue-500/5"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={card.done ? "text-emerald-400" : "text-slate-500 group-hover:text-blue-400"}>
                  {card.done ? <CheckCircle2 size={18} /> : card.icon}
                </span>
                <span className={`text-xs font-medium ${card.done ? "text-emerald-400" : "text-slate-300 group-hover:text-blue-400"} transition-colors`}>
                  {card.title}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mb-2">{card.desc}</p>
              {!card.done && (
                <span className="text-[10px] font-medium text-blue-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {card.cta} <ArrowRight size={10} />
                </span>
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Widget Add Panel
// ---------------------------------------------------------------------------

function AddWidgetPanel({ activeWidgetIds, onAdd, onClose }: {
  activeWidgetIds: Set<string>;
  onAdd: (widgetId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-slate-900 border-l border-slate-700 z-50 shadow-2xl overflow-auto">
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">Add Widget</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
          <X size={16} />
        </button>
      </div>
      <div className="p-4 space-y-2">
        {WIDGET_CATALOG.map((w) => {
          const isActive = activeWidgetIds.has(w.id);
          return (
            <button
              key={w.id}
              disabled={isActive}
              onClick={() => onAdd(w.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                isActive
                  ? "border-slate-700/30 bg-slate-800/20 opacity-50 cursor-not-allowed"
                  : "border-slate-700/50 bg-slate-800/30 hover:border-blue-500/30 hover:bg-blue-500/5 cursor-pointer"
              }`}
            >
              <p className="text-xs font-medium text-slate-200">{w.label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{w.description}</p>
              {isActive && (
                <span className="text-[9px] text-slate-600 mt-1 inline-block">Already on dashboard</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid constants
// ---------------------------------------------------------------------------

const GRID_COLS = 8;

// Compute CSS grid row placement from widget config.
// Widgets are rendered in a CSS grid, positions mapped to grid-row/col.
function widgetGridStyle(w: WidgetConfigApi): React.CSSProperties {
  return {
    gridColumn: `${w.position.col + 1} / span ${w.size.w}`,
    gridRow: `${w.position.row + 1} / span ${w.size.h}`,
  };
}

// ---------------------------------------------------------------------------
// Main dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { orgId, orgName, loading: orgLoading } = useOrg();
  const { user } = useAuth();

  // Dashboard data states
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<AlertResponse[]>([]);
  const [incidents, setIncidents] = useState<IncidentResponse[]>([]);
  const [streams, setStreams] = useState<StreamResponse[]>([]);
  const [rulesCount, setRulesCount] = useState(0);
  const [aiData, setAiData] = useState<Map<string, { baselines: BaselineResponse[]; stats: AnomalyStatsResponse | null }>>(new Map());
  const [orgRisk, setOrgRisk] = useState<OrgRiskApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layout states
  const [layout, setLayout] = useState<WidgetConfigApi[]>([]);
  const [savedLayout, setSavedLayout] = useState<WidgetConfigApi[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const dragItem = useRef<string | null>(null);

  // Load dashboard layout
  useEffect(() => {
    if (!user) return;
    getDashboardLayout()
      .then((res) => {
        setLayout(res.layout);
        setSavedLayout(res.layout);
        setLayoutLoaded(true);
      })
      .catch(() => {
        // Use default if endpoint doesn't exist yet
        const { DEFAULT_LAYOUT } = require("@/components/dashboard/widget-types") as { DEFAULT_LAYOUT?: WidgetConfigApi[] };
        // Fallback inline
        const fallback: WidgetConfigApi[] = [
          { widget_id: "compliance_score", position: { row: 0, col: 0 }, size: { w: 2, h: 1 }, config: {} },
          { widget_id: "active_alerts", position: { row: 0, col: 2 }, size: { w: 2, h: 1 }, config: {} },
          { widget_id: "risk_gauge", position: { row: 0, col: 4 }, size: { w: 2, h: 1 }, config: {} },
          { widget_id: "asset_overview", position: { row: 0, col: 6 }, size: { w: 2, h: 1 }, config: {} },
          { widget_id: "recent_alerts", position: { row: 1, col: 0 }, size: { w: 5, h: 2 }, config: {} },
          { widget_id: "nis2_deadlines", position: { row: 1, col: 5 }, size: { w: 3, h: 2 }, config: {} },
          { widget_id: "compliance_by_category", position: { row: 3, col: 0 }, size: { w: 5, h: 2 }, config: {} },
          { widget_id: "telemetry_health", position: { row: 3, col: 5 }, size: { w: 3, h: 2 }, config: {} },
          { widget_id: "gap_analysis", position: { row: 5, col: 0 }, size: { w: 8, h: 2 }, config: {} },
          { widget_id: "incident_timeline", position: { row: 7, col: 0 }, size: { w: 4, h: 2 }, config: {} },
          { widget_id: "sparta_coverage", position: { row: 7, col: 4 }, size: { w: 4, h: 2 }, config: {} },
          { widget_id: "alert_trend", position: { row: 9, col: 0 }, size: { w: 8, h: 2 }, config: {} },
        ];
        setLayout(DEFAULT_LAYOUT ?? fallback);
        setSavedLayout(DEFAULT_LAYOUT ?? fallback);
        setLayoutLoaded(true);
      });
  }, [user]);

  // Load dashboard data
  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setLoading(false);
      setDashboard(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [dash, stats, recent, inc, str, rulesRes] = await Promise.all([
          getDashboard(orgId!),
          getAlertStats(orgId!).catch(() => null),
          getAlerts({ organizationId: orgId!, perPage: 8 }).catch(() => ({ data: [], total: 0 })),
          getIncidents({ organizationId: orgId!, perPage: 20 }).catch(() => ({ data: [], total: 0 })),
          getTelemetryStreams(orgId!).catch(() => ({ data: [], total: 0 })),
          getDetectionRules().catch(() => ({ rules: [], total: 0 })),
        ]);
        if (cancelled) return;
        setDashboard(dash);
        setAlertStats(stats);
        setRecentAlerts(recent.data);
        setIncidents(inc.data);
        setStreams(str.data);
        setRulesCount(rulesRes.total);

        // Non-blocking risk fetch
        getOrgRisk(orgId!).then((r) => { if (!cancelled) setOrgRisk(r); }).catch(() => {});

        // Non-blocking anomaly data
        const activeStreams = str.data.filter((s) => s.status === "ACTIVE").slice(0, 10);
        if (activeStreams.length > 0) {
          const aiResults = await Promise.all(
            activeStreams.map(async (s) => {
              const [bl, st] = await Promise.all([
                getAnomalyBaselines(s.id).catch(() => ({ data: [] as BaselineResponse[], total: 0 })),
                getAnomalyStats(s.id).catch(() => null),
              ]);
              return { streamId: s.id, baselines: bl.data, stats: st };
            }),
          ).catch(() => []);
          if (!cancelled) {
            const map = new Map<string, { baselines: BaselineResponse[]; stats: AnomalyStatsResponse | null }>();
            for (const r of aiResults) {
              map.set(r.streamId, { baselines: r.baselines, stats: r.stats });
            }
            setAiData(map);
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orgId, orgLoading]);

  // Layout actions
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveDashboardLayout(layout);
      setSavedLayout(layout);
      setEditMode(false);
      setShowAddPanel(false);
    } catch {
      // Silently fail - layout still in memory
    } finally {
      setSaving(false);
    }
  }, [layout]);

  const handleReset = useCallback(async () => {
    setSaving(true);
    try {
      const res = await resetDashboardLayout() as unknown as { layout: WidgetConfigApi[] };
      setLayout(res.layout);
      setSavedLayout(res.layout);
      setEditMode(false);
      setShowAddPanel(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, []);

  const handleCancel = useCallback(() => {
    setLayout(savedLayout);
    setEditMode(false);
    setShowAddPanel(false);
  }, [savedLayout]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    setLayout((prev) => prev.filter((w) => w.widget_id !== widgetId));
  }, []);

  const handleAddWidget = useCallback((widgetId: string) => {
    const def = WIDGET_CATALOG.find((w) => w.id === widgetId);
    if (!def) return;

    // Find the next free row at the bottom
    const maxRow = layout.reduce((max, w) => Math.max(max, w.position.row + w.size.h), 0);

    const newWidget: WidgetConfigApi = {
      widget_id: widgetId,
      position: { row: maxRow, col: 0 },
      size: def.defaultSize,
      config: {},
    };
    setLayout((prev) => [...prev, newWidget]);
  }, [layout]);

  // Move widget up/down in the grid
  const handleMoveWidget = useCallback((widgetId: string, direction: "up" | "down") => {
    setLayout((prev) => {
      const idx = prev.findIndex((w) => w.widget_id === widgetId);
      if (idx === -1) return prev;

      const widget = prev[idx];
      const newRow = direction === "up"
        ? Math.max(0, widget.position.row - 1)
        : widget.position.row + 1;

      const updated = [...prev];
      updated[idx] = { ...widget, position: { ...widget.position, row: newRow } };
      return updated;
    });
  }, []);

  // Resize widget
  const handleResizeWidget = useCallback((widgetId: string, dw: number, dh: number) => {
    setLayout((prev) => {
      const idx = prev.findIndex((w) => w.widget_id === widgetId);
      if (idx === -1) return prev;

      const widget = prev[idx];
      const newW = Math.max(1, Math.min(GRID_COLS - widget.position.col, widget.size.w + dw));
      const newH = Math.max(1, widget.size.h + dh);

      const updated = [...prev];
      updated[idx] = { ...widget, size: { w: newW, h: newH } };
      return updated;
    });
  }, []);

  // ---- Loading state ----
  if (loading || !layoutLoaded) {
    return (
      <div className="p-6 space-y-5">
        <div className="mb-4">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-3"><Skeleton className="h-72 rounded-lg" /></div>
          <div className="col-span-2"><Skeleton className="h-72 rounded-lg" /></div>
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!orgLoading && !orgId) return <SetupPrompt />;

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!dashboard) return null;

  // Build the data bag for widgets
  const dashboardData: DashboardData = {
    dashboard,
    alertStats,
    recentAlerts,
    incidents,
    streams,
    rulesCount,
    aiData,
    orgRisk,
    orgId: orgId!,
    orgName: orgName ?? "",
  };

  const activeWidgetIds = new Set(layout.map((w) => w.widget_id));

  // Compute total grid rows needed
  const maxGridRow = layout.reduce((max, w) => Math.max(max, w.position.row + w.size.h), 0);

  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {orgName} &mdash; Operational overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 mt-1">
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </span>
          {editMode ? (
            <>
              <button
                onClick={() => setShowAddPanel(!showAddPanel)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors"
              >
                <Plus size={12} /> Add Widget
              </button>
              <button
                onClick={handleReset}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 text-slate-400 text-xs font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                <RotateCcw size={12} /> Reset
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 text-slate-400 text-xs font-medium hover:bg-slate-700 transition-colors"
              >
                <X size={12} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                <Save size={12} /> {saving ? "Saving..." : "Save Layout"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 text-slate-400 text-xs font-medium hover:bg-slate-700 hover:text-slate-200 transition-colors"
            >
              <Settings2 size={12} /> Customize
            </button>
          )}
        </div>
      </div>

      {/* Getting Started cards */}
      <GettingStartedCards
        assetCount={dashboard.assetsSummary.total}
        streamCount={streams.length}
        complianceScore={dashboard.overallScore}
      />

      {/* Widget Grid */}
      <div
        className="relative"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridAutoRows: "minmax(140px, auto)",
          gap: "16px",
        }}
      >
        {editMode && (
          <div
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(59, 130, 246, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.05) 1px, transparent 1px)",
              backgroundSize: `${100 / GRID_COLS}% 140px`,
            }}
          />
        )}

        {layout.map((w) => {
          const Component = WIDGET_COMPONENTS[w.widget_id];
          if (!Component) return null;

          return (
            <div
              key={w.widget_id}
              className={`relative ${editMode ? "ring-1 ring-blue-500/20 rounded-lg" : ""}`}
              style={widgetGridStyle(w)}
            >
              {editMode && (
                <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
                  {/* Move up */}
                  <button
                    onClick={() => handleMoveWidget(w.widget_id, "up")}
                    className="w-6 h-6 rounded bg-slate-800/90 border border-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-xs"
                    title="Move up"
                  >
                    &#x25B2;
                  </button>
                  {/* Move down */}
                  <button
                    onClick={() => handleMoveWidget(w.widget_id, "down")}
                    className="w-6 h-6 rounded bg-slate-800/90 border border-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-xs"
                    title="Move down"
                  >
                    &#x25BC;
                  </button>
                  {/* Wider */}
                  <button
                    onClick={() => handleResizeWidget(w.widget_id, 1, 0)}
                    className="w-6 h-6 rounded bg-slate-800/90 border border-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-xs"
                    title="Wider"
                  >
                    &#x25B6;
                  </button>
                  {/* Narrower */}
                  <button
                    onClick={() => handleResizeWidget(w.widget_id, -1, 0)}
                    className="w-6 h-6 rounded bg-slate-800/90 border border-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-xs"
                    title="Narrower"
                  >
                    &#x25C0;
                  </button>
                  {/* Taller */}
                  <button
                    onClick={() => handleResizeWidget(w.widget_id, 0, 1)}
                    className="w-6 h-6 rounded bg-slate-800/90 border border-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-[9px] font-mono"
                    title="Taller"
                  >
                    H+
                  </button>
                  {/* Shorter */}
                  <button
                    onClick={() => handleResizeWidget(w.widget_id, 0, -1)}
                    className="w-6 h-6 rounded bg-slate-800/90 border border-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-[9px] font-mono"
                    title="Shorter"
                  >
                    H-
                  </button>
                  {/* Remove */}
                  <button
                    onClick={() => handleRemoveWidget(w.widget_id)}
                    className="w-6 h-6 rounded bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 flex items-center justify-center"
                    title="Remove widget"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              <Component data={dashboardData} config={w.config} />
            </div>
          );
        })}
      </div>

      {/* Add Widget side panel */}
      {showAddPanel && (
        <AddWidgetPanel
          activeWidgetIds={activeWidgetIds}
          onAdd={handleAddWidget}
          onClose={() => setShowAddPanel(false)}
        />
      )}
    </div>
  );
}
