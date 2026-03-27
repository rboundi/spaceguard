"use client";

import type { WidgetProps } from "./widget-types";
import { ComplianceScoreWidget } from "./widgets/ComplianceScoreWidget";
import { ActiveAlertsWidget } from "./widgets/ActiveAlertsWidget";
import { RiskGaugeWidget } from "./widgets/RiskGaugeWidget";
import { RecentAlertsWidget } from "./widgets/RecentAlertsWidget";
import { Nis2DeadlinesWidget } from "./widgets/Nis2DeadlinesWidget";
import { TelemetryHealthWidget } from "./widgets/TelemetryHealthWidget";
import { ComplianceByCategoryWidget } from "./widgets/ComplianceByCategoryWidget";
import { GapAnalysisWidget } from "./widgets/GapAnalysisWidget";
import { AssetOverviewWidget } from "./widgets/AssetOverviewWidget";
import { IncidentTimelineWidget } from "./widgets/IncidentTimelineWidget";
import { SpartaCoverageWidget } from "./widgets/SpartaCoverageWidget";
import { AlertTrendWidget } from "./widgets/AlertTrendWidget";

type WidgetComponent = React.ComponentType<WidgetProps>;

export const WIDGET_COMPONENTS: Record<string, WidgetComponent> = {
  compliance_score: ComplianceScoreWidget,
  active_alerts: ActiveAlertsWidget,
  risk_gauge: RiskGaugeWidget,
  recent_alerts: RecentAlertsWidget,
  nis2_deadlines: Nis2DeadlinesWidget,
  telemetry_health: TelemetryHealthWidget,
  compliance_by_category: ComplianceByCategoryWidget,
  gap_analysis: GapAnalysisWidget,
  asset_overview: AssetOverviewWidget,
  incident_timeline: IncidentTimelineWidget,
  sparta_coverage: SpartaCoverageWidget,
  alert_trend: AlertTrendWidget,
};
