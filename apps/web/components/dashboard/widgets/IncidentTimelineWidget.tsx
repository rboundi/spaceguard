"use client";

import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WidgetProps } from "../widget-types";

const ACTIVE_STATUSES = new Set([
  "DETECTED", "TRIAGING", "INVESTIGATING", "CONTAINING", "ERADICATING", "RECOVERING",
]);

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "border-red-500/40 bg-red-500/10",
  HIGH: "border-amber-500/40 bg-amber-500/10",
  MEDIUM: "border-yellow-500/40 bg-yellow-500/10",
  LOW: "border-blue-500/40 bg-blue-500/10",
};

const SEV_TEXT: Record<string, string> = {
  CRITICAL: "text-red-400",
  HIGH: "text-amber-400",
  MEDIUM: "text-yellow-400",
  LOW: "text-blue-400",
};

export function IncidentTimelineWidget({ data }: WidgetProps) {
  const active = data.incidents.filter((i) => ACTIVE_STATUSES.has(i.status));
  const sorted = [...active].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <Card className="bg-slate-900 border-slate-800 h-full flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">Active Incidents</CardTitle>
          <Link href="/incidents" className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
            View all <ArrowRight size={10} />
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{active.length} open incident{active.length !== 1 ? "s" : ""}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 overflow-auto">
        {sorted.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle size={20} className="mx-auto text-slate-600 mb-1" />
            <p className="text-xs text-slate-500">No active incidents</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.slice(0, 8).map((inc) => (
              <div
                key={inc.id}
                className={`rounded-md border px-3 py-2 ${SEV_COLOR[inc.severity] ?? "border-slate-700 bg-slate-800/30"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-200 font-medium truncate mr-2">{inc.title}</span>
                  <span className={`text-[10px] font-semibold shrink-0 ${SEV_TEXT[inc.severity] ?? "text-slate-400"}`}>
                    {inc.severity}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-slate-500">{inc.status.replaceAll("_", " ")}</span>
                  <span className="text-[10px] text-slate-600">{relTime(inc.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
