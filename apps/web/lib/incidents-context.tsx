"use client";

/**
 * IncidentContext
 *
 * Polls GET /incidents every 30 seconds for active (non-closed) incidents.
 * Provides:
 *   - activeCount: number of open incidents (for sidebar badge)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getIncidentStats } from "@/lib/api";
import { useOrg } from "@/lib/context";

interface IncidentContextValue {
  activeCount: number;
}

const IncidentContext = createContext<IncidentContextValue>({
  activeCount: 0,
});

const POLL_INTERVAL_MS = 30_000;

export function IncidentProvider({ children }: { children: ReactNode }) {
  const { orgId, loading: orgLoading } = useOrg();
  const [activeCount, setActiveCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const poll = useCallback(async () => {
    if (!orgId) return;
    try {
      // Single stats endpoint instead of 6 parallel status queries
      const { activeCount: count } = await getIncidentStats(orgId);
      if (mountedRef.current) setActiveCount(count);
    } catch {
      // Silently degrade if incidents table not yet migrated
    }
  }, [orgId]);

  // Reset on org change
  useEffect(() => {
    setActiveCount(0);
  }, [orgId]);

  // Start polling once org is known
  useEffect(() => {
    if (orgLoading || !orgId) return;
    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [orgId, orgLoading, poll]);

  return (
    <IncidentContext.Provider value={{ activeCount }}>
      {children}
    </IncidentContext.Provider>
  );
}

export function useIncidents(): IncidentContextValue {
  return useContext(IncidentContext);
}
