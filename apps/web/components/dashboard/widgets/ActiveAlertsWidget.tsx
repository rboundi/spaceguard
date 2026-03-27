"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { WidgetProps } from "../widget-types";

export function ActiveAlertsWidget({ data }: WidgetProps) {
  const stats = data.alertStats;
  const openAlerts = stats
    ? (stats.byStatus["NEW"] ?? 0) + (stats.byStatus["INVESTIGATING"] ?? 0)
    : 0;

  return (
    <Link href="/alerts" className="block h-full">
      <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors group h-full">
        <CardContent className="px-4 py-4 h-full flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Active Alerts
            </span>
            <Bell size={16} className="text-slate-600 group-hover:text-slate-500 transition-colors" />
          </div>
          <p className={`text-3xl font-bold ${openAlerts > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {openAlerts}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {stats ? `${stats.openCritical} critical, ${stats.openHigh} high` : "No alert data"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
