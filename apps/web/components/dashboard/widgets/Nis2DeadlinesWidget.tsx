"use client";

import Link from "next/link";
import { ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WidgetProps } from "../widget-types";

const ACTIVE_STATUSES = new Set([
  "DETECTED", "TRIAGING", "INVESTIGATING", "CONTAINING", "ERADICATING", "RECOVERING",
]);

function timeUntil(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

export function Nis2DeadlinesWidget({ data }: WidgetProps) {
  const incidents = data.incidents;
  const active = incidents.filter((i) => ACTIVE_STATUSES.has(i.status));
  const significant = active.filter((i) => i.nis2Classification === "SIGNIFICANT");

  interface Deadline {
    incidentTitle: string;
    label: string;
    deadlineTime: Date;
    overdue: boolean;
  }

  const deadlines: Deadline[] = [];
  for (const inc of significant.slice(0, 5)) {
    const detected = inc.detectedAt ? new Date(inc.detectedAt) : new Date(inc.createdAt);
    const rules = [
      { label: "Early warning (24h)", hoursOffset: 24 },
      { label: "Notification (72h)", hoursOffset: 72 },
      { label: "Final report (30d)", hoursOffset: 30 * 24 },
    ];
    for (const rule of rules) {
      const dl = new Date(detected.getTime() + rule.hoursOffset * 60 * 60 * 1000);
      deadlines.push({
        incidentTitle: inc.title,
        label: rule.label,
        deadlineTime: dl,
        overdue: dl.getTime() <= Date.now(),
      });
    }
  }
  deadlines.sort((a, b) => a.deadlineTime.getTime() - b.deadlineTime.getTime());
  const relevantDeadlines = deadlines.slice(0, 6);

  return (
    <Card className="bg-slate-900 border-slate-800 flex flex-col h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">
            Incidents & NIS2 Deadlines
          </CardTitle>
          <Link href="/incidents" className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
            View all <ArrowRight size={10} />
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {active.length} active, {significant.length} NIS2-significant
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 space-y-3">
        {/* Active incident severity breakdown */}
        <div className="grid grid-cols-4 gap-2">
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
            const ct = active.filter((i) => i.severity === sev).length;
            const styles: Record<string, { bg: string; text: string }> = {
              CRITICAL: { bg: "bg-red-500/10", text: "text-red-400" },
              HIGH: { bg: "bg-amber-500/10", text: "text-amber-400" },
              MEDIUM: { bg: "bg-yellow-500/10", text: "text-yellow-400" },
              LOW: { bg: "bg-blue-500/10", text: "text-blue-400" },
            };
            const s = styles[sev];
            return (
              <div key={sev} className={`rounded-md px-2 py-1.5 ${s.bg} text-center`}>
                <p className={`text-lg font-bold ${s.text}`}>{ct}</p>
                <p className={`text-[9px] font-semibold uppercase tracking-wider ${s.text} opacity-70`}>{sev}</p>
              </div>
            );
          })}
        </div>

        {relevantDeadlines.length > 0 ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">
              Regulatory Deadlines
            </p>
            <div className="space-y-1.5">
              {relevantDeadlines.map((d, i) => (
                <div
                  key={i}
                  className={[
                    "flex items-center justify-between rounded-md border px-3 py-1.5",
                    d.overdue
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-slate-700/50 bg-slate-800/30",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock size={12} className={d.overdue ? "text-red-400 shrink-0" : "text-slate-500 shrink-0"} />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300 truncate">{d.incidentTitle}</p>
                      <p className="text-[10px] text-slate-500">{d.label}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium shrink-0 ml-2 ${d.overdue ? "text-red-400" : "text-slate-400"}`}>
                    {d.overdue ? "OVERDUE" : timeUntil(d.deadlineTime)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : significant.length === 0 ? (
          <div className="text-center py-4">
            <CheckCircle2 size={20} className="mx-auto text-emerald-500 mb-1" />
            <p className="text-xs text-slate-500">No NIS2-significant incidents</p>
          </div>
        ) : (
          <div className="text-center py-4">
            <CheckCircle2 size={20} className="mx-auto text-emerald-500 mb-1" />
            <p className="text-xs text-slate-500">All deadlines met</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
