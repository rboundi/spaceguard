import type {
  OrganizationResponse,
  AssetResponse,
  AssetQuery,
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
} from "@spaceguard/shared";

const API_URL =
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
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof body.error === "string" ? body.error : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
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
  if (query?.page) params.set("page", String(query.page));
  if (query?.perPage) params.set("perPage", String(query.perPage));
  const qs = params.toString();
  return api.get<{ data: AssetResponse[]; total: number; page: number; perPage: number }>(
    `/api/v1/assets${qs ? `?${qs}` : ""}`
  );
};

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

// PDF report - returns a Blob for direct download in the browser
export const getCompliancePdf = async (organizationId: string): Promise<Blob> => {
  const params = new URLSearchParams({ organizationId });
  const res = await fetch(
    `${API_URL}/api/v1/reports/compliance/pdf?${params.toString()}`,
    { method: "GET" }
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

export const getAlerts = (query: {
  organizationId: string;
  status?: string;
  severity?: string;
  streamId?: string;
  affectedAssetId?: string;
  ruleId?: string;
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
}) => {
  const params = new URLSearchParams({ organizationId: query.organizationId });
  if (query.status)          params.set("status", query.status);
  if (query.severity)        params.set("severity", query.severity);
  if (query.streamId)        params.set("streamId", query.streamId);
  if (query.affectedAssetId) params.set("affectedAssetId", query.affectedAssetId);
  if (query.ruleId)          params.set("ruleId", query.ruleId);
  if (query.from)            params.set("from", query.from);
  if (query.to)              params.set("to", query.to);
  if (query.page)            params.set("page", String(query.page));
  if (query.perPage)         params.set("perPage", String(query.perPage));
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

export { ApiError };
