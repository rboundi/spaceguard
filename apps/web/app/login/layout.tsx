import type { ReactNode } from "react";

/**
 * Login page uses a bare layout (no sidebar, no header).
 * The root layout provides the Providers wrapper; this layout
 * simply strips out the shell chrome.
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
