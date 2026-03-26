# SpaceGuard Demo Script

A 15-minute walkthrough for demoing SpaceGuard to prospects and investors. This script assumes the full demo scenario has been loaded (`npx tsx scripts/full-demo.ts`).

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

Start here. The dashboard shows the operational posture at a glance.

**Walk through these elements:**

1. **Compliance score donut** (top left): "Proba Space Systems is at around 60% NIS2 compliance. The donut breaks down by status: compliant, partially compliant, non-compliant, and not yet assessed."

2. **Active incidents card**: "We have active security incidents right now. You can see severity breakdown and the count of open cases."

3. **NIS2 deadline countdown**: "These are regulatory deadlines from NIS2 Article 23. The platform tracks early warning (24 hours), incident notification (72 hours), and final report (30 days) deadlines automatically. Red means a deadline is approaching."

4. **Recent alerts table**: "The detection engine has flagged several anomalies in the last 48 hours. We'll investigate one of these shortly."

**Ask the prospect:** "How are you currently tracking your NIS2 compliance deadlines? Are you doing this manually?"

## Act 2: Asset Registry (2 minutes)

Navigate to **Assets** in the sidebar.

**Walk through:**

1. "Proba has 8 registered assets: LEO satellites, ground stations, a control center, network segments, and communication links."

2. Click on **Proba-EO-1** (the primary satellite): "Each asset has its type, criticality level, operational status, and compliance mappings. This satellite is marked CRITICAL because it's the primary revenue-generating payload."

3. Show the compliance mappings on the asset detail page: "You can see which NIS2 requirements apply to this specific asset and their current compliance status."

**Talking point:** "Most satellite operators we talk to are managing this in spreadsheets. SpaceGuard gives you a single source of truth that connects assets to requirements to evidence."

**Ask the prospect:** "How many assets are in your constellation? Do you track ground stations separately?"

## Act 3: Telemetry & Detection (3 minutes)

Navigate to **Telemetry** in the sidebar.

1. "These are live telemetry streams from Proba-EO-1. We're ingesting housekeeping data and communications telemetry via CCSDS-compatible endpoints."

2. Click on the **Proba-EO-1 HK** stream to see the detail view: "Here's the time-series data. You can see battery voltage, solar current, and onboard temperature plotted over time."

3. Point to the anomaly region: "Notice this area where battery voltage starts dropping. The detection engine picked this up automatically."

Navigate to **Alerts** in the sidebar.

4. "The detection engine generated alerts for five different anomaly scenarios. Let me show you the most critical one."

5. Click to expand the **Battery Cell Failure** alert (CRITICAL): "This alert was triggered when battery voltage on Proba-EO-1 dropped below the safe threshold. The system classified it using the SPARTA space-attack framework."

6. Show the Intelligence Context section: "SpaceGuard enriches every alert with SPARTA technique mappings, detection tips, and recommended mitigations. This turns a raw anomaly into actionable intelligence."

**Talking point:** "Traditional SOC tools don't understand space telemetry. They can't tell you that a battery voltage drop at this orbital position is anomalous versus expected during eclipse. SpaceGuard's detection rules are built specifically for space operations."

## Act 4: Alert to Incident (2 minutes)

From the expanded alert row:

1. Click **Create Incident**: "One click turns this alert into a tracked security incident. The system pre-fills the incident title, description, severity, and SPARTA classification from the alert."

2. You'll be redirected to the new incident detail page. Alternatively, navigate to **Incidents** and click the existing **Battery Cell Failure** incident.

3. Show the incident detail page: "Here's the full incident lifecycle view. You can see the timeline of events, linked alerts, and investigator notes."

4. Scroll to the **NIS2 Regulatory Reports** section: "The moment an incident is created, SpaceGuard starts the NIS2 Article 23 clock. Early warning must go to the CSIRT within 24 hours, incident notification within 72 hours, and the final report within 30 days."

5. Show the existing reports (for the battery incident, all three should be SUBMITTED): "For this resolved incident, all three reports were generated and submitted on time. The platform tracks submission status and deadlines."

**Ask the prospect:** "Have you had to file an NIS2 incident report yet? How long did it take to prepare?"

## Act 5: Compliance & Regulatory (2 minutes)

Navigate to **Compliance** in the sidebar.

1. "This is the NIS2 Article 21 compliance mapper. All 10 categories from Article 21(2) are covered: risk analysis, incident handling, business continuity, supply chain security, and more."

2. Click through a few categories: "Each requirement can be mapped at the organization level or per-asset. You set the status, add evidence descriptions, and track when it was last assessed."

3. Show a category with mixed statuses: "Proba is fully compliant on some requirements but has gaps in supply chain security and business continuity. These gaps show up on the dashboard."

Navigate to **Reports** in the sidebar.

4. Click **Download PDF**: "One click generates a comprehensive compliance status report. This is what you'd hand to an auditor or attach to a regulatory submission."

**Talking point:** "NIS2 applies to space operators classified as essential or important entities. The regulation is enforced starting October 2024. SpaceGuard maps every requirement to your specific assets and tracks compliance continuously, not just at audit time."

## Act 6: Threat Intelligence & Supply Chain (2 minutes)

Navigate to **SPARTA Navigator** (under Admin in the sidebar).

1. "SpaceGuard integrates the SPARTA framework, which is the space-specific equivalent of MITRE ATT&CK. It covers 11 tactics and 85+ techniques specific to satellite and ground station attacks."

2. Search for a technique: "You can search by technique name, tactic, or keyword. Each technique has detection guidance and recommended mitigations."

Navigate to **Supply Chain** in the sidebar.

3. "NIS2 requires supply chain risk management. SpaceGuard tracks your suppliers with risk scores, security certifications, and review schedules."

4. Point out a high-risk or overdue supplier: "This supplier hasn't been reviewed in over a year and has a high risk score. The platform flags these automatically."

**Ask the prospect:** "Who are your critical suppliers for ground segment operations? Do you track their security posture today?"

## Act 7: Audit Trail & Export (1 minute)

Navigate to **Audit** in the sidebar.

1. "Every action in SpaceGuard is logged: logins, asset changes, compliance updates, incident actions, report submissions. This is essential for NIS2 Article 21 accountability requirements."

2. Show the filters: "You can filter by date range, actor, action type, or resource. And export the full trail as CSV or PDF for auditors."

Navigate to the **Alerts** page, select a few alerts, and click **STIX Export**.

3. "For sharing threat intelligence with your national CSIRT or peer operators, SpaceGuard exports in STIX 2.1 format. This is the standard used by EU CSIRT networks."

## Closing (1 minute)

Return to the **Dashboard**.

"SpaceGuard gives you a single platform that connects your space assets to NIS2 compliance requirements, monitors telemetry for anomalies, manages incidents with regulatory deadline tracking, and produces audit-ready reports. Everything is purpose-built for space operations."

**Key differentiators to emphasize:**

- Space-native: understands CCSDS telemetry, orbital mechanics, and SPARTA threat framework
- NIS2-first: built around EU regulatory requirements, not retrofitted
- Operator-friendly: designed for 10-200 person teams without dedicated security staff
- Audit-ready: continuous compliance tracking, not point-in-time assessments
- Integrated: asset registry, detection, incidents, intel, and compliance in one platform

**Ask the prospect:** "What's your biggest pain point right now: compliance tracking, threat detection, or incident response? We can dive deeper into any of these areas."

## Demo Scenarios Available

The full demo data includes these pre-built scenarios:

| Scenario | Org | Status | Description |
|----------|-----|--------|-------------|
| Battery Cell Failure | Proba Space Systems | CLOSED | Resolved incident with all three NIS2 reports submitted |
| RF Signal Jamming | Proba Space Systems | INVESTIGATING | Active incident with early warning report, 18h until notification deadline |
| Unauthorized Access | Proba Space Systems | DETECTED | New incident just detected, 22h until early warning deadline |
| Temperature Spike | NordSat IoT | Alert only | Anomaly on NordSat satellite, not yet escalated |
| Telemetry Dropout | Proba Space Systems | Alert only | Communication gap detected, under investigation |

## Tips for Presenters

- Keep the demo moving. Don't dwell on any single page for more than 2 minutes.
- Use the NIS2 deadline countdown as a hook. Every operator worries about regulatory deadlines.
- The "Create Incident from Alert" flow is the most impressive. Practice it until it feels smooth.
- If the prospect asks about a feature that doesn't exist yet, note it and move on. Don't apologize.
- Adjust depth based on audience: investors care about market and differentiation, operators care about the detection engine and compliance mapping.
