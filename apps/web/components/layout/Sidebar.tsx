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
  ChevronDown,
  Shield,
  Waves,
  Bell,
  AlertTriangle,
  ShieldAlert,
  Gauge,
  Workflow,
  Link as LinkIcon,
  ClipboardList,
  Settings,
  UserCog,
  Download,
  BookOpen,
  Code2,
  Bug,
  Orbit,
  Crosshair,
  Lock,
} from "lucide-react";
import { useAlerts } from "@/lib/alerts-context";
import { useIncidents } from "@/lib/incidents-context";

// ---------------------------------------------------------------------------
// Nav item type
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  exact: boolean;
  badge: "alerts" | "incidents" | false;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Grouped navigation
// ---------------------------------------------------------------------------

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard, exact: true, badge: false },
      { label: "NIS2 Guide", href: "/guide", icon: BookOpen, exact: false, badge: false },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Assets", href: "/assets", icon: Satellite, exact: false, badge: false },
      { label: "Telemetry", href: "/telemetry", icon: Waves, exact: false, badge: false },
      { label: "Alerts", href: "/alerts", icon: Bell, exact: false, badge: "alerts" },
      { label: "Incidents", href: "/incidents", icon: AlertTriangle, exact: false, badge: "incidents" },
      { label: "Playbooks", href: "/playbooks", icon: Workflow, exact: false, badge: false },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Threat Intel", href: "/intel", icon: ShieldAlert, exact: false, badge: false },
      { label: "Tailoring", href: "/tailoring", icon: Crosshair, exact: false, badge: false },
      { label: "Risk", href: "/risk", icon: Gauge, exact: false, badge: false },
    ],
  },
  {
    title: "Compliance",
    items: [
      { label: "Compliance", href: "/compliance", icon: ShieldCheck, exact: false, badge: false },
      { label: "Lifecycle", href: "/lifecycle", icon: Orbit, exact: false, badge: false },
      { label: "Crypto", href: "/crypto", icon: Lock, exact: false, badge: false },
    ],
  },
  {
    title: "Supply Chain",
    items: [
      { label: "Suppliers", href: "/supply-chain", icon: LinkIcon, exact: false, badge: false },
      { label: "Vulnerabilities", href: "/vulnerabilities", icon: Bug, exact: false, badge: false },
    ],
  },
  {
    title: "Reporting",
    items: [
      { label: "Reports", href: "/reports", icon: FileText, exact: false, badge: false },
      { label: "Audit Trail", href: "/audit", icon: ClipboardList, exact: false, badge: false },
      { label: "Exports", href: "/exports", icon: Download, exact: false, badge: false },
    ],
  },
];

const ADMIN_ITEMS: NavItem[] = [
  { label: "SPARTA Data", href: "/admin/sparta", icon: Settings, exact: false, badge: false },
  { label: "Developers", href: "/developers", icon: Code2, exact: false, badge: false },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const { newCount = 0 } = useAlerts();
  const { activeCount: incidentActiveCount = 0 } = useIncidents();

  function getBadgeCount(badge: string | false): number {
    if (badge === "alerts") return newCount;
    if (badge === "incidents") return incidentActiveCount;
    return 0;
  }

  function toggleSection(title: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function renderItem(item: NavItem) {
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
            "flex items-center gap-3 mx-2 rounded-md text-[13px] font-medium",
            "transition-colors duration-150 relative",
            collapsed ? "justify-center px-2 py-2" : "px-3 py-1.5",
            active
              ? "bg-slate-800 text-blue-400"
              : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
          ].join(" ")}
        >
          {active && (
            <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-blue-400 rounded-r-full" aria-hidden="true" />
          )}
          <span className="relative shrink-0">
            <Icon size={16} aria-hidden="true" />
            {showBadge && collapsed && (
              <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
          </span>
          {!collapsed && <span className="flex-1">{item.label}</span>}
          {showBadge && !collapsed && (
            <span className="ml-auto flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </Link>
      </li>
    );
  }

  return (
    <aside
      className={[
        "flex flex-col bg-slate-900 border-r border-slate-800",
        "transition-all duration-200 ease-in-out shrink-0",
        collapsed ? "w-16" : "w-56",
      ].join(" ")}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-slate-800 shrink-0">
        <Shield size={20} className="text-blue-400 shrink-0" aria-hidden="true" />
        {!collapsed && (
          <span className="ml-2.5 text-slate-50 font-bold tracking-wide text-base leading-none">
            Space<span className="text-blue-400">Guard</span>
          </span>
        )}
      </div>

      {/* Nav sections */}
      <nav className="flex-1 py-2 overflow-y-auto" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => {
          const isCollapsedSection = collapsedSections.has(section.title);
          const hasActiveItem = section.items.some((i) => isActive(pathname, i.href, i.exact));
          return (
            <div key={section.title} className="mb-1">
              {!collapsed && (
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors"
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    size={10}
                    className={`transition-transform ${isCollapsedSection ? "-rotate-90" : ""}`}
                  />
                </button>
              )}
              {(!isCollapsedSection || collapsed || hasActiveItem) && (
                <ul className="space-y-0.5">
                  {collapsed
                    ? section.items.map(renderItem)
                    : isCollapsedSection
                    ? section.items.filter((i) => isActive(pathname, i.href, i.exact)).map(renderItem)
                    : section.items.map(renderItem)}
                </ul>
              )}
            </div>
          );
        })}

        {/* Admin section */}
        <div className="mt-1 pt-1 border-t border-slate-800/50">
          {!collapsed && (
            <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Admin
            </p>
          )}
          <ul className="space-y-0.5">
            {ADMIN_ITEMS.map(renderItem)}
          </ul>
        </div>
      </nav>

      {/* Settings link */}
      <div className="shrink-0 px-2 pb-1">
        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={[
            "flex items-center gap-3 mx-0 rounded-md text-[13px] font-medium",
            "transition-colors duration-150 relative",
            collapsed ? "justify-center px-2 py-2" : "px-3 py-1.5",
            pathname === "/settings"
              ? "bg-slate-800 text-blue-400"
              : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
          ].join(" ")}
        >
          {pathname === "/settings" && (
            <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-blue-400 rounded-r-full" aria-hidden="true" />
          )}
          <UserCog size={16} aria-hidden="true" />
          {!collapsed && <span className="flex-1">Settings</span>}
        </Link>
      </div>

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
          {!collapsed && <span className="uppercase tracking-widest text-[10px]">Collapse</span>}
          {collapsed ? <ChevronRight size={15} aria-hidden="true" /> : <ChevronLeft size={15} aria-hidden="true" />}
        </button>
      </div>
    </aside>
  );
}
