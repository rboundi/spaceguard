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
