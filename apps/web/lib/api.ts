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
    throw new ApiError(res.status, body.error ?? res.statusText);
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
export const getDashboard = (organizationId: string) =>
  api.get<DashboardResponse>(
    `/api/v1/compliance/dashboard?organizationId=${organizationId}`
  );

// PDF report - returns a Blob for direct download in the browser
export const getCompliancePdf = async (organizationId: string): Promise<Blob> => {
  const res = await fetch(
    `${API_URL}/api/v1/reports/compliance/pdf?organizationId=${organizationId}`,
    { method: "GET" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.blob();
};

export { ApiError };
