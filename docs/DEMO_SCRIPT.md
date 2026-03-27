# SpaceGuard Demo Script

A 20-minute walkthrough for demoing SpaceGuard to prospects and investors. This script assumes the full demo scenario has been loaded (`npx tsx scripts/full-demo.ts`).

## Pre-Demo Checklist

- [ ] Docker running (PostgreSQL + Redis): `docker compose up -d`
- [ ] Demo data loaded: `npx tsx scripts/full-demo.ts`
- [ ] API server running on port 3001: `npm run dev`
- [ ] Frontend running on port 3000
- [ ] Browser open to http://localhost:3000/login
- [ ] Screen resolution set to 1920x1080 or higher
- [ ] Select "Proba Space Systems" as the active organization after login

## Login (30 seconds)

Open the login page and sign in with the admin credentials:

- Email: admin@proba-space.eu
- Password: SpaceGuard2026!

**Talking point:** "SpaceGuard supports role-based access. We have admin, operator, and auditor roles. The admin we're logging in as has full platform access."

## Act 1: The Dashboard (2 minutes)

Start here. The dashboard is fully customizable with drag-and-drop widgets.

**Walk through these elements:**

1. **Compliance score donut** (top left): "Proba Space Systems is at around 60% NIS2 compliance. The donut breaks down by status: compliant, partially compliant, non-compliant, and not yet assessed."

2. **Active incidents card**: "We have active security incidents right now, including one that was auto-created by the correlation engine. We'll see how that works shortly."

3. **NIS2 deadline countdown**: "These are regulatory deadlines from NIS2 Article 23. The platform tracks early warning (24 hours), incident notification (72 hours), and final report (30 days) deadlines automatically."

4. **Risk heatmap**: "Every asset has a risk score calculated across five dimensions: compliance gaps, threat exposure, active alerts, supply chain risk, and configuration weaknesses. The heatmap shows which assets need attention."

5. **Recent alerts table**: "The detection engine has flagged several anomalies in the last 48 hours. We'll investigate one of these shortly."

**Talking point:** "The dashboard layout is fully customizable. Each user can drag, resize, and arrange widgets to match their workflow. Changes persist across sessions."

**Ask the prospect:** "How are you currently tracking your NIS2 compliance deadlines? Are you doing this manually?"

## Act 2: Asset Registry & Risk Scoring (2 minutes)

Navigate to **Assets** in the sidebar.

**Walk through:**

1. "Proba has 8 registered assets: LEO satellites, ground stations, a control center, and communication links. Notice the risk score badges next to each asset."

2. Click on **Proba-EO-1** (the primary satellite): "This satellite has a risk score of 72 out of 100. Let me show you why."

3. Show the risk breakdown: "The score comes from five dimensions. Proba-EO-1 scores high on threat exposure (22) because of the recent battery incident, and high on active alerts (20) because of ongoing anomalies."

4. Navigate to the **Risk** page: "Here you can compare risk scores across your entire fleet. NordSat-Alpha has the highest score at 78 because NordSat IoT is a less mature organization with more compliance gaps."

**Talking point:** "Risk scores update automatically as compliance status changes, new alerts fire, or supplier assessments expire. This gives you a continuous, quantified view of your security posture."

## Act 3: Telemetry & AI Anomaly Detection (3 minutes)

Navigate to **Telemetry** in the sidebar.

1. "These are live telemetry streams from Proba-EO-1. We're ingesting housekeeping data and communications telemetry via CCSDS-compatible endpoints."

2. Click on the **Proba-EO-1 HK** stream to see the detail view: "Here's the time-series data. You can see battery voltage, solar current, and onboard temperature plotted over time."

3. **Highlight the anomaly with baseline overlay**: "The shaded band behind the chart is the statistical baseline. SpaceGuard calculates rolling mean and standard deviation for every parameter. When the battery voltage drops outside the normal band, you get the red anomaly markers."

4. Point to the battery voltage drop: "This anomaly was detected automatically. The z-score exceeded the threshold, meaning the value was more than 3 standard deviations from the rolling mean. The system generated an alert without any manual threshold configuration."

Navigate to **Alerts** in the sidebar.

5. "The detection engine generated alerts for five different anomaly scenarios. Let me show you the most critical one."

6. Click to expand the **Battery Cell Failure** alert: "This alert was triggered when battery voltage dropped below the safe threshold. SpaceGuard enriched it with SPARTA space-attack framework classification and provided detection guidance."

**Talking point:** "Traditional SOC tools don't understand space telemetry. They can't tell you that a battery voltage drop at this orbital position is anomalous versus expected during eclipse. SpaceGuard's detection uses statistical baselines trained on your actual telemetry data."

## Act 4: Alert Correlation (2 minutes)

Stay on the **Alerts** page or navigate to **Incidents**.

1. "Notice this incident marked with a correlation badge: 'Correlated: Fleet-wide Thermal/Power Anomaly Pattern.' This was created automatically by the correlation engine."

2. Click into the correlated incident: "The engine detected that a battery failure on Proba-EO-1 and a temperature spike on NordSat-Alpha happened within a 2-hour window. It grouped them into a single investigation with a correlation score of 0.82."

3. Show the timeline: "The correlation engine uses four rules: temporal proximity (events close in time), asset proximity (same asset or fleet), technique clustering (similar SPARTA techniques), and campaign detection (coordinated patterns)."

**Talking point:** "Alert fatigue is the number one problem in security operations. The correlation engine reduces noise by grouping related alerts and surfacing what matters. Instead of investigating 10 separate alerts, your team sees one correlated incident."

**Ask the prospect:** "How many alerts does your team see per day? Do you have a way to group related events?"

## Act 5: Alert to Incident & Playbook Execution (3 minutes)

Navigate to the **Incidents** list.

1. "We have four incidents: one closed (battery failure), one investigating (RF jamming), one just detected (unauthorized access), and one auto-correlated."

2. Click into the **Battery Cell Failure** incident (CLOSED): "Here's the full incident lifecycle. Timeline shows every status change from detection through resolution."

3. Scroll to the **Playbook Execution** section: "When this alert fired, the Battery Anomaly Response playbook auto-triggered. You can see the five steps it executed: alert the flight dynamics team, run the safe-mode checklist, switch to backup power bus, notify the manufacturer, and escalate to incident."

4. Show the per-step execution log: "Every step has a timestamp, status (success/failed/waiting), and detailed message. This is your audit trail for automated responses."

Navigate to **Playbooks** in the sidebar.

5. "We have three playbooks configured. The Battery Anomaly Response triggers automatically on CRITICAL battery alerts. The RF Interference Response is manual. The Unauthorized Access Response auto-triggers on Initial Access tactics."

6. Show the visual step builder: "Each playbook defines a sequence of steps with types like notify, isolate, diagnostic, mitigate, escalate, and report. You can configure trigger conditions based on severity, SPARTA tactic, or specific rule IDs."

**Talking point:** "Playbooks turn your incident response procedures into executable, auditable workflows. When a 2 AM alert fires, the platform starts your response automatically instead of waiting for a human to wake up."

## Act 6: Compliance & Regulatory (2 minutes)

Navigate to **Compliance** in the sidebar.

1. "This is the compliance mapper. SpaceGuard supports three regulation frameworks: NIS2 Article 21, ENISA Space Threat Landscape, and the new Cyber Resilience Act (CRA). Use the filter to switch between them."

2. Click through the CRA requirements: "CRA is specifically relevant for space operators building products with digital elements. SpaceGuard maps these requirements alongside NIS2 so you don't have to manage them separately."

3. Navigate to the **Battery Cell Failure** incident and scroll to NIS2 Reports: "For the closed battery incident, all three NIS2 Article 23 reports were generated and submitted on time. Early warning within 24h, incident notification within 72h, final report within 30 days."

Navigate to **Reports** in the sidebar.

4. Click **Download PDF**: "One click generates a comprehensive compliance status report for auditors."

**Talking point:** "NIS2 enforcement started October 2024. CRA requirements begin applying in 2027. SpaceGuard tracks both continuously, not just at audit time."

## Act 7: Integrations & Scheduled Reports (2 minutes)

Navigate to **Settings** in the sidebar.

1. Show the Syslog/SIEM Integrations section: "SpaceGuard pushes alerts to your existing SIEM via syslog. We support CEF format for Splunk, LEEF for QRadar, and JSON for Elastic. You can configure multiple endpoints with different severity filters."

2. Point to the configured endpoints: "Proba has three endpoints: their primary Splunk instance gets MEDIUM and above over TLS, QRadar backup gets only HIGH/CRITICAL, and there's a dev endpoint for testing."

3. Show the Scheduled Reports section: "Reports can be generated automatically. Proba gets a weekly compliance summary every Monday, a monthly threat briefing, and a quarterly supply chain review. Recipients are configurable."

**Talking point:** "SpaceGuard integrates with your existing security infrastructure. It's not a replacement for your SIEM; it's the space-native data source that feeds into it."

## Act 8: Threat Intelligence & Supply Chain (2 minutes)

Navigate to **SPARTA Navigator** (under Admin in the sidebar).

1. "SpaceGuard integrates the SPARTA framework, the space-specific equivalent of MITRE ATT&CK. It covers 11 tactics and 85+ techniques specific to satellite and ground station attacks."

2. Search for a technique: "Each technique has detection guidance and recommended mitigations."

Navigate to **Supply Chain** in the sidebar.

3. "NIS2 requires supply chain risk management. Proba tracks 5 suppliers with risk scores, security certifications (ISO 27001, SOC 2), and review schedules."

4. Point to the high-risk vendor: "This software vendor has a risk score of 7/10, no ISO 27001, and their review is overdue. The platform flags these automatically."

## Act 9: Audit Trail & Developer Portal (1 minute)

Navigate to **Audit** in the sidebar.

1. "Every action is logged: logins, asset changes, compliance updates, incident actions, playbook executions, report submissions. This is essential for NIS2 accountability."

Navigate to **Developer Portal** (`/developers`).

2. "For integrations, we provide full OpenAPI documentation with interactive endpoint exploration. Your engineering team can build custom integrations using our REST API."

## Closing (1 minute)

Return to the **Dashboard**.

"SpaceGuard gives you a single platform that monitors satellite telemetry with AI anomaly detection, auto-correlates alerts to reduce noise, executes response playbooks automatically, tracks NIS2 and CRA compliance continuously, calculates risk across your entire fleet, and integrates with your existing SIEM. Everything is purpose-built for space operations."

**Key differentiators to emphasize:**

- Space-native: understands CCSDS telemetry, orbital mechanics, and SPARTA threat framework
- AI-powered: statistical anomaly detection with rolling baselines, not static thresholds
- Alert correlation: auto-groups related events to reduce noise by 80%+
- Automated response: playbooks execute your IR procedures without human delay
- Risk-quantified: five-dimension scoring across every asset with historical trends
- NIS2 and CRA-first: built around EU regulatory requirements, not retrofitted
- Operator-friendly: designed for 10-200 person teams without dedicated security staff
- Audit-ready: continuous compliance tracking with full action logging
- Production-ready: Docker deployment with SSL, nginx reverse proxy, and automated backups

**Ask the prospect:** "What's your biggest pain point right now: compliance tracking, threat detection, or incident response? We can dive deeper into any of these areas."

## Demo Scenarios Available

The full demo data includes these pre-built scenarios:

| Scenario | Org | Status | Description |
|----------|-----|--------|-------------|
| Battery Cell Failure | Proba Space Systems | CLOSED | Full lifecycle with all NIS2 reports submitted, playbook auto-executed |
| RF Signal Jamming | Proba Space Systems | INVESTIGATING | Active incident, playbook ran failover to Matera, 18h until notification deadline |
| Unauthorized Access | Proba Space Systems | DETECTED | New incident, playbook running (2/5 steps complete), 22h until early warning |
| Fleet Thermal/Power Pattern | Proba Space Systems | DETECTED | Auto-correlated by engine, groups battery + temp anomalies across fleet |
| Temperature Spike | NordSat IoT | Alert only | Anomaly on NordSat satellite, not yet escalated |
| Telemetry Dropout | Proba Space Systems | Alert only | Communication gap detected, under investigation |

## Tips for Presenters

- Keep the demo moving. Don't dwell on any single page for more than 3 minutes.
- Use the NIS2 deadline countdown as a hook. Every operator worries about regulatory deadlines.
- The anomaly baseline overlay is the most visually compelling feature. Make sure to pause on the telemetry chart.
- The correlated incident is a great "wow" moment. Practice the transition from individual alerts to the auto-grouped incident.
- Show the playbook execution log to demonstrate automation. The per-step timestamps prove the platform responds in seconds, not hours.
- Risk score comparison between Proba-EO-1 (72) and NordSat-Alpha (78) is a great conversation starter about security maturity.
- If the prospect asks about a feature that doesn't exist yet, note it and move on. Don't apologize.
- Adjust depth based on audience: investors care about market and differentiation, operators care about the detection engine and playbooks, CISOs care about compliance and risk scoring.
