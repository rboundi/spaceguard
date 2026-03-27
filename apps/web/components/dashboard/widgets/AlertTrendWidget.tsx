"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WidgetProps } from "../widget-types";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function AlertTrendWidget({ data }: WidgetProps) {
  const [range, setRange] = useState<7 | 30>(7);
  const alerts = data.recentAlerts;

  const chartData = useMemo(() => {
    // Build map of date -> count
    const counts = new Map<string, number>();
    for (let i = range - 1; i >= 0; i--) {
      counts.set(daysAgo(i), 0);
    }
    for (const a of alerts) {
      const date = a.triggeredAt.slice(0, 10);
      if (counts.has(date)) {
        counts.set(date, (counts.get(date) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([date, count]) => ({
      date,
      label: new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      alerts: count,
    }));
  }, [alerts, range]);

  return (
    <Card className="bg-slate-900 border-slate-800 h-full flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-200">Alert Trend</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">Alert volume over time</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-slate-700 overflow-hidden">
              <button
                onClick={() => setRange(7)}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  range === 7 ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                7d
              </button>
              <button
                onClick={() => setRange(30)}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  range === 30 ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                30d
              </button>
            </div>
            <Link href="/alerts" className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
              Alerts <ArrowRight size={10} />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={{ stroke: "#334155" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 6,
                fontSize: 12,
                color: "#e2e8f0",
              }}
            />
            <Line
              type="monotone"
              dataKey="alerts"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: "#3b82f6", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
