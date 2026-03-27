"use client";

import { AuthProvider } from "@/lib/auth-context";
import { OrgProvider } from "@/lib/context";
import { AlertProvider } from "@/lib/alerts-context";
import { IncidentProvider } from "@/lib/incidents-context";
import { AlertNotifications } from "@/components/layout/AlertNotifications";
import { WebSocketConnector } from "@/components/layout/WebSocketConnector";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <OrgProvider>
        <WebSocketConnector />
        <AlertProvider>
          <IncidentProvider>
            {children}
            <AlertNotifications />
          </IncidentProvider>
        </AlertProvider>
      </OrgProvider>
    </AuthProvider>
  );
}
