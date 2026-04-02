export enum AssetType {
  // Original top-level types
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

  // Space Segment subsystems (ENISA Annex B)
  CDHS = "CDHS",
  COM_SUBSYSTEM = "COM_SUBSYSTEM",
  ADCS = "ADCS",
  EPS = "EPS",
  PAYLOAD = "PAYLOAD",
  PROPULSION = "PROPULSION",
  THERMAL = "THERMAL",

  // Ground Segment subsystems (ENISA Annex B)
  TTC_ANTENNA = "TTC_ANTENNA",
  SLE_INTERFACE = "SLE_INTERFACE",
  CRYPTO_UNIT_GROUND = "CRYPTO_UNIT_GROUND",
  MISSION_PLANNING = "MISSION_PLANNING",
  FLIGHT_DYNAMICS = "FLIGHT_DYNAMICS",
  GROUND_NETWORK = "GROUND_NETWORK",

  // User Segment (ENISA Annex B)
  VSAT_TERMINAL = "VSAT_TERMINAL",
  USER_MODEM = "USER_MODEM",
  USER_APPLICATION = "USER_APPLICATION",

  // Human Resources (security tracking)
  OPERATIONS_TEAM = "OPERATIONS_TEAM",
  ENGINEERING_TEAM = "ENGINEERING_TEAM",
  SECURITY_TEAM = "SECURITY_TEAM",
}

// ---------------------------------------------------------------------------
// ENISA Annex B 4-segment taxonomy
// ---------------------------------------------------------------------------

export enum AssetSegment {
  SPACE = "SPACE",
  GROUND = "GROUND",
  USER = "USER",
  HUMAN_RESOURCES = "HUMAN_RESOURCES",
}

export const assetSegmentLabels: Record<AssetSegment, string> = {
  [AssetSegment.SPACE]: "Space Segment",
  [AssetSegment.GROUND]: "Ground Segment",
  [AssetSegment.USER]: "User Segment",
  [AssetSegment.HUMAN_RESOURCES]: "Human Resources",
};

// ---------------------------------------------------------------------------
// Satellite lifecycle phases (ENISA / ECSS)
// ---------------------------------------------------------------------------

export enum LifecyclePhase {
  PHASE_0_MISSION_ANALYSIS = "PHASE_0_MISSION_ANALYSIS",
  PHASE_A_FEASIBILITY = "PHASE_A_FEASIBILITY",
  PHASE_B_DEFINITION = "PHASE_B_DEFINITION",
  PHASE_C_QUALIFICATION = "PHASE_C_QUALIFICATION",
  PHASE_D_PRODUCTION = "PHASE_D_PRODUCTION",
  PHASE_E_OPERATIONS = "PHASE_E_OPERATIONS",
  PHASE_F_DISPOSAL = "PHASE_F_DISPOSAL",
}

export const lifecyclePhaseLabels: Record<LifecyclePhase, string> = {
  [LifecyclePhase.PHASE_0_MISSION_ANALYSIS]: "Phase 0 - Mission Analysis",
  [LifecyclePhase.PHASE_A_FEASIBILITY]: "Phase A - Feasibility",
  [LifecyclePhase.PHASE_B_DEFINITION]: "Phase B - Definition",
  [LifecyclePhase.PHASE_C_QUALIFICATION]: "Phase C - Qualification",
  [LifecyclePhase.PHASE_D_PRODUCTION]: "Phase D - Production",
  [LifecyclePhase.PHASE_E_OPERATIONS]: "Phase E - Operations",
  [LifecyclePhase.PHASE_F_DISPOSAL]: "Phase F - Disposal",
};

// ---------------------------------------------------------------------------
// Segment mapping: which asset types belong to which ENISA segment
// ---------------------------------------------------------------------------

export const assetTypeSegment: Record<AssetType, AssetSegment> = {
  // Space segment
  [AssetType.LEO_SATELLITE]: AssetSegment.SPACE,
  [AssetType.MEO_SATELLITE]: AssetSegment.SPACE,
  [AssetType.GEO_SATELLITE]: AssetSegment.SPACE,
  [AssetType.INTER_SATELLITE_LINK]: AssetSegment.SPACE,
  [AssetType.CDHS]: AssetSegment.SPACE,
  [AssetType.COM_SUBSYSTEM]: AssetSegment.SPACE,
  [AssetType.ADCS]: AssetSegment.SPACE,
  [AssetType.EPS]: AssetSegment.SPACE,
  [AssetType.PAYLOAD]: AssetSegment.SPACE,
  [AssetType.PROPULSION]: AssetSegment.SPACE,
  [AssetType.THERMAL]: AssetSegment.SPACE,

  // Ground segment
  [AssetType.GROUND_STATION]: AssetSegment.GROUND,
  [AssetType.CONTROL_CENTER]: AssetSegment.GROUND,
  [AssetType.UPLINK]: AssetSegment.GROUND,
  [AssetType.DOWNLINK]: AssetSegment.GROUND,
  [AssetType.DATA_CENTER]: AssetSegment.GROUND,
  [AssetType.NETWORK_SEGMENT]: AssetSegment.GROUND,
  [AssetType.TTC_ANTENNA]: AssetSegment.GROUND,
  [AssetType.SLE_INTERFACE]: AssetSegment.GROUND,
  [AssetType.CRYPTO_UNIT_GROUND]: AssetSegment.GROUND,
  [AssetType.MISSION_PLANNING]: AssetSegment.GROUND,
  [AssetType.FLIGHT_DYNAMICS]: AssetSegment.GROUND,
  [AssetType.GROUND_NETWORK]: AssetSegment.GROUND,

  // User segment
  [AssetType.VSAT_TERMINAL]: AssetSegment.USER,
  [AssetType.USER_MODEM]: AssetSegment.USER,
  [AssetType.USER_APPLICATION]: AssetSegment.USER,

  // Human resources
  [AssetType.OPERATIONS_TEAM]: AssetSegment.HUMAN_RESOURCES,
  [AssetType.ENGINEERING_TEAM]: AssetSegment.HUMAN_RESOURCES,
  [AssetType.SECURITY_TEAM]: AssetSegment.HUMAN_RESOURCES,
};

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
  // Original types
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

  // Space Segment subsystems
  [AssetType.CDHS]: "CDHS (Command & Data Handling)",
  [AssetType.COM_SUBSYSTEM]: "COM Subsystem",
  [AssetType.ADCS]: "ADCS (Attitude Determination & Control)",
  [AssetType.EPS]: "EPS (Electrical Power System)",
  [AssetType.PAYLOAD]: "Payload",
  [AssetType.PROPULSION]: "Propulsion",
  [AssetType.THERMAL]: "Thermal Control",

  // Ground Segment subsystems
  [AssetType.TTC_ANTENNA]: "TTC Antenna",
  [AssetType.SLE_INTERFACE]: "SLE Interface",
  [AssetType.CRYPTO_UNIT_GROUND]: "Crypto Unit (Ground)",
  [AssetType.MISSION_PLANNING]: "Mission Planning System",
  [AssetType.FLIGHT_DYNAMICS]: "Flight Dynamics System",
  [AssetType.GROUND_NETWORK]: "Ground Network",

  // User Segment
  [AssetType.VSAT_TERMINAL]: "VSAT Terminal",
  [AssetType.USER_MODEM]: "User Modem",
  [AssetType.USER_APPLICATION]: "User Application",

  // Human Resources
  [AssetType.OPERATIONS_TEAM]: "Operations Team",
  [AssetType.ENGINEERING_TEAM]: "Engineering Team",
  [AssetType.SECURITY_TEAM]: "Security Team",
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

// ---------------------------------------------------------------------------
// Playbooks
// ---------------------------------------------------------------------------

export enum PlaybookStepType {
  NOTIFY = "notify",
  CREATE_INCIDENT = "create_incident",
  CHANGE_ALERT_STATUS = "change_alert_status",
  GENERATE_REPORT = "generate_report",
  WEBHOOK_ACTION = "webhook_action",
  WAIT = "wait",
  HUMAN_APPROVAL = "human_approval",
  ADD_NOTE = "add_note",
}

export const playbookStepTypeLabels: Record<PlaybookStepType, string> = {
  [PlaybookStepType.NOTIFY]: "Send Notification",
  [PlaybookStepType.CREATE_INCIDENT]: "Create Incident",
  [PlaybookStepType.CHANGE_ALERT_STATUS]: "Change Alert Status",
  [PlaybookStepType.GENERATE_REPORT]: "Generate Report",
  [PlaybookStepType.WEBHOOK_ACTION]: "Webhook Action",
  [PlaybookStepType.WAIT]: "Wait",
  [PlaybookStepType.HUMAN_APPROVAL]: "Human Approval",
  [PlaybookStepType.ADD_NOTE]: "Add Note",
};

export enum PlaybookExecutionStatus {
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export const playbookExecutionStatusLabels: Record<PlaybookExecutionStatus, string> = {
  [PlaybookExecutionStatus.RUNNING]: "Running",
  [PlaybookExecutionStatus.COMPLETED]: "Completed",
  [PlaybookExecutionStatus.FAILED]: "Failed",
  [PlaybookExecutionStatus.CANCELLED]: "Cancelled",
};

// ---------------------------------------------------------------------------
// SBOM / Vulnerability Management (CRA Annex I)
// ---------------------------------------------------------------------------

export enum ComponentType {
  OPERATING_SYSTEM = "OPERATING_SYSTEM",
  FIRMWARE = "FIRMWARE",
  APPLICATION = "APPLICATION",
  LIBRARY = "LIBRARY",
  DRIVER = "DRIVER",
  MIDDLEWARE = "MIDDLEWARE",
  PROTOCOL_STACK = "PROTOCOL_STACK",
}

export const componentTypeLabels: Record<ComponentType, string> = {
  [ComponentType.OPERATING_SYSTEM]: "Operating System",
  [ComponentType.FIRMWARE]: "Firmware",
  [ComponentType.APPLICATION]: "Application",
  [ComponentType.LIBRARY]: "Library",
  [ComponentType.DRIVER]: "Driver",
  [ComponentType.MIDDLEWARE]: "Middleware",
  [ComponentType.PROTOCOL_STACK]: "Protocol Stack",
};

export enum ComponentSource {
  PROPRIETARY = "PROPRIETARY",
  COTS = "COTS",
  OPEN_SOURCE = "OPEN_SOURCE",
  CUSTOM = "CUSTOM",
}

export const componentSourceLabels: Record<ComponentSource, string> = {
  [ComponentSource.PROPRIETARY]: "Proprietary",
  [ComponentSource.COTS]: "COTS",
  [ComponentSource.OPEN_SOURCE]: "Open Source",
  [ComponentSource.CUSTOM]: "Custom",
};

export enum VulnerabilitySeverity {
  NONE = "NONE",
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum VulnerabilityStatus {
  IDENTIFIED = "IDENTIFIED",
  ASSESSING = "ASSESSING",
  RISK_ACCEPTED = "RISK_ACCEPTED",
  REMEDIATION_PLANNED = "REMEDIATION_PLANNED",
  REMEDIATION_IN_PROGRESS = "REMEDIATION_IN_PROGRESS",
  VERIFIED_FIXED = "VERIFIED_FIXED",
  NOT_APPLICABLE = "NOT_APPLICABLE",
}

export const vulnerabilityStatusLabels: Record<VulnerabilityStatus, string> = {
  [VulnerabilityStatus.IDENTIFIED]: "Identified",
  [VulnerabilityStatus.ASSESSING]: "Assessing",
  [VulnerabilityStatus.RISK_ACCEPTED]: "Risk Accepted",
  [VulnerabilityStatus.REMEDIATION_PLANNED]: "Remediation Planned",
  [VulnerabilityStatus.REMEDIATION_IN_PROGRESS]: "Remediation In Progress",
  [VulnerabilityStatus.VERIFIED_FIXED]: "Verified Fixed",
  [VulnerabilityStatus.NOT_APPLICABLE]: "Not Applicable",
};

export enum SbomFormat {
  CYCLONEDX = "CYCLONEDX",
  SPDX = "SPDX",
  CSV = "CSV",
  MANUAL = "MANUAL",
}
