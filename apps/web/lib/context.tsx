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
import { useAuth } from "@/lib/auth-context";

// ---------------------------------------------------------------------------
// Country flag helper
// ---------------------------------------------------------------------------

const COUNTRY_FLAGS: Record<string, string> = {
  AT: "\u{1F1E6}\u{1F1F9}",
  BE: "\u{1F1E7}\u{1F1EA}",
  BG: "\u{1F1E7}\u{1F1EC}",
  CY: "\u{1F1E8}\u{1F1FE}",
  CZ: "\u{1F1E8}\u{1F1FF}",
  DE: "\u{1F1E9}\u{1F1EA}",
  DK: "\u{1F1E9}\u{1F1F0}",
  EE: "\u{1F1EA}\u{1F1EA}",
  ES: "\u{1F1EA}\u{1F1F8}",
  FI: "\u{1F1EB}\u{1F1EE}",
  FR: "\u{1F1EB}\u{1F1F7}",
  GB: "\u{1F1EC}\u{1F1E7}",
  GR: "\u{1F1EC}\u{1F1F7}",
  HR: "\u{1F1ED}\u{1F1F7}",
  HU: "\u{1F1ED}\u{1F1FA}",
  IE: "\u{1F1EE}\u{1F1EA}",
  IT: "\u{1F1EE}\u{1F1F9}",
  LT: "\u{1F1F1}\u{1F1F9}",
  LU: "\u{1F1F1}\u{1F1FA}",
  LV: "\u{1F1F1}\u{1F1FB}",
  MT: "\u{1F1F2}\u{1F1F9}",
  NL: "\u{1F1F3}\u{1F1F1}",
  NO: "\u{1F1F3}\u{1F1F4}",
  PL: "\u{1F1F5}\u{1F1F1}",
  PT: "\u{1F1F5}\u{1F1F9}",
  RO: "\u{1F1F7}\u{1F1F4}",
  SE: "\u{1F1F8}\u{1F1EA}",
  SI: "\u{1F1F8}\u{1F1EE}",
  SK: "\u{1F1F8}\u{1F1F0}",
};

export function countryFlag(code: string): string {
  return COUNTRY_FLAGS[code.toUpperCase()] ?? "\u{1F30D}";
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

const ORG_STORAGE_KEY = "spaceguard_selected_org";

function readStoredOrgId(): string | null {
  try { return localStorage.getItem(ORG_STORAGE_KEY); } catch { return null; }
}

function writeStoredOrgId(id: string): void {
  try { localStorage.setItem(ORG_STORAGE_KEY, id); } catch { /* ignore */ }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrganizationResponse[]>([]);
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === "ADMIN";

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await getOrganizations();
      setOrgs(data);

      if (!isAdmin) {
        // Non-admin users are locked to their own org
        setOrgIdState(user.organizationId);
        writeStoredOrgId(user.organizationId);
      } else if (data.length > 0) {
        setOrgIdState((prev) => {
          if (prev) return prev;
          const stored = readStoredOrgId();
          const valid = stored && data.some((o) => o.id === stored);
          return valid ? stored : data[0].id;
        });
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const setOrgId = useCallback((id: string) => {
    if (!isAdmin) return; // Non-admins cannot switch orgs
    setOrgIdState(id);
    writeStoredOrgId(id);
  }, [isAdmin]);

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
