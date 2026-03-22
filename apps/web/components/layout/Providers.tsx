"use client";

import { OrgProvider } from "@/lib/context";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <OrgProvider>{children}</OrgProvider>;
}
