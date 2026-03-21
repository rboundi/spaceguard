import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50">Dashboard</h1>
        <p className="text-slate-400 mt-1 text-sm">
          NIS2 compliance overview for your space infrastructure
        </p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-500 text-sm">
        Dashboard coming soon
      </div>
    </div>
  );
}
