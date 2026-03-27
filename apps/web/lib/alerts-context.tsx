"use client";

/**
 * AlertContext
 *
 * Combines an initial fetch with WebSocket real-time events to provide:
 *   - newCount:    number of NEW alerts (for sidebar badge)
 *   - toasts:      queue of freshly-seen alerts to display as notifications
 *   - dismissToast: remove a toast by id
 *   - refresh:     manual re-fetch (e.g. after bulk actions)
 *
 * On mount, fetches the current NEW alert count once. After that, the count is
 * updated incrementally via "alert.new" and "alert.updated" WebSocket events.
 * Falls back to polling every 30s if the WS connection drops.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getAlerts } from "@/lib/api";
import type { AlertResponse } from "@/lib/api";
import { useOrg } from "@/lib/context";
import { useRealtimeEvent, useConnectionStatus } from "@/lib/ws";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertToast {
  id: string;          // alert id (stable dedup key)
  toastId: string;     // unique per-toast instance (for dismiss)
  severity: AlertResponse["severity"];
  title: string;
  ruleId: string;
  triggeredAt: string;
}

interface AlertContextValue {
  newCount: number;
  toasts: AlertToast[];
  dismissToast: (toastId: string) => void;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AlertContext = createContext<AlertContextValue>({
  newCount: 0,
  toasts: [],
  dismissToast: () => undefined,
  refresh: () => undefined,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const TOAST_TTL_MS = 6_000;
const FALLBACK_POLL_MS = 30_000;

export function AlertProvider({ children }: { children: ReactNode }) {
  const { orgId, loading: orgLoading } = useOrg();
  const [newCount, setNewCount] = useState(0);
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const toastTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const wsStatus = useConnectionStatus();

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  // Shared fetch function
  const fetchAlerts = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, total } = await getAlerts({
        organizationId: orgId,
        status: "NEW",
        perPage: 100,
      });

      setNewCount(total);

      if (!initialized.current) {
        for (const a of data) seenIds.current.add(a.id);
        initialized.current = true;
        return;
      }

      // Detect unseen alerts (only during poll fallback, WS handles its own)
      const fresh: AlertToast[] = [];
      for (const a of data) {
        if (!seenIds.current.has(a.id)) {
          seenIds.current.add(a.id);
          const toastId = `${a.id}-${Date.now()}`;
          fresh.push({
            id: a.id,
            toastId,
            severity: a.severity,
            title: a.title,
            ruleId: a.ruleId,
            triggeredAt: a.triggeredAt,
          });
          const timerId = setTimeout(() => {
            toastTimers.current.delete(timerId);
            setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
          }, TOAST_TTL_MS);
          toastTimers.current.add(timerId);
        }
      }

      if (fresh.length > 0) {
        setToasts((prev) => [...fresh, ...prev].slice(0, 5));
      }
    } catch {
      // Silently ignore
    }
  }, [orgId]);

  // Handle WS alert.new events
  useRealtimeEvent("alert.new", useCallback((event) => {
    const p = event.payload as {
      id?: string;
      title?: string;
      severity?: string;
      status?: string;
    };
    if (!p.id) return;

    // Increment count
    setNewCount((prev) => prev + 1);

    // Show toast if not already seen
    if (!seenIds.current.has(p.id)) {
      seenIds.current.add(p.id);
      const toastId = `${p.id}-${Date.now()}`;
      const toast: AlertToast = {
        id: p.id,
        toastId,
        severity: (p.severity ?? "MEDIUM") as AlertToast["severity"],
        title: p.title ?? "New Alert",
        ruleId: "",
        triggeredAt: event.timestamp,
      };
      setToasts((prev) => [toast, ...prev].slice(0, 5));
      const timerId = setTimeout(() => {
        toastTimers.current.delete(timerId);
        setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
      }, TOAST_TTL_MS);
      toastTimers.current.add(timerId);
    }
  }, []));

  // Handle WS alert.updated (status change may reduce NEW count)
  useRealtimeEvent("alert.updated", useCallback(() => {
    // Easiest: just re-fetch to get accurate count
    void fetchAlerts();
  }, [fetchAlerts]));

  // Reset when org changes
  useEffect(() => {
    seenIds.current = new Set();
    initialized.current = false;
    setNewCount(0);
    setToasts([]);
    for (const t of toastTimers.current) clearTimeout(t);
    toastTimers.current = new Set();
  }, [orgId]);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      for (const t of toastTimers.current) clearTimeout(t);
    };
  }, []);

  // Initial fetch + fallback poll when WS is disconnected
  useEffect(() => {
    if (orgLoading || !orgId) return;

    // Always do an initial fetch
    void fetchAlerts();

    // Only poll as fallback when WS is not connected
    if (wsStatus !== "connected") {
      const interval = setInterval(() => {
        void fetchAlerts();
      }, FALLBACK_POLL_MS);
      return () => clearInterval(interval);
    }
  }, [orgId, orgLoading, fetchAlerts, wsStatus]);

  const refresh = useCallback(() => {
    void fetchAlerts();
  }, [fetchAlerts]);

  return (
    <AlertContext.Provider value={{ newCount, toasts, dismissToast, refresh }}>
      {children}
    </AlertContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAlerts(): AlertContextValue {
  return useContext(AlertContext);
}
