"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, ArrowRight, Wifi, WifiOff, Pause, AlertCircle } from "lucide-react";
import type { StreamResponse } from "@spaceguard/shared";
import { getTelemetryStreams } from "@/lib/api";
import { useOrg } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROTOCOL_LABELS: Record<string, string> = {
  CCSDS_TM: "CCSDS TM",
  CCSDS_TC: "CCSDS TC",
  SYSLOG:   "Syslog",
  SNMP:     "SNMP",
  CUSTOM:   "Custom",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE")
    return (
      <Badge variant="success" className="gap-1 text-[10px]">
        <Wifi size={9} />
        Active
      </Badge>
    );
  if (status === "PAUSED")
    return (
      <Badge variant="warning" className="gap-1 text-[10px]">
        <Pause size={9} />
        Paused
      </Badge>
    );
  return (
    <Badge variant="destructive" className="gap-1 text-[10px]">
      <AlertCircle size={9} />
      Error
    </Badge>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Empty / setup prompt
// ---------------------------------------------------------------------------

function EmptyState({ orgName }: { orgName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="rounded-full bg-blue-500/10 border border-blue-500/20 p-4 mb-4">
        <Radio size={28} className="text-blue-400" />
      </div>
      <h3 className="text-slate-200 font-semibold text-base mb-1">
        No telemetry streams configured
      </h3>
      <p className="text-slate-500 text-sm max-w-sm">
        {orgName
          ? `Connect your first telemetry stream for ${orgName} to start monitoring satellite health, link quality, and subsystem parameters.`
          : "Select an organization and connect a telemetry stream to start monitoring."}
      </p>
      <code className="mt-4 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-400 text-xs font-mono">
        npm run simulate
      </code>
      <p className="mt-3 text-slate-600 text-xs max-w-xs">
        Run the simulator to generate sample CCSDS telemetry with optional anomaly injection.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TelemetryPage() {
  const router = useRouter();
  const { orgId, orgName, loading: orgLoading } = useOrg();
  const [streams, setStreams] = useState<StreamResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) { setLoading(false); setStreams([]); return; }
    setLoading(true);
    setError(null);
    getTelemetryStreams(orgId)
      .then((res) => setStreams(res.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load streams"))
      .finally(() => setLoading(false));
  }, [orgId, orgLoading]);

  // Group streams by asset for a compact summary bar
  const assetCount = new Set(streams.map((s) => s.assetId)).size;
  const activeCount = streams.filter((s) => s.status === "ACTIVE").length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Telemetry</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Monitor real-time and historical telemetry streams from your space assets
          </p>
        </div>
      </div>

      {/* Summary strip */}
      {streams.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6 max-w-lg">
          <div className="rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Streams</p>
            <p className="text-2xl font-bold text-slate-100">{streams.length}</p>
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Active</p>
            <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Assets</p>
            <p className="text-2xl font-bold text-blue-400">{assetCount}</p>
          </div>
        </div>
      )}

      {/* Stream table */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="pb-3 border-b border-slate-800">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Radio size={14} className="text-blue-400" />
            Telemetry Streams
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-px">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse bg-slate-800/40 border-b border-slate-800 last:border-0" />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 px-4 py-6 text-red-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          ) : streams.length === 0 ? (
            <EmptyState orgName={orgName} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs font-medium w-[30%]">Stream</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium">Protocol</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium">APID</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium">Rate</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium">Status</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium">Created</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {streams.map((stream) => (
                  <TableRow
                    key={stream.id}
                    className="border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => router.push(`/telemetry/${stream.id}`)}
                  >
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="rounded bg-blue-500/10 p-1.5 shrink-0">
                          {stream.status === "ACTIVE"
                            ? <Wifi size={12} className="text-blue-400" />
                            : <WifiOff size={12} className="text-slate-500" />
                          }
                        </div>
                        <div>
                          <p className="text-slate-200 text-sm font-medium leading-tight">
                            {stream.name}
                          </p>
                          <p className="text-slate-500 text-[10px] font-mono mt-0.5">
                            {stream.id.slice(0, 8)}…
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant="outline" className="text-[10px] font-mono text-slate-400 border-slate-700">
                        {PROTOCOL_LABELS[stream.protocol] ?? stream.protocol}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-slate-400 text-sm font-mono">
                      {stream.apid ?? <span className="text-slate-600">—</span>}
                    </TableCell>
                    <TableCell className="py-3 text-slate-400 text-sm">
                      {stream.sampleRateHz != null
                        ? `${stream.sampleRateHz} Hz`
                        : <span className="text-slate-600">—</span>
                      }
                    </TableCell>
                    <TableCell className="py-3">
                      <StatusBadge status={stream.status} />
                    </TableCell>
                    <TableCell className="py-3 text-slate-500 text-xs">
                      {fmtDate(stream.createdAt)}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-slate-500 hover:text-slate-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/telemetry/${stream.id}`);
                        }}
                      >
                        <ArrowRight size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
