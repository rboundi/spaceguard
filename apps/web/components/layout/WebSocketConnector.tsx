"use client";

/**
 * WebSocketConnector
 *
 * Renders nothing visible. Its only job is to call useWebSocket()
 * so the singleton WS connection is established once the user is
 * authenticated. Place this inside Providers, after AuthProvider
 * and OrgProvider so the auth token is available.
 *
 * When the org changes, reconnects to ensure the server associates
 * the socket with the correct organization.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useOrg } from "@/lib/context";
import { useWebSocket, reconnectWebSocket } from "@/lib/ws";

export function WebSocketConnector() {
  const { token } = useAuth();
  const { orgId } = useOrg();
  useWebSocket();

  // Reconnect when token or org changes
  const prevToken = useRef(token);
  const prevOrg = useRef(orgId);

  useEffect(() => {
    if (prevToken.current !== token || prevOrg.current !== orgId) {
      prevToken.current = token;
      prevOrg.current = orgId;
      if (token) {
        reconnectWebSocket();
      }
    }
  }, [token, orgId]);

  return null;
}
