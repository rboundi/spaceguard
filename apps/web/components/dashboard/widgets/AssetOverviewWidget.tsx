"use client";

import Link from "next/link";
import { Satellite } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { WidgetProps } from "../widget-types";

export function AssetOverviewWidget({ data }: WidgetProps) {
  const total = data.dashboard?.assetsSummary.total ?? 0;
  const critical = data.dashboard?.assetsSummary.byCriticality?.CRITICAL ?? 0;

  return (
    <Link href="/assets" className="block h-full">
      <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors group h-full">
        <CardContent className="px-4 py-4 h-full flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Total Assets
            </span>
            <Satellite size={16} className="text-slate-600 group-hover:text-slate-500 transition-colors" />
          </div>
          <p className="text-3xl font-bold text-slate-100">{total}</p>
          <p className="text-xs text-slate-500 mt-1">{critical} critical assets</p>
        </CardContent>
      </Card>
    </Link>
  );
}
