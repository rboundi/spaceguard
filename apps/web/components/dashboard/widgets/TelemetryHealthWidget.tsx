"use client";

import Link from "next/link";
import { ArrowRight, Activity, Clock, XCircle, Waves } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WidgetProps } from "../widget-types";

export function TelemetryHealthWidget({ data }: WidgetProps) {
  const streams = data.streams;
  const active = streams.filter((s) => s.status === "ACTIVE");
  const paused = streams.filter((s) => s.status === "PAUSED");
  const error = streams.filter((s) => s.status === "ERROR");

  return (
    <Card className="bg-slate-900 border-slate-800 h-full flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">Telemetry Health</CardTitle>
          <Link href="/telemetry" className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
            Details <ArrowRight size={10} />
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {streams.length} stream{streams.length !== 1 ? "s" : ""} configured
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Activity size={12} className="text-emerald-400" />
              <span className="text-lg font-bold text-emerald-400">{active.length}</span>
            </div>
            <p className="text-[9px] uppercase tracking-wider text-emerald-500">Active</p>
          </div>
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Clock size={12} className="text-amber-400" />
              <span className="text-lg font-bold text-amber-400">{paused.length}</span>
            </div>
            <p className="text-[9px] uppercase tracking-wider text-amber-500">Paused</p>
          </div>
          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <XCircle size={12} className="text-red-400" />
              <span className="text-lg font-bold text-red-400">{error.length}</span>
            </div>
            <p className="text-[9px] uppercase tracking-wider text-red-500">Error</p>
          </div>
        </div>

        {streams.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Recent Streams</p>
            {streams.slice(0, 5).map((s) => {
              const dotStyles: Record<string, string> = {
                ACTIVE: "bg-emerald-400", PAUSED: "bg-amber-400", ERROR: "bg-red-400", DISABLED: "bg-slate-500",
              };
              const textStyles: Record<string, string> = {
                ACTIVE: "text-emerald-400", PAUSED: "text-amber-400", ERROR: "text-red-400", DISABLED: "text-slate-500",
              };
              return (
                <div key={s.id} className="flex items-center justify-between rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStyles[s.status] ?? "bg-slate-500"}`} />
                    <span className="text-xs text-slate-300 truncate">{s.name}</span>
                  </div>
                  <span className={`text-[10px] font-medium shrink-0 ml-2 ${textStyles[s.status] ?? "text-slate-500"}`}>
                    {s.status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4">
            <Waves size={20} className="mx-auto text-slate-600 mb-1" />
            <p className="text-xs text-slate-500">No telemetry streams configured</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
