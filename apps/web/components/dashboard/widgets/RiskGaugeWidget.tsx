"use client";

import Link from "next/link";
import { ShieldAlert, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { WidgetProps } from "../widget-types";

export function RiskGaugeWidget({ data }: WidgetProps) {
  const risk = data.orgRisk;

  if (!risk) {
    return (
      <Card className="bg-slate-900 border-slate-800 h-full">
        <CardContent className="px-4 py-4 h-full flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Risk Score
            </span>
            <ShieldAlert size={16} className="text-slate-600" />
          </div>
          <p className="text-3xl font-bold text-slate-500">--</p>
          <p className="text-xs text-slate-500 mt-1">Risk data loading</p>
        </CardContent>
      </Card>
    );
  }

  const colorClass = risk.overall > 60 ? "text-red-400" : risk.overall > 30 ? "text-amber-400" : "text-emerald-400";

  return (
    <Link href="/risk" className="block h-full">
      <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors group h-full">
        <CardContent className="px-4 py-4 h-full flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Risk Score
            </span>
            <ShieldAlert size={16} className="text-slate-600 group-hover:text-slate-500 transition-colors" />
          </div>
          <div className="flex items-center gap-2">
            <p className={`text-3xl font-bold ${colorClass}`}>{risk.overall}</p>
            <span className="text-xs text-slate-500">/ 100</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            {risk.trend === "IMPROVING" ? (
              <TrendingDown size={12} className="text-emerald-400" />
            ) : risk.trend === "DEGRADING" ? (
              <TrendingUp size={12} className="text-red-400" />
            ) : (
              <Minus size={12} className="text-slate-500" />
            )}
            <span className={`text-xs ${risk.trend === "IMPROVING" ? "text-emerald-400" : risk.trend === "DEGRADING" ? "text-red-400" : "text-slate-500"}`}>
              {risk.trend === "IMPROVING" ? "Improving" : risk.trend === "DEGRADING" ? "Degrading" : "Stable"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
