"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WidgetProps } from "../widget-types";
import React from "react";

function shortCat(cat: string): string {
  const map: Record<string, string> = {
    "Risk Management": "Risk Mgmt",
    "Incident Handling": "Incidents",
    "Business Continuity": "Continuity",
    "Supply Chain Security": "Supply Chain",
    "Network Security": "Network Sec.",
    "Access Control": "Access Ctrl",
    "Cryptography": "Crypto",
    "Physical Security": "Physical",
    "Vulnerability Management": "Vuln. Mgmt",
    "Policies & Governance": "Governance",
  };
  return map[cat] ?? cat;
}

export function ComplianceByCategoryWidget({ data }: WidgetProps) {
  const byCategory = data.dashboard?.byCategory ?? [];
  const chartData = byCategory.map((c) => ({
    category: c.category,
    shortCategory: shortCat(c.category),
    compliant: c.score,
    remaining: 100 - c.score,
    score: c.score,
  }));

  const renderLabel = (props: {
    x: number; y: number; width: number; height: number; value: number;
  }): React.ReactElement => {
    const { x, y, width, height, value } = props;
    if (width < 30) return <g />;
    return (
      <text x={x + width / 2} y={y + height / 2 + 4} fill="#fff" textAnchor="middle" fontSize={10} fontWeight={600}>
        {value}%
      </text>
    );
  };

  return (
    <Card className="bg-slate-900 border-slate-800 h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200">Compliance by Category</CardTitle>
          <Link href="/compliance" className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
            Details <ArrowRight size={10} />
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">Scores per compliance domain</p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {chartData.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-slate-500">No category data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartData.length * 36 + 20}>
            <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barSize={16}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="shortCategory" width={110} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 12, color: "#e2e8f0" }}
                formatter={(value: number, name: string) => name === "compliant" ? [`${value}%`, "Compliant"] : [`${value}%`, "Remaining"]}
              />
              <Bar dataKey="compliant" name="compliant" stackId="a" fill="#10b981" radius={[3, 0, 0, 3]} label={renderLabel} />
              <Bar dataKey="remaining" name="remaining" stackId="a" fill="#1e293b" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
