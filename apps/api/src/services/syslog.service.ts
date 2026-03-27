/**
 * Syslog SIEM Integration Service
 *
 * Provides:
 * - CEF (ArcSight, Splunk, Elastic, Sentinel) formatting
 * - LEEF (IBM QRadar) formatting
 * - JSON (generic) formatting
 * - UDP/TCP/TLS transport
 * - CRUD for syslog endpoint configuration
 * - Fire-and-forget forwarding on alert/incident creation
 */

import * as dgram from "node:dgram";
import * as net from "node:net";
import * as tls from "node:tls";
import { db } from "../db/client";
import { syslogEndpoints } from "../db/schema/syslog";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { SyslogEndpoint, NewSyslogEndpoint } from "../db/schema/syslog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Alert shape as received from alertToResponse() */
export interface SyslogAlertPayload {
  id: string;
  organizationId: string;
  streamId: string | null;
  ruleId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  status: string;
  spartaTactic: string | null;
  spartaTechnique: string | null;
  affectedAssetId: string | null;
  triggeredAt: string;
  metadata: Record<string, unknown> | null;
}

/** Incident shape for syslog forwarding */
export interface SyslogIncidentPayload {
  id: string;
  organizationId: string;
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: string;
  description: string;
  nis2Classification: string;
  affectedAssetIds: string[];
  spartaTechniques: Array<{ tactic: string; technique: string }>;
  createdAt: string;
}

export interface SyslogEndpointResponse {
  id: string;
  organizationId: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  format: string;
  minSeverity: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_NUM: Record<string, number> = {
  LOW: 3,
  MEDIUM: 5,
  HIGH: 7,
  CRITICAL: 10,
};

const SEVERITY_ORDER: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const PRODUCT_NAME = "SpaceGuard";
const PRODUCT_VERSION = "1.0";

// ---------------------------------------------------------------------------
// CEF Formatter
// ---------------------------------------------------------------------------

/** Escape CEF extension value: backslash, equals, newlines */
function cefEscape(val: string): string {
  return val
    .replace(/\\/g, "\\\\")
    .replace(/=/g, "\\=")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

/** Escape CEF header field: backslash, pipe */
function cefHeaderEscape(val: string): string {
  return val.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/**
 * Format an alert as CEF (Common Event Format) for Splunk/ArcSight/Elastic/Sentinel.
 *
 * CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
 */
export function formatAlertAsCef(alert: SyslogAlertPayload): string {
  const sevNum = SEVERITY_NUM[alert.severity] ?? 5;
  const epochMs = new Date(alert.triggeredAt).getTime();

  const extensions: string[] = [];
  extensions.push(`rt=${epochMs}`);
  extensions.push(`externalId=${cefEscape(alert.id)}`);
  if (alert.affectedAssetId) {
    extensions.push(`src=${cefEscape(alert.affectedAssetId)}`);
  }
  if (alert.streamId) {
    extensions.push(`spt=${cefEscape(alert.streamId)}`);
  }
  if (alert.spartaTactic) {
    extensions.push(`cs1Label=sparta_tactic`);
    extensions.push(`cs1=${cefEscape(alert.spartaTactic)}`);
  }
  if (alert.spartaTechnique) {
    extensions.push(`cs2Label=sparta_technique`);
    extensions.push(`cs2=${cefEscape(alert.spartaTechnique)}`);
  }
  extensions.push(`msg=${cefEscape(alert.description)}`);
  extensions.push(`cat=Alert`);

  const header = [
    "CEF:0",
    cefHeaderEscape(PRODUCT_NAME),
    cefHeaderEscape(PRODUCT_NAME),
    PRODUCT_VERSION,
    cefHeaderEscape(alert.ruleId),
    cefHeaderEscape(alert.title),
    String(sevNum),
  ].join("|");

  return `${header}|${extensions.join(" ")}`;
}

/**
 * Format an incident as CEF.
 */
export function formatIncidentAsCef(incident: SyslogIncidentPayload): string {
  const sevNum = SEVERITY_NUM[incident.severity] ?? 5;
  const epochMs = new Date(incident.createdAt).getTime();

  const extensions: string[] = [];
  extensions.push(`rt=${epochMs}`);
  extensions.push(`externalId=${cefEscape(incident.id)}`);
  extensions.push(`cat=Incident`);
  extensions.push(`cs1Label=nis2_classification`);
  extensions.push(`cs1=${cefEscape(incident.nis2Classification)}`);
  extensions.push(`cs2Label=status`);
  extensions.push(`cs2=${cefEscape(incident.status)}`);
  if (incident.affectedAssetIds.length > 0) {
    extensions.push(
      `cs3Label=affected_assets`
    );
    extensions.push(
      `cs3=${cefEscape(incident.affectedAssetIds.join(","))}`
    );
  }
  if (incident.spartaTechniques.length > 0) {
    const tactics = [
      ...new Set(incident.spartaTechniques.map((t) => t.tactic)),
    ];
    extensions.push(`cs4Label=sparta_tactics`);
    extensions.push(`cs4=${cefEscape(tactics.join(","))}`);
  }
  extensions.push(`msg=${cefEscape(incident.description)}`);

  const header = [
    "CEF:0",
    cefHeaderEscape(PRODUCT_NAME),
    cefHeaderEscape(PRODUCT_NAME),
    PRODUCT_VERSION,
    `INC-${cefHeaderEscape(incident.id.slice(0, 8))}`,
    cefHeaderEscape(incident.title),
    String(sevNum),
  ].join("|");

  return `${header}|${extensions.join(" ")}`;
}

// ---------------------------------------------------------------------------
// LEEF Formatter (IBM QRadar)
// ---------------------------------------------------------------------------

/** Escape LEEF value: tab characters */
function leefEscape(val: string): string {
  return val.replace(/\t/g, " ").replace(/\n/g, " ").replace(/\r/g, "");
}

/**
 * Format an alert as LEEF 2.0 (Log Event Extended Format) for IBM QRadar.
 *
 * LEEF:Version|Vendor|Product|Version|EventID|delimiter|Extension
 */
export function formatAlertAsLeef(alert: SyslogAlertPayload): string {
  const sev = SEVERITY_NUM[alert.severity] ?? 5;
  const epochMs = new Date(alert.triggeredAt).getTime();

  const extensions: string[] = [];
  extensions.push(`cat=Alert`);
  extensions.push(`sev=${sev}`);
  extensions.push(`devTime=${epochMs}`);
  extensions.push(`externalId=${leefEscape(alert.id)}`);
  if (alert.affectedAssetId) {
    extensions.push(`src=${leefEscape(alert.affectedAssetId)}`);
  }
  if (alert.streamId) {
    extensions.push(`srcPort=${leefEscape(alert.streamId)}`);
  }
  if (alert.spartaTactic) {
    extensions.push(`spartaTactic=${leefEscape(alert.spartaTactic)}`);
  }
  if (alert.spartaTechnique) {
    extensions.push(`spartaTechnique=${leefEscape(alert.spartaTechnique)}`);
  }
  extensions.push(`msg=${leefEscape(alert.description)}`);

  const header = [
    "LEEF:2.0",
    PRODUCT_NAME,
    PRODUCT_NAME,
    PRODUCT_VERSION,
    alert.ruleId,
  ].join("|");

  // LEEF 2.0 uses tab as default delimiter
  return `${header}|\t${extensions.join("\t")}`;
}

/**
 * Format an incident as LEEF 2.0.
 */
export function formatIncidentAsLeef(incident: SyslogIncidentPayload): string {
  const sev = SEVERITY_NUM[incident.severity] ?? 5;
  const epochMs = new Date(incident.createdAt).getTime();

  const extensions: string[] = [];
  extensions.push(`cat=Incident`);
  extensions.push(`sev=${sev}`);
  extensions.push(`devTime=${epochMs}`);
  extensions.push(`externalId=${leefEscape(incident.id)}`);
  extensions.push(`status=${leefEscape(incident.status)}`);
  extensions.push(`nis2Class=${leefEscape(incident.nis2Classification)}`);
  if (incident.affectedAssetIds.length > 0) {
    extensions.push(
      `affectedAssets=${leefEscape(incident.affectedAssetIds.join(","))}`
    );
  }
  extensions.push(`msg=${leefEscape(incident.description)}`);

  const header = [
    "LEEF:2.0",
    PRODUCT_NAME,
    PRODUCT_NAME,
    PRODUCT_VERSION,
    `INC-${incident.id.slice(0, 8)}`,
  ].join("|");

  return `${header}|\t${extensions.join("\t")}`;
}

// ---------------------------------------------------------------------------
// JSON Formatter
// ---------------------------------------------------------------------------

export function formatAlertAsJson(alert: SyslogAlertPayload): string {
  return JSON.stringify({
    source: PRODUCT_NAME,
    type: "alert",
    version: PRODUCT_VERSION,
    timestamp: alert.triggeredAt,
    severity: alert.severity,
    severityNum: SEVERITY_NUM[alert.severity] ?? 5,
    eventId: alert.ruleId,
    externalId: alert.id,
    title: alert.title,
    description: alert.description,
    status: alert.status,
    streamId: alert.streamId,
    affectedAssetId: alert.affectedAssetId,
    spartaTactic: alert.spartaTactic,
    spartaTechnique: alert.spartaTechnique,
    metadata: alert.metadata,
  });
}

export function formatIncidentAsJson(incident: SyslogIncidentPayload): string {
  return JSON.stringify({
    source: PRODUCT_NAME,
    type: "incident",
    version: PRODUCT_VERSION,
    timestamp: incident.createdAt,
    severity: incident.severity,
    severityNum: SEVERITY_NUM[incident.severity] ?? 5,
    externalId: incident.id,
    title: incident.title,
    description: incident.description,
    status: incident.status,
    nis2Classification: incident.nis2Classification,
    affectedAssetIds: incident.affectedAssetIds,
    spartaTechniques: incident.spartaTechniques,
  });
}

// ---------------------------------------------------------------------------
// Transport: send a message to a syslog endpoint
// ---------------------------------------------------------------------------

const SEND_TIMEOUT_MS = 5000;

function sendUdp(host: string, port: number, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket("udp4");
    const buf = Buffer.from(message, "utf-8");
    const timer = setTimeout(() => {
      client.close();
      reject(new Error(`UDP send to ${host}:${port} timed out`));
    }, SEND_TIMEOUT_MS);

    client.send(buf, 0, buf.length, port, host, (err) => {
      clearTimeout(timer);
      client.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

function sendTcp(host: string, port: number, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: SEND_TIMEOUT_MS });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP send to ${host}:${port} timed out`));
    }, SEND_TIMEOUT_MS);

    socket.on("connect", () => {
      // Syslog over TCP: send message followed by newline (octet-counting or newline framing)
      socket.end(`${message}\n`, () => {
        clearTimeout(timer);
        resolve();
      });
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function sendTls(host: string, port: number, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TLS send to ${host}:${port} timed out`));
    }, SEND_TIMEOUT_MS);

    const socket = tls.connect(
      { host, port, rejectUnauthorized: false, timeout: SEND_TIMEOUT_MS },
      () => {
        socket.end(`${message}\n`, () => {
          clearTimeout(timer);
          resolve();
        });
      }
    );
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function sendToEndpoint(
  endpoint: SyslogEndpoint,
  message: string
): Promise<void> {
  switch (endpoint.protocol) {
    case "UDP":
      return sendUdp(endpoint.host, endpoint.port, message);
    case "TCP":
      return sendTcp(endpoint.host, endpoint.port, message);
    case "TLS":
      return sendTls(endpoint.host, endpoint.port, message);
    default:
      throw new Error(`Unsupported protocol: ${endpoint.protocol}`);
  }
}

// ---------------------------------------------------------------------------
// Formatting dispatcher
// ---------------------------------------------------------------------------

function formatAlert(
  format: string,
  alert: SyslogAlertPayload
): string {
  switch (format) {
    case "CEF":
      return formatAlertAsCef(alert);
    case "LEEF":
      return formatAlertAsLeef(alert);
    case "JSON":
      return formatAlertAsJson(alert);
    default:
      return formatAlertAsCef(alert);
  }
}

function formatIncident(
  format: string,
  incident: SyslogIncidentPayload
): string {
  switch (format) {
    case "CEF":
      return formatIncidentAsCef(incident);
    case "LEEF":
      return formatIncidentAsLeef(incident);
    case "JSON":
      return formatIncidentAsJson(incident);
    default:
      return formatIncidentAsCef(incident);
  }
}

// ---------------------------------------------------------------------------
// Public: forward alert/incident to all matching syslog endpoints
// ---------------------------------------------------------------------------

function meetsMinSeverity(alertSev: string, minSev: string): boolean {
  return (SEVERITY_ORDER[alertSev] ?? 0) >= (SEVERITY_ORDER[minSev] ?? 0);
}

/**
 * Forward an alert to all active syslog endpoints for its organization.
 * Fire-and-forget: errors are logged, not thrown.
 */
export async function forwardAlertToSyslog(
  alert: SyslogAlertPayload
): Promise<void> {
  try {
    const endpoints = await db
      .select()
      .from(syslogEndpoints)
      .where(
        and(
          eq(syslogEndpoints.organizationId, alert.organizationId),
          eq(syslogEndpoints.isActive, true)
        )
      );

    if (endpoints.length === 0) return;

    const results = await Promise.allSettled(
      endpoints
        .filter((ep) => meetsMinSeverity(alert.severity, ep.minSeverity))
        .map(async (ep) => {
          const msg = formatAlert(ep.format, alert);
          await sendToEndpoint(ep, msg);
        })
    );

    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[syslog] Failed to forward alert:", r.reason);
      }
    }
  } catch (err) {
    console.error("[syslog] Error querying syslog endpoints:", err);
  }
}

/**
 * Forward an incident to all active syslog endpoints for its organization.
 * Fire-and-forget: errors are logged, not thrown.
 */
export async function forwardIncidentToSyslog(
  incident: SyslogIncidentPayload
): Promise<void> {
  try {
    const endpoints = await db
      .select()
      .from(syslogEndpoints)
      .where(
        and(
          eq(syslogEndpoints.organizationId, incident.organizationId),
          eq(syslogEndpoints.isActive, true)
        )
      );

    if (endpoints.length === 0) return;

    const results = await Promise.allSettled(
      endpoints
        .filter((ep) => meetsMinSeverity(incident.severity, ep.minSeverity))
        .map(async (ep) => {
          const msg = formatIncident(ep.format, incident);
          await sendToEndpoint(ep, msg);
        })
    );

    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[syslog] Failed to forward incident:", r.reason);
      }
    }
  } catch (err) {
    console.error("[syslog] Error querying syslog endpoints:", err);
  }
}

/**
 * Send a test message to a syslog endpoint to verify connectivity.
 */
export async function testSyslogEndpoint(
  endpointId: string
): Promise<{ success: boolean; error?: string }> {
  const [ep] = await db
    .select()
    .from(syslogEndpoints)
    .where(eq(syslogEndpoints.id, endpointId))
    .limit(1);

  if (!ep) {
    throw new HTTPException(404, { message: `Syslog endpoint ${endpointId} not found` });
  }

  const testAlert: SyslogAlertPayload = {
    id: "00000000-0000-0000-0000-000000000000",
    organizationId: ep.organizationId,
    streamId: null,
    ruleId: "SG-TEST-001",
    severity: "LOW",
    title: "SpaceGuard Syslog Test Message",
    description: "This is a connectivity test from SpaceGuard. If you see this message, syslog forwarding is working correctly.",
    status: "NEW",
    spartaTactic: null,
    spartaTechnique: null,
    affectedAssetId: null,
    triggeredAt: new Date().toISOString(),
    metadata: null,
  };

  try {
    const msg = formatAlert(ep.format, testAlert);
    await sendToEndpoint(ep, msg);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// CRUD for syslog endpoint configuration
// ---------------------------------------------------------------------------

function endpointToResponse(row: SyslogEndpoint): SyslogEndpointResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    host: row.host,
    port: row.port,
    protocol: row.protocol,
    format: row.format,
    minSeverity: row.minSeverity,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSyslogEndpoints(
  organizationId: string
): Promise<SyslogEndpointResponse[]> {
  const rows = await db
    .select()
    .from(syslogEndpoints)
    .where(eq(syslogEndpoints.organizationId, organizationId));
  return rows.map(endpointToResponse);
}

export async function getSyslogEndpoint(
  id: string
): Promise<SyslogEndpointResponse> {
  const [row] = await db
    .select()
    .from(syslogEndpoints)
    .where(eq(syslogEndpoints.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: `Syslog endpoint ${id} not found` });
  }
  return endpointToResponse(row);
}

export async function createSyslogEndpoint(
  data: Omit<NewSyslogEndpoint, "id" | "createdAt" | "updatedAt">
): Promise<SyslogEndpointResponse> {
  const [row] = await db
    .insert(syslogEndpoints)
    .values(data)
    .returning();

  return endpointToResponse(row);
}

export async function updateSyslogEndpoint(
  id: string,
  data: Partial<Pick<NewSyslogEndpoint, "name" | "host" | "port" | "protocol" | "format" | "minSeverity" | "isActive">>
): Promise<SyslogEndpointResponse> {
  const [row] = await db
    .update(syslogEndpoints)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(syslogEndpoints.id, id))
    .returning();

  if (!row) {
    throw new HTTPException(404, { message: `Syslog endpoint ${id} not found` });
  }
  return endpointToResponse(row);
}

export async function deleteSyslogEndpoint(
  id: string
): Promise<{ organizationId: string }> {
  const [existing] = await db
    .select({ organizationId: syslogEndpoints.organizationId })
    .from(syslogEndpoints)
    .where(eq(syslogEndpoints.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: `Syslog endpoint ${id} not found` });
  }

  await db.delete(syslogEndpoints).where(eq(syslogEndpoints.id, id));
  return { organizationId: existing.organizationId };
}
