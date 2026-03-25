"use client";

import { Building2, LogOut, User } from "lucide-react";
import { useOrg, countryFlag } from "@/lib/context";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Header() {
  const { orgs, orgId, setOrgId, loading: orgLoading } = useOrg();
  const { user, logout } = useAuth();

  if (orgLoading || orgs.length === 0) {
    return (
      <header className="h-12 border-b border-slate-800 bg-slate-900/50 flex items-center px-5 shrink-0">
        <div className="h-4 w-52 animate-pulse rounded bg-slate-800" />
      </header>
    );
  }

  const isAdmin = user?.role === "ADMIN";

  return (
    <header className="h-12 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-5 shrink-0 gap-4">
      {/* Left: org switcher (admin only) or org name */}
      <div className="flex items-center gap-2 min-w-0">
        <Building2 size={14} className="text-slate-500 shrink-0" />
        {isAdmin ? (
          <Select value={orgId ?? ""} onValueChange={setOrgId}>
            <SelectTrigger className="h-7 text-xs bg-transparent border-slate-700 text-slate-200 focus:border-blue-500 min-w-0 max-w-xs gap-1.5">
              <SelectValue placeholder="Select organization" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              {orgs.map((org) => (
                <SelectItem
                  key={org.id}
                  value={org.id}
                  className="text-slate-200 focus:bg-slate-800 text-xs cursor-pointer"
                >
                  {org.name}{" "}
                  <span aria-label={org.country} className="ml-1">
                    {countryFlag(org.country)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-slate-300 truncate">
            {orgs.find((o) => o.id === orgId)?.name ?? ""}
          </span>
        )}
      </div>

      {/* Right: user info + logout */}
      <div className="flex items-center gap-3 shrink-0">
        {user && (
          <div className="flex items-center gap-2">
            <User size={13} className="text-slate-500" />
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              {user.name}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-medium uppercase tracking-wide">
              {user.role}
            </span>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          title="Sign out"
        >
          <LogOut size={13} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
