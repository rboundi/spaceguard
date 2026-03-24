"use client";

/**
 * AlertNotifications
 *
 * Renders a stack of toast notifications in the top-right corner for
 * freshly detected NEW alerts. Driven by AlertContext (polling every 10s).
 */

import { X, AlertTriangle, AlertCircle, Info, Zap } from "lucide-react";
import Link from "next/link";
import { useAlerts } from "@/lib/alerts-context";
import type { AlertToast } from "@/lib/alerts-context";

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "border-red-500/60 bg-red-950/80 text-red-200",
  HIGH:     "border-amber-500/60 bg-amber-950/80 text-amber-200",
  MEDIUM:   "border-yellow-500/60 bg-yellow-950/80 text-yellow-200",
  LOW:      "border-blue-500/40 bg-blue-950/60 text-blue-200",
};

const SEVERITY_ICON_CLASS: Record<string, string> = {
  CRITICAL: "text-red-400",
  HIGH:     "text-amber-400",
  MEDIUM:   "text-yellow-400",
  LOW:      "text-blue-400",
};

function SeverityIcon({ severity }: { severity: AlertToast["severity"] }) {
  const cls = `shrink-0 ${SEVERITY_ICON_CLASS[severity] ?? "text-slate-400"}`;
  switch (severity) {
    case "CRITICAL": return <Zap size={16} className={cls} />;
    case "HIGH":     return <AlertTriangle size={16} className={cls} />;
    case "MEDIUM":   return <AlertCircle size={16} className={cls} />;
    default:         return <Info size={16} className={cls} />;
  }
}

// ---------------------------------------------------------------------------
// Single toast
// ---------------------------------------------------------------------------

function Toast({ toast, onDismiss }: { toast: AlertToast; onDismiss: () => void }) {
  const styles = SEVERITY_STYLES[toast.severity] ?? SEVERITY_STYLES.LOW;
  const time = new Date(toast.triggeredAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      className={[
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-xl",
        "animate-in slide-in-from-right-5 fade-in duration-300",
        "max-w-xs w-full backdrop-blur-sm",
        styles,
      ].join(" ")}
      role="alert"
      aria-live="assertive"
    >
      <SeverityIcon severity={toast.severity} />

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight line-clamp-2">
          {toast.title}
        </p>
        <p className="text-[10px] opacity-70 mt-0.5">
          {toast.ruleId} &middot; {time}
        </p>
        <Link
          href={`/alerts`}
          className="text-[10px] underline underline-offset-2 opacity-80 hover:opacity-100 mt-0.5 inline-block"
          onClick={onDismiss}
        >
          View alert
        </Link>
      </div>

      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity mt-0.5"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function AlertNotifications() {
  const { toasts, dismissToast } = useAlerts();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-label="Alert notifications"
    >
      {toasts.map((t) => (
        <div key={t.toastId} className="pointer-events-auto">
          <Toast toast={t} onDismiss={() => dismissToast(t.toastId)} />
        </div>
      ))}
    </div>
  );
}
