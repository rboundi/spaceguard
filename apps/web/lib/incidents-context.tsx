"use client";

/**
 * IncidentContext
 *
 * Combines an initial fetch with WebSocket real-time events to provide:
 *   - activeCount: number of open incidents (for sidebar badge)
 *
 * On mount, fetches the current active count once. After that, the count is
 * updated via "incident.new" and "incident.updated" WebSocket events.
 * Falls back to polling every 60s if the WS connection drops.
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
import { useRealtimeEvent, useConnectionStatus } from "@/lib/ws";

interface IncidentContextValue {
  activeCount: number;
}

const IncidentContext = createContext<IncidentContextValue>({
  activeCount: 0,
});

const FALLBACK_POLL_MS = 60_000;

const CLOSED_STATUSES = ["CLOSED", "FALSE_POSITIVE"];

export function IncidentProvider({ children }: { children: ReactNode }) {
  const { orgId, loading: orgLoading } = useOrg();
  const [activeCount, setActiveCount] = useState(0);
  const mountedRef = useRef(true);
  const wsStatus = useConnectionStatus();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchStats = useCallback(async () => {
    if (!orgId) return;
    try {
      const { activeCount: count } = await getIncidentStats(orgId);
      if (mountedRef.current) setActiveCount(count);
    } catch {
      // Silently degrade
    }
  }, [orgId]);

  // Handle WS incident.new
  useRealtimeEvent("incident.new", useCallback(() => {
    setActiveCount((prev) => prev + 1);
  }, []));

  // Handle WS incident.updated (might close an incident)
  useRealtimeEvent("incident.updated", useCallback((event) => {
    const p = event.payload as { status?: string };
    if (p.status && CLOSED_STATUSES.includes(p.status)) {
      setActiveCount((prev) => Math.max(0, prev - 1));
    }
  }, []));

  // Reset on org change
  useEffect(() => {
    setActiveCount(0);
  }, [orgId]);

  // Initial fetch + fallback poll
  useEffect(() => {
    if (orgLoading || !orgId) return;
    void fetchStats();

    if (wsStatus !== "connected") {
      const id = setInterval(() => void fetchStats(), FALLBACK_POLL_MS);
      return () => clearInterval(id);
    }
  }, [orgId, orgLoading, fetchStats, wsStatus]);

  return (
    <IncidentContext.Provider value={{ activeCount }}>
      {children}
    </IncidentContext.Provider>
  );
}

export function useIncidents(): IncidentContextValue {
  return useContext(IncidentContext);
}
