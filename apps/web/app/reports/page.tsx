import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50">Reports</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Generate and download NIS2 compliance PDF reports
        </p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-500 text-sm">
        PDF report generation coming soon
      </div>
    </div>
  );
}
