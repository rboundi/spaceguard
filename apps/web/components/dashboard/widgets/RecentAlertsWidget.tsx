"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WidgetProps } from "../widget-types";

const SEV_BADGE_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-300 border-red-500/40",
  HIGH:     "bg-amber-500/20 text-amber-300 border-amber-500/40",
  MEDIUM:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  LOW:      "bg-blue-500/20 text-blue-300 border-blue-500/40",
};

const ALERT_STATUS_STYLE: Record<string, string> = {
  NEW:            "bg-red-500/20 text-red-300 border-red-500/40",
  INVESTIGATING:  "bg-amber-500/20 text-amber-300 border-amber-500/40",
  RESOLVED:       "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  FALSE_POSITIVE: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function RecentAlertsWidget({ data }: WidgetProps) {
  const alerts = data.recentAlerts;

  return (
    <Card className="bg-slate-900 border-slate-800 flex flex-col h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">Recent Alerts</CardTitle>
          <Link href="/alerts" className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
            View all <ArrowRight size={10} />
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">Latest triggered events</p>
      </CardHeader>
      <CardContent className="px-0 pb-0 flex-1">
        {alerts.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-slate-500 text-sm font-medium">No alerts yet</p>
            <p className="text-slate-600 text-xs mt-1">Detection engine is active and monitoring.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Alert</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Severity</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Status</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((a) => (
                  <TableRow key={a.id} className="border-slate-800 hover:bg-slate-800/40">
                    <TableCell className="px-4 py-2.5">
                      <Link href="/alerts" className="group">
                        <span className="text-xs text-slate-300 group-hover:text-blue-400 transition-colors line-clamp-1">
                          {a.title}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${SEV_BADGE_STYLE[a.severity] ?? ""}`}>
                        {a.severity}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      <span className={`inline-flex items-center text-[9px] font-medium px-1 py-0 rounded border ${ALERT_STATUS_STYLE[a.status] ?? ""}`}>
                        {a.status.replaceAll("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right">
                      <span className="text-[11px] text-slate-500">{relTime(a.triggeredAt)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
