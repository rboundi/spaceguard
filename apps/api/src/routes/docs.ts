/**
 * OpenAPI 3.1 specification + Swagger UI route for SpaceGuard API.
 *
 * Serves:
 *   GET /api/docs           - Swagger UI (dark theme)
 *   GET /api/docs/openapi.json - Raw OpenAPI spec
 */

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function paginatedResponse(itemRef: string) {
  return {
    type: "object" as const,
    properties: {
      data: { type: "array" as const, items: ref(itemRef) },
      total: { type: "integer" as const },
      page: { type: "integer" as const },
      perPage: { type: "integer" as const },
    },
  };
}

function errorResponse(desc: string) {
  return {
    description: desc,
    content: {
      "application/json": {
        schema: ref("ErrorResponse"),
      },
    },
  };
}

function jsonBody(schemaRef: string, required = true) {
  return {
    required,
    content: { "application/json": { schema: ref(schemaRef) } },
  };
}

function jsonResponse(schemaRef: string, desc = "Success") {
  return {
    description: desc,
    content: { "application/json": { schema: ref(schemaRef) } },
  };
}

function paginatedJsonResponse(itemRef: string, desc = "Paginated list") {
  return {
    description: desc,
    content: {
      "application/json": { schema: paginatedResponse(itemRef) },
    },
  };
}

function pdfResponse(desc = "PDF document") {
  return {
    description: desc,
    content: { "application/pdf": { schema: { type: "string" as const, format: "binary" } } },
  };
}

function csvResponse(desc = "CSV file") {
  return {
    description: desc,
    content: { "text/csv": { schema: { type: "string" as const } } },
  };
}

function qp(name: string, type: string, desc: string, required = false, enumValues?: string[]) {
  const p: Record<string, unknown> = { name, in: "query", description: desc, required, schema: { type } };
  if (enumValues) (p.schema as Record<string, unknown>).enum = enumValues;
  return p;
}

function pp(name: string, desc: string) {
  return { name, in: "path", required: true, description: desc, schema: { type: "string", format: "uuid" } };
}

const bearerAuth = [{ BearerAuth: [] }];

// ---------------------------------------------------------------------------
// Enum values (kept in sync with packages/shared/src/enums.ts)
// ---------------------------------------------------------------------------

const AssetType = ["LEO_SATELLITE", "MEO_SATELLITE", "GEO_SATELLITE", "GROUND_STATION", "CONTROL_CENTER", "UPLINK", "DOWNLINK", "INTER_SATELLITE_LINK", "DATA_CENTER", "NETWORK_SEGMENT"];
const AssetStatus = ["OPERATIONAL", "DEGRADED", "MAINTENANCE", "DECOMMISSIONED"];
const Criticality = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const NIS2Classification = ["ESSENTIAL", "IMPORTANT"];
const Regulation = ["NIS2", "CRA", "EU_SPACE_ACT", "ENISA_SPACE"];
const ComplianceStatus = ["NOT_ASSESSED", "NON_COMPLIANT", "PARTIALLY_COMPLIANT", "COMPLIANT"];
const AlertSeverity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const AlertStatus = ["NEW", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"];
const IncidentSeverity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const IncidentStatus = ["DETECTED", "TRIAGING", "INVESTIGATING", "CONTAINING", "ERADICATING", "RECOVERING", "CLOSED", "FALSE_POSITIVE"];
const IncidentNis2 = ["SIGNIFICANT", "NON_SIGNIFICANT"];
const ReportType = ["EARLY_WARNING", "INCIDENT_NOTIFICATION", "INTERMEDIATE_REPORT", "FINAL_REPORT"];
const StreamProtocol = ["CCSDS_TM", "CCSDS_TC", "SYSLOG", "SNMP", "CUSTOM"];
const StreamStatus = ["ACTIVE", "PAUSED", "ERROR"];
const LogSeverity = ["DEBUG", "INFO", "NOTICE", "WARNING", "ERROR", "CRITICAL", "ALERT", "EMERGENCY"];
const UserRole = ["ADMIN", "OPERATOR", "VIEWER", "AUDITOR"];
const SupplierType = ["COMPONENT_MANUFACTURER", "GROUND_STATION_OPERATOR", "LAUNCH_PROVIDER", "CLOUD_PROVIDER", "SOFTWARE_VENDOR", "INTEGRATION_PARTNER", "DATA_RELAY_PROVIDER"];
const SyslogProtocol = ["UDP", "TCP", "TLS"];
const SyslogFormat = ["CEF", "LEEF", "JSON"];
const StixType = ["attack-pattern", "indicator", "threat-actor", "relationship", "malware", "course-of-action", "identity", "vulnerability"];

// ---------------------------------------------------------------------------
// OpenAPI Specification
// ---------------------------------------------------------------------------

const spec = {
  openapi: "3.1.0",
  info: {
    title: "SpaceGuard API",
    version: "1.0.0",
    description:
      "Cybersecurity platform for European satellite operators. " +
      "Provides asset registry, NIS2 compliance mapping, telemetry ingestion, " +
      "anomaly detection, alerting, incident management, threat intelligence, " +
      "supply chain risk management, and SIEM integration.",
    contact: { name: "SpaceGuard Team", email: "security@spaceguard.eu" },
    license: { name: "Proprietary" },
  },
  servers: [
    { url: "http://localhost:3001", description: "Local development" },
  ],
  tags: [
    { name: "Auth", description: "Authentication and user management" },
    { name: "Organizations", description: "Organization CRUD" },
    { name: "Assets", description: "Space asset registry" },
    { name: "Compliance", description: "NIS2/ENISA compliance mapping and dashboard" },
    { name: "Telemetry", description: "Telemetry stream management and data ingestion" },
    { name: "Alerts", description: "Detection engine alerts" },
    { name: "Incidents", description: "Incident management and NIS2 reporting" },
    { name: "Intel", description: "STIX/SPARTA threat intelligence" },
    { name: "Supply Chain", description: "Supplier risk management" },
    { name: "Anomaly", description: "Anomaly detection baselines and stats" },
    { name: "Reports", description: "PDF and statistical report generation" },
    { name: "Exports", description: "CSV and STIX 2.1 bundle exports" },
    { name: "Audit", description: "Audit trail" },
    { name: "Settings", description: "Platform settings and configuration" },
    { name: "Integrations", description: "Syslog/SIEM integration endpoints" },
    { name: "ENISA", description: "ENISA Space Threat Landscape controls" },
    { name: "Admin", description: "Admin-only SPARTA data management" },
  ],

  // -------------------------------------------------------------------------
  // Paths
  // -------------------------------------------------------------------------
  paths: {
    // === Auth ===
    "/api/v1/auth/setup-status": {
      get: {
        tags: ["Auth"], summary: "Check bootstrap status", operationId: "getSetupStatus",
        description: "Returns whether any users exist. If not, the first registration is allowed without admin auth.",
        responses: { "200": jsonResponse("SetupStatus") },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"], summary: "Log in", operationId: "login",
        requestBody: jsonBody("LoginRequest"),
        responses: { "200": jsonResponse("LoginResponse"), "401": errorResponse("Invalid credentials") },
      },
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"], summary: "Register user", operationId: "register",
        description: "Public if no users exist (bootstrap). Otherwise requires ADMIN role.",
        requestBody: jsonBody("RegisterRequest"),
        responses: { "201": jsonResponse("UserResponse"), "400": errorResponse("Validation error"), "403": errorResponse("Not authorized") },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"], summary: "Log out", operationId: "logout", security: bearerAuth,
        responses: { "200": jsonResponse("MessageResponse") },
      },
    },
    "/api/v1/auth/me": {
      get: {
        tags: ["Auth"], summary: "Get current user", operationId: "getMe", security: bearerAuth,
        responses: { "200": jsonResponse("UserResponse") },
      },
      put: {
        tags: ["Auth"], summary: "Update profile", operationId: "updateProfile", security: bearerAuth,
        requestBody: jsonBody("UpdateProfileRequest"),
        responses: { "200": jsonResponse("UserResponse") },
      },
    },
    "/api/v1/users": {
      get: {
        tags: ["Auth"], summary: "List users (admin)", operationId: "listUsers", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Filter by organization"),
          qp("page", "integer", "Page number"),
          qp("perPage", "integer", "Items per page"),
        ],
        responses: { "200": paginatedJsonResponse("UserResponse") },
      },
    },
    "/api/v1/users/{id}": {
      put: {
        tags: ["Auth"], summary: "Update user (admin)", operationId: "updateUser", security: bearerAuth,
        parameters: [pp("id", "User ID")],
        requestBody: jsonBody("UpdateUserRequest"),
        responses: { "200": jsonResponse("UserResponse"), "404": errorResponse("User not found") },
      },
    },

    // === Organizations ===
    "/api/v1/organizations": {
      post: {
        tags: ["Organizations"], summary: "Create organization", operationId: "createOrganization", security: bearerAuth,
        requestBody: jsonBody("CreateOrganization"),
        responses: { "201": jsonResponse("OrganizationResponse"), "400": errorResponse("Validation error") },
      },
      get: {
        tags: ["Organizations"], summary: "List organizations", operationId: "listOrganizations", security: bearerAuth,
        responses: {
          "200": {
            description: "Organization list",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: ref("OrganizationResponse") } } } } },
          },
        },
      },
    },
    "/api/v1/organizations/{id}": {
      get: {
        tags: ["Organizations"], summary: "Get organization", operationId: "getOrganization", security: bearerAuth,
        parameters: [pp("id", "Organization ID")],
        responses: { "200": jsonResponse("OrganizationResponse"), "404": errorResponse("Not found") },
      },
      put: {
        tags: ["Organizations"], summary: "Update organization", operationId: "updateOrganization", security: bearerAuth,
        parameters: [pp("id", "Organization ID")],
        requestBody: jsonBody("UpdateOrganization"),
        responses: { "200": jsonResponse("OrganizationResponse"), "404": errorResponse("Not found") },
      },
    },

    // === Assets ===
    "/api/v1/assets": {
      post: {
        tags: ["Assets"], summary: "Create asset", operationId: "createAsset", security: bearerAuth,
        requestBody: jsonBody("CreateAsset"),
        responses: { "201": jsonResponse("AssetResponse"), "400": errorResponse("Validation error") },
      },
      get: {
        tags: ["Assets"], summary: "List assets", operationId: "listAssets", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Filter by organization"),
          qp("type", "string", "Filter by asset type", false, AssetType),
          qp("status", "string", "Filter by status", false, AssetStatus),
          qp("q", "string", "Search by name"),
          qp("page", "integer", "Page number"),
          qp("perPage", "integer", "Items per page"),
        ],
        responses: { "200": paginatedJsonResponse("AssetResponse") },
      },
    },
    "/api/v1/assets/{id}": {
      get: {
        tags: ["Assets"], summary: "Get asset", operationId: "getAsset", security: bearerAuth,
        parameters: [pp("id", "Asset ID")],
        responses: { "200": jsonResponse("AssetResponse"), "404": errorResponse("Not found") },
      },
      put: {
        tags: ["Assets"], summary: "Update asset", operationId: "updateAsset", security: bearerAuth,
        parameters: [pp("id", "Asset ID")],
        requestBody: jsonBody("UpdateAsset"),
        responses: { "200": jsonResponse("AssetResponse"), "404": errorResponse("Not found") },
      },
      delete: {
        tags: ["Assets"], summary: "Delete asset (decommission)", operationId: "deleteAsset", security: bearerAuth,
        parameters: [pp("id", "Asset ID")],
        responses: { "200": jsonResponse("AssetResponse"), "404": errorResponse("Not found") },
      },
    },

    // === Compliance ===
    "/api/v1/compliance/requirements": {
      get: {
        tags: ["Compliance"], summary: "List compliance requirements", operationId: "listRequirements", security: bearerAuth,
        parameters: [
          qp("regulation", "string", "Filter by regulation", false, Regulation),
          qp("category", "string", "Filter by category"),
        ],
        responses: {
          "200": {
            description: "Requirements list",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: ref("ComplianceRequirement") } } } } },
          },
        },
      },
    },
    "/api/v1/compliance/requirements/{id}": {
      get: {
        tags: ["Compliance"], summary: "Get requirement", operationId: "getRequirement", security: bearerAuth,
        parameters: [pp("id", "Requirement ID")],
        responses: { "200": jsonResponse("ComplianceRequirement"), "404": errorResponse("Not found") },
      },
    },
    "/api/v1/compliance/mappings": {
      post: {
        tags: ["Compliance"], summary: "Create mapping", operationId: "createMapping", security: bearerAuth,
        requestBody: jsonBody("CreateMapping"),
        responses: { "201": jsonResponse("MappingResponse"), "400": errorResponse("Validation error") },
      },
      get: {
        tags: ["Compliance"], summary: "List mappings", operationId: "listMappings", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Filter by organization"),
          qp("assetId", "string", "Filter by asset"),
          qp("requirementId", "string", "Filter by requirement"),
          qp("status", "string", "Filter by status", false, ComplianceStatus),
        ],
        responses: {
          "200": {
            description: "Mappings list",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: ref("MappingResponse") } } } } },
          },
        },
      },
    },
    "/api/v1/compliance/mappings/{id}": {
      put: {
        tags: ["Compliance"], summary: "Update mapping", operationId: "updateMapping", security: bearerAuth,
        parameters: [pp("id", "Mapping ID")],
        requestBody: jsonBody("UpdateMapping"),
        responses: { "200": jsonResponse("MappingResponse"), "404": errorResponse("Not found") },
      },
      delete: {
        tags: ["Compliance"], summary: "Delete mapping", operationId: "deleteMapping", security: bearerAuth,
        parameters: [pp("id", "Mapping ID")],
        responses: { "200": { description: "Deleted", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" } } } } } } },
      },
    },
    "/api/v1/compliance/dashboard": {
      get: {
        tags: ["Compliance"], summary: "Compliance dashboard", operationId: "complianceDashboard", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true)],
        responses: { "200": jsonResponse("ComplianceDashboard") },
      },
    },
    "/api/v1/compliance/initialize": {
      post: {
        tags: ["Compliance"], summary: "Initialize compliance mappings", operationId: "initializeCompliance", security: bearerAuth,
        description: "Creates default NOT_ASSESSED mappings for all requirements for the given organization.",
        requestBody: jsonBody("InitializeCompliance"),
        responses: { "200": { description: "Initialization result", content: { "application/json": { schema: { type: "object", properties: { created: { type: "integer" }, total: { type: "integer" } } } } } } },
      },
    },

    // === Telemetry ===
    "/api/v1/telemetry/streams": {
      post: {
        tags: ["Telemetry"], summary: "Create telemetry stream", operationId: "createStream", security: bearerAuth,
        requestBody: jsonBody("CreateStream"),
        responses: { "201": jsonResponse("StreamResponse"), "400": errorResponse("Validation error") },
      },
      get: {
        tags: ["Telemetry"], summary: "List streams", operationId: "listStreams", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Filter by organization"),
          qp("assetId", "string", "Filter by asset"),
          qp("status", "string", "Filter by status", false, StreamStatus),
          qp("page", "integer", "Page number"),
          qp("perPage", "integer", "Items per page"),
        ],
        responses: { "200": paginatedJsonResponse("StreamResponse") },
      },
    },
    "/api/v1/telemetry/streams/{id}": {
      get: {
        tags: ["Telemetry"], summary: "Get stream", operationId: "getStream", security: bearerAuth,
        parameters: [pp("id", "Stream ID")],
        responses: { "200": jsonResponse("StreamResponse"), "404": errorResponse("Not found") },
      },
      put: {
        tags: ["Telemetry"], summary: "Update stream", operationId: "updateStream", security: bearerAuth,
        parameters: [pp("id", "Stream ID")],
        requestBody: jsonBody("UpdateStream"),
        responses: { "200": jsonResponse("StreamResponse"), "404": errorResponse("Not found") },
      },
    },
    "/api/v1/telemetry/ingest/{streamId}": {
      post: {
        tags: ["Telemetry"], summary: "Ingest telemetry (JSON)", operationId: "ingestTelemetry",
        description: "Authenticated via X-API-Key header (not JWT). Send batches of telemetry data points.",
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "streamId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: jsonBody("IngestBatch"),
        responses: {
          "200": { description: "Ingestion result", content: { "application/json": { schema: { type: "object", properties: { inserted: { type: "integer" }, failed: { type: "integer" } } } } } },
          "401": errorResponse("Invalid API key"),
        },
      },
    },
    "/api/v1/telemetry/ingest/{streamId}/ccsds": {
      post: {
        tags: ["Telemetry"], summary: "Ingest CCSDS packets", operationId: "ingestCcsds",
        description: "Authenticated via X-API-Key header. Send raw CCSDS binary packet data.",
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "streamId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: { required: true, content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
        responses: {
          "200": { description: "Parse result", content: { "application/json": { schema: { type: "object", properties: { parsed: { type: "integer" }, ingested: { type: "integer" } } } } } },
        },
      },
    },
    "/api/v1/telemetry/points": {
      get: {
        tags: ["Telemetry"], summary: "Query telemetry points", operationId: "queryTelemetry", security: bearerAuth,
        parameters: [
          qp("streamId", "string", "Stream ID", true),
          qp("from", "string", "Start time (ISO 8601)", true),
          qp("to", "string", "End time (ISO 8601)", true),
          qp("parameterName", "string", "Filter by parameter name"),
          qp("page", "integer", "Page number"),
          qp("perPage", "integer", "Items per page"),
        ],
        responses: { "200": paginatedJsonResponse("TelemetryPoint") },
      },
    },
    "/api/v1/telemetry/logs": {
      post: {
        tags: ["Telemetry"], summary: "Ingest ground segment log", operationId: "ingestLog", security: bearerAuth,
        requestBody: jsonBody("LogEntry"),
        responses: { "201": jsonResponse("LogResponse") },
      },
      get: {
        tags: ["Telemetry"], summary: "Query logs", operationId: "queryLogs", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Organization ID", true),
          qp("source", "string", "Log source"),
          qp("severity", "string", "Minimum severity", false, LogSeverity),
          qp("from", "string", "Start time"),
          qp("to", "string", "End time"),
          qp("q", "string", "Search text"),
          qp("page", "integer", "Page number"),
          qp("perPage", "integer", "Items per page"),
        ],
        responses: { "200": paginatedJsonResponse("LogResponse") },
      },
    },

    // === Alerts ===
    "/api/v1/alerts": {
      get: {
        tags: ["Alerts"], summary: "List alerts", operationId: "listAlerts", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Organization ID", true),
          qp("severity", "string", "Filter by severity", false, AlertSeverity),
          qp("status", "string", "Filter by status", false, AlertStatus),
          qp("streamId", "string", "Filter by stream"),
          qp("affectedAssetId", "string", "Filter by asset"),
          qp("ruleId", "string", "Filter by rule"),
          qp("spartaTactic", "string", "Filter by SPARTA tactic"),
          qp("from", "string", "Start time"),
          qp("to", "string", "End time"),
          qp("page", "integer", "Page number"),
          qp("perPage", "integer", "Items per page"),
        ],
        responses: { "200": paginatedJsonResponse("AlertResponse") },
      },
    },
    "/api/v1/alerts/rules": {
      get: {
        tags: ["Alerts"], summary: "List detection rules", operationId: "listRules", security: bearerAuth,
        responses: {
          "200": { description: "Rule library", content: { "application/json": { schema: { type: "object", properties: { rules: { type: "array", items: ref("DetectionRule") }, total: { type: "integer" } } } } } },
        },
      },
    },
    "/api/v1/alerts/stats": {
      get: {
        tags: ["Alerts"], summary: "Alert statistics", operationId: "alertStats", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true)],
        responses: { "200": jsonResponse("AlertStats") },
      },
    },
    "/api/v1/alerts/{id}": {
      get: {
        tags: ["Alerts"], summary: "Get alert", operationId: "getAlert", security: bearerAuth,
        parameters: [pp("id", "Alert ID")],
        responses: { "200": jsonResponse("AlertResponse"), "404": errorResponse("Not found") },
      },
      put: {
        tags: ["Alerts"], summary: "Update alert", operationId: "updateAlert", security: bearerAuth,
        parameters: [pp("id", "Alert ID")],
        requestBody: jsonBody("UpdateAlert"),
        responses: { "200": jsonResponse("AlertResponse"), "404": errorResponse("Not found") },
      },
    },

    // === Incidents ===
    "/api/v1/incidents": {
      post: {
        tags: ["Incidents"], summary: "Create incident", operationId: "createIncident", security: bearerAuth,
        requestBody: jsonBody("CreateIncident"),
        responses: { "201": jsonResponse("IncidentResponse"), "400": errorResponse("Validation error") },
      },
      get: {
        tags: ["Incidents"], summary: "List incidents", operationId: "listIncidents", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Organization ID", true),
          qp("severity", "string", "Filter by severity", false, IncidentSeverity),
          qp("status", "string", "Filter by status", false, IncidentStatus),
          qp("from", "string", "Start time"),
          qp("to", "string", "End time"),
          qp("page", "integer", "Page number"),
          qp("perPage", "integer", "Items per page"),
        ],
        responses: { "200": paginatedJsonResponse("IncidentResponse") },
      },
    },
    "/api/v1/incidents/stats": {
      get: {
        tags: ["Incidents"], summary: "Incident statistics", operationId: "incidentStats", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true)],
        responses: { "200": { description: "Stats", content: { "application/json": { schema: { type: "object", properties: { activeCount: { type: "integer" } } } } } } },
      },
    },
    "/api/v1/incidents/{id}": {
      get: {
        tags: ["Incidents"], summary: "Get incident", operationId: "getIncident", security: bearerAuth,
        parameters: [pp("id", "Incident ID")],
        responses: { "200": jsonResponse("IncidentResponse"), "404": errorResponse("Not found") },
      },
      put: {
        tags: ["Incidents"], summary: "Update incident", operationId: "updateIncident", security: bearerAuth,
        parameters: [pp("id", "Incident ID")],
        requestBody: jsonBody("UpdateIncident"),
        responses: { "200": jsonResponse("IncidentResponse"), "404": errorResponse("Not found") },
      },
    },
    "/api/v1/incidents/{id}/alerts": {
      post: {
        tags: ["Incidents"], summary: "Link alert to incident", operationId: "linkAlert", security: bearerAuth,
        parameters: [pp("id", "Incident ID")],
        requestBody: jsonBody("LinkAlert"),
        responses: { "201": jsonResponse("IncidentAlertLink") },
      },
      get: {
        tags: ["Incidents"], summary: "List linked alerts", operationId: "listIncidentAlerts", security: bearerAuth,
        parameters: [pp("id", "Incident ID")],
        responses: {
          "200": { description: "Linked alerts", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: ref("IncidentAlertLink") } } } } } },
        },
      },
    },
    "/api/v1/incidents/{id}/notes": {
      post: {
        tags: ["Incidents"], summary: "Add note", operationId: "addNote", security: bearerAuth,
        parameters: [pp("id", "Incident ID")],
        requestBody: jsonBody("CreateNote"),
        responses: { "201": jsonResponse("NoteResponse") },
      },
      get: {
        tags: ["Incidents"], summary: "List notes", operationId: "listNotes", security: bearerAuth,
        parameters: [pp("id", "Incident ID")],
        responses: {
          "200": { description: "Notes", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: ref("NoteResponse") } } } } } },
        },
      },
    },
    "/api/v1/incidents/{id}/reports": {
      post: {
        tags: ["Incidents"], summary: "Generate NIS2 report", operationId: "generateReport", security: bearerAuth,
        parameters: [pp("id", "Incident ID")],
        requestBody: jsonBody("CreateIncidentReport"),
        responses: { "201": jsonResponse("IncidentReportResponse") },
      },
      get: {
        tags: ["Incidents"], summary: "List NIS2 reports", operationId: "listReports", security: bearerAuth,
        parameters: [pp("id", "Incident ID")],
        responses: {
          "200": { description: "Reports", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: ref("IncidentReportResponse") } } } } } },
        },
      },
    },
    "/api/v1/incidents/{id}/reports/{reportId}/submit": {
      put: {
        tags: ["Incidents"], summary: "Mark report as submitted", operationId: "submitReport", security: bearerAuth,
        parameters: [pp("id", "Incident ID"), { name: "reportId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: jsonBody("SubmitReport"),
        responses: { "200": jsonResponse("IncidentReportResponse") },
      },
    },

    // === Intel ===
    "/api/v1/intel": {
      get: {
        tags: ["Intel"], summary: "List threat intel", operationId: "listIntel", security: bearerAuth,
        parameters: [
          qp("stixType", "string", "Filter by STIX type", false, StixType),
          qp("source", "string", "Filter by source"),
          qp("tactic", "string", "Filter by SPARTA tactic"),
          qp("q", "string", "Search query"),
          qp("page", "integer", "Page number"),
          qp("perPage", "integer", "Items per page"),
        ],
        responses: { "200": paginatedJsonResponse("IntelResponse") },
      },
      post: {
        tags: ["Intel"], summary: "Create threat intel", operationId: "createIntel", security: bearerAuth,
        requestBody: jsonBody("CreateIntel"),
        responses: { "201": jsonResponse("IntelResponse"), "400": errorResponse("Validation error") },
      },
    },
    "/api/v1/intel/search": {
      get: {
        tags: ["Intel"], summary: "Search threat intel", operationId: "searchIntel", security: bearerAuth,
        parameters: [qp("q", "string", "Search query", true), qp("limit", "integer", "Max results")],
        responses: { "200": paginatedJsonResponse("IntelResponse") },
      },
    },
    "/api/v1/intel/{id}": {
      get: {
        tags: ["Intel"], summary: "Get intel object", operationId: "getIntel", security: bearerAuth,
        parameters: [pp("id", "Intel UUID")],
        responses: { "200": jsonResponse("IntelResponse"), "404": errorResponse("Not found") },
      },
    },
    "/api/v1/intel/enrich/alert/{alertId}": {
      get: {
        tags: ["Intel"], summary: "SPARTA enrichment for alert", operationId: "enrichAlert", security: bearerAuth,
        parameters: [{ name: "alertId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": jsonResponse("AlertEnrichment") },
      },
    },
    "/api/v1/intel/tactics/{tacticId}/techniques": {
      get: {
        tags: ["Intel"], summary: "List techniques for tactic", operationId: "listTechniques", security: bearerAuth,
        parameters: [{ name: "tacticId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": paginatedJsonResponse("IntelResponse") },
      },
    },
    "/api/v1/intel/techniques/search": {
      get: {
        tags: ["Intel"], summary: "Search techniques", operationId: "searchTechniques", security: bearerAuth,
        parameters: [qp("q", "string", "Search query", true), qp("limit", "integer", "Max results")],
        responses: { "200": paginatedJsonResponse("IntelResponse") },
      },
    },
    "/api/v1/intel/techniques/{id}": {
      get: {
        tags: ["Intel"], summary: "Get technique with countermeasures", operationId: "getTechnique", security: bearerAuth,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": jsonResponse("IntelResponse") },
      },
    },

    // === Supply Chain ===
    "/api/v1/supply-chain/suppliers": {
      post: {
        tags: ["Supply Chain"], summary: "Create supplier", operationId: "createSupplier", security: bearerAuth,
        requestBody: jsonBody("CreateSupplier"),
        responses: { "201": jsonResponse("SupplierResponse"), "400": errorResponse("Validation error") },
      },
      get: {
        tags: ["Supply Chain"], summary: "List suppliers", operationId: "listSuppliers", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Organization ID"),
          qp("type", "string", "Supplier type", false, SupplierType),
          qp("criticality", "string", "Criticality", false, Criticality),
          qp("page", "integer", "Page number"),
          qp("perPage", "integer", "Items per page"),
        ],
        responses: { "200": paginatedJsonResponse("SupplierResponse") },
      },
    },
    "/api/v1/supply-chain/suppliers/{id}": {
      get: {
        tags: ["Supply Chain"], summary: "Get supplier", operationId: "getSupplier", security: bearerAuth,
        parameters: [pp("id", "Supplier ID")],
        responses: { "200": jsonResponse("SupplierResponse"), "404": errorResponse("Not found") },
      },
      put: {
        tags: ["Supply Chain"], summary: "Update supplier", operationId: "updateSupplier", security: bearerAuth,
        parameters: [pp("id", "Supplier ID")],
        requestBody: jsonBody("UpdateSupplier"),
        responses: { "200": jsonResponse("SupplierResponse"), "404": errorResponse("Not found") },
      },
      delete: {
        tags: ["Supply Chain"], summary: "Delete supplier", operationId: "deleteSupplier", security: bearerAuth,
        parameters: [pp("id", "Supplier ID")],
        responses: { "200": jsonResponse("SupplierResponse") },
      },
    },
    "/api/v1/supply-chain/risk-summary": {
      get: {
        tags: ["Supply Chain"], summary: "Risk summary", operationId: "riskSummary", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true)],
        responses: { "200": jsonResponse("RiskSummary") },
      },
    },

    // === Anomaly ===
    "/api/v1/anomaly/baselines": {
      get: {
        tags: ["Anomaly"], summary: "View baselines", operationId: "listBaselines", security: bearerAuth,
        parameters: [qp("streamId", "string", "Stream ID", true)],
        responses: { "200": paginatedJsonResponse("BaselineResponse") },
      },
    },
    "/api/v1/anomaly/baselines/{id}": {
      put: {
        tags: ["Anomaly"], summary: "Adjust baseline", operationId: "updateBaseline", security: bearerAuth,
        parameters: [pp("id", "Baseline ID")],
        requestBody: jsonBody("UpdateBaseline"),
        responses: { "200": jsonResponse("BaselineResponse") },
      },
    },
    "/api/v1/anomaly/stats": {
      get: {
        tags: ["Anomaly"], summary: "Anomaly stats", operationId: "anomalyStats", security: bearerAuth,
        parameters: [qp("streamId", "string", "Stream ID", true)],
        responses: { "200": jsonResponse("AnomalyStats") },
      },
    },

    // === Reports ===
    "/api/v1/reports/compliance/pdf": {
      get: {
        tags: ["Reports"], summary: "Compliance PDF report", operationId: "compliancePdf", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true)],
        responses: { "200": pdfResponse("Compliance report PDF") },
      },
    },
    "/api/v1/reports/incident-summary/stats": {
      get: {
        tags: ["Reports"], summary: "Incident summary stats", operationId: "incidentSummaryStats", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Organization ID", true),
          qp("from", "string", "Start date (YYYY-MM-DD)"),
          qp("to", "string", "End date (YYYY-MM-DD)"),
        ],
        responses: { "200": jsonResponse("IncidentSummaryStats") },
      },
    },
    "/api/v1/reports/incident-summary/pdf": {
      get: {
        tags: ["Reports"], summary: "Incident summary PDF", operationId: "incidentSummaryPdf", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Organization ID", true),
          qp("from", "string", "Start date"),
          qp("to", "string", "End date"),
        ],
        responses: { "200": pdfResponse("Incident summary PDF") },
      },
    },
    "/api/v1/reports/threat-briefing/pdf": {
      get: {
        tags: ["Reports"], summary: "Threat briefing PDF", operationId: "threatBriefingPdf", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true)],
        responses: { "200": pdfResponse("ENISA threat briefing PDF") },
      },
    },
    "/api/v1/reports/supply-chain/pdf": {
      get: {
        tags: ["Reports"], summary: "Supply chain risk PDF", operationId: "supplyChainPdf", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true)],
        responses: { "200": pdfResponse("Supply chain risk assessment PDF") },
      },
    },
    "/api/v1/reports/audit-trail/pdf": {
      get: {
        tags: ["Reports"], summary: "Audit trail PDF", operationId: "auditTrailPdf", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Organization ID", true),
          qp("from", "string", "Start date"),
          qp("to", "string", "End date"),
        ],
        responses: { "200": pdfResponse("Audit trail PDF") },
      },
    },

    // === Exports ===
    "/api/v1/export/alerts/csv": {
      get: {
        tags: ["Exports"], summary: "Export alerts CSV", operationId: "exportAlertsCsv", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true), qp("from", "string", "Start date"), qp("to", "string", "End date")],
        responses: { "200": csvResponse("Alerts CSV") },
      },
    },
    "/api/v1/export/incidents/csv": {
      get: {
        tags: ["Exports"], summary: "Export incidents CSV", operationId: "exportIncidentsCsv", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true), qp("from", "string", "Start date"), qp("to", "string", "End date")],
        responses: { "200": csvResponse("Incidents CSV") },
      },
    },
    "/api/v1/export/compliance/csv": {
      get: {
        tags: ["Exports"], summary: "Export compliance CSV", operationId: "exportComplianceCsv", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true)],
        responses: { "200": csvResponse("Compliance CSV") },
      },
    },
    "/api/v1/export/audit/csv": {
      get: {
        tags: ["Exports"], summary: "Export audit CSV", operationId: "exportAuditCsv", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true), qp("from", "string", "Start date"), qp("to", "string", "End date")],
        responses: { "200": csvResponse("Audit log CSV") },
      },
    },
    "/api/v1/export/stix": {
      post: {
        tags: ["Exports"], summary: "Export STIX 2.1 bundle", operationId: "exportStix", security: bearerAuth,
        requestBody: jsonBody("StixExportRequest"),
        responses: { "200": jsonResponse("StixBundle", "STIX 2.1 bundle") },
      },
    },

    // === Audit ===
    "/api/v1/audit": {
      get: {
        tags: ["Audit"], summary: "List audit logs", operationId: "listAuditLogs", security: bearerAuth,
        parameters: [
          qp("organizationId", "string", "Organization ID"),
          qp("from", "string", "Start time"),
          qp("to", "string", "End time"),
          qp("actor", "string", "Filter by actor"),
          qp("action", "string", "Filter by action"),
          qp("resourceType", "string", "Filter by resource type"),
          qp("page", "integer", "Page number"),
          qp("perPage", "integer", "Items per page"),
        ],
        responses: { "200": paginatedJsonResponse("AuditLogEntry") },
      },
    },

    // === Settings ===
    "/api/v1/settings/organization": {
      put: {
        tags: ["Settings"], summary: "Update organization settings", operationId: "updateOrgSettings", security: bearerAuth,
        requestBody: jsonBody("UpdateOrganization"),
        responses: { "200": jsonResponse("OrganizationResponse") },
      },
    },
    "/api/v1/settings/notifications": {
      put: {
        tags: ["Settings"], summary: "Update notification preferences", operationId: "updateNotifications", security: bearerAuth,
        requestBody: jsonBody("UpdateNotifications"),
        responses: { "200": { description: "Success", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" } } } } } } },
      },
    },
    "/api/v1/settings/notifications/test": {
      post: {
        tags: ["Settings"], summary: "Send test notification", operationId: "testNotification", security: bearerAuth,
        responses: { "200": jsonResponse("MessageResponse") },
      },
    },
    "/api/v1/settings/detection/rules": {
      get: {
        tags: ["Settings"], summary: "List detection rule overrides", operationId: "listRuleOverrides", security: bearerAuth,
        responses: {
          "200": { description: "Rules with overrides", content: { "application/json": { schema: { type: "object", properties: { rules: { type: "array", items: ref("DetectionRule") }, total: { type: "integer" } } } } } },
        },
      },
    },
    "/api/v1/settings/detection/rules/{ruleId}": {
      put: {
        tags: ["Settings"], summary: "Override detection rule", operationId: "overrideRule", security: bearerAuth,
        parameters: [{ name: "ruleId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: jsonBody("RuleOverride"),
        responses: { "200": jsonResponse("DetectionRule") },
      },
    },
    "/api/v1/settings/telemetry/streams/{id}/regenerate-key": {
      post: {
        tags: ["Settings"], summary: "Regenerate stream API key", operationId: "regenerateKey", security: bearerAuth,
        parameters: [pp("id", "Stream ID")],
        responses: { "200": { description: "New API key", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, apiKey: { type: "string" } } } } } } },
      },
    },
    "/api/v1/settings/telemetry/streams/{id}/rate-limit": {
      put: {
        tags: ["Settings"], summary: "Set stream rate limit", operationId: "setRateLimit", security: bearerAuth,
        parameters: [pp("id", "Stream ID")],
        requestBody: jsonBody("RateLimit"),
        responses: { "200": { description: "Updated", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, pointsPerMinute: { type: "integer" } } } } } } },
      },
    },

    // === Integrations (Syslog) ===
    "/api/v1/settings/syslog": {
      get: {
        tags: ["Integrations"], summary: "List syslog endpoints", operationId: "listSyslogEndpoints", security: bearerAuth,
        parameters: [qp("organizationId", "string", "Organization ID", true)],
        responses: { "200": paginatedJsonResponse("SyslogEndpoint") },
      },
      post: {
        tags: ["Integrations"], summary: "Create syslog endpoint", operationId: "createSyslogEndpoint", security: bearerAuth,
        requestBody: jsonBody("CreateSyslogEndpoint"),
        responses: { "201": jsonResponse("SyslogEndpoint"), "400": errorResponse("Validation error") },
      },
    },
    "/api/v1/settings/syslog/{id}": {
      put: {
        tags: ["Integrations"], summary: "Update syslog endpoint", operationId: "updateSyslogEndpoint", security: bearerAuth,
        parameters: [pp("id", "Endpoint ID")],
        requestBody: jsonBody("UpdateSyslogEndpoint"),
        responses: { "200": jsonResponse("SyslogEndpoint") },
      },
      delete: {
        tags: ["Integrations"], summary: "Delete syslog endpoint", operationId: "deleteSyslogEndpoint", security: bearerAuth,
        parameters: [pp("id", "Endpoint ID")],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/api/v1/settings/syslog/{id}/test": {
      post: {
        tags: ["Integrations"], summary: "Test syslog endpoint", operationId: "testSyslogEndpoint", security: bearerAuth,
        parameters: [pp("id", "Endpoint ID")],
        responses: { "200": jsonResponse("SyslogTestResult") },
      },
    },
    "/api/v1/settings/syslog/formats": {
      get: {
        tags: ["Integrations"], summary: "Syslog format documentation", operationId: "syslogFormats",
        responses: { "200": jsonResponse("SyslogFormatDocs") },
      },
    },

    // === ENISA ===
    "/api/v1/enisa/controls": {
      get: {
        tags: ["ENISA"], summary: "List ENISA controls", operationId: "listEnisaControls", security: bearerAuth,
        responses: {
          "200": { description: "ENISA controls", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: ref("EnisaControl") } } } } } },
        },
      },
    },
    "/api/v1/enisa/controls/{id}/sparta-techniques": {
      get: {
        tags: ["ENISA"], summary: "SPARTA techniques for control", operationId: "controlTechniques", security: bearerAuth,
        parameters: [pp("id", "Control ID")],
        responses: { "200": { description: "Techniques", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { type: "object" } } } } } } } },
      },
    },
    "/api/v1/enisa/sparta-mapping": {
      get: {
        tags: ["ENISA"], summary: "SPARTA/ENISA bidirectional mapping", operationId: "spartaEnisaMapping", security: bearerAuth,
        responses: { "200": { description: "Mapping", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },

    // === Admin ===
    "/api/v1/admin/sparta/import": {
      post: {
        tags: ["Admin"], summary: "Import STIX bundle", operationId: "spartaImport", security: bearerAuth,
        description: "Upload a STIX 2.1 bundle JSON file or raw JSON body. Max 20 MB.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } }, "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } } },
        responses: { "200": jsonResponse("SpartaImportDiff") },
      },
    },
    "/api/v1/admin/sparta/fetch": {
      post: {
        tags: ["Admin"], summary: "Fetch SPARTA from server", operationId: "spartaFetch", security: bearerAuth,
        requestBody: jsonBody("SpartaFetchRequest", false),
        responses: { "200": jsonResponse("SpartaImportDiff") },
      },
    },
    "/api/v1/admin/sparta/status": {
      get: {
        tags: ["Admin"], summary: "SPARTA import status", operationId: "spartaStatus", security: bearerAuth,
        responses: { "200": jsonResponse("SpartaStatus") },
      },
    },
    "/api/v1/admin/sparta/settings": {
      get: {
        tags: ["Admin"], summary: "Get SPARTA settings", operationId: "spartaGetSettings", security: bearerAuth,
        responses: { "200": { description: "Settings", content: { "application/json": { schema: { type: "object", properties: { spartaUrl: { type: "string" } } } } } } },
      },
      put: {
        tags: ["Admin"], summary: "Update SPARTA settings", operationId: "spartaUpdateSettings", security: bearerAuth,
        requestBody: jsonBody("SpartaSettings"),
        responses: { "200": { description: "Updated", content: { "application/json": { schema: { type: "object", properties: { spartaUrl: { type: "string" } } } } } } },
      },
    },
    "/api/v1/admin/sparta/duplicates": {
      post: {
        tags: ["Admin"], summary: "Check/clean STIX duplicates", operationId: "spartaDuplicates", security: bearerAuth,
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { autoClean: { type: "boolean" } } } } } },
        responses: { "200": jsonResponse("DuplicateReport") },
      },
    },

    // === Health ===
    "/health": {
      get: {
        tags: ["Health"], summary: "Health check", operationId: "healthCheck",
        responses: { "200": { description: "Healthy", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, version: { type: "string" } } } } } } },
      },
    },
  },

  // -------------------------------------------------------------------------
  // Components
  // -------------------------------------------------------------------------
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token obtained via POST /api/v1/auth/login",
      },
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "Stream API key for telemetry ingestion endpoints",
      },
    },

    schemas: {
      // -- Common --
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
          details: {},
        },
        required: ["error"],
      },
      MessageResponse: {
        type: "object",
        properties: { message: { type: "string" } },
      },
      SetupStatus: {
        type: "object",
        properties: { hasUsers: { type: "boolean" } },
      },

      // -- Auth --
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 1 },
        },
      },
      LoginResponse: {
        type: "object",
        properties: {
          user: ref("UserResponse"),
          token: { type: "string" },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["email", "password", "name", "organizationId"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          name: { type: "string", minLength: 1, maxLength: 255 },
          organizationId: { type: "string", format: "uuid" },
          role: { type: "string", enum: UserRole, default: "VIEWER" },
        },
      },
      UpdateProfileRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          password: { type: "string", minLength: 8 },
          notifyCriticalAlerts: { type: "boolean" },
          notifyDeadlines: { type: "boolean" },
          notifyWeeklyDigest: { type: "boolean" },
        },
      },
      UpdateUserRequest: {
        type: "object",
        properties: {
          role: { type: "string", enum: UserRole },
          isActive: { type: "boolean" },
          name: { type: "string" },
        },
      },
      UserResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          role: { type: "string", enum: UserRole },
          organizationId: { type: "string", format: "uuid" },
          isActive: { type: "boolean" },
          notifyCriticalAlerts: { type: "boolean" },
          notifyDeadlines: { type: "boolean" },
          notifyWeeklyDigest: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      // -- Organizations --
      CreateOrganization: {
        type: "object",
        required: ["name", "nis2Classification", "country", "contactEmail", "contactName"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          nis2Classification: { type: "string", enum: NIS2Classification },
          country: { type: "string", minLength: 2, maxLength: 2, description: "ISO 3166-1 alpha-2" },
          sector: { type: "string", default: "space" },
          contactEmail: { type: "string", format: "email" },
          contactName: { type: "string", minLength: 1, maxLength: 255 },
        },
      },
      UpdateOrganization: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          nis2Classification: { type: "string", enum: NIS2Classification },
          country: { type: "string", minLength: 2, maxLength: 2 },
          sector: { type: "string" },
          contactEmail: { type: "string", format: "email" },
          contactName: { type: "string" },
        },
      },
      OrganizationResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          nis2Classification: { type: "string", enum: NIS2Classification },
          country: { type: "string" },
          sector: { type: "string" },
          contactEmail: { type: "string" },
          contactName: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      // -- Assets --
      CreateAsset: {
        type: "object",
        required: ["organizationId", "name", "assetType"],
        properties: {
          organizationId: { type: "string", format: "uuid" },
          name: { type: "string", minLength: 1, maxLength: 255 },
          assetType: { type: "string", enum: AssetType },
          description: { type: "string", maxLength: 2000 },
          metadata: { type: "object" },
          status: { type: "string", enum: AssetStatus, default: "OPERATIONAL" },
          criticality: { type: "string", enum: Criticality, default: "MEDIUM" },
        },
      },
      UpdateAsset: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          assetType: { type: "string", enum: AssetType },
          description: { type: "string" },
          metadata: { type: "object" },
          status: { type: "string", enum: AssetStatus },
          criticality: { type: "string", enum: Criticality },
        },
      },
      AssetResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          name: { type: "string" },
          assetType: { type: "string", enum: AssetType },
          description: { type: "string", nullable: true },
          metadata: { type: "object", nullable: true },
          status: { type: "string", enum: AssetStatus },
          criticality: { type: "string", enum: Criticality },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      // -- Compliance --
      ComplianceRequirement: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          regulation: { type: "string", enum: Regulation },
          articleReference: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          evidenceGuidance: { type: "string", nullable: true },
          applicabilityNotes: { type: "string", nullable: true },
          category: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateMapping: {
        type: "object",
        required: ["organizationId", "requirementId"],
        properties: {
          organizationId: { type: "string", format: "uuid" },
          requirementId: { type: "string", format: "uuid" },
          assetId: { type: "string", format: "uuid", nullable: true },
          status: { type: "string", enum: ComplianceStatus, default: "NOT_ASSESSED" },
          evidenceDescription: { type: "string", maxLength: 10000 },
          responsiblePerson: { type: "string", maxLength: 255 },
          nextReviewDate: { type: "string", format: "date" },
          notes: { type: "string", maxLength: 10000 },
        },
      },
      UpdateMapping: {
        type: "object",
        properties: {
          assetId: { type: "string", format: "uuid", nullable: true },
          status: { type: "string", enum: ComplianceStatus },
          evidenceDescription: { type: "string" },
          responsiblePerson: { type: "string" },
          nextReviewDate: { type: "string", format: "date" },
          notes: { type: "string" },
        },
      },
      MappingResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          requirementId: { type: "string", format: "uuid" },
          assetId: { type: "string", format: "uuid", nullable: true },
          status: { type: "string", enum: ComplianceStatus },
          evidenceDescription: { type: "string", nullable: true },
          responsiblePerson: { type: "string", nullable: true },
          nextReviewDate: { type: "string", nullable: true },
          lastAssessed: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ComplianceDashboard: {
        type: "object",
        properties: {
          overallScore: { type: "number" },
          totalRequirements: { type: "integer" },
          byStatus: { type: "object" },
          byCategory: { type: "array", items: { type: "object" } },
          byRegulation: { type: "array", items: { type: "object" } },
          gaps: { type: "array", items: { type: "object" } },
          assetsSummary: { type: "object" },
        },
      },
      InitializeCompliance: {
        type: "object",
        required: ["organizationId"],
        properties: { organizationId: { type: "string", format: "uuid" } },
      },

      // -- Telemetry --
      CreateStream: {
        type: "object",
        required: ["organizationId", "assetId", "name", "protocol"],
        properties: {
          organizationId: { type: "string", format: "uuid" },
          assetId: { type: "string", format: "uuid" },
          name: { type: "string", minLength: 1, maxLength: 255 },
          protocol: { type: "string", enum: StreamProtocol },
          apid: { type: "integer", minimum: 0, maximum: 2047 },
          sampleRateHz: { type: "number" },
          status: { type: "string", enum: StreamStatus, default: "ACTIVE" },
        },
      },
      UpdateStream: {
        type: "object",
        properties: {
          name: { type: "string" },
          protocol: { type: "string", enum: StreamProtocol },
          apid: { type: "integer" },
          sampleRateHz: { type: "number" },
          status: { type: "string", enum: StreamStatus },
        },
      },
      StreamResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          assetId: { type: "string", format: "uuid" },
          name: { type: "string" },
          protocol: { type: "string", enum: StreamProtocol },
          apid: { type: "integer", nullable: true },
          sampleRateHz: { type: "number", nullable: true },
          apiKey: { type: "string" },
          status: { type: "string", enum: StreamStatus },
          learningModeUntil: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      IngestBatch: {
        type: "object",
        required: ["streamId", "points"],
        properties: {
          streamId: { type: "string", format: "uuid" },
          points: {
            type: "array",
            items: {
              type: "object",
              required: ["time", "parameterName"],
              properties: {
                time: { type: "string", format: "date-time" },
                parameterName: { type: "string" },
                valueNumeric: { type: "number", nullable: true },
                valueText: { type: "string", nullable: true },
                quality: { type: "string" },
              },
            },
          },
        },
      },
      TelemetryPoint: {
        type: "object",
        properties: {
          time: { type: "string", format: "date-time" },
          streamId: { type: "string", format: "uuid" },
          parameterName: { type: "string" },
          valueNumeric: { type: "number", nullable: true },
          valueText: { type: "string", nullable: true },
          quality: { type: "string" },
        },
      },
      LogEntry: {
        type: "object",
        required: ["organizationId", "source", "severity", "message"],
        properties: {
          organizationId: { type: "string", format: "uuid" },
          source: { type: "string", minLength: 1, maxLength: 255 },
          severity: { type: "string", enum: LogSeverity },
          message: { type: "string", minLength: 1, maxLength: 10000 },
          structuredData: { type: "object" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      LogResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          source: { type: "string" },
          severity: { type: "string" },
          message: { type: "string" },
          structuredData: { type: "object", nullable: true },
          timestamp: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      },

      // -- Alerts --
      AlertResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          streamId: { type: "string", format: "uuid", nullable: true },
          ruleId: { type: "string" },
          severity: { type: "string", enum: AlertSeverity },
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: AlertStatus },
          spartaTactic: { type: "string", nullable: true },
          spartaTechnique: { type: "string", nullable: true },
          affectedAssetId: { type: "string", format: "uuid", nullable: true },
          triggeredAt: { type: "string", format: "date-time" },
          resolvedAt: { type: "string", format: "date-time", nullable: true },
          resolvedBy: { type: "string", nullable: true },
          metadata: { type: "object", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      UpdateAlert: {
        type: "object",
        properties: {
          status: { type: "string", enum: AlertStatus },
          resolvedBy: { type: "string", maxLength: 255 },
          metadata: { type: "object" },
        },
      },
      AlertStats: {
        type: "object",
        properties: {
          total: { type: "integer" },
          bySeverity: { type: "object" },
          byStatus: { type: "object" },
          last24h: { type: "integer" },
          last7d: { type: "integer" },
        },
      },
      DetectionRule: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          severity: { type: "string", enum: AlertSeverity },
          spartaTactic: { type: "string" },
          spartaTechnique: { type: "string" },
          enabled: { type: "boolean" },
          threshold: { type: "number", nullable: true },
        },
      },

      // -- Incidents --
      CreateIncident: {
        type: "object",
        required: ["organizationId", "title", "description", "severity"],
        properties: {
          organizationId: { type: "string", format: "uuid" },
          title: { type: "string", minLength: 1, maxLength: 500 },
          description: { type: "string", minLength: 1, maxLength: 10000 },
          severity: { type: "string", enum: IncidentSeverity },
          nis2Classification: { type: "string", enum: IncidentNis2, default: "NON_SIGNIFICANT" },
          spartaTechniques: { type: "array", items: { type: "object", properties: { tactic: { type: "string" }, technique: { type: "string" } } } },
          affectedAssetIds: { type: "array", items: { type: "string", format: "uuid" } },
          detectedAt: { type: "string", format: "date-time" },
        },
      },
      UpdateIncident: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          severity: { type: "string", enum: IncidentSeverity },
          status: { type: "string", enum: IncidentStatus },
          nis2Classification: { type: "string", enum: IncidentNis2 },
          spartaTechniques: { type: "array", items: { type: "object" } },
          affectedAssetIds: { type: "array", items: { type: "string", format: "uuid" } },
          resolvedAt: { type: "string", format: "date-time" },
          timeToDetectMinutes: { type: "integer" },
          timeToRespondMinutes: { type: "integer" },
        },
      },
      IncidentResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string" },
          severity: { type: "string", enum: IncidentSeverity },
          status: { type: "string", enum: IncidentStatus },
          nis2Classification: { type: "string", enum: IncidentNis2 },
          spartaTechniques: { type: "array", items: { type: "object" } },
          affectedAssetIds: { type: "array", items: { type: "string", format: "uuid" } },
          correlationScore: { type: "number", nullable: true },
          detectedAt: { type: "string", format: "date-time", nullable: true },
          resolvedAt: { type: "string", format: "date-time", nullable: true },
          timeToDetectMinutes: { type: "integer", nullable: true },
          timeToRespondMinutes: { type: "integer", nullable: true },
          timeline: { type: "array", items: { type: "object" } },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      LinkAlert: {
        type: "object",
        required: ["alertId"],
        properties: { alertId: { type: "string", format: "uuid" } },
      },
      IncidentAlertLink: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          incidentId: { type: "string", format: "uuid" },
          alertId: { type: "string", format: "uuid" },
          linkedAt: { type: "string", format: "date-time" },
        },
      },
      CreateNote: {
        type: "object",
        required: ["author", "content"],
        properties: {
          author: { type: "string", minLength: 1, maxLength: 255 },
          content: { type: "string", minLength: 1, maxLength: 10000 },
        },
      },
      NoteResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          incidentId: { type: "string", format: "uuid" },
          author: { type: "string" },
          content: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateIncidentReport: {
        type: "object",
        required: ["reportType"],
        properties: {
          reportType: { type: "string", enum: ReportType },
          submittedTo: { type: "string", maxLength: 255 },
        },
      },
      IncidentReportResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          incidentId: { type: "string", format: "uuid" },
          reportType: { type: "string", enum: ReportType },
          content: { type: "string" },
          deadline: { type: "string", format: "date-time", nullable: true },
          submittedAt: { type: "string", format: "date-time", nullable: true },
          submittedTo: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      SubmitReport: {
        type: "object",
        properties: { submittedTo: { type: "string" } },
      },
      IncidentSummaryStats: {
        type: "object",
        properties: {
          totalIncidents: { type: "integer" },
          bySeverity: { type: "object" },
          byStatus: { type: "object" },
          avgTTD: { type: "number", nullable: true },
          avgTTR: { type: "number", nullable: true },
        },
      },

      // -- Intel --
      CreateIntel: {
        type: "object",
        required: ["stixId", "stixType", "name", "data"],
        properties: {
          stixId: { type: "string", minLength: 1, maxLength: 255 },
          stixType: { type: "string", enum: StixType },
          name: { type: "string", minLength: 1, maxLength: 255 },
          description: { type: "string", maxLength: 5000 },
          data: { type: "object", description: "STIX 2.1 properties" },
          source: { type: "string", default: "SpaceGuard" },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          validFrom: { type: "string", format: "date-time" },
          validUntil: { type: "string", format: "date-time" },
        },
      },
      IntelResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          stixId: { type: "string" },
          stixType: { type: "string" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          data: { type: "object" },
          source: { type: "string" },
          confidence: { type: "integer", nullable: true },
          validFrom: { type: "string", nullable: true },
          validUntil: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      AlertEnrichment: {
        type: "object",
        properties: {
          alert: ref("AlertResponse"),
          techniques: { type: "array", items: { type: "object" } },
          countermeasures: { type: "array", items: { type: "object" } },
        },
      },

      // -- Supply Chain --
      CreateSupplier: {
        type: "object",
        required: ["organizationId", "name", "type", "country"],
        properties: {
          organizationId: { type: "string", format: "uuid" },
          name: { type: "string", minLength: 1, maxLength: 255 },
          type: { type: "string", enum: SupplierType },
          country: { type: "string", minLength: 2, maxLength: 2 },
          criticality: { type: "string", enum: Criticality, default: "MEDIUM" },
          description: { type: "string", maxLength: 2000 },
          contactInfo: { type: "object" },
          assetsSupplied: { type: "array", items: { type: "string", format: "uuid" } },
          securityAssessment: ref("SecurityAssessment"),
        },
      },
      UpdateSupplier: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: SupplierType },
          country: { type: "string" },
          criticality: { type: "string", enum: Criticality },
          description: { type: "string" },
          contactInfo: { type: "object" },
          assetsSupplied: { type: "array", items: { type: "string", format: "uuid" } },
          securityAssessment: ref("SecurityAssessment"),
        },
      },
      SupplierResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          name: { type: "string" },
          type: { type: "string", enum: SupplierType },
          country: { type: "string" },
          criticality: { type: "string", enum: Criticality },
          description: { type: "string", nullable: true },
          contactInfo: { type: "object", nullable: true },
          assetsSupplied: { type: "array", items: { type: "string", format: "uuid" } },
          securityAssessment: { type: "object", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      SecurityAssessment: {
        type: "object",
        properties: {
          iso27001Certified: { type: "boolean" },
          soc2Certified: { type: "boolean" },
          nis2Compliant: { type: "boolean" },
          riskScore: { type: "integer", minimum: 1, maximum: 10 },
          notes: { type: "string" },
        },
      },
      RiskSummary: {
        type: "object",
        properties: {
          totalSuppliers: { type: "integer" },
          byCriticality: { type: "object" },
          byType: { type: "object" },
          averageRiskScore: { type: "number", nullable: true },
          highRiskSuppliers: { type: "array", items: ref("SupplierResponse") },
        },
      },

      // -- Anomaly --
      BaselineResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          streamId: { type: "string", format: "uuid" },
          parameterName: { type: "string" },
          mean: { type: "number" },
          stdDeviation: { type: "number" },
          minValue: { type: "number" },
          maxValue: { type: "number" },
          sampleCount: { type: "integer" },
          lastUpdated: { type: "string", format: "date-time" },
        },
      },
      UpdateBaseline: {
        type: "object",
        properties: {
          mean: { type: "number" },
          stdDeviation: { type: "number" },
          minValue: { type: "number" },
          maxValue: { type: "number" },
        },
      },
      AnomalyStats: {
        type: "object",
        properties: {
          streamId: { type: "string", format: "uuid" },
          totalBaselines: { type: "integer" },
          anomalyRate: { type: "number" },
          topAnomalousParameters: { type: "array", items: { type: "object" } },
          learningMode: { type: "boolean" },
          learningModeUntil: { type: "string", format: "date-time", nullable: true },
        },
      },

      // -- Audit --
      AuditLogEntry: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid", nullable: true },
          timestamp: { type: "string", format: "date-time" },
          actor: { type: "string" },
          action: { type: "string" },
          resourceType: { type: "string", nullable: true },
          resourceId: { type: "string", nullable: true },
          details: { type: "object", nullable: true },
          ipAddress: { type: "string", nullable: true },
        },
      },

      // -- Syslog --
      CreateSyslogEndpoint: {
        type: "object",
        required: ["organizationId", "name", "host"],
        properties: {
          organizationId: { type: "string", format: "uuid" },
          name: { type: "string", minLength: 1, maxLength: 255 },
          host: { type: "string", minLength: 1, maxLength: 255 },
          port: { type: "integer", minimum: 1, maximum: 65535, default: 514 },
          protocol: { type: "string", enum: SyslogProtocol, default: "UDP" },
          format: { type: "string", enum: SyslogFormat, default: "CEF" },
          minSeverity: { type: "string", enum: AlertSeverity, default: "LOW" },
          isActive: { type: "boolean", default: true },
        },
      },
      UpdateSyslogEndpoint: {
        type: "object",
        properties: {
          name: { type: "string" },
          host: { type: "string" },
          port: { type: "integer" },
          protocol: { type: "string", enum: SyslogProtocol },
          format: { type: "string", enum: SyslogFormat },
          minSeverity: { type: "string", enum: AlertSeverity },
          isActive: { type: "boolean" },
        },
      },
      SyslogEndpoint: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organizationId: { type: "string", format: "uuid" },
          name: { type: "string" },
          host: { type: "string" },
          port: { type: "integer" },
          protocol: { type: "string", enum: SyslogProtocol },
          format: { type: "string", enum: SyslogFormat },
          minSeverity: { type: "string", enum: AlertSeverity },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      SyslogTestResult: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          message: { type: "string" },
          latencyMs: { type: "number" },
        },
      },
      SyslogFormatDocs: {
        type: "object",
        properties: {
          cef: { type: "object" },
          leef: { type: "object" },
          json: { type: "object" },
        },
      },

      // -- Settings --
      UpdateNotifications: {
        type: "object",
        properties: {
          notifyCriticalAlerts: { type: "boolean" },
          notifyDeadlines: { type: "boolean" },
          notifyWeeklyDigest: { type: "boolean" },
        },
      },
      RuleOverride: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          thresholdOverride: { type: "number", nullable: true },
        },
      },
      RateLimit: {
        type: "object",
        required: ["pointsPerMinute"],
        properties: { pointsPerMinute: { type: "integer", minimum: 1, maximum: 100000 } },
      },

      // -- Exports --
      StixExportRequest: {
        type: "object",
        required: ["organizationId"],
        properties: {
          organizationId: { type: "string", format: "uuid" },
          includeAlerts: { type: "boolean", default: true },
          includeIncidents: { type: "boolean", default: true },
          includeThreatIntel: { type: "boolean", default: true },
          includeRelationships: { type: "boolean", default: true },
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
        },
      },
      StixBundle: {
        type: "object",
        properties: {
          type: { type: "string", const: "bundle" },
          id: { type: "string" },
          objects: { type: "array", items: { type: "object" } },
        },
      },

      // -- ENISA --
      EnisaControl: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          regulation: { type: "string" },
          articleReference: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          evidenceGuidance: { type: "string", nullable: true },
          category: { type: "string" },
          metadata: { type: "object", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },

      // -- Admin SPARTA --
      SpartaFetchRequest: {
        type: "object",
        properties: { url: { type: "string", format: "uri" } },
      },
      SpartaImportDiff: {
        type: "object",
        properties: {
          techniques: { type: "object", properties: { added: { type: "integer" }, updated: { type: "integer" }, unchanged: { type: "integer" }, total: { type: "integer" } } },
          countermeasures: { type: "object" },
          indicators: { type: "object" },
          relationships: { type: "object" },
          version: { type: "string" },
          importedAt: { type: "string", format: "date-time" },
        },
      },
      SpartaStatus: {
        type: "object",
        properties: {
          version: { type: "string", nullable: true },
          lastImportedAt: { type: "string", format: "date-time", nullable: true },
          lastImportSource: { type: "string", nullable: true },
          counts: { type: "object" },
          recentImports: { type: "array", items: { type: "object" } },
        },
      },
      SpartaSettings: {
        type: "object",
        properties: { spartaUrl: { type: "string" } },
      },
      DuplicateReport: {
        type: "object",
        properties: {
          duplicates: { type: "integer" },
          cleaned: { type: "integer" },
          details: { type: "array", items: { type: "object" } },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hono routes
// ---------------------------------------------------------------------------

export const docsRoutes = new Hono();

// JSON spec
docsRoutes.get("/api/docs/openapi.json", (c) => {
  return c.json(spec);
});

// Swagger UI (self-contained HTML, dark theme)
docsRoutes.get("/api/docs", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SpaceGuard API Docs</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css" />
  <style>
    /* SpaceGuard dark theme */
    :root {
      --sg-bg: #020617;
      --sg-surface: #0f172a;
      --sg-border: #1e293b;
      --sg-text: #e2e8f0;
      --sg-muted: #94a3b8;
      --sg-accent: #3b82f6;
    }
    body {
      margin: 0;
      background: var(--sg-bg);
      color: var(--sg-text);
    }
    .swagger-ui .topbar { display: none; }
    .swagger-ui {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    /* Header bar */
    .sg-header {
      background: var(--sg-surface);
      border-bottom: 1px solid var(--sg-border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .sg-header svg { color: var(--sg-accent); }
    .sg-header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: #f8fafc;
    }
    .sg-header h1 span { color: var(--sg-accent); }
    .sg-header .version {
      background: var(--sg-accent);
      color: #fff;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 9999px;
      font-weight: 600;
    }
    /* Dark overrides */
    .swagger-ui .scheme-container,
    .swagger-ui .information-container { background: var(--sg-bg) !important; }
    .swagger-ui .opblock-tag { color: var(--sg-text) !important; border-bottom-color: var(--sg-border) !important; }
    .swagger-ui .opblock { background: var(--sg-surface) !important; border-color: var(--sg-border) !important; }
    .swagger-ui .opblock .opblock-summary { border-color: var(--sg-border) !important; }
    .swagger-ui .opblock .opblock-summary-description,
    .swagger-ui .opblock .opblock-summary-path,
    .swagger-ui .opblock .opblock-summary-method { color: var(--sg-text) !important; }
    .swagger-ui .opblock-body { background: var(--sg-bg) !important; }
    .swagger-ui table thead tr th,
    .swagger-ui table thead tr td,
    .swagger-ui .parameter__name,
    .swagger-ui .parameter__type,
    .swagger-ui .response-col_status,
    .swagger-ui .response-col_description,
    .swagger-ui .model-title,
    .swagger-ui section.models h4,
    .swagger-ui .model { color: var(--sg-text) !important; }
    .swagger-ui .model-box { background: var(--sg-surface) !important; }
    .swagger-ui section.models { border-color: var(--sg-border) !important; }
    .swagger-ui section.models.is-open h4 { border-bottom-color: var(--sg-border) !important; }
    .swagger-ui .responses-inner { background: var(--sg-surface) !important; }
    .swagger-ui .markdown p,
    .swagger-ui .markdown li,
    .swagger-ui .renderedMarkdown p { color: var(--sg-muted) !important; }
    .swagger-ui .info .title,
    .swagger-ui .info .description p { color: var(--sg-text) !important; }
    .swagger-ui .info .title small { color: var(--sg-muted) !important; }
    .swagger-ui .btn.authorize { color: var(--sg-accent) !important; border-color: var(--sg-accent) !important; }
    .swagger-ui .dialog-ux .modal-ux { background: var(--sg-surface) !important; }
    .swagger-ui .dialog-ux .modal-ux-header h3 { color: var(--sg-text) !important; }
    .swagger-ui input[type=text], .swagger-ui textarea { background: var(--sg-bg) !important; color: var(--sg-text) !important; border-color: var(--sg-border) !important; }
    .swagger-ui select { background: var(--sg-bg) !important; color: var(--sg-text) !important; }
  </style>
</head>
<body>
  <div class="sg-header">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    <h1>Space<span>Guard</span> API</h1>
    <span class="version">v1.0.0</span>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script>
  <script>
    SwaggerUIBundle({
      url: "/api/docs/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 2,
      docExpansion: "list",
      filter: true,
      persistAuthorization: true,
      tryItOutEnabled: true,
    });
  </script>
</body>
</html>`;
  return c.html(html);
});
