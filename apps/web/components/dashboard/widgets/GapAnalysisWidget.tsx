"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WidgetProps } from "../widget-types";

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "muted"> = {
  COMPLIANT: "success",
  PARTIALLY_COMPLIANT: "warning",
  NON_COMPLIANT: "danger",
  NOT_ASSESSED: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  COMPLIANT: "Compliant",
  PARTIALLY_COMPLIANT: "Partial",
  NON_COMPLIANT: "Non-Compliant",
  NOT_ASSESSED: "Not Assessed",
};

export function GapAnalysisWidget({ data }: WidgetProps) {
  const gaps = data.dashboard?.gaps ?? [];
  const filtered = gaps.filter(
    (g) => g.status === "NON_COMPLIANT" || g.status === "NOT_ASSESSED",
  );

  return (
    <Card className="bg-slate-900 border-slate-800 h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-200">Gap Analysis</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length} requirement{filtered.length !== 1 ? "s" : ""} requiring attention
            </p>
          </div>
          <Link href="/compliance" className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
            View compliance <ArrowRight size={10} />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2" />
            <p className="text-emerald-400 font-medium text-sm">All requirements addressed</p>
            <p className="text-slate-500 text-xs mt-1">No compliance gaps identified</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-72">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Requirement</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2">Category</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium px-4 py-2 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((gap) => (
                  <TableRow key={gap.requirementId} className="border-slate-800 hover:bg-slate-800/40">
                    <TableCell className="px-4 py-2.5 text-xs text-slate-300 max-w-[300px]">
                      <span className="line-clamp-2">{gap.title}</span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-xs text-slate-500">{gap.category}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right">
                      <Badge variant={STATUS_BADGE[gap.status] ?? "muted"} className="text-[10px] px-1.5 py-0">
                        {STATUS_LABEL[gap.status] ?? gap.status}
                      </Badge>
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
