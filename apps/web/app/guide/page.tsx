"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Satellite,
  Shield,
  AlertTriangle,
  MonitorCheck,
  FileText,
  GraduationCap,
  Lock,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Guide steps
// ---------------------------------------------------------------------------

interface GuideStep {
  number: number;
  title: string;
  description: string;
  icon: React.ElementType;
  criteria: string[];
  links: { label: string; href: string }[];
  article: string;
}

const STEPS: GuideStep[] = [
  {
    number: 1,
    title: "Understand Your Classification",
    description: "Determine whether your organization is classified as 'Essential' or 'Important' under NIS2. Satellite operators providing services to EU member states are typically classified as Essential entities in the space sector. This classification determines your reporting deadlines and supervision regime.",
    icon: BookOpen,
    article: "Article 3",
    criteria: [
      "Identified your NIS2 entity classification (Essential or Important)",
      "Confirmed which EU member state(s) have jurisdiction",
      "Registered with the relevant national competent authority",
      "Understood the supervision and enforcement regime that applies",
    ],
    links: [
      { label: "Organization settings", href: "/settings" },
    ],
  },
  {
    number: 2,
    title: "Map Your Assets",
    description: "Create a complete inventory of your space and ground infrastructure using the ENISA Annex B 4-segment model (Space, Ground, User, Human Resources). Include satellite subsystems (CDHS, COM, ADCS, EPS, Payload) and ground station components. Classify each by criticality.",
    icon: Satellite,
    article: "Article 21(2)(a)",
    criteria: [
      "All satellites registered with subsystem decomposition",
      "All ground stations registered with component breakdown",
      "Every asset classified by criticality (Low/Medium/High/Critical)",
      "ENISA segment assigned to each asset (Space/Ground/User/HR)",
      "Dependencies mapped between ground and space segments",
    ],
    links: [
      { label: "Asset Registry", href: "/assets" },
      { label: "Lifecycle Tracking", href: "/lifecycle" },
    ],
  },
  {
    number: 3,
    title: "Assess Your Current Posture",
    description: "Work through the compliance requirements for NIS2, CRA, and ENISA Space Threat Landscape. Map each requirement to your assets and honestly assess your current status. Start with NIS2 Article 21(2) categories.",
    icon: Shield,
    article: "Article 21(2)",
    criteria: [
      "All 18 NIS2 requirements assessed (not left as 'Not Assessed')",
      "CRA vulnerability handling requirements reviewed",
      "ENISA Space controls mapped to your asset types",
      "Compliance score calculated for each regulation",
      "Gaps identified and documented",
    ],
    links: [
      { label: "Compliance Dashboard", href: "/compliance" },
    ],
  },
  {
    number: 4,
    title: "Address Critical Gaps First",
    description: "Focus on the requirements where you scored NON_COMPLIANT and that affect your most critical assets. Typical priority areas for satellite operators: incident handling, supply chain security, access control for command systems, and TT&C link encryption.",
    icon: AlertTriangle,
    article: "Article 21(2)(b-d)",
    criteria: [
      "Top 5 gaps identified by risk impact",
      "Remediation plan with owners and deadlines for each gap",
      "Quick wins implemented (MFA, access reviews, incident templates)",
      "Supply chain assessment started for critical suppliers",
      "SBOM created for flight and ground software",
    ],
    links: [
      { label: "Risk Dashboard", href: "/risk" },
      { label: "Vulnerability Management", href: "/vulnerabilities" },
      { label: "Supply Chain", href: "/supply-chain" },
    ],
  },
  {
    number: 5,
    title: "Set Up Monitoring",
    description: "Deploy detection capabilities across your infrastructure. Connect telemetry streams from your satellites, configure detection rules for space-specific threats (RF jamming, unauthorized commands, telemetry anomalies), and set up alerting.",
    icon: MonitorCheck,
    article: "Article 21(2)(b)",
    criteria: [
      "Telemetry streams connected for all operational satellites",
      "Detection rules configured for your specific asset types",
      "Alert thresholds tuned to reduce false positives",
      "SPARTA techniques mapped to your detection coverage",
      "24/7 monitoring capability established (SOC or on-call)",
    ],
    links: [
      { label: "Telemetry", href: "/telemetry" },
      { label: "Alerts", href: "/alerts" },
      { label: "Detection Rules", href: "/alerts/rules" },
      { label: "Threat Intel", href: "/intel" },
    ],
  },
  {
    number: 6,
    title: "Prepare Incident Response",
    description: "Build and test your incident response capability. Create response playbooks for space-specific scenarios (RF interference, unauthorized telecommands, ground station compromise). Configure NIS2 notification templates with the 24h/72h/30d deadlines.",
    icon: AlertTriangle,
    article: "Article 21(2)(b), Article 23",
    criteria: [
      "Incident response plan written and approved",
      "NIS2 notification templates configured (24h, 72h, final report)",
      "At least 3 response playbooks for space-specific scenarios",
      "IR drill conducted within the past 12 months",
      "Escalation procedures include ground station providers",
    ],
    links: [
      { label: "Incidents", href: "/incidents" },
      { label: "Playbooks", href: "/playbooks" },
    ],
  },
  {
    number: 7,
    title: "Document Everything",
    description: "NIS2 compliance is evidence-based. Generate compliance reports, maintain an audit trail, and ensure all security decisions are documented. Export reports for auditors and management reviews.",
    icon: FileText,
    article: "Article 21",
    criteria: [
      "Compliance report generated showing current posture",
      "Audit trail active for all security-relevant actions",
      "Risk acceptance decisions documented with justifications",
      "Security policies version-controlled and reviewed annually",
      "Management review minutes recorded",
    ],
    links: [
      { label: "Reports", href: "/reports" },
      { label: "Audit Trail", href: "/audit" },
      { label: "Exports", href: "/exports" },
    ],
  },
  {
    number: 8,
    title: "Schedule Regular Reviews",
    description: "NIS2 compliance is not a one-time exercise. Schedule recurring assessments, penetration tests (TLPT every 3 years per EU Space Act), supplier reassessments, and training refreshers. Use SpaceGuard's scheduled reports to automate regular updates.",
    icon: GraduationCap,
    article: "Article 21(2)(f-g)",
    criteria: [
      "Annual compliance reassessment scheduled",
      "TLPT scheduled (before launch + every 3 years)",
      "Quarterly supplier security reviews calendared",
      "Annual cybersecurity training program in place",
      "Scheduled compliance reports configured for management",
    ],
    links: [
      { label: "Lifecycle / TLPT", href: "/lifecycle" },
      { label: "Scheduled Reports", href: "/reports" },
      { label: "Settings", href: "/settings" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuidePage() {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([1]));

  function toggleStep(n: number) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen size={20} className="text-blue-400" />
          <h1 className="text-2xl font-bold text-slate-50">NIS2 Compliance Guide</h1>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed">
          Step-by-step guide for satellite operators to achieve NIS2 compliance.
          Only 57% of space operators are familiar with NIS2 requirements (ENISA NIS360).
          This guide translates regulatory obligations into practical actions for your space operations.
        </p>
      </div>

      {/* Progress bar */}
      <Card className="bg-slate-900 border-slate-800 mb-6">
        <CardContent className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {STEPS.map((s) => (
                <div
                  key={s.number}
                  className={`w-8 h-1.5 rounded-full ${
                    expandedSteps.has(s.number) ? "bg-blue-500" : "bg-slate-700"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-slate-500">8 steps to compliance</span>
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step) => {
          const expanded = expandedSteps.has(step.number);
          const Icon = step.icon;
          return (
            <Card key={step.number} className="bg-slate-900 border-slate-800">
              <div
                onClick={() => toggleStep(step.number)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold shrink-0">
                  {step.number}
                </div>
                <Icon size={16} className="text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-200">{step.title}</h3>
                  <span className="text-[10px] text-slate-600">{step.article}</span>
                </div>
                {expanded ? (
                  <ChevronDown size={16} className="text-slate-500 shrink-0" />
                ) : (
                  <ChevronRight size={16} className="text-slate-500 shrink-0" />
                )}
              </div>

              {expanded && (
                <CardContent className="px-4 pb-4 pt-0 border-t border-slate-800">
                  <p className="text-sm text-slate-400 leading-relaxed mt-3 mb-4">
                    {step.description}
                  </p>

                  {/* Criteria checklist */}
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">
                      Completion Criteria
                    </p>
                    <div className="space-y-1.5">
                      {step.criteria.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                          <Circle size={10} className="text-slate-600 shrink-0 mt-0.5" />
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Links */}
                  <div className="flex flex-wrap gap-2">
                    {step.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1 transition-colors"
                      >
                        {link.label}
                        <ChevronRight size={10} />
                      </Link>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
