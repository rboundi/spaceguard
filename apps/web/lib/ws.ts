"use client";

/**
 * useWebSocket
 *
 * Manages a single WebSocket connection per authenticated session.
 * Auto-reconnects with exponential backoff on disconnect.
 *
 * Consumers register event handlers via onEvent callbacks. When a message
 * arrives, all registered handlers for that event type are invoked.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { API_URL } from "@/lib/api";
import { getAuthToken } from "@/lib/auth-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RealtimeEventType =
  | "alert.new"
  | "alert.updated"
  | "incident.new"
  | "incident.updated"
  | "telemetry.status"
  | "playbook.step"
  | "deadline.warning"
  | "connected";

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}

export type EventHandler = (event: RealtimeEvent) => void;

// ---------------------------------------------------------------------------
// Singleton event bus: lets multiple hooks subscribe without multiple sockets
// ---------------------------------------------------------------------------

type Unsubscribe = () => void;

const listeners = new Map<RealtimeEventType | "*", Set<EventHandler>>();

function subscribe(type: RealtimeEventType | "*", handler: EventHandler): Unsubscribe {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  listeners.get(type)!.add(handler);
  return () => {
    listeners.get(type)?.delete(handler);
  };
}

function dispatch(event: RealtimeEvent): void {
  // Typed listeners
  const typed = listeners.get(event.type);
  if (typed) {
    for (const fn of typed) fn(event);
  }
  // Wildcard listeners
  const wild = listeners.get("*");
  if (wild) {
    for (const fn of wild) fn(event);
  }
}

// ---------------------------------------------------------------------------
// Connection state (shared across all hook instances)
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let connectionStatus: "connecting" | "connected" | "disconnected" = "disconnected";
const statusListeners = new Set<(s: typeof connectionStatus) => void>();

function setStatus(s: typeof connectionStatus) {
  connectionStatus = s;
  for (const fn of statusListeners) fn(s);
}

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

function connect(): void {
  const token = getAuthToken();
  if (!token) {
    setStatus("disconnected");
    return;
  }

  // Build WS URL from API_URL (http -> ws, https -> wss)
  const wsBase = API_URL.replace(/^http/, "ws");
  const url = `${wsBase}/api/v1/ws?token=${encodeURIComponent(token)}`;

  setStatus("connecting");

  try {
    ws = new WebSocket(url);
  } catch {
    setStatus("disconnected");
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempts = 0;
    setStatus("connected");
  };

  ws.onmessage = (evt) => {
    try {
      const event = JSON.parse(evt.data as string) as RealtimeEvent;
      dispatch(event);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    ws = null;
    setStatus("disconnected");
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after onerror, triggering reconnect
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = Math.min(
    BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY_MS,
  );
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
    ws = null;
  }
  setStatus("disconnected");
}

// Track how many hook instances are mounted to manage the connection lifecycle
let refCount = 0;

// ---------------------------------------------------------------------------
// Hook: useWebSocket
// ---------------------------------------------------------------------------

/**
 * Connect to the WebSocket server. Returns the connection status.
 * Call this once high up in the component tree (e.g. Providers).
 */
export function useWebSocket(): { status: "connecting" | "connected" | "disconnected" } {
  const [status, setLocalStatus] = useState<typeof connectionStatus>(connectionStatus);

  useEffect(() => {
    // Subscribe to status changes
    const handler = (s: typeof connectionStatus) => setLocalStatus(s);
    statusListeners.add(handler);

    refCount++;
    if (refCount === 1) {
      // First subscriber: open the connection
      connect();
    } else {
      // Already connected: sync current status
      setLocalStatus(connectionStatus);
    }

    return () => {
      statusListeners.delete(handler);
      refCount--;
      if (refCount === 0) {
        disconnect();
      }
    };
  }, []);

  return { status };
}

/**
 * Re-establish the connection (e.g. after org switch or login).
 */
export function reconnectWebSocket(): void {
  disconnect();
  connect();
}

// ---------------------------------------------------------------------------
// Hook: useRealtimeEvent
// ---------------------------------------------------------------------------

/**
 * Subscribe to a specific event type (or "*" for all).
 * The handler is stable across renders via ref.
 */
export function useRealtimeEvent(
  type: RealtimeEventType | "*",
  handler: EventHandler,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const fn: EventHandler = (event) => handlerRef.current(event);
    return subscribe(type, fn);
  }, [type]);
}

/**
 * Get current connection status without managing the connection.
 */
export function useConnectionStatus(): "connecting" | "connected" | "disconnected" {
  const [status, setLocalStatus] = useState<typeof connectionStatus>(connectionStatus);

  useEffect(() => {
    const handler = (s: typeof connectionStatus) => setLocalStatus(s);
    statusListeners.add(handler);
    setLocalStatus(connectionStatus);
    return () => { statusListeners.delete(handler); };
  }, []);

  return status;
}
