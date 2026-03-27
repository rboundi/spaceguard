"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WidgetProps } from "../widget-types";

// SPARTA tactics in canonical order
const TACTICS = [
  "Reconnaissance",
  "Resource Development",
  "Initial Access",
  "Execution",
  "Persistence",
  "Defense Evasion",
  "Lateral Movement",
  "Exfiltration",
  "Impact",
];

export function SpartaCoverageWidget({ data }: WidgetProps) {
  const alerts = data.recentAlerts;

  // Count alerts per SPARTA tactic
  const tacticCounts = new Map<string, number>();
  for (const a of alerts) {
    const tactic = (a as unknown as Record<string, unknown>).spartaTactic as string | undefined;
    if (tactic) {
      tacticCounts.set(tactic, (tacticCounts.get(tactic) ?? 0) + 1);
    }
  }

  const maxCount = Math.max(1, ...tacticCounts.values());

  return (
    <Card className="bg-slate-900 border-slate-800 h-full flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">SPARTA Coverage</CardTitle>
          <Link href="/intel" className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
            Threat intel <ArrowRight size={10} />
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">Alerts mapped to SPARTA tactics</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1">
        <div className="grid grid-cols-3 gap-2">
          {TACTICS.map((tactic) => {
            const count = tacticCounts.get(tactic) ?? 0;
            const intensity = count > 0 ? Math.max(0.15, count / maxCount) : 0;
            const bgColor = count === 0
              ? "bg-slate-800/50"
              : `bg-violet-500/${Math.round(intensity * 50)}`;
            const textColor = count > 0 ? "text-violet-300" : "text-slate-600";

            return (
              <div
                key={tactic}
                className={`rounded-md border border-slate-700/30 px-2 py-2 text-center ${bgColor}`}
                title={`${tactic}: ${count} alert${count !== 1 ? "s" : ""}`}
              >
                <p className={`text-lg font-bold tabular-nums ${textColor}`}>{count}</p>
                <p className="text-[8px] text-slate-500 leading-tight truncate">{tactic}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
