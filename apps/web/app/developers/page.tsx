"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Key,
  Satellite,
  Webhook,
  Download,
  Shield,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Zap,
  Code2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Copy-to-clipboard button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-2 right-2 p-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors text-slate-400 hover:text-slate-200"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Code block
// ---------------------------------------------------------------------------

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <CopyButton text={code} />
      <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 overflow-x-auto text-sm text-slate-300 leading-relaxed">
        <code className={`language-${lang}`}>{code}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Section({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="bg-slate-900 border-slate-800">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-slate-800/40 transition-colors rounded-t-lg"
      >
        <Icon size={18} className="text-blue-400 shrink-0" />
        <span className="text-sm font-semibold text-slate-100 flex-1">{title}</span>
        {open ? (
          <ChevronDown size={16} className="text-slate-500" />
        ) : (
          <ChevronRight size={16} className="text-slate-500" />
        )}
      </button>
      {open && <CardContent className="px-6 pb-6 pt-0 space-y-4">{children}</CardContent>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab component for language tabs
// ---------------------------------------------------------------------------

function LangTabs({ tabs }: { tabs: { label: string; lang: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div className="flex gap-1 mb-2">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActive(i)}
            className={[
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              i === active
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <CodeBlock code={tabs[active].code} lang={tabs[active].lang} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function DevelopersPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50 flex items-center gap-3">
            <Code2 size={24} className="text-blue-400" />
            Developer Portal
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Integrate with the SpaceGuard API to automate security operations.
          </p>
        </div>
        <a
          href={`${API_BASE}/api/docs`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800">
            <BookOpen size={16} />
            Interactive API Docs
            <ExternalLink size={14} />
          </Button>
        </a>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <a href={`${API_BASE}/api/docs`} target="_blank" rel="noopener noreferrer">
          <Card className="bg-slate-900 border-slate-800 hover:border-blue-500/40 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <BookOpen size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Swagger UI</p>
                <p className="text-xs text-slate-500 mt-0.5">Interactive API explorer with "Try it out"</p>
              </div>
            </CardContent>
          </Card>
        </a>
        <a href={`${API_BASE}/api/docs/openapi.json`} target="_blank" rel="noopener noreferrer">
          <Card className="bg-slate-900 border-slate-800 hover:border-blue-500/40 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Download size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">OpenAPI Spec</p>
                <p className="text-xs text-slate-500 mt-0.5">Download openapi.json for code generation</p>
              </div>
            </CardContent>
          </Card>
        </a>
        <Link href="/settings">
          <Card className="bg-slate-900 border-slate-800 hover:border-blue-500/40 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Webhook size={18} className="text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">SIEM Integrations</p>
                <p className="text-xs text-slate-500 mt-0.5">Configure syslog CEF/LEEF/JSON endpoints</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Auth guide */}
      <Section title="Authentication" icon={Key} defaultOpen>
        <p className="text-sm text-slate-400">
          SpaceGuard uses JWT bearer tokens for API authentication.
          Telemetry ingestion endpoints use stream-specific API keys instead.
        </p>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Step 1: Get a token</p>
          <LangTabs tabs={[
            {
              label: "curl",
              lang: "bash",
              code: `curl -X POST ${API_BASE}/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "admin@example.com", "password": "your-password"}'

# Response: { "user": {...}, "token": "eyJhbGciOi..." }`,
            },
            {
              label: "TypeScript",
              lang: "typescript",
              code: `const res = await fetch("${API_BASE}/api/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@example.com",
    password: "your-password",
  }),
});
const { token } = await res.json();`,
            },
            {
              label: "Python",
              lang: "python",
              code: `import requests

res = requests.post("${API_BASE}/api/v1/auth/login", json={
    "email": "admin@example.com",
    "password": "your-password",
})
token = res.json()["token"]`,
            },
          ]} />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Step 2: Use the token</p>
          <CodeBlock code={`curl ${API_BASE}/api/v1/assets \\
  -H "Authorization: Bearer \${TOKEN}"`} />
        </div>
      </Section>

      {/* Telemetry quickstart */}
      <Section title="Telemetry Ingestion Quickstart" icon={Satellite}>
        <p className="text-sm text-slate-400">
          Send satellite housekeeping data, CCSDS frames, or ground segment logs to SpaceGuard
          for anomaly detection and alerting.
        </p>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Step 1: Create a telemetry stream
          </p>
          <CodeBlock code={`curl -X POST ${API_BASE}/api/v1/telemetry/streams \\
  -H "Authorization: Bearer \${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "organizationId": "your-org-uuid",
    "assetId": "your-satellite-uuid",
    "name": "Sentinel-A Housekeeping",
    "protocol": "CCSDS_TM"
  }'

# Response includes:
# {
#   "id": "stream-uuid",
#   "apiKey": "abc123def456...",
#   ...
# }`} />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Step 2: Note the API key from the response
          </p>
          <p className="text-sm text-slate-400">
            The <code className="text-blue-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">apiKey</code> field
            is your stream authentication credential. Store it securely. You can regenerate it from
            Settings if compromised.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Step 3: Send telemetry data
          </p>
          <LangTabs tabs={[
            {
              label: "curl (JSON)",
              lang: "bash",
              code: `curl -X POST ${API_BASE}/api/v1/telemetry/ingest/\${STREAM_ID} \\
  -H "X-API-Key: \${API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "streamId": "your-stream-uuid",
    "points": [
      {
        "time": "2026-03-27T10:00:00Z",
        "parameterName": "battery_voltage_v",
        "valueNumeric": 28.3,
        "quality": "GOOD"
      },
      {
        "time": "2026-03-27T10:00:00Z",
        "parameterName": "temperature_obc_c",
        "valueNumeric": 22.1,
        "quality": "GOOD"
      }
    ]
  }'`,
            },
            {
              label: "curl (CCSDS)",
              lang: "bash",
              code: `# Send raw CCSDS binary frames
curl -X POST ${API_BASE}/api/v1/telemetry/ingest/\${STREAM_ID}/ccsds \\
  -H "X-API-Key: \${API_KEY}" \\
  -H "Content-Type: application/octet-stream" \\
  --data-binary @telemetry_frame.bin`,
            },
            {
              label: "Python",
              lang: "python",
              code: `import requests
from datetime import datetime, timezone

API_KEY = "your-stream-api-key"
STREAM_ID = "your-stream-uuid"

res = requests.post(
    f"${API_BASE}/api/v1/telemetry/ingest/{STREAM_ID}",
    headers={"X-API-Key": API_KEY},
    json={
        "streamId": STREAM_ID,
        "points": [
            {
                "time": datetime.now(timezone.utc).isoformat(),
                "parameterName": "battery_voltage_v",
                "valueNumeric": 28.3,
                "quality": "GOOD",
            },
            {
                "time": datetime.now(timezone.utc).isoformat(),
                "parameterName": "solar_power_w",
                "valueNumeric": 145.2,
                "quality": "GOOD",
            },
        ],
    },
)
print(res.json())  # {"inserted": 2, "failed": 0}`,
            },
            {
              label: "TypeScript",
              lang: "typescript",
              code: `const API_KEY = "your-stream-api-key";
const STREAM_ID = "your-stream-uuid";

const res = await fetch(
  \`${API_BASE}/api/v1/telemetry/ingest/\${STREAM_ID}\`,
  {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      streamId: STREAM_ID,
      points: [
        {
          time: new Date().toISOString(),
          parameterName: "battery_voltage_v",
          valueNumeric: 28.3,
          quality: "GOOD",
        },
      ],
    }),
  }
);
const result = await res.json();
// { inserted: 1, failed: 0 }`,
            },
          ]} />
        </div>

        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Zap size={16} className="text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-slate-400">
              <span className="text-blue-400 font-medium">Anomaly detection</span> activates automatically.
              New streams enter a 24-hour learning mode to establish baselines.
              After learning completes, any parameter that deviates beyond 3 standard deviations triggers an alert.
            </div>
          </div>
        </div>
      </Section>

      {/* STIX export */}
      <Section title="STIX 2.1 Export" icon={Shield}>
        <p className="text-sm text-slate-400">
          Export your alerts, incidents, and threat intelligence as a STIX 2.1 bundle
          for sharing with partner organizations or importing into threat intelligence platforms.
        </p>

        <LangTabs tabs={[
          {
            label: "curl",
            lang: "bash",
            code: `curl -X POST ${API_BASE}/api/v1/export/stix \\
  -H "Authorization: Bearer \${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "organizationId": "your-org-uuid",
    "includeAlerts": true,
    "includeIncidents": true,
    "includeThreatIntel": true,
    "includeRelationships": true,
    "from": "2026-01-01T00:00:00Z",
    "to": "2026-03-27T23:59:59Z"
  }' -o stix-bundle.json`,
          },
          {
            label: "Python",
            lang: "python",
            code: `import requests, json

res = requests.post(
    f"${API_BASE}/api/v1/export/stix",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "organizationId": org_id,
        "includeAlerts": True,
        "includeIncidents": True,
        "includeThreatIntel": True,
    },
)
bundle = res.json()
print(f"Exported {len(bundle['objects'])} STIX objects")

with open("stix-bundle.json", "w") as f:
    json.dump(bundle, f, indent=2)`,
          },
        ]} />
      </Section>

      {/* Syslog/SIEM */}
      <Section title="SIEM Integration (Syslog)" icon={Terminal}>
        <p className="text-sm text-slate-400">
          Forward SpaceGuard alerts and incidents to your SIEM in real time via syslog.
          Supported formats: CEF (Splunk, ArcSight, Elastic, Sentinel), LEEF (IBM QRadar),
          and structured JSON.
        </p>

        <CodeBlock code={`# Create a syslog endpoint
curl -X POST ${API_BASE}/api/v1/settings/syslog \\
  -H "Authorization: Bearer \${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "organizationId": "your-org-uuid",
    "name": "Splunk HEC",
    "host": "splunk.example.com",
    "port": 514,
    "protocol": "TCP",
    "format": "CEF",
    "minSeverity": "MEDIUM"
  }'

# Test the endpoint
curl -X POST ${API_BASE}/api/v1/settings/syslog/\${ENDPOINT_ID}/test \\
  -H "Authorization: Bearer \${TOKEN}"`} />

        <p className="text-sm text-slate-400">
          Once configured, all new alerts and incidents at or above the minimum severity
          are automatically forwarded to your SIEM. See the{" "}
          <Link href="/settings" className="text-blue-400 hover:underline">
            Settings &gt; Integrations
          </Link>{" "}
          page to manage endpoints through the UI.
        </p>
      </Section>

      {/* Rate limits */}
      <Section title="Rate Limits" icon={Zap}>
        <div className="text-sm text-slate-400 space-y-3">
          <p>
            API requests are subject to the following limits per authenticated user:
          </p>
          <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-2 text-slate-500 font-medium">Endpoint Category</th>
                  <th className="text-left px-4 py-2 text-slate-500 font-medium">Limit</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-slate-800/50">
                  <td className="px-4 py-2">Standard REST endpoints</td>
                  <td className="px-4 py-2">120 requests/min</td>
                </tr>
                <tr className="border-b border-slate-800/50">
                  <td className="px-4 py-2">Telemetry ingest (JSON)</td>
                  <td className="px-4 py-2">Configurable per stream (default: 1000 pts/min)</td>
                </tr>
                <tr className="border-b border-slate-800/50">
                  <td className="px-4 py-2">CCSDS binary ingest</td>
                  <td className="px-4 py-2">60 requests/min (512 KB max per request)</td>
                </tr>
                <tr className="border-b border-slate-800/50">
                  <td className="px-4 py-2">PDF report generation</td>
                  <td className="px-4 py-2">10 requests/min</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">STIX/CSV export</td>
                  <td className="px-4 py-2">10 requests/min</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Rate-limited responses return HTTP 429 with a <code className="text-blue-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">Retry-After</code> header.
          </p>
        </div>
      </Section>

      {/* Error handling */}
      <Section title="Error Handling" icon={Shield}>
        <p className="text-sm text-slate-400">
          All API errors return a consistent JSON shape:
        </p>
        <CodeBlock lang="json" code={`{
  "error": "Human-readable error message",
  "details": "Optional additional context"
}`} />
        <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-2 text-slate-500 font-medium">Status</th>
                <th className="text-left px-4 py-2 text-slate-500 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr className="border-b border-slate-800/50"><td className="px-4 py-2">400</td><td className="px-4 py-2">Validation error (check request body/params)</td></tr>
              <tr className="border-b border-slate-800/50"><td className="px-4 py-2">401</td><td className="px-4 py-2">Missing or invalid authentication</td></tr>
              <tr className="border-b border-slate-800/50"><td className="px-4 py-2">403</td><td className="px-4 py-2">Insufficient permissions or tenant mismatch</td></tr>
              <tr className="border-b border-slate-800/50"><td className="px-4 py-2">404</td><td className="px-4 py-2">Resource not found</td></tr>
              <tr className="border-b border-slate-800/50"><td className="px-4 py-2">413</td><td className="px-4 py-2">Request body too large</td></tr>
              <tr className="border-b border-slate-800/50"><td className="px-4 py-2">429</td><td className="px-4 py-2">Rate limited</td></tr>
              <tr><td className="px-4 py-2">500</td><td className="px-4 py-2">Internal server error</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Footer */}
      <div className="text-center text-xs text-slate-600 pb-8">
        SpaceGuard API v1.0.0 &middot; OpenAPI 3.1 &middot;{" "}
        <a
          href={`${API_BASE}/api/docs/openapi.json`}
          className="text-blue-500 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          openapi.json
        </a>
      </div>
    </div>
  );
}
