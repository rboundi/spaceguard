"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { WidgetProps } from "../widget-types";

function scoreTextClass(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

export function ComplianceScoreWidget({ data }: WidgetProps) {
  const score = data.dashboard?.overallScore ?? 0;

  return (
    <Link href="/compliance" className="block h-full">
      <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors group h-full">
        <CardContent className="px-4 py-4 h-full flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Compliance Score
            </span>
            <ShieldCheck size={16} className="text-slate-600 group-hover:text-slate-500 transition-colors" />
          </div>
          <p className={`text-3xl font-bold ${scoreTextClass(score)}`}>
            {score}%
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {score >= 70 ? "Good posture" : score >= 40 ? "Needs improvement" : "Critical gaps"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
