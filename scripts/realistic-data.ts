/**
 * Realistic European Space Company Seed Data
 *
 * Creates 4 representative organisations with assets and compliance mappings.
 * IDEMPOTENT: deletes each org by name (cascades to assets + mappings) then
 * re-creates everything fresh so the script can be run any number of times.
 */

import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://spaceguard:spaceguard_dev@localhost:5432/spaceguard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgDef {
  name: string;
  country: string;
  nis2Classification: "ESSENTIAL" | "IMPORTANT";
  contactName: string;
  contactEmail: string;
  sector: string;
}

interface AssetDef {
  name: string;
  assetType: string;
  status: string;
  criticality: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface MappingDef {
  requirementIndex: number; // 0-based index into requirement title list
  status: "COMPLIANT" | "PARTIALLY_COMPLIANT" | "NON_COMPLIANT" | "NOT_ASSESSED";
  evidenceDescription?: string;
  notes?: string;
  lastAssessed?: string; // ISO timestamp
}

interface SupplierDef {
  name: string;
  type: string;
  country: string;
  criticality: string;
  description?: string;
  securityAssessment?: {
    lastAssessed?: string | null;
    nextReview?: string | null;
    iso27001Certified?: boolean;
    soc2Certified?: boolean;
    nis2Compliant?: boolean;
    riskScore?: number;
    notes?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Organisation definitions
// ---------------------------------------------------------------------------

const ORGS: Array<{
  org: OrgDef;
  assets: AssetDef[];
  mappings: MappingDef[];
  suppliers?: SupplierDef[];
}> = [
  // --------------------------------------------------------------------------
  // 1. Proba Space Systems (Small EO Constellation, Belgium, most mature)
  // --------------------------------------------------------------------------
  {
    org: {
      name: "Proba Space Systems",
      country: "BE",
      nis2Classification: "ESSENTIAL",
      contactName: "Dr. Lena Vandermeer",
      contactEmail: "ops@proba-space.eu",
      sector: "space",
    },
    assets: [
      {
        name: "Proba-EO-1",
        assetType: "LEO_SATELLITE",
        status: "OPERATIONAL",
        criticality: "CRITICAL",
        description: "LEO Earth Observation satellite with MSI payload",
        metadata: {
          altitude_km: 615,
          inclination: 97.9,
          orbit_type: "SSO",
          norad_id: "55201",
          launch_date: "2024-03-15",
          manufacturer: "OHB SE",
          bus: "SmallGEO-derived",
          mass_kg: 120,
          design_life_years: 5,
          subsystems: ["AOCS", "EPS", "COMMS", "Payload-MSI"],
          downlink_frequency_mhz: 8200,
          uplink_frequency_mhz: 2050,
        },
      },
      {
        name: "Proba-EO-2",
        assetType: "LEO_SATELLITE",
        status: "OPERATIONAL",
        criticality: "CRITICAL",
        description: "LEO Earth Observation satellite with SAR payload",
        metadata: {
          altitude_km: 615,
          inclination: 97.9,
          orbit_type: "SSO",
          norad_id: "55202",
          launch_date: "2024-03-15",
          manufacturer: "OHB SE",
          bus: "SmallGEO-derived",
          mass_kg: 120,
          design_life_years: 5,
          subsystems: ["AOCS", "EPS", "COMMS", "Payload-SAR"],
          downlink_frequency_mhz: 8200,
          uplink_frequency_mhz: 2050,
        },
      },
      {
        name: "Proba-EO-3",
        assetType: "LEO_SATELLITE",
        status: "MAINTENANCE",
        criticality: "HIGH",
        description: "LEO EO satellite - AOCS anomaly under investigation",
        metadata: {
          altitude_km: 615,
          inclination: 97.9,
          orbit_type: "SSO",
          norad_id: "55203",
          launch_date: "2024-09-22",
          manufacturer: "OHB SE",
          status_notes: "AOCS anomaly under investigation since 2025-11",
          mass_kg: 120,
        },
      },
      {
        name: "Svalbard Ground Station",
        assetType: "GROUND_STATION",
        status: "OPERATIONAL",
        criticality: "CRITICAL",
        description: "Primary high-latitude ground station via KSAT network",
        metadata: {
          location: "Longyearbyen, Svalbard, Norway",
          latitude: 78.23,
          longitude: 15.39,
          operator: "KSAT (Kongsberg Satellite Services)",
          antennas: ["13m S/X-band", "7.3m S-band"],
          services: ["TT&C", "Data downlink", "LEO support"],
          connectivity: "Dual fiber + VSAT backup",
          access_type: "Shared ground station network",
        },
      },
      {
        name: "Matera Ground Station",
        assetType: "GROUND_STATION",
        status: "OPERATIONAL",
        criticality: "HIGH",
        description: "Secondary ground station via e-GEOS / ASI",
        metadata: {
          location: "Matera, Italy",
          latitude: 40.65,
          longitude: 16.7,
          operator: "e-GEOS / ASI",
          antennas: ["7.2m X-band"],
          services: ["Data downlink", "Backup TT&C"],
          access_type: "Shared ground station network",
        },
      },
      {
        name: "Brussels Mission Control",
        assetType: "CONTROL_CENTER",
        status: "OPERATIONAL",
        criticality: "CRITICAL",
        description: "Primary mission control with hot standby in Liege",
        metadata: {
          location: "Brussels, Belgium",
          redundancy: "Hot standby in Liege",
          software: "SCOS-2000 based",
          network: "Dedicated VPN to ground stations",
          staff: "12 operators, 24/7 coverage",
        },
      },
      {
        name: "Primary S-band TT&C Link",
        assetType: "UPLINK",
        status: "OPERATIONAL",
        criticality: "CRITICAL",
        description: "Encrypted S-band telecommand and telemetry link",
        metadata: {
          frequency_uplink_mhz: "2025-2110",
          frequency_downlink_mhz: "2200-2290",
          protocol: "CCSDS TC/TM",
          modulation: "BPSK",
          encryption: "SDLS - AES-256-GCM",
          data_rate_kbps: 64,
        },
      },
      {
        name: "X-band Payload Data Link",
        assetType: "DOWNLINK",
        status: "OPERATIONAL",
        criticality: "HIGH",
        description: "High-rate payload data downlink - encryption pending",
        metadata: {
          frequency_mhz: "8025-8400",
          protocol: "CCSDS AOS",
          modulation: "QPSK",
          data_rate_mbps: 150,
          encryption: "None (pending CRA review)",
        },
      },
    ],
    // 8 COMPLIANT, 5 PARTIALLY_COMPLIANT, 3 NON_COMPLIANT, 2 NOT_ASSESSED
    mappings: [
      // COMPLIANT (8)
      {
        requirementIndex: 0,
        status: "COMPLIANT",
        evidenceDescription: "ISO 27001 certified. Last surveillance audit March 2025 by DNV. Scope covers all mission operations.",
        lastAssessed: "2025-03-15T10:00:00Z",
      },
      {
        requirementIndex: 1,
        status: "COMPLIANT",
        evidenceDescription: "Full asset register maintained in SpaceGuard. Criticality classifications reviewed and approved by CTO board in Q4 2024.",
        lastAssessed: "2024-12-10T14:00:00Z",
      },
      {
        requirementIndex: 5,
        status: "COMPLIANT",
        evidenceDescription: "BCP/DRP tested annually. Last full failover exercise October 2025. RTO 4h, RPO 1h for mission-critical systems.",
        lastAssessed: "2025-10-20T09:00:00Z",
      },
      {
        requirementIndex: 6,
        status: "COMPLIANT",
        evidenceDescription: "Mission continuity procedures in operations manual v3.2. Hot standby MCC in Liege tested quarterly. Degraded-mode operations validated.",
        lastAssessed: "2025-09-05T11:00:00Z",
      },
      {
        requirementIndex: 12,
        status: "COMPLIANT",
        evidenceDescription: "Annual security awareness training mandatory for all staff. Role-based training for operators and engineers. Phishing simulation quarterly.",
        lastAssessed: "2025-11-01T08:00:00Z",
      },
      {
        requirementIndex: 13,
        status: "COMPLIANT",
        evidenceDescription: "Cryptography policy v2.1 in effect. AES-256-GCM for TT&C via SDLS. RSA-4096 for key exchange. Policy reviewed bi-annually.",
        lastAssessed: "2025-06-15T10:00:00Z",
      },
      {
        requirementIndex: 15,
        status: "COMPLIANT",
        evidenceDescription: "HR security policy enforced. Background checks for all staff with system access. Access revocation process tested. Leavers checklist audited monthly.",
        lastAssessed: "2025-08-20T14:00:00Z",
      },
      {
        requirementIndex: 16,
        status: "COMPLIANT",
        evidenceDescription: "MFA enforced via Okta for all mission control access and remote sessions. Hardware tokens for privileged accounts. No bypass permitted.",
        lastAssessed: "2025-07-10T09:00:00Z",
      },
      // PARTIALLY_COMPLIANT (5)
      {
        requirementIndex: 2,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Incident response plan exists and has been tested for ground segment. Space-specific IR playbooks for satellite anomalies are in draft.",
        notes: "Space-segment incident playbooks expected Q1 2026. Ground segment IR is fully documented.",
        lastAssessed: "2025-05-20T10:00:00Z",
      },
      {
        requirementIndex: 3,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Notification procedure documented for CCN-CERT Belgium. One test notification submitted. Thresholds calibrated but not yet formally validated with authority.",
        notes: "Formal validation exercise with CCN-CERT scheduled Q2 2026.",
        lastAssessed: "2025-04-10T11:00:00Z",
      },
      {
        requirementIndex: 7,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Tier-1 suppliers (KSAT, OHB SE) assessed against ISO 27001 baseline. Tier-2 and component suppliers not yet formally assessed.",
        notes: "Supply chain questionnaire sent to all Tier-2 suppliers. Responses expected Q1 2026.",
        lastAssessed: "2025-09-15T10:00:00Z",
      },
      {
        requirementIndex: 8,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "KSAT assessed via SOC 2 Type II report review. e-GEOS security posture assessed informally. Formal contractual security requirements not yet included in SLAs.",
        notes: "Contract renewal with e-GEOS in Q2 2026 will include security annexe.",
        lastAssessed: "2025-10-05T14:00:00Z",
      },
      {
        requirementIndex: 9,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Secure development process for ground software follows OWASP Top 10 and internal coding standards. Flight software security review process is informal.",
        notes: "Formalising flight software security review into the PDR/CDR gate process for next mission.",
        lastAssessed: "2025-07-20T09:00:00Z",
      },
      // NON_COMPLIANT (3)
      {
        requirementIndex: 4,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "No SIEM or centralised log management in place. Ground network monitoring is ad-hoc. Anomaly detection for spacecraft telemetry is manual. Budget approved for SIEM deployment Q1 2026.",
        lastAssessed: "2025-11-15T10:00:00Z",
      },
      {
        requirementIndex: 10,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "Flight software on Proba-EO-1 and EO-2 (OHB SE bus firmware v2.1) cannot be patched in-orbit. Risk accepted per board resolution 2024-07. Ground segment compensating controls in place. New mission will use patchable firmware.",
        lastAssessed: "2025-10-30T11:00:00Z",
      },
      {
        requirementIndex: 14,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "X-band payload downlink (8025-8400 MHz) operates without encryption. CRA review scheduled Q2 2026. Compensating control: link-level authentication via known-good downlink windows only. S-band TT&C is fully encrypted (SDLS AES-256-GCM).",
        lastAssessed: "2025-09-20T10:00:00Z",
      },
      // NOT_ASSESSED (2)
      {
        requirementIndex: 11,
        status: "NOT_ASSESSED",
      },
      {
        requirementIndex: 17,
        status: "NOT_ASSESSED",
      },
    ],
    suppliers: [
      {
        name: "KSAT",
        type: "GROUND_STATION_OPERATOR",
        country: "NO",
        criticality: "CRITICAL",
        description: "Kongsberg Satellite Services - primary ground station network provider (Svalbard, TrollSat). 24/7 LEO TT&C and data downlink.",
        securityAssessment: {
          lastAssessed: "2025-11-15",
          nextReview: "2026-05-15",
          iso27001Certified: true,
          soc2Certified: false,
          nis2Compliant: true,
          riskScore: 3,
          notes: "Mature provider with strong physical security. Annual on-site audits performed. Data-in-transit encrypted via dedicated VPN.",
        },
      },
      {
        name: "e-GEOS",
        type: "GROUND_STATION_OPERATOR",
        country: "IT",
        criticality: "HIGH",
        description: "Secondary ground station network via ASI Matera facility. EO data relay and emergency TT&C backup.",
        securityAssessment: {
          lastAssessed: "2025-09-22",
          nextReview: "2026-03-22",
          iso27001Certified: true,
          soc2Certified: false,
          nis2Compliant: true,
          riskScore: 4,
          notes: "ASI facility meets ESA security standards. Network segmentation verified. Some legacy systems in data processing chain.",
        },
      },
      {
        name: "OHB SE",
        type: "COMPONENT_MANUFACTURER",
        country: "DE",
        criticality: "CRITICAL",
        description: "Satellite bus manufacturer (SmallGEO-derived platform). Responsible for AOCS, EPS, and COMMS subsystem hardware and firmware.",
        securityAssessment: {
          lastAssessed: "2025-06-10",
          nextReview: "2026-06-10",
          iso27001Certified: true,
          soc2Certified: true,
          nis2Compliant: true,
          riskScore: 2,
          notes: "Gold-standard supply chain partner. Hardware provenance tracking via ITAR-compliant processes. Firmware signing and secure boot chain verified.",
        },
      },
      {
        name: "AWS",
        type: "CLOUD_PROVIDER",
        country: "IE",
        criticality: "HIGH",
        description: "Cloud infrastructure for mission control system (MCS), data processing pipeline, and archival storage. Region: eu-west-1.",
        securityAssessment: {
          lastAssessed: "2025-12-01",
          nextReview: "2026-06-01",
          iso27001Certified: true,
          soc2Certified: true,
          nis2Compliant: false,
          riskScore: 3,
          notes: "Hyperscaler with extensive compliance portfolio. NIS2 self-assessment pending from AWS. Data residency confirmed within EU. Shared responsibility model documented.",
        },
      },
      {
        name: "Custom MCS Vendor",
        type: "SOFTWARE_VENDOR",
        country: "BE",
        criticality: "MEDIUM",
        description: "Develops and maintains the bespoke Mission Control System software. Small team (8 engineers) based in Brussels.",
        securityAssessment: {
          lastAssessed: "2025-04-20",
          nextReview: "2025-10-20",
          iso27001Certified: false,
          soc2Certified: false,
          nis2Compliant: false,
          riskScore: 7,
          notes: "No formal security certifications. SAST/DAST tooling not yet adopted. Penetration test scheduled for Q1 2026. Key-person risk: only 2 engineers know the full codebase.",
        },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 2. NordSat IoT (IoT Constellation Startup, Sweden, least mature)
  // --------------------------------------------------------------------------
  {
    org: {
      name: "NordSat IoT",
      country: "SE",
      nis2Classification: "IMPORTANT",
      contactName: "Erik Lindqvist",
      contactEmail: "security@nordsat.io",
      sector: "space",
    },
    assets: [
      {
        name: "NordSat-Alpha",
        assetType: "LEO_SATELLITE",
        status: "OPERATIONAL",
        criticality: "MEDIUM",
        description: "6U CubeSat - IoT connectivity payload",
        metadata: {
          altitude_km: 520,
          inclination: 52.0,
          orbit_type: "LEO inclined",
          mass_kg: 6,
          bus: "6U CubeSat",
          manufacturer: "GomSpace",
          subsystems: ["UHF", "S-band", "IoT-payload"],
          design_life_years: 3,
        },
      },
      {
        name: "NordSat-Beta",
        assetType: "LEO_SATELLITE",
        status: "OPERATIONAL",
        criticality: "MEDIUM",
        description: "6U CubeSat - IoT connectivity payload",
        metadata: {
          altitude_km: 520,
          inclination: 52.0,
          orbit_type: "LEO inclined",
          mass_kg: 6,
          bus: "6U CubeSat",
          manufacturer: "GomSpace",
          subsystems: ["UHF", "S-band", "IoT-payload"],
          design_life_years: 3,
        },
      },
      {
        name: "NordSat-Gamma",
        assetType: "LEO_SATELLITE",
        status: "OPERATIONAL",
        criticality: "MEDIUM",
        description: "6U CubeSat - IoT connectivity payload",
        metadata: {
          altitude_km: 520,
          inclination: 52.0,
          orbit_type: "LEO inclined",
          mass_kg: 6,
          bus: "6U CubeSat",
          manufacturer: "GomSpace",
          subsystems: ["UHF", "S-band", "IoT-payload"],
          design_life_years: 3,
        },
      },
      {
        name: "NordSat-Delta",
        assetType: "LEO_SATELLITE",
        status: "OPERATIONAL",
        criticality: "MEDIUM",
        description: "6U CubeSat - IoT connectivity payload",
        metadata: {
          altitude_km: 520,
          inclination: 52.0,
          orbit_type: "LEO inclined",
          mass_kg: 6,
          bus: "6U CubeSat",
          manufacturer: "GomSpace",
          subsystems: ["UHF", "S-band", "IoT-payload"],
          design_life_years: 3,
        },
      },
      {
        name: "Kiruna Ground Station",
        assetType: "GROUND_STATION",
        status: "OPERATIONAL",
        criticality: "HIGH",
        description: "TT&C ground station via SSC Kiruna",
        metadata: {
          location: "Kiruna, Sweden",
          latitude: 67.86,
          longitude: 20.96,
          operator: "SSC (Swedish Space Corporation)",
          antennas: ["5m S-band"],
          services: ["TT&C"],
        },
      },
      {
        name: "Stockholm Operations",
        assetType: "CONTROL_CENTER",
        status: "OPERATIONAL",
        criticality: "HIGH",
        description: "Mission control hosted in AWS eu-north-1",
        metadata: {
          location: "Stockholm, Sweden",
          software: "Custom Python-based MCS",
          cloud: "AWS eu-north-1",
          staff: "4 engineers",
        },
      },
    ],
    // 2 COMPLIANT, 3 PARTIALLY_COMPLIANT, 5 NON_COMPLIANT, 8 NOT_ASSESSED
    mappings: [
      // COMPLIANT (2)
      {
        requirementIndex: 15,
        status: "COMPLIANT",
        evidenceDescription: "HR policy in place. Access control managed via AWS IAM with least-privilege. Joiners/leavers process documented and followed by all 12 staff.",
        lastAssessed: "2025-08-10T10:00:00Z",
      },
      {
        requirementIndex: 16,
        status: "COMPLIANT",
        evidenceDescription: "MFA enforced on all AWS accounts and GitHub organisation. Google Workspace MFA mandatory. No exceptions granted.",
        lastAssessed: "2025-08-10T11:00:00Z",
      },
      // PARTIALLY_COMPLIANT (3)
      {
        requirementIndex: 0,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Basic risk register maintained in Confluence. Annual review process established but not yet formally documented as an ISMS policy.",
        notes: "Targeting ISO 27001 readiness assessment in 2026.",
        lastAssessed: "2025-06-01T09:00:00Z",
      },
      {
        requirementIndex: 12,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Annual security awareness training via KnowBe4. Technical staff receive additional secure coding training. No space-specific cybersecurity training yet.",
        notes: "ENISA space cybersecurity training programme planned for Q2 2026.",
        lastAssessed: "2025-09-15T10:00:00Z",
      },
      {
        requirementIndex: 13,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Data at rest encrypted on AWS (AES-256). TLS 1.3 for all API traffic. No formal cryptography policy document; relying on AWS defaults.",
        notes: "Formal cryptography policy to be drafted as part of ISMS project.",
        lastAssessed: "2025-07-20T14:00:00Z",
      },
      // NON_COMPLIANT (5)
      {
        requirementIndex: 4,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "No dedicated security monitoring. Relying on AWS CloudTrail and basic alerting. No anomaly detection for satellite telemetry. Early-stage company; security operations not yet staffed.",
        lastAssessed: "2025-10-01T10:00:00Z",
      },
      {
        requirementIndex: 7,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "GomSpace is sole spacecraft manufacturer. No formal security assessment of GomSpace or SSC conducted. No security requirements in procurement contracts.",
        lastAssessed: "2025-10-01T10:00:00Z",
      },
      {
        requirementIndex: 8,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "SSC Kiruna ground station used without formal security assessment. No contractual security requirements beyond basic SLA.",
        lastAssessed: "2025-10-01T10:00:00Z",
      },
      {
        requirementIndex: 10,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "GomSpace CubeSat firmware v1.4 has no over-the-air patch capability. Known CVEs in on-board Python interpreter not remediated. Acknowledged risk item on risk register.",
        lastAssessed: "2025-10-01T10:00:00Z",
      },
      {
        requirementIndex: 14,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "UHF and S-band links use no encryption. Relying on frequency obscurity. No key management infrastructure. Identified as top security risk in last risk review.",
        lastAssessed: "2025-10-01T10:00:00Z",
      },
      // NOT_ASSESSED (8)
      { requirementIndex: 1, status: "NOT_ASSESSED" },
      { requirementIndex: 2, status: "NOT_ASSESSED" },
      { requirementIndex: 3, status: "NOT_ASSESSED" },
      { requirementIndex: 5, status: "NOT_ASSESSED" },
      { requirementIndex: 6, status: "NOT_ASSESSED" },
      { requirementIndex: 9, status: "NOT_ASSESSED" },
      { requirementIndex: 11, status: "NOT_ASSESSED" },
      { requirementIndex: 17, status: "NOT_ASSESSED" },
    ],
  },

  // --------------------------------------------------------------------------
  // 3. MediterraneanSat Communications (SATCOM, Greece, established posture)
  // --------------------------------------------------------------------------
  {
    org: {
      name: "MediterraneanSat Communications",
      country: "GR",
      nis2Classification: "ESSENTIAL",
      contactName: "Dimitris Karagiannis",
      contactEmail: "ciso@medsat-comm.gr",
      sector: "space",
    },
    assets: [
      {
        name: "MedSat-1",
        assetType: "GEO_SATELLITE",
        status: "OPERATIONAL",
        criticality: "CRITICAL",
        description: "GEO communications satellite covering Mediterranean, Middle East, North Africa",
        metadata: {
          longitude_degrees: 39.0,
          orbit_type: "GEO",
          norad_id: "41028",
          launch_date: "2018-06-12",
          manufacturer: "Thales Alenia Space",
          bus: "Spacebus 4000C3",
          mass_kg: 3200,
          design_life_years: 15,
          transponders: "36 Ku-band, 12 Ka-band",
          coverage: "Mediterranean, Middle East, North Africa",
        },
      },
      {
        name: "Thermopylae Teleport",
        assetType: "GROUND_STATION",
        status: "OPERATIONAL",
        criticality: "CRITICAL",
        description: "Primary owned teleport and hub operations centre",
        metadata: {
          location: "Thermopylae, Greece",
          latitude: 38.8,
          longitude: 22.56,
          antennas: ["9.3m Ku-band", "7.2m Ka-band", "4.5m C-band"],
          services: ["Gateway", "TT&C", "Hub operations"],
          operator: "MedSat (owned)",
          connectivity: "Redundant fiber",
        },
      },
      {
        name: "Limassol Backup Teleport",
        assetType: "GROUND_STATION",
        status: "OPERATIONAL",
        criticality: "HIGH",
        description: "Disaster recovery teleport in Cyprus",
        metadata: {
          location: "Limassol, Cyprus",
          latitude: 34.68,
          longitude: 33.04,
          antennas: ["7.2m Ku-band"],
          services: ["Backup gateway", "Disaster recovery"],
          operator: "Partner facility",
        },
      },
      {
        name: "Athens NOC",
        assetType: "CONTROL_CENTER",
        status: "OPERATIONAL",
        criticality: "CRITICAL",
        description: "24/7 Network Operations Centre - active-active with Thermopylae",
        metadata: {
          location: "Athens, Greece",
          redundancy: "Active-Active with Thermopylae",
          monitoring: "24/7 NOC with 8 operators",
          software: "Satellite monitoring + network management",
        },
      },
    ],
    // 10 COMPLIANT, 4 PARTIALLY_COMPLIANT, 2 NON_COMPLIANT, 2 NOT_ASSESSED
    mappings: [
      // COMPLIANT (10)
      {
        requirementIndex: 0,
        status: "COMPLIANT",
        evidenceDescription: "ISO 27001:2022 certified since 2020. Scope: GEO satellite operations and ground segment. Annual surveillance audit by Bureau Veritas.",
        lastAssessed: "2025-04-20T10:00:00Z",
      },
      {
        requirementIndex: 1,
        status: "COMPLIANT",
        evidenceDescription: "Asset inventory maintained. Criticality classifications approved by CISO and reviewed after each infrastructure change.",
        lastAssessed: "2025-03-10T14:00:00Z",
      },
      {
        requirementIndex: 2,
        status: "COMPLIANT",
        evidenceDescription: "CSIRT established. IR plan tested with tabletop exercise November 2025. Satellite anomaly procedures separately documented in operations manual.",
        lastAssessed: "2025-11-10T10:00:00Z",
      },
      {
        requirementIndex: 3,
        status: "COMPLIANT",
        evidenceDescription: "Notification procedure aligned with ENISA guidelines. Test notification submitted to ADAE (Greece NCA) in Q3 2025. 72h threshold understood and implemented.",
        lastAssessed: "2025-09-01T09:00:00Z",
      },
      {
        requirementIndex: 5,
        status: "COMPLIANT",
        evidenceDescription: "Active-Active NOC architecture. BCP tested annually. Last full failover to Limassol in September 2025. RTO 2h, RPO 15min achieved.",
        lastAssessed: "2025-09-15T11:00:00Z",
      },
      {
        requirementIndex: 12,
        status: "COMPLIANT",
        evidenceDescription: "Security awareness programme via Proofpoint. Technical staff receive annual penetration testing and secure coding courses. 100% completion rate.",
        lastAssessed: "2025-10-05T10:00:00Z",
      },
      {
        requirementIndex: 13,
        status: "COMPLIANT",
        evidenceDescription: "Cryptography policy v3.0 in effect. AES-256 for data at rest, TLS 1.3 for data in transit. Annual review by external cryptography consultant.",
        lastAssessed: "2025-05-20T14:00:00Z",
      },
      {
        requirementIndex: 14,
        status: "COMPLIANT",
        evidenceDescription: "TT&C link uses CCSDS SDLS with AES-256-GCM. Key management via dedicated HSM at Thermopylae. Annual key rotation procedure tested.",
        lastAssessed: "2025-06-10T09:00:00Z",
      },
      {
        requirementIndex: 15,
        status: "COMPLIANT",
        evidenceDescription: "HR security policy integrated into employment contracts. All staff with privileged access background checked. Quarterly access reviews conducted.",
        lastAssessed: "2025-08-15T10:00:00Z",
      },
      {
        requirementIndex: 16,
        status: "COMPLIANT",
        evidenceDescription: "MFA via RSA SecurID for all remote access. Hardware tokens for NOC operators and administrators. No exceptions; policy enforced technically.",
        lastAssessed: "2025-07-20T09:00:00Z",
      },
      // PARTIALLY_COMPLIANT (4)
      {
        requirementIndex: 4,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Splunk SIEM deployed for ground network monitoring. Space segment telemetry not yet integrated into SIEM. Manual monitoring of spacecraft health by NOC operators.",
        notes: "Telemetry-to-SIEM integration project scheduled Q2 2026.",
        lastAssessed: "2025-11-01T10:00:00Z",
      },
      {
        requirementIndex: 6,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Degraded-mode operations procedure exists. Satellite is designed for autonomous safe mode. Tested for ground-loss scenario but not for active cyber attack scenario.",
        notes: "Cyber attack continuity scenario to be added to next BCP exercise.",
        lastAssessed: "2025-09-15T11:00:00Z",
      },
      {
        requirementIndex: 7,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Thales Alenia Space (manufacturer) has ISO 27001. Ground equipment suppliers assessed informally. No formal third-party risk management programme.",
        notes: "Implementing supplier risk management framework in 2026.",
        lastAssessed: "2025-07-10T14:00:00Z",
      },
      {
        requirementIndex: 11,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Annual penetration test by external firm (report on file, October 2025). No continuous effectiveness measurement framework. No metrics dashboard for cybersecurity KPIs.",
        notes: "Implementing cybersecurity metrics framework as part of 2026 ISMS improvement plan.",
        lastAssessed: "2025-10-30T10:00:00Z",
      },
      // NON_COMPLIANT (2)
      {
        requirementIndex: 10,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "GEO satellite software (Thales Spacebus 4000C3) cannot be patched in-orbit post-launch. Legacy TT&C processor firmware v1.2 has known vulnerabilities. Risk accepted by board 2023. Compensating controls in place at ground segment.",
        lastAssessed: "2025-10-15T10:00:00Z",
      },
      {
        requirementIndex: 17,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "Emergency communication relies on standard NOC voice bridge and email. No dedicated out-of-band secure communication channel for cyber incident management. Procurement process initiated.",
        lastAssessed: "2025-09-20T11:00:00Z",
      },
      // NOT_ASSESSED (2)
      { requirementIndex: 8, status: "NOT_ASSESSED" },
      { requirementIndex: 9, status: "NOT_ASSESSED" },
    ],
  },

  // --------------------------------------------------------------------------
  // 4. Orbital Watch Europe (SSA Provider, France, government-adjacent, strong)
  // --------------------------------------------------------------------------
  {
    org: {
      name: "Orbital Watch Europe",
      country: "FR",
      nis2Classification: "IMPORTANT",
      contactName: "Marie Delacroix",
      contactEmail: "security@orbitalwatch.eu",
      sector: "space",
    },
    assets: [
      {
        name: "OWE Radar Station Alpha",
        assetType: "GROUND_STATION",
        status: "OPERATIONAL",
        criticality: "CRITICAL",
        description: "Phased array radar for space surveillance and tracking",
        metadata: {
          location: "Aire-sur-l'Adour, France",
          latitude: 43.7,
          longitude: -0.25,
          type: "Phased array radar",
          purpose: "Space surveillance and tracking",
          detection_range_km: 2000,
        },
      },
      {
        name: "OWE Optical Sensor Beta",
        assetType: "GROUND_STATION",
        status: "OPERATIONAL",
        criticality: "HIGH",
        description: "Optical telescope for GEO belt monitoring in Tenerife",
        metadata: {
          location: "Tenerife, Canary Islands, Spain",
          latitude: 28.3,
          longitude: -16.51,
          type: "Optical telescope with CCD",
          purpose: "GEO belt monitoring",
          aperture_cm: 50,
        },
      },
      {
        name: "Toulouse Operations Center",
        assetType: "CONTROL_CENTER",
        status: "OPERATIONAL",
        criticality: "CRITICAL",
        description: "SSA platform and analyst operations in Toulouse",
        metadata: {
          location: "Toulouse, France",
          software: "Custom SSA platform (Python/PostgreSQL)",
          data_sources: ["Own sensors", "18th SDS catalog", "ESA SST"],
          cloud: "OVHcloud eu-west",
          staff: "15 analysts",
        },
      },
      {
        name: "SST Data Network",
        assetType: "NETWORK_SEGMENT",
        status: "OPERATIONAL",
        criticality: "HIGH",
        description: "Encrypted WireGuard VPN mesh connecting all sensor sites",
        metadata: {
          type: "Encrypted VPN mesh",
          nodes: ["Aire-sur-l'Adour", "Tenerife", "Toulouse"],
          protocol: "WireGuard over dedicated fiber",
          bandwidth_mbps: 1000,
        },
      },
    ],
    // 12 COMPLIANT, 3 PARTIALLY_COMPLIANT, 1 NON_COMPLIANT, 2 NOT_ASSESSED
    mappings: [
      // COMPLIANT (12)
      {
        requirementIndex: 0,
        status: "COMPLIANT",
        evidenceDescription: "ISO 27001:2022 certified. ANSSI SecNumCloud compliance for data processing. Quarterly risk reviews by internal RSSI plus annual external review.",
        lastAssessed: "2025-05-10T10:00:00Z",
      },
      {
        requirementIndex: 1,
        status: "COMPLIANT",
        evidenceDescription: "Full asset register with criticality ratings. Reviewed after each infrastructure change and quarterly. Approved by CISO.",
        lastAssessed: "2025-11-01T09:00:00Z",
      },
      {
        requirementIndex: 2,
        status: "COMPLIANT",
        evidenceDescription: "CERT-FR notified IR team member. Full IR playbook covering sensor loss, data manipulation, and system compromise. Tested with red team exercise September 2025.",
        lastAssessed: "2025-09-20T10:00:00Z",
      },
      {
        requirementIndex: 3,
        status: "COMPLIANT",
        evidenceDescription: "Notification procedure approved by ANSSI. Test notification completed Q1 2025. Thresholds and criteria documented and validated with ANSSI.",
        lastAssessed: "2025-03-15T11:00:00Z",
      },
      {
        requirementIndex: 4,
        status: "COMPLIANT",
        evidenceDescription: "Splunk Enterprise SIEM with 24/7 monitoring. SIEM integrated with all sensor sites and Toulouse operations. Custom detection rules for SSA-specific attack patterns.",
        lastAssessed: "2025-10-15T10:00:00Z",
      },
      {
        requirementIndex: 5,
        status: "COMPLIANT",
        evidenceDescription: "BCP/DRP tested annually with full failover simulation. RTO 2h for critical SSA services. Toulouse operations can run in degraded mode from any sensor site.",
        lastAssessed: "2025-11-05T09:00:00Z",
      },
      {
        requirementIndex: 7,
        status: "COMPLIANT",
        evidenceDescription: "All critical suppliers assessed. OVHcloud holds ISO 27001 and SecNumCloud qualification. Sensor maintenance contractors assessed against ANSSI baseline. Annual reviews.",
        lastAssessed: "2025-07-20T14:00:00Z",
      },
      {
        requirementIndex: 12,
        status: "COMPLIANT",
        evidenceDescription: "Security awareness via Proofpoint. Analysts receive CISA/ENISA space security training. Monthly phishing simulations. 100% training completion enforced.",
        lastAssessed: "2025-10-20T10:00:00Z",
      },
      {
        requirementIndex: 13,
        status: "COMPLIANT",
        evidenceDescription: "Cryptography policy compliant with ANSSI recommendations. AES-256-GCM for data at rest, TLS 1.3 for transit. WireGuard (ChaCha20-Poly1305) for sensor network. Annual review.",
        lastAssessed: "2025-06-10T09:00:00Z",
      },
      {
        requirementIndex: 14,
        status: "COMPLIANT",
        evidenceDescription: "No RF uplinks to spacecraft (SSA only). Data network uses WireGuard with certificate-based mutual authentication and automated key rotation every 30 days.",
        lastAssessed: "2025-07-05T10:00:00Z",
      },
      {
        requirementIndex: 15,
        status: "COMPLIANT",
        evidenceDescription: "HR security policy enforced. National security clearance required for analysts with access to classified SSA data. Quarterly access reviews. Strict off-boarding process.",
        lastAssessed: "2025-09-10T11:00:00Z",
      },
      {
        requirementIndex: 16,
        status: "COMPLIANT",
        evidenceDescription: "Hardware MFA (FIDO2 keys) for all privileged access. Software TOTP for standard access. No SMS-based MFA permitted. Enforced via SSO (Keycloak).",
        lastAssessed: "2025-08-15T10:00:00Z",
      },
      // PARTIALLY_COMPLIANT (3)
      {
        requirementIndex: 8,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "OVHcloud formally assessed. Sensor maintenance contractors have signed security requirements but have not been independently audited.",
        notes: "Independent audit of sensor site contractors planned H1 2026.",
        lastAssessed: "2025-10-01T10:00:00Z",
      },
      {
        requirementIndex: 10,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Software-defined sensors can be patched remotely. Legacy radar firmware (2019 vintage) has known CVEs that cannot be patched without physical access and downtime window.",
        notes: "Radar firmware upgrade scheduled for Q3 2026 maintenance window.",
        lastAssessed: "2025-11-01T10:00:00Z",
      },
      {
        requirementIndex: 11,
        status: "PARTIALLY_COMPLIANT",
        evidenceDescription: "Annual penetration test by external firm (report on file, August 2025). Vulnerability scanner deployed. No formalised cybersecurity metrics programme or executive dashboard.",
        notes: "Cybersecurity effectiveness metrics programme to be implemented Q1 2026.",
        lastAssessed: "2025-08-30T14:00:00Z",
      },
      // NON_COMPLIANT (1)
      {
        requirementIndex: 17,
        status: "NON_COMPLIANT",
        evidenceDescription: "",
        notes: "Emergency communications rely on standard commercial channels. No dedicated out-of-band secure comms for crisis scenarios. Identified gap since 2024. TETRA radio solution under procurement.",
        lastAssessed: "2025-11-01T10:00:00Z",
      },
      // NOT_ASSESSED (2)
      { requirementIndex: 6, status: "NOT_ASSESSED" },
      { requirementIndex: 9, status: "NOT_ASSESSED" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const sql = postgres(connectionString);

  try {
    // Fetch all requirement IDs ordered by title (consistent with seed order)
    const reqRows = await sql<Array<{ id: string; title: string }>>`
      SELECT id, title FROM compliance_requirements ORDER BY created_at ASC
    `;

    if (reqRows.length === 0) {
      console.error(
        "No compliance requirements found. Run 'npx tsx seed-data/seed.ts' first."
      );
      process.exit(1);
    }

    console.log(`Found ${reqRows.length} compliance requirements in database.`);
    const reqIds = reqRows.map((r) => r.id);

    for (const { org, assets, mappings, suppliers: orgSupplierDefs } of ORGS) {
      console.log(`\nProcessing: ${org.name}`);

      // Idempotent: delete existing org by name (cascades to assets + mappings)
      const deleted = await sql`
        DELETE FROM organizations WHERE name = ${org.name} RETURNING id
      `;
      if (deleted.length > 0) {
        console.log(`  Deleted existing org (id: ${deleted[0].id}) and all dependents`);
      }

      // Insert organisation
      const [orgRow] = await sql<Array<{ id: string }>>`
        INSERT INTO organizations
          (name, nis2_classification, country, sector, contact_email, contact_name)
        VALUES (
          ${org.name},
          ${org.nis2Classification}::nis2_classification,
          ${org.country},
          ${org.sector},
          ${org.contactEmail},
          ${org.contactName}
        )
        RETURNING id
      `;
      const orgId = orgRow.id;
      console.log(`  Created org ${orgId}`);

      // Insert assets
      const assetIds: string[] = [];
      for (const asset of assets) {
        const [assetRow] = await sql<Array<{ id: string }>>`
          INSERT INTO space_assets
            (organization_id, name, asset_type, description, metadata, asset_status, criticality)
          VALUES (
            ${orgId},
            ${asset.name},
            ${asset.assetType}::asset_type,
            ${asset.description ?? null},
            ${asset.metadata ? JSON.stringify(asset.metadata) : null},
            ${asset.status}::asset_status,
            ${asset.criticality}::criticality
          )
          RETURNING id
        `;
        assetIds.push(assetRow.id);
      }
      console.log(`  Created ${assetIds.length} assets`);

      // Validate mapping coverage
      const coveredIndices = new Set(mappings.map((m) => m.requirementIndex));
      for (let i = 0; i < reqIds.length; i++) {
        if (!coveredIndices.has(i)) {
          console.warn(
            `  WARNING: requirement index ${i} ("${reqRows[i]?.title ?? "?"}") not covered in mappings`
          );
        }
      }

      // Insert compliance mappings (org-level, no asset_id)
      let mappingCount = 0;
      for (const m of mappings) {
        const reqId = reqIds[m.requirementIndex];
        if (!reqId) {
          console.warn(`  Skipping mapping: no requirement at index ${m.requirementIndex}`);
          continue;
        }
        await sql`
          INSERT INTO compliance_mappings
            (organization_id, requirement_id, status, evidence_description, notes, last_assessed)
          VALUES (
            ${orgId},
            ${reqId},
            ${m.status}::compliance_status,
            ${m.evidenceDescription ?? null},
            ${m.notes ?? null},
            ${m.lastAssessed ? new Date(m.lastAssessed) : null}
          )
        `;
        mappingCount++;
      }
      console.log(`  Created ${mappingCount} compliance mappings`);

      // Insert suppliers (if defined)
      const orgSuppliers = orgSupplierDefs ?? [];
      let supplierCount = 0;
      for (const sup of orgSuppliers) {
        await sql`
          INSERT INTO suppliers
            (organization_id, name, type, country, criticality, description, security_assessment)
          VALUES (
            ${orgId},
            ${sup.name},
            ${sup.type}::supplier_type,
            ${sup.country},
            ${sup.criticality}::supplier_criticality,
            ${sup.description ?? null},
            ${sup.securityAssessment ? JSON.stringify(sup.securityAssessment) : null}
          )
        `;
        supplierCount++;
      }
      if (supplierCount > 0) {
        console.log(`  Created ${supplierCount} suppliers`);
      }
    }

    console.log("\nDone! Summary:");
    const orgCount = await sql<Array<{ count: string }>>`SELECT count(*)::text as count FROM organizations`;
    const assetCount = await sql<Array<{ count: string }>>`SELECT count(*)::text as count FROM space_assets`;
    const mappingCount = await sql<Array<{ count: string }>>`SELECT count(*)::text as count FROM compliance_mappings`;
    const supplierCountTotal = await sql<Array<{ count: string }>>`SELECT count(*)::text as count FROM suppliers`;
    console.log(`  Organizations: ${orgCount[0].count}`);
    console.log(`  Assets: ${assetCount[0].count}`);
    console.log(`  Compliance mappings: ${mappingCount[0].count}`);
    console.log(`  Suppliers: ${supplierCountTotal[0].count}`);
  } finally {
    await sql.end();
  }
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
