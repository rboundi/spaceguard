import type { DashboardResponse } from "@spaceguard/shared";
import type { StreamResponse } from "@spaceguard/shared";
import type {
  AlertResponse,
  AlertStats,
  IncidentResponse,
  BaselineResponse,
  AnomalyStatsResponse,
  OrgRiskApi,
} from "@/lib/api";

/**
 * Shared data bag that is fetched once by the dashboard page
 * and passed to each widget. Widgets pick what they need.
 */
export interface DashboardData {
  dashboard: DashboardResponse | null;
  alertStats: AlertStats | null;
  recentAlerts: AlertResponse[];
  incidents: IncidentResponse[];
  streams: StreamResponse[];
  rulesCount: number;
  aiData: Map<string, { baselines: BaselineResponse[]; stats: AnomalyStatsResponse | null }>;
  orgRisk: OrgRiskApi | null;
  orgId: string;
  orgName: string;
}

export interface WidgetProps {
  data: DashboardData;
  config: Record<string, unknown>;
}

export interface WidgetDefinition {
  id: string;
  label: string;
  description: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
}

export const WIDGET_CATALOG: WidgetDefinition[] = [
  { id: "compliance_score", label: "Compliance Score", description: "Overall compliance score gauge", defaultSize: { w: 2, h: 1 } },
  { id: "active_alerts", label: "Active Alerts", description: "Open alert count with severity breakdown", defaultSize: { w: 2, h: 1 } },
  { id: "risk_gauge", label: "Risk Gauge", description: "Organization risk score with trend", defaultSize: { w: 2, h: 1 } },
  { id: "recent_alerts", label: "Recent Alerts", description: "Latest triggered alerts table", defaultSize: { w: 5, h: 2 } },
  { id: "nis2_deadlines", label: "NIS2 Deadlines", description: "Upcoming regulatory reporting deadlines", defaultSize: { w: 3, h: 2 } },
  { id: "telemetry_health", label: "Telemetry Health", description: "Telemetry stream status overview", defaultSize: { w: 3, h: 2 } },
  { id: "compliance_by_category", label: "Compliance by Category", description: "NIS2 Article 21 domain scores bar chart", defaultSize: { w: 5, h: 2 } },
  { id: "gap_analysis", label: "Gap Analysis", description: "Non-compliant requirements table", defaultSize: { w: 8, h: 2 } },
  { id: "asset_overview", label: "Asset Overview", description: "Total asset count by criticality", defaultSize: { w: 2, h: 1 } },
  { id: "incident_timeline", label: "Incident Timeline", description: "Active incidents with severity breakdown", defaultSize: { w: 4, h: 2 } },
  { id: "sparta_coverage", label: "SPARTA Coverage", description: "Detection rule coverage across SPARTA tactics", defaultSize: { w: 4, h: 2 } },
  { id: "alert_trend", label: "Alert Trend", description: "Alert volume over last 7/30 days", defaultSize: { w: 8, h: 2 } },
];
