import type {
  OrganizationResponse,
  AssetResponse,
  AssetQuery,
  AssetTreeNode,
  DashboardResponse,
  ComplianceRequirement,
  MappingResponse,
  CreateOrganization,
  CreateAsset,
  UpdateAsset,
  CreateMapping,
  UpdateMapping,
  StreamResponse,
  CreateStream,
  ComponentResponse,
  ComponentQuery,
  CreateComponent,
  VulnerabilityResponse,
  VulnerabilityQuery,
  CreateVulnerability,
  UpdateVulnerability,
  VulnerabilityStats,
  SbomImportResponse,
} from "@spaceguard/shared";

// NOTE: Alert, Incident, Intel, and enrichment response types are defined
// locally below rather than imported from @spaceguard/shared. This is
// intentional: the shared schemas use z.nativeEnum() which infers nominal
// TypeScript enum types (e.g. IncidentStatus), but the API sends plain JSON
// strings. The frontend receives these as string literals, so the local types
// use string literal unions to match the JSON wire format.

import { getAuthToken } from "@/lib/auth-context";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const authHeaders: Record<string, string> = {};
  const token = getAuthToken();
  if (token) {
    authHeaders["Authorization"] = `Bearer ${token}`;
  }

  const { headers: optHeaders, ...restOptions } = options ?? {};

  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(optHeaders as Record<string, string>),
    },
    ...restOptions,
  });

  if (!res.ok) {
    // NOTE: We intentionally do NOT auto-clear tokens or redirect on 401
    // here. AuthProvider validates the token on mount and AuthGuard
    // handles the redirect to /login when the user is not authenticated.
    // Previous auto-logout logic caused race conditions where concurrent
    // API calls during initial page load would clear freshly-issued tokens.
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof body.error === "string" ? body.error : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }

  // Handle 204 No Content and empty responses
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),

  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  delete: (path: string) => request<void>(path, { method: "DELETE" }),
};

// Organizations
export const getOrganizations = () =>
  api.get<{ data: OrganizationResponse[] }>("/api/v1/organizations");

export const getOrganization = (id: string) =>
  api.get<OrganizationResponse>(`/api/v1/organizations/${id}`);

export const createOrganization = (data: CreateOrganization) =>
  api.post<OrganizationResponse>("/api/v1/organizations", data);

// Assets
export const getAssets = (query?: Partial<AssetQuery>) => {
  const params = new URLSearchParams();
  if (query?.organizationId) params.set("organizationId", query.organizationId);
  if (query?.type) params.set("type", query.type);
  if (query?.status) params.set("status", query.status);
  if (query?.segment) params.set("segment", query.segment);
  if (query?.parentAssetId) params.set("parentAssetId", query.parentAssetId);
  if (query?.topLevelOnly) params.set("topLevelOnly", "true");
  if (query?.page) params.set("page", String(query.page));
  if (query?.perPage) params.set("perPage", String(query.perPage));
  const qs = params.toString();
  return api.get<{ data: AssetResponse[]; total: number; page: number; perPage: number }>(
    `/api/v1/assets${qs ? `?${qs}` : ""}`
  );
};

export const getAssetTree = (organizationId: string) =>
  api.get<{ data: AssetTreeNode[]; total: number }>(
    `/api/v1/assets/tree?organizationId=${organizationId}`
  );

export const getAssetWithChildren = (id: string) =>
  api.get<AssetTreeNode>(`/api/v1/assets/${id}/children`);

export const getAsset = (id: string) =>
  api.get<AssetResponse>(`/api/v1/assets/${id}`);

export const createAsset = (data: CreateAsset) =>
  api.post<AssetResponse>("/api/v1/assets", data);

export const updateAsset = (id: string, data: UpdateAsset) =>
  api.put<AssetResponse>(`/api/v1/assets/${id}`, data);

export const deleteAsset = (id: string) =>
  api.delete(`/api/v1/assets/${id}`);

// Compliance requirements
export const getRequirements = (query?: { regulation?: string; category?: string }) => {
  const params = new URLSearchParams();
  if (query?.regulation) params.set("regulation", query.regulation);
  if (query?.category) params.set("category", query.category);
  const qs = params.toString();
  return api.get<{ data: ComplianceRequirement[] }>(
    `/api/v1/compliance/requirements${qs ? `?${qs}` : ""}`
  );
};

export const getRequirement = (id: string) =>
  api.get<ComplianceRequirement>(`/api/v1/compliance/requirements/${id}`);

// Compliance mappings
export const getMappings = (query?: {
  organizationId?: string;
  assetId?: string;
  requirementId?: string;
  status?: string;
}) => {
  const params = new URLSearchParams();
  if (query?.organizationId) params.set("organizationId", query.organizationId);
  if (query?.assetId) params.set("assetId", query.assetId);
  if (query?.requirementId) params.set("requirementId", query.requirementId);
  if (query?.status) params.set("status", query.status);
  const qs = params.toString();
  return api.get<{ data: MappingResponse[] }>(
    `/api/v1/compliance/mappings${qs ? `?${qs}` : ""}`
  );
};

export const createMapping = (data: CreateMapping) =>
  api.post<MappingResponse>("/api/v1/compliance/mappings", data);

export const updateMapping = (id: string, data: UpdateMapping) =>
  api.put<MappingResponse>(`/api/v1/compliance/mappings/${id}`, data);

export const deleteMapping = (id: string) =>
  api.delete(`/api/v1/compliance/mappings/${id}`);

// Dashboard
export const getDashboard = (organizationId: string) => {
  const params = new URLSearchParams({ organizationId });
  return api.get<DashboardResponse>(`/api/v1/compliance/dashboard?${params.toString()}`);
};

// Initialize compliance mappings (onboarding)
export const initializeCompliance = (organizationId: string) =>
  api.post<{ created: number; total: number }>("/api/v1/compliance/initialize", { organizationId });

// ---------------------------------------------------------------------------
// ENISA Controls
// ---------------------------------------------------------------------------

export interface EnisaControlResponse {
  id: string;
  articleReference: string;
  title: string;
  category: string;
  description: string;
  controlStatement: string;
  evidenceGuidance: string;
  lifecyclePhases: string[];
  segments: string[];
  threatsAddressed: string[];
  referenceFrameworks: string[];
  spartaTechniques: string[];
  nis2Mapping: string;
}

export interface EnisaSpartaMappingEntry {
  spartaTechniqueId: string;
  controls: Array<{ articleReference: string; title: string; category: string }>;
}

export const getEnisaControls = () =>
  api.get<{ data: EnisaControlResponse[] }>("/api/v1/enisa/controls");

export const getEnisaSpartaMapping = () =>
  api.get<{ data: EnisaSpartaMappingEntry[] }>("/api/v1/enisa/sparta-mapping");

// ---------------------------------------------------------------------------
// Incident Summary Report
// ---------------------------------------------------------------------------

export interface IncidentSummaryStats {
  total: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  openCount: number;
  closedCount: number;
  mttdMinutes: number | null;
  mttrMinutes: number | null;
  topTechniques: { name: string; count: number }[];
}

export const getIncidentSummaryStats = (query: {
  organizationId: string;
  from?: string;
  to?: string;
}) => {
  const params = new URLSearchParams({ organizationId: query.organizationId });
  if (query.from) params.set("from", query.from);
  if (query.to)   params.set("to", query.to);
  return api.get<IncidentSummaryStats>(
    `/api/v1/reports/incident-summary/stats?${params.toString()}`
  );
};

export const getIncidentSummaryPdf = async (query: {
  organizationId: string;
  from?: string;
  to?: string;
}): Promise<Blob> => {
  const params = new URLSearchParams({ organizationId: query.organizationId });
  if (query.from) params.set("from", query.from);
  if (query.to)   params.set("to", query.to);
  const res = await fetch(
    `${API_URL}/api/v1/reports/incident-summary/pdf?${params.toString()}`,
    { method: "GET", headers: exportHeaders() }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof body.error === "string" ? body.error : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  return res.blob();
};

// PDF report - returns a Blob for direct download in the browser
export const getCompliancePdf = async (organizationId: string): Promise<Blob> => {
  const params = new URLSearchParams({ organizationId });
  const res = await fetch(
    `${API_URL}/api/v1/reports/compliance/pdf?${params.toString()}`,
    { method: "GET", headers: exportHeaders() }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof body.error === "string" ? body.error : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  return res.blob();
};

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export interface TelemetryDataPoint {
  time: string;
  parameterName: string;
  valueNumeric: number | null;
  valueText: string | null;
  quality: string;
}

export interface TelemetryQueryResult {
  streamId: string;
  parameterName: string | undefined;
  from: string;
  to: string;
  downsampled: boolean;
  bucketInterval: string | null;
  data: TelemetryDataPoint[];
  total: number;
}

export const getTelemetryStreams = (organizationId: string) => {
  const params = new URLSearchParams({ organizationId });
  return api.get<{ data: StreamResponse[]; total: number }>(
    `/api/v1/telemetry/streams?${params.toString()}`
  );
};

export const getTelemetryStream = (id: string) =>
  api.get<StreamResponse>(`/api/v1/telemetry/streams/${id}`);

export const createTelemetryStream = (data: CreateStream) =>
  api.post<StreamResponse>("/api/v1/telemetry/streams", data);

export const getTelemetryPoints = (query: {
  streamId: string;
  from: string;
  to: string;
  parameterName?: string;
  perPage?: number;
  page?: number;
}) => {
  const params = new URLSearchParams({ streamId: query.streamId, from: query.from, to: query.to });
  if (query.parameterName) params.set("parameterName", query.parameterName);
  if (query.perPage)       params.set("perPage", String(query.perPage));
  if (query.page)          params.set("page", String(query.page));
  return api.get<TelemetryQueryResult>(`/api/v1/telemetry/points?${params.toString()}`);
};

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface AlertResponse {
  id: string;
  organizationId: string;
  streamId: string | null;
  ruleId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  status: "NEW" | "INVESTIGATING" | "RESOLVED" | "FALSE_POSITIVE";
  spartaTactic: string | null;
  spartaTechnique: string | null;
  affectedAssetId: string | null;
  triggeredAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertStats {
  total: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  openCritical: number;
  openHigh: number;
}

export interface DetectionRuleResponse {
  id: string;
  name: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  sparta: { tactic: string; technique: string } | null;
  mitre: { techniqueId: string; techniqueName: string } | null;
  nis2Articles: string[];
  sourceFile: string | null;
  conditionType: string;
}

export const getAlerts = (query: {
  organizationId: string;
  status?: string;
  severity?: string;
  streamId?: string;
  affectedAssetId?: string;
  ruleId?: string;
  spartaTactic?: string;
  spartaTechnique?: string;
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
}) => {
  const params = new URLSearchParams({ organizationId: query.organizationId });
  if (query.status)           params.set("status", query.status);
  if (query.severity)         params.set("severity", query.severity);
  if (query.streamId)         params.set("streamId", query.streamId);
  if (query.affectedAssetId)  params.set("affectedAssetId", query.affectedAssetId);
  if (query.ruleId)           params.set("ruleId", query.ruleId);
  if (query.spartaTactic)     params.set("spartaTactic", query.spartaTactic);
  if (query.spartaTechnique)  params.set("spartaTechnique", query.spartaTechnique);
  if (query.from)             params.set("from", query.from);
  if (query.to)               params.set("to", query.to);
  if (query.page)             params.set("page", String(query.page));
  if (query.perPage)          params.set("perPage", String(query.perPage));
  return api.get<{ data: AlertResponse[]; total: number }>(
    `/api/v1/alerts?${params.toString()}`
  );
};

export const getAlert = (id: string) =>
  api.get<AlertResponse>(`/api/v1/alerts/${id}`);

export const updateAlert = (id: string, data: { status?: string; resolvedBy?: string }) =>
  api.put<AlertResponse>(`/api/v1/alerts/${id}`, data);

export const getAlertStats = (organizationId: string) => {
  const params = new URLSearchParams({ organizationId });
  return api.get<AlertStats>(`/api/v1/alerts/stats?${params.toString()}`);
};

export const getDetectionRules = () =>
  api.get<{ rules: DetectionRuleResponse[]; total: number }>("/api/v1/alerts/rules");

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export interface SpartaTechniqueEntry {
  tactic: string;
  technique: string;
}

export interface TimelineEntry {
  timestamp: string;
  event: string;
  actor?: string;
}

export interface IncidentResponse {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status:
    | "DETECTED"
    | "TRIAGING"
    | "INVESTIGATING"
    | "CONTAINING"
    | "ERADICATING"
    | "RECOVERING"
    | "CLOSED"
    | "FALSE_POSITIVE";
  nis2Classification: "SIGNIFICANT" | "NON_SIGNIFICANT";
  spartaTechniques: SpartaTechniqueEntry[];
  affectedAssetIds: string[];
  timeline: TimelineEntry[];
  detectedAt: string | null;
  resolvedAt: string | null;
  timeToDetectMinutes: number | null;
  timeToRespondMinutes: number | null;
  correlationRule: string | null;
  correlationScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CorrelationRuleConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  thresholds: Record<string, number>;
}

export interface IncidentNoteResponse {
  id: string;
  incidentId: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface IncidentAlertLinkResponse {
  id: string;
  incidentId: string;
  alertId: string;
  createdAt: string;
}

export interface IncidentReportResponse {
  id: string;
  incidentId: string;
  reportType:
    | "EARLY_WARNING"
    | "INCIDENT_NOTIFICATION"
    | "INTERMEDIATE_REPORT"
    | "FINAL_REPORT";
  content: Record<string, unknown>;
  submittedTo: string | null;
  submittedAt: string | null;
  deadline: string | null;
  createdAt: string;
}

export const getIncidentStats = (organizationId: string) =>
  api.get<{ activeCount: number }>(
    `/api/v1/incidents/stats?organizationId=${organizationId}`
  );

export const getIncidents = (query: {
  organizationId: string;
  status?: string;
  severity?: string;
  nis2Classification?: string;
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
}) => {
  const params = new URLSearchParams({
    organizationId: query.organizationId,
  });
  if (query.status)             params.set("status", query.status);
  if (query.severity)           params.set("severity", query.severity);
  if (query.nis2Classification) params.set("nis2Classification", query.nis2Classification);
  if (query.from)               params.set("from", query.from);
  if (query.to)                 params.set("to", query.to);
  if (query.page)               params.set("page", String(query.page));
  if (query.perPage)            params.set("perPage", String(query.perPage));
  return api.get<{ data: IncidentResponse[]; total: number }>(
    `/api/v1/incidents?${params.toString()}`
  );
};

export const getIncident = (id: string) =>
  api.get<IncidentResponse>(`/api/v1/incidents/${id}`);

export const createIncident = (data: {
  organizationId: string;
  title: string;
  description: string;
  severity: string;
  nis2Classification?: string;
  spartaTechniques?: SpartaTechniqueEntry[];
  affectedAssetIds?: string[];
  detectedAt?: string;
}) => api.post<IncidentResponse>("/api/v1/incidents", data);

export const updateIncident = (
  id: string,
  data: {
    title?: string;
    description?: string;
    severity?: string;
    status?: string;
    nis2Classification?: string;
    spartaTechniques?: SpartaTechniqueEntry[];
    affectedAssetIds?: string[];
    resolvedAt?: string;
  }
) => api.put<IncidentResponse>(`/api/v1/incidents/${id}`, data);

export const getIncidentNotes = (incidentId: string) =>
  api.get<{ data: IncidentNoteResponse[] }>(
    `/api/v1/incidents/${incidentId}/notes`
  );

export const addIncidentNote = (
  incidentId: string,
  data: { author: string; content: string }
) =>
  api.post<IncidentNoteResponse>(
    `/api/v1/incidents/${incidentId}/notes`,
    data
  );

export const getIncidentAlerts = (incidentId: string) =>
  api.get<{ data: IncidentAlertLinkResponse[] }>(
    `/api/v1/incidents/${incidentId}/alerts`
  );

export const addAlertToIncident = (
  incidentId: string,
  alertId: string
) =>
  api.post<IncidentAlertLinkResponse>(
    `/api/v1/incidents/${incidentId}/alerts`,
    { alertId }
  );

export const getIncidentReports = (incidentId: string) =>
  api.get<{ data: IncidentReportResponse[] }>(
    `/api/v1/incidents/${incidentId}/reports`
  );

export const generateIncidentReport = (
  incidentId: string,
  data: { reportType: string; submittedTo?: string }
) =>
  api.post<IncidentReportResponse>(
    `/api/v1/incidents/${incidentId}/reports`,
    data
  );

export const submitIncidentReport = (
  incidentId: string,
  reportId: string,
  submittedTo: string
) =>
  api.put<IncidentReportResponse>(
    `/api/v1/incidents/${incidentId}/reports/${reportId}/submit`,
    { submittedTo }
  );

// Re-export shared types used across pages
export type { AssetResponse };

export { ApiError };

// ---------------------------------------------------------------------------
// Intel (Threat Intelligence)
// ---------------------------------------------------------------------------

export interface IntelResponse {
  id: string;
  stixId: string;
  stixType: string;
  name: string;
  description: string | null;
  data: Record<string, unknown>;
  source: string;
  confidence: number | null;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEnrichment {
  alertId: string;
  spartaTactic: string | null;
  spartaTechnique: string | null;
  matchedIntel: IntelResponse[];
  relatedTactics: string[];
  mitigations: string[];
  detectionTips: string[];
}

export const getIntelList = (query?: {
  stixType?: string;
  source?: string;
  tactic?: string;
  q?: string;
  page?: number;
  perPage?: number;
}) => {
  const params = new URLSearchParams();
  if (query?.stixType) params.set("stixType", query.stixType);
  if (query?.source)   params.set("source", query.source);
  if (query?.tactic)   params.set("tactic", query.tactic);
  if (query?.q)        params.set("q", query.q);
  if (query?.page)     params.set("page", String(query.page));
  if (query?.perPage)  params.set("perPage", String(query.perPage));
  const qs = params.toString();
  return api.get<{ data: IntelResponse[]; total: number }>(
    `/api/v1/intel${qs ? `?${qs}` : ""}`
  );
};

export const getIntel = (id: string) =>
  api.get<IntelResponse>(`/api/v1/intel/${id}`);

export const searchIntel = (q: string, limit = 20) =>
  api.get<{ data: IntelResponse[]; total: number }>(
    `/api/v1/intel/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );

export const enrichAlert = (alertId: string) =>
  api.get<AlertEnrichment>(`/api/v1/intel/enrich/alert/${alertId}`);

// ---------------------------------------------------------------------------
// Admin: SPARTA Data Management
// ---------------------------------------------------------------------------

export interface SpartaDiffCounts {
  added: number;
  updated: number;
  unchanged: number;
  total: number;
}

export interface SpartaImportDiff {
  techniques: SpartaDiffCounts;
  countermeasures: SpartaDiffCounts;
  indicators: SpartaDiffCounts;
  relationships: SpartaDiffCounts;
  version: string | null;
  importedAt: string;
}

export interface SpartaStatusResponse {
  version: string | null;
  lastImportedAt: string | null;
  lastImportSource: string | null;
  counts: {
    attackPatterns: number;
    courseOfActions: number;
    indicators: number;
    relationships: number;
    total: number;
  };
  recentImports: Array<{
    id: string;
    source: string;
    version: string | null;
    techniquesAdded: number;
    techniquesUpdated: number;
    countermeasuresAdded: number;
    countermeasuresUpdated: number;
    importedAt: string;
  }>;
}

export const getSpartaStatus = () =>
  api.get<SpartaStatusResponse>("/api/v1/admin/sparta/status");

export const fetchSpartaFromServer = () =>
  api.post<SpartaImportDiff>("/api/v1/admin/sparta/fetch", {});

// -- SPARTA settings (configurable URL) --

export interface SpartaSettingsResponse {
  spartaUrl: string;
}

export const getSpartaSettings = () =>
  api.get<SpartaSettingsResponse>("/api/v1/admin/sparta/settings");

export const updateSpartaSettings = (spartaUrl: string) =>
  api.put<SpartaSettingsResponse>("/api/v1/admin/sparta/settings", { spartaUrl });

// -- SPARTA duplicate check --

export interface DuplicateCheckResult {
  totalRecords: number;
  duplicateGroups: number;
  duplicateRows: number;
  details: Array<{ stixId: string; count: number }>;
  cleaned: boolean;
  deletedCount: number;
}

export const checkSpartaDuplicates = (autoClean = false) =>
  api.post<DuplicateCheckResult>("/api/v1/admin/sparta/duplicates", { autoClean });

// ---------------------------------------------------------------------------
// SPARTA Technique Navigation (new endpoints from Module 5)
// ---------------------------------------------------------------------------

export interface TechniqueDetail {
  technique: IntelResponse;
  subTechniques: IntelResponse[];
  countermeasures: IntelResponse[];
}

/** Return all SPARTA techniques (parent + sub) for a given tactic phase name or STIX ID */
export const getTacticTechniques = (tacticId: string) =>
  api.get<{ data: IntelResponse[]; total: number }>(
    `/api/v1/intel/tactics/${encodeURIComponent(tacticId)}/techniques`
  );

/** Full-text search restricted to SPARTA attack-pattern objects */
export const searchSpartaTechniques = (q: string, limit = 50) =>
  api.get<{ data: IntelResponse[]; total: number }>(
    `/api/v1/intel/techniques/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );

/** Return a technique with its sub-techniques and countermeasures */
export const getTechniqueDetail = (id: string) =>
  api.get<TechniqueDetail>(`/api/v1/intel/techniques/${encodeURIComponent(id)}`);

/** Return countermeasures mapped to a technique STIX ID */
export const getTechniqueCountermeasures = (stixId: string) =>
  api.get<{ data: IntelResponse[]; total: number }>(
    `/api/v1/intel/techniques/${encodeURIComponent(stixId)}/countermeasures`
  );

/** Find countermeasures mapped to a NIST SP 800-53 control (e.g. "AC-2") */
export const getCountermeasuresByNist = (controlId: string) =>
  api.get<{ data: IntelResponse[]; total: number }>(
    `/api/v1/intel/countermeasures/nist/${encodeURIComponent(controlId)}`
  );

// ---------------------------------------------------------------------------
// Threat Landscape Briefing Report
// ---------------------------------------------------------------------------

export const getThreatBriefingPdf = async (
  organizationId: string
): Promise<Blob> => {
  const params = new URLSearchParams({ organizationId });
  const res = await fetch(
    `${API_URL}/api/v1/reports/threat-briefing/pdf?${params.toString()}`,
    { method: "GET", headers: exportHeaders() }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof body.error === "string" ? body.error : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  return res.blob();
};

// ---------------------------------------------------------------------------
// Audit Trail
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  organizationId: string | null;
  actor: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  timestamp: string;
}

export const getAuditLogs = (query?: {
  organizationId?: string;
  from?: string;
  to?: string;
  actor?: string;
  action?: string;
  resourceType?: string;
  page?: number;
  perPage?: number;
}) => {
  const params = new URLSearchParams();
  if (query?.organizationId) params.set("organizationId", query.organizationId);
  if (query?.from)           params.set("from", query.from);
  if (query?.to)             params.set("to", query.to);
  if (query?.actor)          params.set("actor", query.actor);
  if (query?.action)         params.set("action", query.action);
  if (query?.resourceType)   params.set("resourceType", query.resourceType);
  if (query?.page)           params.set("page", String(query.page));
  if (query?.perPage)        params.set("perPage", String(query.perPage));
  const qs = params.toString();
  return api.get<{
    data: AuditLogEntry[];
    total: number;
    page: number;
    perPage: number;
  }>(`/api/v1/audit${qs ? `?${qs}` : ""}`);
};

export const getAuditTrailPdf = async (
  organizationId: string,
  from: string,
  to: string
): Promise<Blob> => {
  const params = new URLSearchParams({ organizationId, from, to });
  const res = await fetch(
    `${API_URL}/api/v1/reports/audit-trail/pdf?${params.toString()}`,
    { method: "GET", headers: exportHeaders() }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg =
      typeof body.error === "string"
        ? body.error
        : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  return res.blob();
};

// ---------------------------------------------------------------------------
// Supply Chain
// ---------------------------------------------------------------------------

export interface SupplierSecurityAssessment {
  lastAssessed?: string | null;
  nextReview?: string | null;
  iso27001Certified?: boolean;
  soc2Certified?: boolean;
  nis2Compliant?: boolean;
  riskScore?: number;
  notes?: string | null;
}

export interface SupplierResponse {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  country: string;
  criticality: string;
  description?: string;
  contactInfo?: Record<string, unknown>;
  assetsSupplied?: string[];
  securityAssessment?: SupplierSecurityAssessment;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierRiskSummary {
  totalSuppliers: number;
  highRiskCount: number;
  overdueAssessments: number;
  countryDistribution: Record<string, number>;
  byType: Record<string, number>;
  byCriticality: Record<string, number>;
  certificationGaps: {
    noIso27001: number;
    noSoc2: number;
    noNis2: number;
  };
  averageRiskScore: number;
}

export const getSuppliers = (query?: {
  organizationId?: string;
  type?: string;
  criticality?: string;
  page?: number;
  perPage?: number;
}) => {
  const params = new URLSearchParams();
  if (query?.organizationId) params.set("organizationId", query.organizationId);
  if (query?.type) params.set("type", query.type);
  if (query?.criticality) params.set("criticality", query.criticality);
  if (query?.page) params.set("page", String(query.page));
  if (query?.perPage) params.set("perPage", String(query.perPage));
  const qs = params.toString();
  return api.get<{
    data: SupplierResponse[];
    total: number;
    page: number;
    perPage: number;
  }>(`/api/v1/supply-chain/suppliers${qs ? `?${qs}` : ""}`);
};

export const getSupplier = (id: string) =>
  api.get<SupplierResponse>(`/api/v1/supply-chain/suppliers/${id}`);

export const createSupplierApi = (data: Record<string, unknown>) =>
  api.post<SupplierResponse>("/api/v1/supply-chain/suppliers", data);

export const updateSupplierApi = (id: string, data: Record<string, unknown>) =>
  api.put<SupplierResponse>(`/api/v1/supply-chain/suppliers/${id}`, data);

export const deleteSupplierApi = (id: string) =>
  api.delete(`/api/v1/supply-chain/suppliers/${id}`);

export const getSupplierRiskSummary = (organizationId: string) =>
  api.get<SupplierRiskSummary>(
    `/api/v1/supply-chain/risk-summary?organizationId=${organizationId}`
  );

export const getSupplyChainPdf = async (
  organizationId: string
): Promise<Blob> => {
  const params = new URLSearchParams({ organizationId });
  const res = await fetch(
    `${API_URL}/api/v1/reports/supply-chain/pdf?${params.toString()}`,
    { method: "GET", headers: exportHeaders() }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg =
      typeof body.error === "string"
        ? body.error
        : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  return res.blob();
};

/** Upload a STIX 2.1 JSON file via multipart form data */
export async function uploadSpartaBundle(
  file: File
): Promise<SpartaImportDiff> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/api/v1/admin/sparta/import`, {
    method: "POST",
    headers: exportHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg =
      typeof body.error === "string"
        ? body.error
        : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<SpartaImportDiff>;
}

// ---------------------------------------------------------------------------
// Auth / Profile
// ---------------------------------------------------------------------------

export interface ProfileUpdatePayload {
  name?: string;
  password?: string;
  notifyCriticalAlerts?: boolean;
  notifyDeadlines?: boolean;
  notifyWeeklyDigest?: boolean;
}

export function updateProfile(data: ProfileUpdatePayload) {
  return api.put<{ id: string; email: string; name: string; role: string }>("/api/v1/auth/me", data);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportHeaders(): Record<string, string> {
  const token = getAuthToken();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function exportAlertsCsv(organizationId: string, from?: string, to?: string) {
  const params = new URLSearchParams({ organizationId });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`${API_URL}/api/v1/export/alerts/csv?${params}`, {
    headers: exportHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof body.error === "string" ? body.error : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  downloadBlob(blob, `spaceguard-alerts-${organizationId.slice(0, 8)}.csv`);
}

export async function exportIncidentsCsv(organizationId: string, from?: string, to?: string) {
  const params = new URLSearchParams({ organizationId });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`${API_URL}/api/v1/export/incidents/csv?${params}`, {
    headers: exportHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof body.error === "string" ? body.error : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  downloadBlob(blob, `spaceguard-incidents-${organizationId.slice(0, 8)}.csv`);
}

export async function exportComplianceCsv(organizationId: string) {
  const params = new URLSearchParams({ organizationId });
  const res = await fetch(`${API_URL}/api/v1/export/compliance/csv?${params}`, {
    headers: exportHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof body.error === "string" ? body.error : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  downloadBlob(blob, `spaceguard-compliance-${organizationId.slice(0, 8)}.csv`);
}

export async function exportAuditCsv(organizationId: string, from?: string, to?: string) {
  const params = new URLSearchParams({ organizationId });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`${API_URL}/api/v1/export/audit/csv?${params}`, {
    headers: exportHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof body.error === "string" ? body.error : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  downloadBlob(blob, `spaceguard-audit-${organizationId.slice(0, 8)}.csv`);
}

export interface StixExportOptions {
  organizationId: string;
  includeAlerts?: boolean;
  includeIncidents?: boolean;
  includeThreatIntel?: boolean;
  includeRelationships?: boolean;
  from?: string;
  to?: string;
}

export async function exportStixBundle(options: StixExportOptions) {
  const res = await fetch(`${API_URL}/api/v1/export/stix`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...exportHeaders() },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof body.error === "string" ? body.error : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  downloadBlob(blob, `spaceguard-stix-bundle-${options.organizationId.slice(0, 8)}.json`);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface SettingsDetectionRule {
  id: string;
  name: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  sparta: { tactic: string; technique: string } | null;
  mitre: { techniqueId: string; techniqueName: string } | null;
  nis2Articles: string[];
  sourceFile: string | null;
  conditionType: string;
  conditionParameter: string | null;
  conditionValue: number | null;
  enabled: boolean;
  thresholdOverride: number | null;
}

export const updateSettingsOrganization = (data: Partial<{
  name: string;
  contactEmail: string;
  contactName: string;
  nis2Classification: string;
  country: string;
}>) => api.put<OrganizationResponse>("/api/v1/settings/organization", data);

export const updateSettingsNotifications = (data: {
  notifyCriticalAlerts?: boolean;
  notifyDeadlines?: boolean;
  notifyWeeklyDigest?: boolean;
}) => api.put<{ success: boolean }>("/api/v1/settings/notifications", data);

export const sendTestNotification = () =>
  api.post<{ success: boolean; message: string }>("/api/v1/settings/notifications/test", {});

export const getSettingsDetectionRules = () =>
  api.get<{ rules: SettingsDetectionRule[]; total: number }>("/api/v1/settings/detection/rules");

export const updateDetectionRuleSettings = (ruleId: string, data: {
  enabled?: boolean;
  thresholdOverride?: number | null;
}) => api.put<{ ruleId: string; enabled: boolean; thresholdOverride: number | null }>(
  `/api/v1/settings/detection/rules/${ruleId}`, data
);

export const regenerateStreamKey = (streamId: string) =>
  api.post<{ id: string; apiKey: string }>(
    `/api/v1/settings/telemetry/streams/${streamId}/regenerate-key`, {}
  );

export const updateStreamRateLimit = (streamId: string, pointsPerMinute: number) =>
  api.put<{ id: string; pointsPerMinute: number }>(
    `/api/v1/settings/telemetry/streams/${streamId}/rate-limit`,
    { pointsPerMinute }
  );

// ---------------------------------------------------------------------------
// Anomaly Detection
// ---------------------------------------------------------------------------

export interface BaselineResponse {
  id: string;
  streamId: string;
  parameterName: string;
  mean: number;
  stdDeviation: number;
  minValue: number;
  maxValue: number;
  sampleCount: number;
  windowStart: string;
  windowEnd: string;
  updatedAt: string;
}

export interface AnomalyStatsResponse {
  streamId: string;
  totalBaselines: number;
  anomalyRate: number;
  topAnomalousParameters: Array<{
    parameterName: string;
    anomalyCount: number;
    lastZScore: number;
  }>;
  learningMode: boolean;
  learningModeUntil: string | null;
}

export const getAnomalyBaselines = (streamId: string) =>
  api.get<{ data: BaselineResponse[]; total: number }>(
    `/api/v1/anomaly/baselines?streamId=${streamId}`
  );

export const getAnomalyStats = (streamId: string) =>
  api.get<AnomalyStatsResponse>(
    `/api/v1/anomaly/stats?streamId=${streamId}`
  );

// Correlation rules
export const getCorrelationRules = () =>
  api.get<{ rules: CorrelationRuleConfig[]; total: number }>(
    "/api/v1/settings/correlation/rules"
  );

export const updateCorrelationRuleSettings = (
  ruleId: string,
  data: { enabled?: boolean; thresholds?: Record<string, number> }
) => api.put<CorrelationRuleConfig>(`/api/v1/settings/correlation/rules/${ruleId}`, data);

// ---------------------------------------------------------------------------
// Syslog SIEM Integration
// ---------------------------------------------------------------------------

export interface SyslogEndpointResponse {
  id: string;
  organizationId: string;
  name: string;
  host: string;
  port: number;
  protocol: "UDP" | "TCP" | "TLS";
  format: "CEF" | "LEEF" | "JSON";
  minSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSyslogEndpoint {
  organizationId: string;
  name: string;
  host: string;
  port?: number;
  protocol?: "UDP" | "TCP" | "TLS";
  format?: "CEF" | "LEEF" | "JSON";
  minSeverity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  isActive?: boolean;
}

export interface UpdateSyslogEndpoint {
  name?: string;
  host?: string;
  port?: number;
  protocol?: "UDP" | "TCP" | "TLS";
  format?: "CEF" | "LEEF" | "JSON";
  minSeverity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  isActive?: boolean;
}

export const getSyslogEndpoints = (organizationId: string) =>
  api.get<{ data: SyslogEndpointResponse[]; total: number }>(
    `/api/v1/settings/syslog?organizationId=${organizationId}`
  );

export const createSyslogEndpointApi = (data: CreateSyslogEndpoint) =>
  api.post<SyslogEndpointResponse>("/api/v1/settings/syslog", data);

export const updateSyslogEndpointApi = (id: string, data: UpdateSyslogEndpoint) =>
  api.put<SyslogEndpointResponse>(`/api/v1/settings/syslog/${id}`, data);

export const deleteSyslogEndpointApi = (id: string) =>
  api.delete(`/api/v1/settings/syslog/${id}`);

export const testSyslogEndpointApi = (id: string) =>
  api.post<{ success: boolean; error?: string }>(`/api/v1/settings/syslog/${id}/test`, {});

// ---------------------------------------------------------------------------
// Scheduled Reports
// ---------------------------------------------------------------------------

export interface ScheduledReportRow {
  id: string;
  organizationId: string;
  reportType: "COMPLIANCE" | "INCIDENT_SUMMARY" | "THREAT_BRIEFING" | "SUPPLY_CHAIN" | "AUDIT_TRAIL";
  schedule: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  recipients: string[];
  lastGenerated: string | null;
  nextRun: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledReportInput {
  organizationId: string;
  reportType: ScheduledReportRow["reportType"];
  schedule: ScheduledReportRow["schedule"];
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  recipients: string[];
  isActive?: boolean;
}

export interface UpdateScheduledReportInput {
  schedule?: ScheduledReportRow["schedule"];
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  recipients?: string[];
  isActive?: boolean;
}

export const getScheduledReports = (organizationId: string) =>
  api.get<{ data: ScheduledReportRow[]; total: number }>(
    `/api/v1/reports/scheduled?organizationId=${organizationId}`
  );

export const createScheduledReport = (data: CreateScheduledReportInput) =>
  api.post<ScheduledReportRow>("/api/v1/reports/scheduled", data);

export const updateScheduledReport = (id: string, data: UpdateScheduledReportInput) =>
  api.put<ScheduledReportRow>(`/api/v1/reports/scheduled/${id}`, data);

export const deleteScheduledReport = (id: string) =>
  api.delete(`/api/v1/reports/scheduled/${id}`);

export const runScheduledReportNow = (id: string) =>
  api.post<{ success: boolean; message: string }>(`/api/v1/reports/scheduled/${id}/run-now`, {});

// ---------------------------------------------------------------------------
// Risk Scoring
// ---------------------------------------------------------------------------

export interface RiskBreakdownApi {
  compliance: number;
  threat: number;
  alerts: number;
  supplyChain: number;
  config: number;
}

export interface RiskScoreApi {
  overall: number;
  breakdown: RiskBreakdownApi;
  trend: "IMPROVING" | "STABLE" | "DEGRADING";
  topRisks: string[];
}

export interface AssetRiskApi {
  assetId: string;
  assetName: string;
  assetType: string;
  criticality: string;
  risk: RiskScoreApi;
}

export interface OrgRiskApi {
  organizationId: string;
  overall: number;
  breakdown: RiskBreakdownApi;
  trend: "IMPROVING" | "STABLE" | "DEGRADING";
  topRisks: string[];
  assetCount: number;
  highRiskAssetCount: number;
}

export interface RiskOverviewApi {
  organization: OrgRiskApi;
  assets: AssetRiskApi[];
  history: Array<{ date: string; score: number }>;
}

export const getAssetRisk = (assetId: string) =>
  api.get<AssetRiskApi>(`/api/v1/risk/assets/${assetId}`);

export const getOrgRisk = (organizationId: string) =>
  api.get<OrgRiskApi>(`/api/v1/risk/organization?organizationId=${organizationId}`);

export const getRiskOverview = (organizationId: string) =>
  api.get<RiskOverviewApi>(`/api/v1/risk/overview?organizationId=${organizationId}`);

export const storeRiskSnapshot = (organizationId: string) =>
  api.post<{ success: boolean }>(`/api/v1/risk/snapshot?organizationId=${organizationId}`, {});

// ---------------------------------------------------------------------------
// Playbooks
// ---------------------------------------------------------------------------

export interface PlaybookTriggerApi {
  auto: boolean;
  conditions: {
    severity?: string[];
    spartaTactic?: string[];
    ruleIds?: string[];
  };
}

export interface PlaybookStepApi {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
}

export interface PlaybookApi {
  id: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  trigger: PlaybookTriggerApi;
  steps: PlaybookStepApi[];
  isActive: boolean;
  executionCount: number;
  lastExecuted: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookExecutionLogEntry {
  stepIndex: number;
  stepType: string;
  status: "success" | "failed" | "skipped" | "waiting";
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface PlaybookExecutionApi {
  id: string;
  playbookId: string;
  playbookName?: string;
  incidentId: string | null;
  alertId: string | null;
  triggeredBy: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  stepsCompleted: number;
  stepsTotal: number;
  log: PlaybookExecutionLogEntry[];
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export const getPlaybooks = (organizationId: string) =>
  api.get<{ data: PlaybookApi[] }>(`/api/v1/playbooks?organizationId=${organizationId}`);

export const getPlaybook = (id: string) =>
  api.get<PlaybookApi>(`/api/v1/playbooks/${id}`);

export const createPlaybook = (data: {
  organizationId?: string;
  name: string;
  description?: string;
  trigger: PlaybookTriggerApi;
  steps: PlaybookStepApi[];
  isActive?: boolean;
}) => api.post<PlaybookApi>("/api/v1/playbooks", data);

export const updatePlaybook = (id: string, data: {
  name?: string;
  description?: string;
  trigger?: PlaybookTriggerApi;
  steps?: PlaybookStepApi[];
  isActive?: boolean;
}) => api.put<PlaybookApi>(`/api/v1/playbooks/${id}`, data);

export const deletePlaybook = (id: string) =>
  api.delete(`/api/v1/playbooks/${id}`);

export const executePlaybookApi = (id: string, data?: { alertId?: string; incidentId?: string }) =>
  api.post<PlaybookExecutionApi>(`/api/v1/playbooks/${id}/execute`, data ?? {});

export const getPlaybookExecutions = (organizationId: string, playbookId?: string) => {
  const params = new URLSearchParams({ organizationId });
  if (playbookId) params.set("playbookId", playbookId);
  return api.get<{ data: PlaybookExecutionApi[] }>(`/api/v1/playbooks/executions/list?${params}`);
};

export const getPlaybookExecution = (executionId: string) =>
  api.get<PlaybookExecutionApi>(`/api/v1/playbooks/executions/${executionId}`);

// ---------------------------------------------------------------------------
// Dashboard Layouts
// ---------------------------------------------------------------------------

export interface WidgetConfigApi {
  widget_id: string;
  position: { row: number; col: number };
  size: { w: number; h: number };
  config: Record<string, unknown>;
}

export interface DashboardLayoutApi {
  id: string | null;
  userId: string;
  layout: WidgetConfigApi[];
  createdAt: string;
  updatedAt: string;
}

export const getDashboardLayout = () =>
  api.get<DashboardLayoutApi>("/api/v1/dashboard/layout");

export const saveDashboardLayout = (layout: WidgetConfigApi[]) =>
  api.put<DashboardLayoutApi>("/api/v1/dashboard/layout", { layout });

export const resetDashboardLayout = () =>
  api.delete("/api/v1/dashboard/layout");

// ---------------------------------------------------------------------------
// Vulnerability / SBOM Management
// ---------------------------------------------------------------------------

export const getVulnerabilityComponents = (query?: Partial<ComponentQuery>) => {
  const params = new URLSearchParams();
  if (query?.organizationId) params.set("organizationId", query.organizationId);
  if (query?.assetId) params.set("assetId", query.assetId);
  if (query?.componentType) params.set("componentType", query.componentType);
  if (query?.source) params.set("source", query.source);
  if (query?.search) params.set("search", query.search);
  if (query?.page) params.set("page", String(query.page));
  if (query?.perPage) params.set("perPage", String(query.perPage));
  const qs = params.toString();
  return api.get<{ data: ComponentResponse[]; total: number; page: number; perPage: number }>(
    `/api/v1/vulnerability/components${qs ? `?${qs}` : ""}`
  );
};

export const createComponentApi = (data: CreateComponent) =>
  api.post<ComponentResponse>("/api/v1/vulnerability/components", data);

export const getComponentsByAsset = (assetId: string) =>
  api.get<{ data: ComponentResponse[]; total: number }>(
    `/api/v1/vulnerability/assets/${assetId}/components`
  );

export const getVulnerabilities = (query?: Partial<VulnerabilityQuery>) => {
  const params = new URLSearchParams();
  if (query?.organizationId) params.set("organizationId", query.organizationId);
  if (query?.componentId) params.set("componentId", query.componentId);
  if (query?.severity) params.set("severity", query.severity);
  if (query?.status) params.set("status", query.status);
  if (query?.search) params.set("search", query.search);
  if (query?.page) params.set("page", String(query.page));
  if (query?.perPage) params.set("perPage", String(query.perPage));
  const qs = params.toString();
  return api.get<{ data: VulnerabilityResponse[]; total: number; page: number; perPage: number }>(
    `/api/v1/vulnerability/vulnerabilities${qs ? `?${qs}` : ""}`
  );
};

export const createVulnerabilityApi = (data: CreateVulnerability) =>
  api.post<VulnerabilityResponse>("/api/v1/vulnerability/vulnerabilities", data);

export const updateVulnerabilityApi = (id: string, data: UpdateVulnerability) =>
  api.put<VulnerabilityResponse>(`/api/v1/vulnerability/vulnerabilities/${id}`, data);

export const getVulnerabilityStats = (organizationId: string) =>
  api.get<VulnerabilityStats>(`/api/v1/vulnerability/stats?organizationId=${organizationId}`);

// ---------------------------------------------------------------------------
// Lifecycle Management
// ---------------------------------------------------------------------------

export const getFleetLifecycle = (organizationId: string) =>
  api.get<{ data: FleetLifecycleEntry[]; total: number }>(
    `/api/v1/lifecycle/fleet?organizationId=${organizationId}`
  );

export const getLifecycleMilestones = (assetId: string, organizationId: string) =>
  api.get<{ data: SecurityMilestoneEntry[] }>(
    `/api/v1/lifecycle/milestones/${assetId}?organizationId=${organizationId}`
  );

export const transitionLifecyclePhase = (
  assetId: string,
  newPhase: string,
  organizationId: string,
) =>
  api.post<{ asset: { id: string; name: string; lifecyclePhase: string }; previousPhase: string; newPhase: string }>(
    `/api/v1/lifecycle/phases/${assetId}/transition?organizationId=${organizationId}`,
    { newPhase }
  );

export const getTlptSchedule = (organizationId: string) =>
  api.get<{ data: TlptScheduleEntry[]; total: number }>(
    `/api/v1/lifecycle/tlpt-schedule?organizationId=${organizationId}`
  );

export interface FleetLifecycleEntry {
  id: string;
  name: string;
  assetType: string;
  segment: string | null;
  lifecyclePhase: string;
  lifecyclePhaseEnteredAt: string | null;
  endOfLifeDate: string | null;
  criticality: string;
  status: string;
}

export interface SecurityMilestoneEntry {
  id: string;
  phase: string;
  name: string;
  description: string;
  required: boolean;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "NOT_APPLICABLE";
  dueDescription: string;
}

export interface TlptScheduleEntry {
  assetId: string;
  assetName: string;
  assetType: string;
  lifecyclePhase: string;
  lastConducted: string | null;
  nextDue: string | null;
  overdue: boolean;
}

export const importSbomApi = (data: {
  organizationId: string;
  assetId?: string | null;
  filename: string;
  format: string;
  content: string | Record<string, unknown>;
}) =>
  api.post<{ import: SbomImportResponse; components: ComponentResponse[] }>(
    "/api/v1/vulnerability/sbom/import",
    data
  );
