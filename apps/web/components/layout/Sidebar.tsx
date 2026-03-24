"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Satellite,
  ShieldCheck,
  FileText,
  ChevronLeft,
  ChevronRight,
  Shield,
  Waves,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { useAlerts } from "@/lib/alerts-context";
import { useIncidents } from "@/lib/incidents-context";

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    exact: true,
    badge: false,
  },
  {
    label: "Assets",
    href: "/assets",
    icon: Satellite,
    exact: false,
    badge: false,
  },
  {
    label: "Telemetry",
    href: "/telemetry",
    icon: Waves,
    exact: false,
    badge: false,
  },
  {
    label: "Alerts",
    href: "/alerts",
    icon: Bell,
    exact: false,
    badge: "alerts" as const,
  },
  {
    label: "Incidents",
    href: "/incidents",
    icon: AlertTriangle,
    exact: false,
    badge: "incidents" as const,
  },
  {
    label: "Compliance",
    href: "/compliance",
    icon: ShieldCheck,
    exact: false,
    badge: false,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileText,
    exact: false,
    badge: false,
  },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { newCount } = useAlerts();
  const { activeCount: incidentActiveCount } = useIncidents();

  function getBadgeCount(badge: string | false): number {
    if (badge === "alerts")    return newCount;
    if (badge === "incidents") return incidentActiveCount;
    return 0;
  }

  return (
    <aside
      className={[
        "flex flex-col bg-slate-900 border-r border-slate-800",
        "transition-all duration-200 ease-in-out shrink-0",
        collapsed ? "w-16" : "w-60",
      ].join(" ")}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-slate-800 shrink-0">
        <Shield
          size={20}
          className="text-blue-400 shrink-0"
          aria-hidden="true"
        />
        {!collapsed && (
          <span className="ml-2.5 text-slate-50 font-bold tracking-wide text-base leading-none">
            Space
            <span className="text-blue-400">Guard</span>
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 overflow-y-auto" aria-label="Main navigation">
        {!collapsed && (
          <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">
            Platform
          </p>
        )}
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            const Icon = item.icon;
            const badgeCount = getBadgeCount(item.badge);
            const showBadge = item.badge && badgeCount > 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={[
                    "flex items-center gap-3 mx-2 rounded-md text-sm font-medium",
                    "transition-colors duration-150 relative",
                    collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                    active
                      ? "bg-slate-800 text-blue-400"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
                  ].join(" ")}
                >
                  {/* Active indicator bar */}
                  {active && (
                    <span
                      className="absolute left-0 top-1 bottom-1 w-0.5 bg-blue-400 rounded-r-full"
                      aria-hidden="true"
                    />
                  )}

                  {/* Icon with badge when collapsed */}
                  <span className="relative shrink-0">
                    <Icon size={18} aria-hidden="true" />
                    {showBadge && collapsed && (
                      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </span>

                  {!collapsed && <span className="flex-1">{item.label}</span>}

                  {/* Badge when expanded */}
                  {showBadge && !collapsed && (
                    <span className="ml-auto flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="shrink-0 p-3 border-t border-slate-800">
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={[
            "w-full flex items-center rounded-md px-2 py-2",
            "text-slate-500 hover:text-slate-300 hover:bg-slate-800",
            "transition-colors duration-150 text-xs font-medium",
            collapsed ? "justify-center" : "justify-between",
          ].join(" ")}
        >
          {!collapsed && (
            <span className="uppercase tracking-widest text-[10px]">
              Collapse
            </span>
          )}
          {collapsed ? (
            <ChevronRight size={15} aria-hidden="true" />
          ) : (
            <ChevronLeft size={15} aria-hidden="true" />
          )}
        </button>
      </div>
    </aside>
  );
}
