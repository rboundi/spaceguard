"use client";

/**
 * AlertContext
 *
 * Polls GET /alerts?status=NEW every 10 seconds and provides:
 *   - newCount:    number of NEW alerts (for sidebar badge)
 *   - toasts:      queue of freshly-seen alerts to display as notifications
 *   - dismissToast: remove a toast by id
 *
 * New alerts are detected by comparing the set of NEW alert IDs against the
 * previous poll. Any ID that wasn't present before is pushed onto the toast
 * queue. Toasts auto-dismiss after 6 seconds.
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
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AlertContext = createContext<AlertContextValue>({
  newCount: 0,
  toasts: [],
  dismissToast: () => undefined,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 10_000;
const TOAST_TTL_MS = 6_000;

export function AlertProvider({ children }: { children: ReactNode }) {
  const { orgId, loading: orgLoading } = useOrg();
  const [newCount, setNewCount] = useState(0);
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  // Track which alert IDs we've already seen to detect fresh ones
  const seenIds = useRef<Set<string>>(new Set());
  // True after the very first poll - prevents flooding toasts on initial load
  const initialized = useRef(false);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  const poll = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, total } = await getAlerts({
        organizationId: orgId,
        status: "NEW",
        perPage: 100,
      });

      setNewCount(total);

      if (!initialized.current) {
        // First load: populate seen set without showing toasts
        for (const a of data) seenIds.current.add(a.id);
        initialized.current = true;
        return;
      }

      // Detect alerts that weren't in the previous poll
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
          // Auto-dismiss after TTL
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
          }, TOAST_TTL_MS);
        }
      }

      if (fresh.length > 0) {
        setToasts((prev) => [...fresh, ...prev].slice(0, 5)); // cap at 5 toasts
      }
    } catch {
      // Silently ignore poll errors - UI degrades gracefully
    }
  }, [orgId]);

  // Reset when org changes
  useEffect(() => {
    seenIds.current = new Set();
    initialized.current = false;
    setNewCount(0);
    setToasts([]);
  }, [orgId]);

  // Start polling once org is known
  useEffect(() => {
    if (orgLoading || !orgId) return;

    // Immediate first poll
    void poll();

    const interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [orgId, orgLoading, poll]);

  return (
    <AlertContext.Provider value={{ newCount, toasts, dismissToast }}>
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
