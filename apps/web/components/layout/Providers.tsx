"use client";

import { OrgProvider } from "@/lib/context";
import { AlertProvider } from "@/lib/alerts-context";
import { AlertNotifications } from "@/components/layout/AlertNotifications";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <AlertProvider>
        {children}
        <AlertNotifications />
      </AlertProvider>
    </OrgProvider>
  );
}
