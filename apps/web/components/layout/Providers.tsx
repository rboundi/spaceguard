"use client";

import { OrgProvider } from "@/lib/context";
import { AlertProvider } from "@/lib/alerts-context";
import { IncidentProvider } from "@/lib/incidents-context";
import { AlertNotifications } from "@/components/layout/AlertNotifications";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <AlertProvider>
        <IncidentProvider>
          {children}
          <AlertNotifications />
        </IncidentProvider>
      </AlertProvider>
    </OrgProvider>
  );
}
