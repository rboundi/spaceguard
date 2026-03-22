"use client";

import { Building2 } from "lucide-react";
import { useOrg, countryFlag } from "@/lib/context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Header() {
  const { orgs, orgId, setOrgId, loading } = useOrg();

  if (loading || orgs.length === 0) {
    return (
      <header className="h-12 border-b border-slate-800 bg-slate-900/50 flex items-center px-5 shrink-0">
        <div className="h-4 w-52 animate-pulse rounded bg-slate-800" />
      </header>
    );
  }

  return (
    <header className="h-12 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-5 shrink-0 gap-4">
      {/* Left: org switcher */}
      <div className="flex items-center gap-2 min-w-0">
        <Building2 size={14} className="text-slate-500 shrink-0" />
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
      </div>

      {/* Right: platform label */}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 shrink-0">
        SpaceGuard Platform
      </span>
    </header>
  );
}
