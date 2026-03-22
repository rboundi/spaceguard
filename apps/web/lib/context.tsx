"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { OrganizationResponse } from "@spaceguard/shared";
import { getOrganizations } from "@/lib/api";

// ---------------------------------------------------------------------------
// Country flag helper
// ---------------------------------------------------------------------------

const COUNTRY_FLAGS: Record<string, string> = {
  AT: "🇦🇹",
  BE: "🇧🇪",
  BG: "🇧🇬",
  CY: "🇨🇾",
  CZ: "🇨🇿",
  DE: "🇩🇪",
  DK: "🇩🇰",
  EE: "🇪🇪",
  ES: "🇪🇸",
  FI: "🇫🇮",
  FR: "🇫🇷",
  GB: "🇬🇧",
  GR: "🇬🇷",
  HR: "🇭🇷",
  HU: "🇭🇺",
  IE: "🇮🇪",
  IT: "🇮🇹",
  LT: "🇱🇹",
  LU: "🇱🇺",
  LV: "🇱🇻",
  MT: "🇲🇹",
  NL: "🇳🇱",
  NO: "🇳🇴",
  PL: "🇵🇱",
  PT: "🇵🇹",
  RO: "🇷🇴",
  SE: "🇸🇪",
  SI: "🇸🇮",
  SK: "🇸🇰",
};

export function countryFlag(code: string): string {
  return COUNTRY_FLAGS[code.toUpperCase()] ?? "🌍";
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface OrgContextValue {
  orgs: OrganizationResponse[];
  orgId: string | null;
  orgName: string;
  setOrgId: (id: string) => void;
  loading: boolean;
  reload: () => void;
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  orgId: null,
  orgName: "",
  setOrgId: () => undefined,
  loading: true,
  reload: () => undefined,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<OrganizationResponse[]>([]);
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getOrganizations();
      setOrgs(data);
      if (data.length > 0) {
        setOrgIdState((prev) => prev ?? data[0].id);
      }
    } catch {
      // silently fail - pages handle their own error states
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setOrgId = useCallback((id: string) => {
    setOrgIdState(id);
  }, []);

  const selectedOrg = orgs.find((o) => o.id === orgId);

  return (
    <OrgContext.Provider
      value={{
        orgs,
        orgId,
        orgName: selectedOrg?.name ?? "",
        setOrgId,
        loading,
        reload: load,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOrg(): OrgContextValue {
  return useContext(OrgContext);
}
