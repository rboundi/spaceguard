export enum AssetType {
  LEO_SATELLITE = "LEO_SATELLITE",
  MEO_SATELLITE = "MEO_SATELLITE",
  GEO_SATELLITE = "GEO_SATELLITE",
  GROUND_STATION = "GROUND_STATION",
  CONTROL_CENTER = "CONTROL_CENTER",
  UPLINK = "UPLINK",
  DOWNLINK = "DOWNLINK",
  INTER_SATELLITE_LINK = "INTER_SATELLITE_LINK",
  DATA_CENTER = "DATA_CENTER",
  NETWORK_SEGMENT = "NETWORK_SEGMENT",
}

export enum AssetStatus {
  OPERATIONAL = "OPERATIONAL",
  DEGRADED = "DEGRADED",
  MAINTENANCE = "MAINTENANCE",
  DECOMMISSIONED = "DECOMMISSIONED",
}

export enum Criticality {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum NIS2Classification {
  ESSENTIAL = "ESSENTIAL",
  IMPORTANT = "IMPORTANT",
}

export enum Regulation {
  NIS2 = "NIS2",
  CRA = "CRA",
  EU_SPACE_ACT = "EU_SPACE_ACT",
  ENISA_SPACE = "ENISA_SPACE",
}

export enum ComplianceStatus {
  NOT_ASSESSED = "NOT_ASSESSED",
  NON_COMPLIANT = "NON_COMPLIANT",
  PARTIALLY_COMPLIANT = "PARTIALLY_COMPLIANT",
  COMPLIANT = "COMPLIANT",
}

export const assetTypeLabels: Record<AssetType, string> = {
  [AssetType.LEO_SATELLITE]: "LEO Satellite",
  [AssetType.MEO_SATELLITE]: "MEO Satellite",
  [AssetType.GEO_SATELLITE]: "GEO Satellite",
  [AssetType.GROUND_STATION]: "Ground Station",
  [AssetType.CONTROL_CENTER]: "Control Center",
  [AssetType.UPLINK]: "Uplink",
  [AssetType.DOWNLINK]: "Downlink",
  [AssetType.INTER_SATELLITE_LINK]: "Inter-Satellite Link",
  [AssetType.DATA_CENTER]: "Data Center",
  [AssetType.NETWORK_SEGMENT]: "Network Segment",
};

export const complianceStatusLabels: Record<ComplianceStatus, string> = {
  [ComplianceStatus.NOT_ASSESSED]: "Not Assessed",
  [ComplianceStatus.NON_COMPLIANT]: "Non-Compliant",
  [ComplianceStatus.PARTIALLY_COMPLIANT]: "Partially Compliant",
  [ComplianceStatus.COMPLIANT]: "Compliant",
};

export const complianceStatusColors: Record<ComplianceStatus, string> = {
  [ComplianceStatus.NOT_ASSESSED]: "gray",
  [ComplianceStatus.NON_COMPLIANT]: "red",
  [ComplianceStatus.PARTIALLY_COMPLIANT]: "amber",
  [ComplianceStatus.COMPLIANT]: "emerald",
};

// Module 2: Telemetry enums

export enum StreamProtocol {
  CCSDS_TM = "CCSDS_TM",
  CCSDS_TC = "CCSDS_TC",
  SYSLOG = "SYSLOG",
  SNMP = "SNMP",
  CUSTOM = "CUSTOM",
}

export enum StreamStatus {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  ERROR = "ERROR",
}

export enum TelemetryQuality {
  GOOD = "GOOD",
  SUSPECT = "SUSPECT",
  BAD = "BAD",
}

export enum LogSeverity {
  DEBUG = "DEBUG",
  INFO = "INFO",
  NOTICE = "NOTICE",
  WARNING = "WARNING",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
  ALERT = "ALERT",
  EMERGENCY = "EMERGENCY",
}

// Module 3: Detection Engine enums

export enum AlertSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum AlertStatus {
  NEW = "NEW",
  INVESTIGATING = "INVESTIGATING",
  RESOLVED = "RESOLVED",
  FALSE_POSITIVE = "FALSE_POSITIVE",
}

// Module 4: Incident Management enums

export enum IncidentSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum IncidentStatus {
  DETECTED = "DETECTED",
  TRIAGING = "TRIAGING",
  INVESTIGATING = "INVESTIGATING",
  CONTAINING = "CONTAINING",
  ERADICATING = "ERADICATING",
  RECOVERING = "RECOVERING",
  CLOSED = "CLOSED",
  FALSE_POSITIVE = "FALSE_POSITIVE",
}

export enum IncidentNis2Classification {
  SIGNIFICANT = "SIGNIFICANT",
  NON_SIGNIFICANT = "NON_SIGNIFICANT",
}

export enum IncidentReportType {
  EARLY_WARNING = "EARLY_WARNING",
  INCIDENT_NOTIFICATION = "INCIDENT_NOTIFICATION",
  INTERMEDIATE_REPORT = "INTERMEDIATE_REPORT",
  FINAL_REPORT = "FINAL_REPORT",
}

// Supply Chain enums

// ---------------------------------------------------------------------------
// User Roles
// ---------------------------------------------------------------------------

export enum UserRole {
  ADMIN = "ADMIN",
  OPERATOR = "OPERATOR",
  VIEWER = "VIEWER",
  AUDITOR = "AUDITOR",
}

export const userRoleLabels: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.OPERATOR]: "Operator",
  [UserRole.VIEWER]: "Viewer",
  [UserRole.AUDITOR]: "Auditor",
};

// ---------------------------------------------------------------------------
// Scheduled Reports
// ---------------------------------------------------------------------------

export enum ScheduledReportType {
  COMPLIANCE = "COMPLIANCE",
  INCIDENT_SUMMARY = "INCIDENT_SUMMARY",
  THREAT_BRIEFING = "THREAT_BRIEFING",
  SUPPLY_CHAIN = "SUPPLY_CHAIN",
  AUDIT_TRAIL = "AUDIT_TRAIL",
}

export const scheduledReportTypeLabels: Record<ScheduledReportType, string> = {
  [ScheduledReportType.COMPLIANCE]: "NIS2 Compliance",
  [ScheduledReportType.INCIDENT_SUMMARY]: "Incident Summary",
  [ScheduledReportType.THREAT_BRIEFING]: "Threat Briefing",
  [ScheduledReportType.SUPPLY_CHAIN]: "Supply Chain Risk",
  [ScheduledReportType.AUDIT_TRAIL]: "Audit Trail",
};

export enum ReportSchedule {
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
}

export const reportScheduleLabels: Record<ReportSchedule, string> = {
  [ReportSchedule.WEEKLY]: "Weekly",
  [ReportSchedule.MONTHLY]: "Monthly",
  [ReportSchedule.QUARTERLY]: "Quarterly",
};

export enum SupplierType {
  COMPONENT_MANUFACTURER = "COMPONENT_MANUFACTURER",
  GROUND_STATION_OPERATOR = "GROUND_STATION_OPERATOR",
  LAUNCH_PROVIDER = "LAUNCH_PROVIDER",
  CLOUD_PROVIDER = "CLOUD_PROVIDER",
  SOFTWARE_VENDOR = "SOFTWARE_VENDOR",
  INTEGRATION_PARTNER = "INTEGRATION_PARTNER",
  DATA_RELAY_PROVIDER = "DATA_RELAY_PROVIDER",
}

export const supplierTypeLabels: Record<SupplierType, string> = {
  [SupplierType.COMPONENT_MANUFACTURER]: "Component Manufacturer",
  [SupplierType.GROUND_STATION_OPERATOR]: "Ground Station Operator",
  [SupplierType.LAUNCH_PROVIDER]: "Launch Provider",
  [SupplierType.CLOUD_PROVIDER]: "Cloud Provider",
  [SupplierType.SOFTWARE_VENDOR]: "Software Vendor",
  [SupplierType.INTEGRATION_PARTNER]: "Integration Partner",
  [SupplierType.DATA_RELAY_PROVIDER]: "Data Relay Provider",
};
