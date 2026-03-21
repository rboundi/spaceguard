import type { Metadata } from "next";

export const metadata: Metadata = { title: "Compliance" };

export default function CompliancePage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50">Compliance Mapper</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Map NIS2 Article 21 requirements to your assets
        </p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-500 text-sm">
        Compliance mapping coming soon
      </div>
    </div>
  );
}
