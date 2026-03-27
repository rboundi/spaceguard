/**
 * Real-time WebSocket service.
 *
 * Manages WebSocket connections per organization. Any service can call
 * broadcast(orgId, event) to push updates to all connected clients in
 * that org.
 *
 * Connection lifecycle:
 *  1. Client connects to /api/v1/ws?token=<JWT>
 *  2. Server validates JWT, extracts organizationId
 *  3. Connection is added to the org's Set of sockets
 *  4. On disconnect, connection is removed from the Set
 *
 * Heartbeat: server pings every 30 seconds, closes dead connections.
 */

import { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { validateToken } from "./auth.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RealtimeEvent {
  type:
    | "alert.new"
    | "alert.updated"
    | "incident.new"
    | "incident.updated"
    | "telemetry.status"
    | "playbook.step"
    | "deadline.warning";
  payload: Record<string, unknown>;
  timestamp: string;
}

interface AuthenticatedSocket extends WebSocket {
  organizationId: string;
  userId: string;
  isAlive: boolean;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const orgConnections = new Map<string, Set<AuthenticatedSocket>>();
let wss: WebSocketServer | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

/**
 * Send an event to all connected clients in an organization.
 */
export function broadcast(organizationId: string, event: RealtimeEvent): void {
  const connections = orgConnections.get(organizationId);
  if (!connections || connections.size === 0) return;

  const message = JSON.stringify(event);

  for (const ws of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

/**
 * Helper: broadcast a typed event with auto-timestamp.
 */
export function broadcastEvent(
  organizationId: string,
  type: RealtimeEvent["type"],
  payload: Record<string, unknown>,
): void {
  broadcast(organizationId, {
    type,
    payload,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get count of connected clients per org (for diagnostics).
 */
export function getConnectionCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [orgId, conns] of orgConnections) {
    counts[orgId] = conns.size;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

function addConnection(ws: AuthenticatedSocket): void {
  const { organizationId } = ws;
  if (!orgConnections.has(organizationId)) {
    orgConnections.set(organizationId, new Set());
  }
  orgConnections.get(organizationId)!.add(ws);
}

function removeConnection(ws: AuthenticatedSocket): void {
  const { organizationId } = ws;
  const conns = orgConnections.get(organizationId);
  if (conns) {
    conns.delete(ws);
    if (conns.size === 0) {
      orgConnections.delete(organizationId);
    }
  }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

async function authenticateUpgrade(
  req: IncomingMessage,
): Promise<{ organizationId: string; userId: string } | null> {
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    const token = url.searchParams.get("token");
    if (!token) return null;

    const payload = await validateToken(token);
    return {
      organizationId: payload.organizationId,
      userId: payload.userId,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Call this after `serve()` returns the HTTP server instance.
 */
export function setupWebSocket(server: HttpServer): void {
  wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade requests for /api/v1/ws
  server.on("upgrade", async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`).pathname;

    if (pathname !== "/api/v1/ws") {
      socket.destroy();
      return;
    }

    const auth = await authenticateUpgrade(req);
    if (!auth) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss!.handleUpgrade(req, socket, head, (ws) => {
      const authenticated = ws as AuthenticatedSocket;
      authenticated.organizationId = auth.organizationId;
      authenticated.userId = auth.userId;
      authenticated.isAlive = true;

      addConnection(authenticated);

      // Send initial connection confirmation
      ws.send(JSON.stringify({
        type: "connected",
        payload: { organizationId: auth.organizationId },
        timestamp: new Date().toISOString(),
      }));

      // Pong handler for heartbeat
      ws.on("pong", () => {
        authenticated.isAlive = true;
      });

      ws.on("close", () => {
        removeConnection(authenticated);
      });

      ws.on("error", () => {
        removeConnection(authenticated);
      });
    });
  });

  // Heartbeat: ping every 30 seconds, terminate dead connections
  heartbeatInterval = setInterval(() => {
    if (!wss) return;
    for (const ws of wss.clients) {
      const auth = ws as AuthenticatedSocket;
      if (!auth.isAlive) {
        removeConnection(auth);
        ws.terminate();
        continue;
      }
      auth.isAlive = false;
      ws.ping();
    }
  }, 30_000);
}

/**
 * Gracefully shut down WebSocket server.
 */
export function shutdownWebSocket(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (wss) {
    for (const ws of wss.clients) {
      ws.close(1001, "Server shutting down");
    }
    wss.close();
    wss = null;
  }
  orgConnections.clear();
}
