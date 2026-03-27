import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { eq, and, ne, gte, lte, avg, isNotNull, sql, inArray, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import {
  organizations,
  complianceRequirements,
  complianceMappings,
  spaceAssets,
  threatIntel,
  suppliers,
} from "../db/schema/index";
import { incidents, incidentAlerts } from "../db/schema/incidents";
import { alerts } from "../db/schema/alerts";
import { auditLog } from "../db/schema/audit";
import type { DashboardResponse } from "@spaceguard/shared";
import { getDashboard } from "./compliance.service";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface OrgDetails {
  id: string;
  name: string;
  country: string;
  sector: string;
  nis2Classification: string;
  contactEmail: string;
}

interface MappingRow {
  requirementId: string;
  requirementTitle: string;
  requirementCategory: string;
  requirementArticle: string;
  evidenceGuidance: string;
  status: string;
  evidenceDescription: string | null;
  responsiblePerson: string | null;
  assetName: string | null;
}

interface AssetRow {
  name: string;
  assetType: string;
  status: string;
  criticality: string;
  description: string | null;
}

interface ReportData {
  org: OrgDetails;
  dashboard: DashboardResponse;
  mappings: MappingRow[];
  assets: AssetRow[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const C = {
  navyDark: "#060d1a",
  navyMid: "#0d1b2a",
  navyLight: "#162032",
  navyCard: "#1a2740",
  blue: "#3b82f6",
  blueLight: "#60a5fa",
  blueDim: "#1e3a5f",
  white: "#ffffff",
  slate: "#94a3b8",
  slateLight: "#cbd5e1",
  compliant: "#10b981",
  partial: "#f59e0b",
  nonCompliant: "#ef4444",
  notAssessed: "#6b7280",
} as const;

const STATUS_COLORS: Record<string, string> = {
  COMPLIANT: C.compliant,
  PARTIALLY_COMPLIANT: C.partial,
  NON_COMPLIANT: C.nonCompliant,
  NOT_ASSESSED: C.notAssessed,
};

const STATUS_LABELS: Record<string, string> = {
  COMPLIANT: "Compliant",
  PARTIALLY_COMPLIANT: "Partial",
  NON_COMPLIANT: "Non-Compliant",
  NOT_ASSESSED: "Not Assessed",
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  LEO_SATELLITE: "LEO Satellite",
  MEO_SATELLITE: "MEO Satellite",
  GEO_SATELLITE: "GEO Satellite",
  GROUND_STATION: "Ground Station",
  CONTROL_CENTER: "Control Center",
  UPLINK: "Uplink",
  DOWNLINK: "Downlink",
  INTER_SATELLITE_LINK: "ISL",
  DATA_CENTER: "Data Center",
  NETWORK_SEGMENT: "Network Segment",
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  // Pages
  titlePage: {
    backgroundColor: C.navyDark,
    flexDirection: "column",
    width: "100%",
    height: "100%",
  },
  contentPage: {
    backgroundColor: C.navyDark,
    padding: 40,
    paddingBottom: 55,
  },

  // Title page sections
  titleBanner: {
    backgroundColor: C.blue,
    paddingHorizontal: 48,
    paddingVertical: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleBrandName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    letterSpacing: 4,
  },
  titleBrandSub: {
    fontSize: 8,
    color: "#bfdbfe",
    letterSpacing: 2,
    marginTop: 3,
  },
  titleBannerRight: {
    fontSize: 8,
    color: "#bfdbfe",
    textAlign: "right",
  },
  titleBody: {
    flex: 1,
    paddingHorizontal: 48,
    paddingTop: 48,
    paddingBottom: 32,
  },
  titleHeading: {
    fontSize: 34,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 6,
    lineHeight: 1.15,
  },
  titleSubheading: {
    fontSize: 14,
    color: C.blueLight,
    marginBottom: 44,
  },
  titleOrgBox: {
    backgroundColor: C.navyCard,
    borderLeftWidth: 3,
    borderLeftColor: C.blue,
    borderLeftStyle: "solid",
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 28,
    borderRadius: 4,
  },
  titleOrgLabel: {
    fontSize: 7,
    color: C.slate,
    letterSpacing: 2,
    marginBottom: 5,
  },
  titleOrgName: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 3,
  },
  titleOrgMeta: {
    fontSize: 9,
    color: C.slateLight,
  },
  titleScoreRow: {
    flexDirection: "row",
    gap: 16,
  },
  titleScoreCard: {
    flex: 1,
    backgroundColor: C.navyCard,
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  titleScoreLabel: {
    fontSize: 7,
    color: C.slate,
    letterSpacing: 2,
    marginBottom: 8,
  },
  titleScoreValue: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    color: C.blue,
    marginBottom: 2,
  },
  titleScoreSub: {
    fontSize: 9,
    color: C.slateLight,
  },
  titleFooter: {
    backgroundColor: C.navyMid,
    paddingHorizontal: 48,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  titleFooterText: {
    fontSize: 8,
    color: C.slate,
  },

  // Page header
  pageHeader: {
    borderBottomWidth: 1,
    borderBottomColor: C.blueDim,
    borderBottomStyle: "solid",
    paddingBottom: 10,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  sectionBrand: {
    fontSize: 7,
    color: C.blue,
    letterSpacing: 2,
  },

  // Summary cards
  summaryGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: C.navyCard,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryLabel: {
    fontSize: 7,
    color: C.slate,
    letterSpacing: 1,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 2,
  },
  summarySub: {
    fontSize: 8,
    color: C.slateLight,
  },

  // Status bars
  statusSection: {
    backgroundColor: C.navyCard,
    borderRadius: 6,
    padding: 16,
    marginBottom: 20,
  },
  statusSectionTitle: {
    fontSize: 8,
    color: C.slate,
    letterSpacing: 1,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  statusDotWrap: {
    width: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabelText: {
    fontSize: 8,
    color: C.slateLight,
    width: 90,
  },
  statusBar: {
    flex: 1,
    height: 5,
    backgroundColor: C.navyMid,
    borderRadius: 3,
    marginRight: 12,
  },
  statusBarFill: {
    height: 5,
    borderRadius: 3,
  },
  statusCount: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    width: 24,
    textAlign: "right",
  },

  // Category table
  catTableHeader: {
    flexDirection: "row",
    backgroundColor: C.navyMid,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 2,
  },
  catRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.navyLight,
    borderBottomStyle: "solid",
    alignItems: "center",
  },
  catRowAlt: {
    backgroundColor: C.navyMid,
  },
  thCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.slate,
    letterSpacing: 1,
  },
  tdCell: {
    fontSize: 8,
    color: C.slateLight,
  },
  tdCellBold: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },

  // Score bar inline
  scoreBarWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: C.navyMid,
    borderRadius: 2,
  },
  scoreBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.blue,
  },
  scoreBarPct: {
    fontSize: 8,
    color: C.slateLight,
    width: 28,
    textAlign: "right",
  },

  // Status badge
  badge: {
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },

  // Compliance matrix table
  matrixHeader: {
    flexDirection: "row",
    backgroundColor: C.navyMid,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginBottom: 1,
  },
  matrixRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.navyLight,
    borderBottomStyle: "solid",
    minHeight: 22,
  },
  matrixRowAlt: {
    backgroundColor: C.navyMid,
  },
  matCol1: { width: "30%" },
  matCol2: { width: "18%" },
  matCol3: { width: "16%" },
  matCol4: { flex: 1 },

  // Gap items
  gapItem: {
    backgroundColor: C.navyCard,
    borderRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: C.nonCompliant,
  },
  gapItemNA: {
    borderLeftColor: C.notAssessed,
  },
  gapTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 3,
  },
  gapMeta: {
    fontSize: 7,
    color: C.slate,
    marginBottom: 5,
  },
  gapGuidance: {
    fontSize: 7,
    color: C.slateLight,
    lineHeight: 1.4,
  },

  // Asset table
  assetHeader: {
    flexDirection: "row",
    backgroundColor: C.navyMid,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginBottom: 1,
  },
  assetRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.navyLight,
    borderBottomStyle: "solid",
    alignItems: "center",
  },
  assetRowAlt: {
    backgroundColor: C.navyMid,
  },
  asCol1: { width: "28%" },
  asCol2: { width: "22%" },
  asCol3: { width: "18%" },
  asCol4: { width: "16%" },
  asCol5: { flex: 1 },

  // Page number
  pageNumber: {
    position: "absolute",
    bottom: 20,
    right: 40,
    fontSize: 8,
    color: C.slate,
  },
  pageNumberLeft: {
    position: "absolute",
    bottom: 20,
    left: 40,
    fontSize: 8,
    color: C.slate,
  },
  // Shared: navy card section box
  navyBox: {
    backgroundColor: C.navyLight,
    borderRadius: 6,
    padding: 14,
    marginBottom: 0,
  },
  navyBoxTitle: {
    fontSize: 8,
    color: C.slate,
    letterSpacing: 1.5,
    marginBottom: 10,
    fontFamily: "Helvetica-Bold",
  },
});

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.pageHeader}>
      <View>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={[s.thCell, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      <Text style={s.sectionBrand}>SPACEGUARD</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? C.notAssessed;
  const label = STATUS_LABELS[status] ?? status;
  return (
    <View style={[s.badge, { backgroundColor: color + "33" }]}>
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function ScoreColor(score: number): string {
  if (score >= 80) return C.compliant;
  if (score >= 50) return C.partial;
  if (score > 0) return C.nonCompliant;
  return C.notAssessed;
}

// ---------------------------------------------------------------------------
// PDF Pages
// ---------------------------------------------------------------------------

function TitlePage({ data }: { data: ReportData }) {
  const { org, dashboard, generatedAt } = data;
  const gapsCount =
    (dashboard.byStatus.NOT_ASSESSED ?? 0) +
    (dashboard.byStatus.NON_COMPLIANT ?? 0);

  return (
    <Page size="A4" style={s.titlePage}>
      {/* Blue top banner */}
      <View style={s.titleBanner}>
        <View>
          <Text style={s.titleBrandName}>SPACEGUARD</Text>
          <Text style={s.titleBrandSub}>CYBERSECURITY PLATFORM</Text>
        </View>
        <View>
          <Text style={s.titleBannerRight}>NIS2 / CRA / ENISA</Text>
          <Text style={s.titleBannerRight}>Compliance Assessment Report</Text>
        </View>
      </View>

      {/* Body */}
      <View style={s.titleBody}>
        <Text style={s.titleHeading}>Compliance{"\n"}Report</Text>
        <Text style={s.titleSubheading}>European Space Infrastructure</Text>

        {/* Org box */}
        <View style={s.titleOrgBox}>
          <Text style={s.titleOrgLabel}>ORGANIZATION</Text>
          <Text style={s.titleOrgName}>{org.name}</Text>
          <Text style={s.titleOrgMeta}>
            {org.country.toUpperCase()} | {org.sector.toUpperCase()} |{" "}
            {org.nis2Classification} ENTITY | {org.contactEmail}
          </Text>
        </View>

        {/* Score cards */}
        <View style={s.titleScoreRow}>
          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>OVERALL SCORE</Text>
            <Text
              style={[
                s.titleScoreValue,
                { color: ScoreColor(dashboard.overallScore) },
              ]}
            >
              {dashboard.overallScore}%
            </Text>
            <Text style={s.titleScoreSub}>NIS2 compliance posture</Text>
          </View>

          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>REQUIREMENTS</Text>
            <Text style={s.titleScoreValue}>
              {dashboard.byStatus.COMPLIANT}
            </Text>
            <Text style={s.titleScoreSub}>
              of {dashboard.totalRequirements} compliant
            </Text>
          </View>

          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>OPEN GAPS</Text>
            <Text
              style={[
                s.titleScoreValue,
                { color: gapsCount > 0 ? C.nonCompliant : C.compliant },
              ]}
            >
              {gapsCount}
            </Text>
            <Text style={s.titleScoreSub}>requiring attention</Text>
          </View>

          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>ASSETS</Text>
            <Text style={s.titleScoreValue}>
              {dashboard.assetsSummary.total}
            </Text>
            <Text style={s.titleScoreSub}>space assets registered</Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={s.titleFooter}>
        <Text style={s.titleFooterText}>Generated: {generatedAt}</Text>
        <Text style={s.titleFooterText}>
          CONFIDENTIAL | For internal compliance use only
        </Text>
        <Text style={s.titleFooterText}>SpaceGuard Platform v0.1</Text>
      </View>
    </Page>
  );
}

function ExecutiveSummaryPage({ data }: { data: ReportData }) {
  const { dashboard } = data;
  const total = dashboard.totalRequirements;

  const statusEntries: Array<{
    key: string;
    label: string;
    color: string;
    count: number;
  }> = [
    {
      key: "COMPLIANT",
      label: "Compliant",
      color: C.compliant,
      count: dashboard.byStatus.COMPLIANT ?? 0,
    },
    {
      key: "PARTIALLY_COMPLIANT",
      label: "Partially Compliant",
      color: C.partial,
      count: dashboard.byStatus.PARTIALLY_COMPLIANT ?? 0,
    },
    {
      key: "NON_COMPLIANT",
      label: "Non-Compliant",
      color: C.nonCompliant,
      count: dashboard.byStatus.NON_COMPLIANT ?? 0,
    },
    {
      key: "NOT_ASSESSED",
      label: "Not Assessed",
      color: C.notAssessed,
      count: dashboard.byStatus.NOT_ASSESSED ?? 0,
    },
  ];

  return (
    <Page size="A4" style={s.contentPage}>
      <PageHeader
        title="Executive Summary"
        subtitle="NIS2 Article 21 - Compliance Posture"
      />

      {/* Top stat cards */}
      <View style={s.summaryGrid}>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>OVERALL SCORE</Text>
          <Text
            style={[
              s.summaryValue,
              { color: ScoreColor(dashboard.overallScore) },
            ]}
          >
            {dashboard.overallScore}%
          </Text>
          <Text style={s.summarySub}>NIS2 compliance</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>COMPLIANT</Text>
          <Text style={[s.summaryValue, { color: C.compliant }]}>
            {dashboard.byStatus.COMPLIANT}
          </Text>
          <Text style={s.summarySub}>requirements met</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>NON-COMPLIANT</Text>
          <Text
            style={[
              s.summaryValue,
              {
                color:
                  (dashboard.byStatus.NON_COMPLIANT ?? 0) > 0
                    ? C.nonCompliant
                    : C.compliant,
              },
            ]}
          >
            {dashboard.byStatus.NON_COMPLIANT}
          </Text>
          <Text style={s.summarySub}>critical gaps</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>NOT ASSESSED</Text>
          <Text
            style={[
              s.summaryValue,
              {
                color:
                  (dashboard.byStatus.NOT_ASSESSED ?? 0) > 0
                    ? C.partial
                    : C.compliant,
              },
            ]}
          >
            {dashboard.byStatus.NOT_ASSESSED}
          </Text>
          <Text style={s.summarySub}>pending review</Text>
        </View>
      </View>

      {/* Status breakdown */}
      <View style={s.statusSection}>
        <Text style={s.statusSectionTitle}>STATUS BREAKDOWN</Text>
        {statusEntries.map((entry) => {
          const pct = total > 0 ? entry.count / total : 0;
          return (
            <View style={s.statusRow} key={entry.key}>
              <View style={s.statusDotWrap}>
                <View style={[s.statusDot, { backgroundColor: entry.color }]} />
              </View>
              <Text style={s.statusLabelText}>{entry.label}</Text>
              <View style={s.statusBar}>
                <View
                  style={[
                    s.statusBarFill,
                    {
                      width: `${Math.round(pct * 100)}%`,
                      backgroundColor: entry.color,
                    },
                  ]}
                />
              </View>
              <Text style={s.statusCount}>{entry.count}</Text>
            </View>
          );
        })}
      </View>

      {/* Category breakdown */}
      <PageHeader title="By Category" subtitle="Scores per NIS2 Article 21 domain" />
      <View>
        <View style={s.catTableHeader}>
          <Text style={[s.thCell, { width: "45%" }]}>CATEGORY</Text>
          <Text style={[s.thCell, { width: "15%" }]}>SCORE</Text>
          <Text style={[s.thCell, { flex: 1 }]}>PROGRESS</Text>
          <Text style={[s.thCell, { width: "12%" }]}>REQS</Text>
        </View>
        {dashboard.byCategory.map((cat, i) => (
          <View
            style={[s.catRow, i % 2 === 1 ? s.catRowAlt : {}]}
            key={cat.category}
          >
            <Text style={[s.tdCellBold, { width: "45%" }]}>{cat.category}</Text>
            <Text
              style={[
                s.tdCellBold,
                { width: "15%", color: ScoreColor(cat.score) },
              ]}
            >
              {cat.score}%
            </Text>
            <View style={[s.scoreBarWrap, { flex: 1 }]}>
              <View style={s.scoreBarTrack}>
                <View
                  style={[
                    s.scoreBarFill,
                    {
                      width: `${cat.score}%`,
                      backgroundColor: ScoreColor(cat.score),
                    },
                  ]}
                />
              </View>
            </View>
            <Text style={[s.tdCell, { width: "12%", textAlign: "right" }]}>
              {cat.compliant}/{cat.total}
            </Text>
          </View>
        ))}
      </View>

      <Text
        style={s.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </Page>
  );
}

function ComplianceMatrixPage({ data }: { data: ReportData }) {
  const { mappings } = data;

  // De-duplicate: one row per requirement (use the "worst" mapping if multiple)
  const reqMap = new Map<
    string,
    {
      title: string;
      category: string;
      article: string;
      status: string;
      evidence: string | null;
    }
  >();

  const STATUS_PRIORITY: Record<string, number> = {
    NOT_ASSESSED: 1,
    NON_COMPLIANT: 2,
    PARTIALLY_COMPLIANT: 3,
    COMPLIANT: 4,
  };

  for (const m of mappings) {
    const existing = reqMap.get(m.requirementId);
    if (
      !existing ||
      STATUS_PRIORITY[m.status] < STATUS_PRIORITY[existing.status]
    ) {
      reqMap.set(m.requirementId, {
        title: m.requirementTitle,
        category: m.requirementCategory,
        article: m.requirementArticle,
        status: m.status,
        evidence: m.evidenceDescription ?? existing?.evidence ?? null,
      });
    }
  }

  const rows = Array.from(reqMap.values()).sort((a, b) =>
    a.category.localeCompare(b.category)
  );

  return (
    <Page size="A4" style={s.contentPage}>
      <PageHeader
        title="Compliance Matrix"
        subtitle="All NIS2 Article 21 requirements and current status"
      />

      <View style={s.matrixHeader}>
        <Text style={[s.thCell, s.matCol1]}>REQUIREMENT</Text>
        <Text style={[s.thCell, s.matCol2]}>CATEGORY</Text>
        <Text style={[s.thCell, s.matCol3]}>STATUS</Text>
        <Text style={[s.thCell, s.matCol4]}>EVIDENCE / NOTES</Text>
      </View>

      {rows.map((row, i) => (
        <View
          style={[s.matrixRow, i % 2 === 1 ? s.matrixRowAlt : {}]}
          key={`${row.title}-${i}`}
          wrap={false}
        >
          <View style={s.matCol1}>
            <Text style={[s.tdCellBold, { marginBottom: 2 }]}>
              {row.title}
            </Text>
            <Text style={[s.tdCell, { fontSize: 7, color: C.slate }]}>
              {row.article}
            </Text>
          </View>
          <Text style={[s.tdCell, s.matCol2]}>{row.category}</Text>
          <View style={s.matCol3}>
            <StatusBadge status={row.status} />
          </View>
          <Text style={[s.tdCell, s.matCol4]}>
            {row.evidence ?? "No evidence recorded"}
          </Text>
        </View>
      ))}

      <Text
        style={s.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </Page>
  );
}

function GapAnalysisPage({ data }: { data: ReportData }) {
  const { dashboard, mappings } = data;

  // Map requirementId to evidence guidance
  const guidanceMap = new Map<string, string>();
  for (const m of mappings) {
    if (!guidanceMap.has(m.requirementId)) {
      guidanceMap.set(m.requirementId, m.evidenceGuidance);
    }
  }

  const gaps = dashboard.gaps;
  const nonCompliant = gaps.filter((g) => g.status === "NON_COMPLIANT");
  const notAssessed = gaps.filter((g) => g.status === "NOT_ASSESSED");

  return (
    <Page size="A4" style={s.contentPage}>
      <PageHeader
        title="Gap Analysis"
        subtitle={`${gaps.length} requirements require attention`}
      />

      {nonCompliant.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text
            style={[
              s.statusSectionTitle,
              { color: C.nonCompliant, marginBottom: 8 },
            ]}
          >
            NON-COMPLIANT ({nonCompliant.length})
          </Text>
          {nonCompliant.map((gap) => (
            <View style={s.gapItem} key={gap.requirementId} wrap={false}>
              <Text style={s.gapTitle}>{gap.title}</Text>
              <Text style={s.gapMeta}>
                {gap.category}
                {gap.affectedAssets.length > 0
                  ? ` | Assets: ${gap.affectedAssets.join(", ")}`
                  : ""}
              </Text>
              <Text style={s.gapGuidance}>
                Evidence guidance:{" "}
                {guidanceMap.get(gap.requirementId) ?? "See NIS2 Article 21"}
              </Text>
            </View>
          ))}
        </View>
      )}

      {notAssessed.length > 0 && (
        <View>
          <Text
            style={[
              s.statusSectionTitle,
              { color: C.notAssessed, marginBottom: 8 },
            ]}
          >
            NOT ASSESSED ({notAssessed.length})
          </Text>
          {notAssessed.map((gap) => (
            <View
              style={[s.gapItem, s.gapItemNA]}
              key={gap.requirementId}
              wrap={false}
            >
              <Text style={s.gapTitle}>{gap.title}</Text>
              <Text style={s.gapMeta}>{gap.category}</Text>
              <Text style={s.gapGuidance}>
                Evidence guidance:{" "}
                {guidanceMap.get(gap.requirementId) ?? "See NIS2 Article 21"}
              </Text>
            </View>
          ))}
        </View>
      )}

      {gaps.length === 0 && (
        <View style={[s.summaryCard, { marginTop: 20 }]}>
          <Text style={[s.tdCellBold, { color: C.compliant, fontSize: 12 }]}>
            No gaps identified
          </Text>
          <Text style={[s.tdCell, { marginTop: 6 }]}>
            All NIS2 requirements are marked as compliant.
          </Text>
        </View>
      )}

      <Text
        style={s.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </Page>
  );
}

function AssetInventoryPage({ data }: { data: ReportData }) {
  const { assets, dashboard } = data;

  const CRIT_COLORS: Record<string, string> = {
    CRITICAL: C.nonCompliant,
    HIGH: C.partial,
    MEDIUM: C.blue,
    LOW: C.slate,
  };

  const STATUS_ASSET_COLORS: Record<string, string> = {
    OPERATIONAL: C.compliant,
    DEGRADED: C.partial,
    MAINTENANCE: C.notAssessed,
    DECOMMISSIONED: C.slate,
  };

  return (
    <Page size="A4" style={s.contentPage}>
      <PageHeader
        title="Asset Inventory"
        subtitle={`${assets.length} space assets registered`}
      />

      {/* Type and criticality summary */}
      <View style={s.summaryGrid}>
        <View style={[s.summaryCard, { flex: 1 }]}>
          <Text style={s.summaryLabel}>TOTAL ASSETS</Text>
          <Text style={s.summaryValue}>{dashboard.assetsSummary.total}</Text>
          <Text style={s.summarySub}>registered in platform</Text>
        </View>
        {Object.entries(dashboard.assetsSummary.byCriticality)
          .sort((a, b) => {
            const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
            return order.indexOf(a[0]) - order.indexOf(b[0]);
          })
          .slice(0, 3)
          .map(([crit, cnt]) => (
            <View key={crit} style={[s.summaryCard, { flex: 1 }]}>
              <Text style={s.summaryLabel}>{crit}</Text>
              <Text style={[s.summaryValue, { color: CRIT_COLORS[crit] ?? C.blue }]}>
                {cnt}
              </Text>
              <Text style={s.summarySub}>assets</Text>
            </View>
          ))}
      </View>

      {/* Asset table */}
      {assets.length > 0 ? (
        <View>
          <View style={s.assetHeader}>
            <Text style={[s.thCell, s.asCol1]}>ASSET NAME</Text>
            <Text style={[s.thCell, s.asCol2]}>TYPE</Text>
            <Text style={[s.thCell, s.asCol3]}>STATUS</Text>
            <Text style={[s.thCell, s.asCol4]}>CRITICALITY</Text>
            <Text style={[s.thCell, s.asCol5]}>DESCRIPTION</Text>
          </View>
          {assets.map((asset, i) => (
            <View
              style={[s.assetRow, i % 2 === 1 ? s.assetRowAlt : {}]}
              key={`${asset.name}-${i}`}
              wrap={false}
            >
              <Text style={[s.tdCellBold, s.asCol1]}>{asset.name}</Text>
              <Text style={[s.tdCell, s.asCol2]}>
                {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
              </Text>
              <View style={[s.asCol3, { flexDirection: "row" }]}>
                <View
                  style={[
                    s.badge,
                    {
                      backgroundColor:
                        (STATUS_ASSET_COLORS[asset.status] ?? C.slate) + "33",
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.badgeText,
                      {
                        color:
                          STATUS_ASSET_COLORS[asset.status] ?? C.slate,
                      },
                    ]}
                  >
                    {asset.status}
                  </Text>
                </View>
              </View>
              <View style={[s.asCol4, { flexDirection: "row" }]}>
                <View
                  style={[
                    s.badge,
                    {
                      backgroundColor:
                        (CRIT_COLORS[asset.criticality] ?? C.slate) + "33",
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.badgeText,
                      {
                        color: CRIT_COLORS[asset.criticality] ?? C.slate,
                      },
                    ]}
                  >
                    {asset.criticality}
                  </Text>
                </View>
              </View>
              <Text style={[s.tdCell, s.asCol5]}>
                {asset.description ?? "-"}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={[s.summaryCard, { marginTop: 20 }]}>
          <Text style={s.tdCell}>
            No assets registered yet. Add assets in the SpaceGuard platform to
            populate this inventory.
          </Text>
        </View>
      )}

      <Text
        style={s.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Regulation Breakdown Page (NIS2 / CRA / ENISA per-regulation scores)
// ---------------------------------------------------------------------------

const REG_LABELS: Record<string, string> = {
  NIS2: "NIS2 Directive",
  CRA: "Cyber Resilience Act",
  ENISA_SPACE: "ENISA Space Threat Landscape",
};

const REG_DESCRIPTIONS: Record<string, string> = {
  NIS2: "EU directive on measures for a high common level of cybersecurity across the Union. Requires essential and important entities to implement risk management and incident reporting.",
  CRA: "EU regulation establishing cybersecurity requirements for products with digital elements. Focuses on secure-by-design development, vulnerability handling, and security update obligations.",
  ENISA_SPACE: "ENISA guidelines for cybersecurity of space systems. Provides sector-specific controls mapped to the SPARTA threat framework.",
};

function RegulationBreakdownPage({ data }: { data: ReportData }) {
  const byRegulation = data.dashboard?.byRegulation ?? [];

  if (byRegulation.length <= 1) return null;

  return (
    <Page size="A4" style={s.contentPage}>
      <PageHeader
        title="Regulation Breakdown"
        subtitle="Compliance posture per regulatory framework"
      />

      <View style={{ marginTop: 16 }}>
        {byRegulation.map((reg) => {
          const pct = reg.total > 0 ? Math.round((reg.compliant / reg.total) * 100) : 0;
          const barColor =
            pct >= 70 ? C.compliant : pct >= 40 ? C.partial : C.nonCompliant;

          return (
            <View
              key={reg.regulation}
              style={{
                backgroundColor: C.navyCard,
                borderRadius: 6,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: C.white }}>
                  {REG_LABELS[reg.regulation] ?? reg.regulation}
                </Text>
                <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: barColor }}>
                  {reg.score}%
                </Text>
              </View>

              <Text style={{ fontSize: 8, color: C.slate, marginBottom: 8, lineHeight: 1.4 }}>
                {REG_DESCRIPTIONS[reg.regulation] ?? ""}
              </Text>

              {/* Progress bar */}
              <View style={{ height: 8, backgroundColor: C.navyDark, borderRadius: 4 }}>
                <View
                  style={{
                    height: 8,
                    width: `${pct}%`,
                    backgroundColor: barColor,
                    borderRadius: 4,
                  }}
                />
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ fontSize: 8, color: C.slate }}>
                  {reg.compliant} of {reg.total} requirements compliant
                </Text>
                <Text style={{ fontSize: 8, color: C.slate }}>
                  {reg.total - reg.compliant} remaining
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <Text
        style={s.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Root PDF document
// ---------------------------------------------------------------------------

function ComplianceReport({ data }: { data: ReportData }) {
  return (
    <Document
      title={`Compliance Report - ${data.org.name}`}
      author="SpaceGuard Platform"
      subject="NIS2, CRA & ENISA Compliance Assessment"
      creator="SpaceGuard"
      producer="SpaceGuard v0.1"
    >
      <TitlePage data={data} />
      <ExecutiveSummaryPage data={data} />
      <RegulationBreakdownPage data={data} />
      <ComplianceMatrixPage data={data} />
      <GapAnalysisPage data={data} />
      <AssetInventoryPage data={data} />
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateCompliancePdf(
  organizationId: string
): Promise<Buffer> {
  // 1. Verify organization exists and fetch details
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      country: organizations.country,
      sector: organizations.sector,
      nis2Classification: organizations.nis2Classification,
      contactEmail: organizations.contactEmail,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    throw new HTTPException(404, {
      message: `Organization ${organizationId} not found`,
    });
  }

  // 2. Fetch dashboard data (handles auto-seeding of mappings)
  const dashboard = await getDashboard(organizationId);

  // 3. Fetch full mappings joined with requirements and assets for compliance matrix
  const rawMappings = await db
    .select({
      requirementId: complianceMappings.requirementId,
      status: complianceMappings.status,
      evidenceDescription: complianceMappings.evidenceDescription,
      responsiblePerson: complianceMappings.responsiblePerson,
      requirementTitle: complianceRequirements.title,
      requirementCategory: complianceRequirements.category,
      requirementArticle: complianceRequirements.articleReference,
      evidenceGuidance: complianceRequirements.evidenceGuidance,
      assetName: spaceAssets.name,
    })
    .from(complianceMappings)
    .leftJoin(
      complianceRequirements,
      eq(complianceMappings.requirementId, complianceRequirements.id)
    )
    .leftJoin(spaceAssets, eq(complianceMappings.assetId, spaceAssets.id))
    .where(eq(complianceMappings.organizationId, organizationId))
    .orderBy(complianceRequirements.category, complianceRequirements.title);

  const mappings: MappingRow[] = rawMappings
    .filter(
      (m): m is typeof m & {
        requirementTitle: string;
        requirementCategory: string;
        requirementArticle: string;
        evidenceGuidance: string;
      } =>
        m.requirementTitle !== null &&
        m.requirementCategory !== null &&
        m.requirementArticle !== null &&
        m.evidenceGuidance !== null
    )
    .map((m) => ({
      requirementId: m.requirementId,
      requirementTitle: m.requirementTitle,
      requirementCategory: m.requirementCategory,
      requirementArticle: m.requirementArticle,
      evidenceGuidance: m.evidenceGuidance,
      status: m.status,
      evidenceDescription: m.evidenceDescription,
      responsiblePerson: m.responsiblePerson,
      assetName: m.assetName,
    }));

  // 4. Fetch assets (all except DECOMMISSIONED)
  const rawAssets = await db
    .select({
      name: spaceAssets.name,
      assetType: spaceAssets.assetType,
      status: spaceAssets.status,
      criticality: spaceAssets.criticality,
      description: spaceAssets.description,
    })
    .from(spaceAssets)
    .where(
      and(
        eq(spaceAssets.organizationId, organizationId),
        ne(spaceAssets.status, "DECOMMISSIONED")
      )
    )
    .orderBy(spaceAssets.criticality, spaceAssets.name);

  const assets: AssetRow[] = rawAssets;

  const reportData: ReportData = {
    org: {
      id: org.id,
      name: org.name,
      country: org.country,
      sector: org.sector,
      nis2Classification: org.nis2Classification,
      contactEmail: org.contactEmail,
    },
    dashboard,
    mappings,
    assets,
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
  };

  // 5. Render PDF to buffer
  const buffer = await renderToBuffer(<ComplianceReport data={reportData} />);
  return buffer;
}

// =============================================================================
// INCIDENT SUMMARY REPORT
// =============================================================================

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface IncidentSummaryRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  detectedAt: string | null;
  resolvedAt: string | null;
  affectedAssetCount: number;
  spartaTechniqueNames: string[];
  description: string;
}

interface MonthlyBucket {
  label: string; // e.g. "Jan 2026"
  count: number;
}

interface IncidentSummaryData {
  org: OrgDetails;
  dateRange: { from: string; to: string };
  generatedAt: string;
  stats: {
    total: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    openCount: number;
    closedCount: number;
    mttdMinutes: number | null;
    mttrMinutes: number | null;
  };
  incidents: IncidentSummaryRow[];
  trend: MonthlyBucket[];
  topTechniques: { name: string; count: number }[];
  topAssetTypes: { type: string; label: string; count: number }[];
  alertStats: {
    totalLinkedAlerts: number;
    topRules: { ruleId: string; count: number }[];
  };
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH:     "#f97316",
  MEDIUM:   "#f59e0b",
  LOW:      "#6b7280",
};

const STATUS_BADGE: Record<string, string> = {
  CLOSED:       "#10b981",
  FALSE_POSITIVE: "#6b7280",
  DETECTED:     "#3b82f6",
  TRIAGING:     "#8b5cf6",
  INVESTIGATING: "#f59e0b",
  CONTAINING:   "#f97316",
  ERADICATING:  "#ef4444",
  RECOVERING:   "#06b6d4",
};

function fmtMinutes(minutes: number | null): string {
  if (minutes === null) return "N/A";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "N/A";
  return iso.slice(0, 10);
}

function isOpen(status: string): boolean {
  return !["CLOSED", "FALSE_POSITIVE"].includes(status);
}

function buildRecommendations(data: IncidentSummaryData): string[] {
  const recs: string[] = [];
  const { stats, topTechniques, topAssetTypes } = data;

  // MTTD-based recommendation
  if (stats.mttdMinutes !== null && stats.mttdMinutes > 120) {
    recs.push(
      `Mean time to detect is ${fmtMinutes(stats.mttdMinutes)}, which exceeds the recommended 2-hour threshold. ` +
      `Review telemetry polling intervals and consider enabling automated anomaly detection rules for faster triage.`
    );
  }

  // MTTR-based recommendation
  if (stats.mttrMinutes !== null && stats.mttrMinutes > 480) {
    recs.push(
      `Mean time to respond is ${fmtMinutes(stats.mttrMinutes)}. Establish documented incident response runbooks for your ` +
      `most common threat categories to accelerate containment and eradication steps.`
    );
  }

  // Repeated SPARTA technique
  if (topTechniques.length > 0 && topTechniques[0].count >= 2) {
    const t = topTechniques[0];
    recs.push(
      `"${t.name}" was the most frequently observed attack technique (${t.count} incidents). ` +
      `Review the SPARTA countermeasures mapped to this technique in the Threat Intelligence module and ` +
      `prioritise their implementation to reduce re-occurrence.`
    );
  }

  // Repeatedly affected asset type
  if (topAssetTypes.length > 0 && topAssetTypes[0].count >= 2) {
    const a = topAssetTypes[0];
    recs.push(
      `${a.label} assets were involved in ${a.count} incidents - more than any other asset category. ` +
      `Flag these assets for an enhanced security review and consider additional monitoring or segmentation controls.`
    );
  }

  // High CRITICAL/HIGH ratio
  const critHigh = (stats.bySeverity["CRITICAL"] ?? 0) + (stats.bySeverity["HIGH"] ?? 0);
  if (stats.total > 0 && critHigh / stats.total >= 0.5) {
    recs.push(
      `${critHigh} of ${stats.total} incidents were rated HIGH or CRITICAL severity. ` +
      `Ensure NIS2 Article 23 notifications were filed within the required 24/72-hour windows for all significant incidents.`
    );
  }

  // Open incidents still unresolved
  if (stats.openCount > 0) {
    recs.push(
      `${stats.openCount} incident${stats.openCount > 1 ? "s remain" : " remains"} unresolved. ` +
      `Prioritise closure or escalation of open incidents to maintain accurate NIS2 reporting status.`
    );
  }

  if (recs.length === 0) {
    recs.push(
      `No significant patterns identified in this period. Continue regular NIS2 Article 21 control reviews ` +
      `and ensure detection rules are kept current with the latest SPARTA matrix updates.`
    );
  }

  return recs;
}

// ---------------------------------------------------------------------------
// PDF component
// ---------------------------------------------------------------------------

function IncidentSummaryReport({ data }: { data: IncidentSummaryData }) {
  const { org, dateRange, generatedAt, stats, incidents: incList, trend, topTechniques, topAssetTypes, alertStats, recommendations } = data;

  const pageStyle = { ...s.contentPage };

  // Title page
  const TitlePage = () => (
    <Page size="A4" style={s.titlePage}>
      {/* Top banner */}
      <View style={s.titleBanner}>
        <View>
          <Text style={s.titleBrandName}>SPACEGUARD</Text>
          <Text style={s.titleBrandSub}>CYBERSECURITY PLATFORM</Text>
        </View>
        <View>
          <Text style={[s.titleBannerRight, { textAlign: "right" }]}>
            INCIDENT SUMMARY REPORT
          </Text>
          <Text style={[s.titleBannerRight, { marginTop: 3 }]}>
            {dateRange.from} to {dateRange.to}
          </Text>
        </View>
      </View>

      {/* Body */}
      <View style={s.titleBody}>
        <Text style={s.titleHeading}>Incident{"\n"}Summary Report</Text>
        <Text style={s.titleSubheading}>
          Operational Cybersecurity Platform for European Space Infrastructure
        </Text>

        {/* Org box */}
        <View style={s.titleOrgBox}>
          <Text style={s.titleOrgLabel}>ORGANISATION</Text>
          <Text style={s.titleOrgName}>{org.name}</Text>
          <Text style={s.titleOrgMeta}>
            {org.country.toUpperCase()} · {org.nis2Classification} Entity · {org.sector.toUpperCase()}
          </Text>
        </View>

        {/* Score row - key stats */}
        <View style={s.titleScoreRow}>
          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>TOTAL INCIDENTS</Text>
            <Text style={[s.titleScoreValue, { color: stats.total > 0 ? C.nonCompliant : C.compliant }]}>
              {stats.total}
            </Text>
            <Text style={s.titleScoreSub}>in period</Text>
          </View>
          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>OPEN</Text>
            <Text style={[s.titleScoreValue, { color: stats.openCount > 0 ? C.partial : C.compliant }]}>
              {stats.openCount}
            </Text>
            <Text style={s.titleScoreSub}>unresolved</Text>
          </View>
          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>AVG MTTD</Text>
            <Text style={[s.titleScoreValue, { color: C.blue, fontSize: 28 }]}>
              {fmtMinutes(stats.mttdMinutes)}
            </Text>
            <Text style={s.titleScoreSub}>mean detection time</Text>
          </View>
          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>AVG MTTR</Text>
            <Text style={[s.titleScoreValue, { color: C.blue, fontSize: 28 }]}>
              {fmtMinutes(stats.mttrMinutes)}
            </Text>
            <Text style={s.titleScoreSub}>mean response time</Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={s.titleFooter}>
        <Text style={s.titleFooterText}>Generated {generatedAt}</Text>
        <Text style={s.titleFooterText}>CONFIDENTIAL - INTERNAL USE ONLY</Text>
      </View>
    </Page>
  );

  // Reusable page header
  const PageHeader = ({ title }: { title: string }) => (
    <View style={s.pageHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.sectionBrand}>SPACEGUARD · INCIDENT REPORT</Text>
    </View>
  );

  // Stat cell helper
  const StatCell = ({ label, value, color }: { label: string; value: string | number; color?: string }) => (
    <View style={[s.summaryCard, { borderRadius: 6, paddingHorizontal: 14, paddingVertical: 12 }]}>
      <Text style={[s.summaryLabel, { fontSize: 7, letterSpacing: 1.5, marginBottom: 6 }]}>{label}</Text>
      <Text style={[s.summaryValue, color ? { color } : {}]}>{String(value)}</Text>
    </View>
  );

  // Severity bar (visual indicator)
  const SeverityBar = ({ severity, count, total }: { severity: string; count: number; total: number }) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const color = SEVERITY_COLORS[severity] ?? C.slate;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <View style={{ width: 56 }}>
          <Text style={{ fontSize: 8, color: C.slateLight }}>{severity}</Text>
        </View>
        <View style={{ flex: 1, height: 8, backgroundColor: C.navyCard, borderRadius: 4, overflow: "hidden" }}>
          <View style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: 4 }} />
        </View>
        <View style={{ width: 28, alignItems: "flex-end" }}>
          <Text style={{ fontSize: 8, color: C.slateLight }}>{count}</Text>
        </View>
      </View>
    );
  };

  // Executive Summary page
  const ExecSummaryPage = () => (
    <Page size="A4" style={pageStyle}>
      <PageHeader title="Executive Summary" />

      {/* Key metrics row */}
      <View style={s.summaryGrid}>
        <StatCell label="TOTAL" value={stats.total} color={stats.total > 0 ? C.nonCompliant : C.compliant} />
        <StatCell label="OPEN" value={stats.openCount} color={stats.openCount > 0 ? C.partial : C.compliant} />
        <StatCell label="CLOSED" value={stats.closedCount} color={C.compliant} />
        <StatCell label="AVG MTTD" value={fmtMinutes(stats.mttdMinutes)} color={C.blue} />
        <StatCell label="AVG MTTR" value={fmtMinutes(stats.mttrMinutes)} color={C.blue} />
      </View>

      {/* Severity breakdown */}
      <View style={[s.navyBox, { marginBottom: 16 }]}>
        <Text style={s.navyBoxTitle}>Breakdown by Severity</Text>
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => (
          <SeverityBar key={sev} severity={sev} count={stats.bySeverity[sev] ?? 0} total={stats.total} />
        ))}
      </View>

      {/* Status breakdown */}
      <View style={s.navyBox}>
        <Text style={s.navyBoxTitle}>Breakdown by Status</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <View key={status} style={{
              flexDirection: "row", alignItems: "center", gap: 5,
              backgroundColor: C.navyCard, borderRadius: 4,
              paddingHorizontal: 10, paddingVertical: 6,
            }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: STATUS_BADGE[status] ?? C.slate }} />
              <Text style={{ fontSize: 8, color: C.slateLight }}>{status.replace(/_/g, " ")}</Text>
              <Text style={{ fontSize: 8, color: C.white, fontFamily: "Helvetica-Bold" }}>{count as number}</Text>
            </View>
          ))}
        </View>
      </View>
    </Page>
  );

  // Incident Timeline page(s)
  const TimelinePage = () => (
    <Page size="A4" style={pageStyle}>
      <PageHeader title="Incident Timeline" />

      {incList.length === 0 ? (
        <View style={s.navyBox}>
          <Text style={{ fontSize: 10, color: C.slate, textAlign: "center", paddingVertical: 20 }}>
            No incidents recorded in this period.
          </Text>
        </View>
      ) : (
        incList.map((inc, idx) => {
          const sevColor = SEVERITY_COLORS[inc.severity] ?? C.slate;
          const statusColor = STATUS_BADGE[inc.status] ?? C.slate;
          return (
            <View key={inc.id} style={{
              marginBottom: 8,
              backgroundColor: C.navyLight,
              borderRadius: 5,
              padding: 12,
              borderLeftWidth: 3,
              borderLeftColor: sevColor,
              borderLeftStyle: "solid",
            }}>
              {/* Row 1: date + severity + status */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 8, color: C.slate, width: 70 }}>{fmtDateShort(inc.detectedAt ?? null)}</Text>
                <View style={{
                  paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
                  backgroundColor: sevColor + "33",
                }}>
                  <Text style={{ fontSize: 7, color: sevColor, fontFamily: "Helvetica-Bold" }}>{inc.severity}</Text>
                </View>
                <View style={{
                  paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
                  backgroundColor: statusColor + "22",
                }}>
                  <Text style={{ fontSize: 7, color: statusColor }}>{inc.status.replace(/_/g, " ")}</Text>
                </View>
                {inc.affectedAssetCount > 0 && (
                  <Text style={{ fontSize: 7, color: C.slate }}>{inc.affectedAssetCount} asset{inc.affectedAssetCount > 1 ? "s" : ""}</Text>
                )}
              </View>
              {/* Row 2: title */}
              <Text style={{ fontSize: 10, color: C.white, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>
                {String(idx + 1).padStart(2, "0")}. {inc.title}
              </Text>
              {/* Row 3: description (truncated) */}
              {inc.description && (
                <Text style={{ fontSize: 8, color: C.slate, lineHeight: 1.4, marginBottom: 4 }}>
                  {inc.description.slice(0, 200)}{inc.description.length > 200 ? "..." : ""}
                </Text>
              )}
              {/* Row 4: SPARTA techniques */}
              {inc.spartaTechniqueNames.length > 0 && (
                <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
                  {inc.spartaTechniqueNames.map((tech) => (
                    <View key={tech} style={{
                      paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
                      backgroundColor: C.blueDim,
                    }}>
                      <Text style={{ fontSize: 7, color: C.blueLight }}>{tech}</Text>
                    </View>
                  ))}
                </View>
              )}
              {/* Row 5: resolution date */}
              {inc.resolvedAt && (
                <Text style={{ fontSize: 7, color: C.slate, marginTop: 4 }}>
                  Resolved: {fmtDateShort(inc.resolvedAt)}
                </Text>
              )}
            </View>
          );
        })
      )}
    </Page>
  );

  // Trend Analysis page
  const TrendPage = () => (
    <Page size="A4" style={pageStyle}>
      <PageHeader title="Trend Analysis" />

      {/* Monthly trend */}
      {trend.length > 1 && (
        <View style={[s.navyBox, { marginBottom: 16 }]}>
          <Text style={s.navyBoxTitle}>Incidents per Month</Text>
          {trend.map((bucket) => {
            const maxCount = Math.max(...trend.map((b) => b.count), 1);
            const pct = Math.round((bucket.count / maxCount) * 100);
            return (
              <View key={bucket.label} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <View style={{ width: 60 }}>
                  <Text style={{ fontSize: 8, color: C.slateLight }}>{bucket.label}</Text>
                </View>
                <View style={{ flex: 1, height: 10, backgroundColor: C.navyCard, borderRadius: 4, overflow: "hidden" }}>
                  <View style={{ width: `${pct}%`, height: "100%", backgroundColor: C.blue, borderRadius: 4 }} />
                </View>
                <View style={{ width: 20, alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 8, color: C.white }}>{bucket.count}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Top SPARTA techniques */}
      <View style={[s.navyBox, { marginBottom: 16 }]}>
        <Text style={s.navyBoxTitle}>Top SPARTA Techniques</Text>
        {topTechniques.length === 0 ? (
          <Text style={{ fontSize: 9, color: C.slate }}>No SPARTA techniques recorded in this period.</Text>
        ) : (
          topTechniques.slice(0, 5).map((t, i) => (
            <View key={t.name} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 8, color: C.slate, width: 14 }}>{i + 1}.</Text>
              <Text style={{ fontSize: 9, color: C.slateLight, flex: 1 }}>{t.name}</Text>
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, backgroundColor: C.blueDim }}>
                <Text style={{ fontSize: 8, color: C.blueLight, fontFamily: "Helvetica-Bold" }}>{t.count}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Top affected asset types */}
      <View style={s.navyBox}>
        <Text style={s.navyBoxTitle}>Top Affected Asset Types</Text>
        {topAssetTypes.length === 0 ? (
          <Text style={{ fontSize: 9, color: C.slate }}>No asset types recorded in this period.</Text>
        ) : (
          topAssetTypes.slice(0, 5).map((a, i) => (
            <View key={a.type} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 8, color: C.slate, width: 14 }}>{i + 1}.</Text>
              <Text style={{ fontSize: 9, color: C.slateLight, flex: 1 }}>{a.label}</Text>
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, backgroundColor: "#1e3a2f" }}>
                <Text style={{ fontSize: 8, color: C.compliant, fontFamily: "Helvetica-Bold" }}>{a.count}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </Page>
  );

  // Alert Summary + Recommendations page
  const AlertRecsPage = () => (
    <Page size="A4" style={pageStyle}>
      <PageHeader title="Alert Summary and Recommendations" />

      {/* Alert stats */}
      <View style={[s.navyBox, { marginBottom: 16 }]}>
        <Text style={s.navyBoxTitle}>Alert Summary</Text>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
          <View style={[s.titleScoreCard, { paddingHorizontal: 14, paddingVertical: 10 }]}>
            <Text style={[s.titleScoreLabel, { marginBottom: 4 }]}>LINKED ALERTS</Text>
            <Text style={[s.summaryValue, { color: C.partial }]}>{alertStats.totalLinkedAlerts}</Text>
          </View>
        </View>

        {alertStats.topRules.length > 0 && (
          <>
            <Text style={[s.navyBoxTitle, { marginBottom: 6 }]}>Top Detection Rules</Text>
            {alertStats.topRules.slice(0, 5).map((r, i) => (
              <View key={r.ruleId} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <Text style={{ fontSize: 8, color: C.slate, width: 14 }}>{i + 1}.</Text>
                <Text style={{ fontSize: 9, color: C.slateLight, flex: 1, fontFamily: "Helvetica-Bold" }}>{r.ruleId}</Text>
                <Text style={{ fontSize: 8, color: C.slateLight }}>{r.count} alert{r.count > 1 ? "s" : ""}</Text>
              </View>
            ))}
          </>
        )}
      </View>

      {/* Recommendations */}
      <View style={s.navyBox}>
        <Text style={s.navyBoxTitle}>Recommendations</Text>
        {recommendations.map((rec, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
            <View style={{
              width: 18, height: 18, borderRadius: 9,
              backgroundColor: C.blue, alignItems: "center", justifyContent: "center",
              marginTop: 1, flexShrink: 0,
            }}>
              <Text style={{ fontSize: 8, color: C.white, fontFamily: "Helvetica-Bold" }}>{i + 1}</Text>
            </View>
            <Text style={{ fontSize: 9, color: C.slateLight, flex: 1, lineHeight: 1.55 }}>{rec}</Text>
          </View>
        ))}
      </View>
    </Page>
  );

  return (
    <Document
      title={`SpaceGuard Incident Summary - ${org.name}`}
      author="SpaceGuard"
      subject={`Incident Summary ${dateRange.from} to ${dateRange.to}`}
    >
      <TitlePage />
      <ExecSummaryPage />
      <TimelinePage />
      <TrendPage />
      <AlertRecsPage />
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Data fetcher
// ---------------------------------------------------------------------------

async function buildIncidentSummaryData(
  organizationId: string,
  from: Date,
  to: Date
): Promise<IncidentSummaryData> {
  // 1. Validate org
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) throw new HTTPException(404, { message: "Organization not found" });

  // 2. Fetch incidents in range
  const rawIncidents = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.organizationId, organizationId),
        gte(incidents.createdAt, from),
        lte(incidents.createdAt, to)
      )
    )
    .orderBy(incidents.createdAt);

  const total = rawIncidents.length;

  // 3. Aggregate severity + status
  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let mttdSum = 0, mttdCount = 0, mttrSum = 0, mttrCount = 0;
  let openCount = 0, closedCount = 0;

  for (const inc of rawIncidents) {
    bySeverity[inc.severity] = (bySeverity[inc.severity] ?? 0) + 1;
    byStatus[inc.status] = (byStatus[inc.status] ?? 0) + 1;
    if (isOpen(inc.status)) openCount++;
    else closedCount++;
    if (inc.timeToDetectMinutes !== null) { mttdSum += inc.timeToDetectMinutes; mttdCount++; }
    if (inc.timeToRespondMinutes !== null) { mttrSum += inc.timeToRespondMinutes; mttrCount++; }
  }

  const mttdMinutes = mttdCount > 0 ? Math.round(mttdSum / mttdCount) : null;
  const mttrMinutes = mttrCount > 0 ? Math.round(mttrSum / mttrCount) : null;

  // 4. Build IncidentSummaryRow list
  // Gather all unique asset IDs across incidents
  const allAssetIds: string[] = [];
  for (const inc of rawIncidents) {
    const ids = Array.isArray(inc.affectedAssetIds) ? (inc.affectedAssetIds as string[]) : [];
    allAssetIds.push(...ids);
  }
  const uniqueAssetIds = [...new Set(allAssetIds)];

  // Fetch asset types for affected assets
  const assetMap = new Map<string, string>(); // id -> assetType
  if (uniqueAssetIds.length > 0) {
    const assetRows = await db
      .select({ id: spaceAssets.id, assetType: spaceAssets.assetType })
      .from(spaceAssets)
      .where(inArray(spaceAssets.id, uniqueAssetIds));
    for (const row of assetRows) assetMap.set(row.id, row.assetType);
  }

  const incidentRows: IncidentSummaryRow[] = rawIncidents.map((inc) => {
    const assetIds = Array.isArray(inc.affectedAssetIds) ? (inc.affectedAssetIds as string[]) : [];
    const spartaTechs = Array.isArray(inc.spartaTechniques)
      ? (inc.spartaTechniques as { tactic?: string; technique?: string }[]).map((t) => t.technique ?? "").filter(Boolean)
      : [];
    return {
      id: inc.id,
      title: inc.title,
      severity: inc.severity,
      status: inc.status,
      detectedAt: inc.detectedAt?.toISOString() ?? null,
      resolvedAt: inc.resolvedAt?.toISOString() ?? null,
      affectedAssetCount: assetIds.length,
      spartaTechniqueNames: spartaTechs,
      description: inc.description,
    };
  });

  // 5. Monthly trend
  const monthMap = new Map<string, number>();
  const rangeStart = new Date(from);
  const rangeEnd = new Date(to);
  // Enumerate months in range
  const cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cur <= rangeEnd) {
    const key = cur.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    monthMap.set(key, 0);
    cur.setMonth(cur.getMonth() + 1);
  }
  for (const inc of rawIncidents) {
    const key = inc.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  const trend: MonthlyBucket[] = Array.from(monthMap.entries()).map(([label, count]) => ({ label, count }));

  // 6. Top SPARTA techniques
  const techCount = new Map<string, number>();
  for (const row of incidentRows) {
    for (const t of row.spartaTechniqueNames) {
      techCount.set(t, (techCount.get(t) ?? 0) + 1);
    }
  }
  const topTechniques = [...techCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // 7. Top affected asset types
  const assetTypeCount = new Map<string, number>();
  for (const inc of rawIncidents) {
    const assetIds = Array.isArray(inc.affectedAssetIds) ? (inc.affectedAssetIds as string[]) : [];
    const seen = new Set<string>();
    for (const id of assetIds) {
      const t = assetMap.get(id);
      if (t && !seen.has(t)) { assetTypeCount.set(t, (assetTypeCount.get(t) ?? 0) + 1); seen.add(t); }
    }
  }
  const topAssetTypes = [...assetTypeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, label: ASSET_TYPE_LABELS[type] ?? type, count }));

  // 8. Alert stats
  const incidentIds = rawIncidents.map((inc) => inc.id);
  let totalLinkedAlerts = 0;
  const ruleCount = new Map<string, number>();

  if (incidentIds.length > 0) {
    const linkedAlerts = await db
      .select({ ruleId: alerts.ruleId })
      .from(incidentAlerts)
      .innerJoin(alerts, eq(incidentAlerts.alertId, alerts.id))
      .where(inArray(incidentAlerts.incidentId, incidentIds));
    totalLinkedAlerts = linkedAlerts.length;
    for (const a of linkedAlerts) ruleCount.set(a.ruleId, (ruleCount.get(a.ruleId) ?? 0) + 1);
  }

  const topRules = [...ruleCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ruleId, count]) => ({ ruleId, count }));

  // 9. Assemble
  const summaryData: IncidentSummaryData = {
    org: {
      id: org.id,
      name: org.name,
      country: org.country,
      sector: org.sector,
      nis2Classification: org.nis2Classification,
      contactEmail: org.contactEmail,
    },
    dateRange: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
    stats: { total, bySeverity, byStatus, openCount, closedCount, mttdMinutes, mttrMinutes },
    incidents: incidentRows,
    trend,
    topTechniques,
    topAssetTypes,
    alertStats: { totalLinkedAlerts, topRules },
    recommendations: [],
  };

  summaryData.recommendations = buildRecommendations(summaryData);
  return summaryData;
}

// ---------------------------------------------------------------------------
// Exported: JSON stats (lightweight preview)
// ---------------------------------------------------------------------------

export async function getIncidentSummaryStats(
  organizationId: string,
  from: Date,
  to: Date
): Promise<{
  total: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  openCount: number;
  closedCount: number;
  mttdMinutes: number | null;
  mttrMinutes: number | null;
  topTechniques: { name: string; count: number }[];
}> {
  const data = await buildIncidentSummaryData(organizationId, from, to);
  return {
    total: data.stats.total,
    bySeverity: data.stats.bySeverity,
    byStatus: data.stats.byStatus,
    openCount: data.stats.openCount,
    closedCount: data.stats.closedCount,
    mttdMinutes: data.stats.mttdMinutes,
    mttrMinutes: data.stats.mttrMinutes,
    topTechniques: data.topTechniques,
  };
}

// ---------------------------------------------------------------------------
// Exported: PDF generator
// ---------------------------------------------------------------------------

export async function generateIncidentSummaryPdf(
  organizationId: string,
  from: Date,
  to: Date
): Promise<Buffer> {
  const data = await buildIncidentSummaryData(organizationId, from, to);
  const buffer = await renderToBuffer(<IncidentSummaryReport data={data} />);
  return buffer;
}

// =============================================================================
// THREAT LANDSCAPE BRIEFING REPORT
// =============================================================================

// ---------------------------------------------------------------------------
// Segment classification helpers
// ---------------------------------------------------------------------------

const SPACE_SEGMENT_TYPES = new Set([
  "LEO_SATELLITE", "MEO_SATELLITE", "GEO_SATELLITE", "INTER_SATELLITE_LINK",
]);

const GROUND_SEGMENT_TYPES = new Set([
  "GROUND_STATION", "CONTROL_CENTER", "UPLINK", "DOWNLINK",
]);

const INFRA_SEGMENT_TYPES = new Set([
  "DATA_CENTER", "NETWORK_SEGMENT",
]);

// SPARTA tactic phase names that are primarily relevant per segment.
// Techniques belonging to these tactics get a relevance boost when the
// org has assets in the matching segment.
const SPACE_RELEVANT_PHASES = new Set([
  "execution", "persistence", "impact", "exfiltration",
]);
const GROUND_RELEVANT_PHASES = new Set([
  "initial-access", "reconnaissance", "defense-evasion", "lateral-movement",
  "command-and-control",
]);
const ALL_RELEVANT_PHASES = new Set([
  "privilege-escalation", "resource-development", "collection",
]);

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ThreatTechniqueRow {
  id: string;
  stixId: string;
  name: string;
  description: string | null;
  mitreId: string | null;
  phase: string;         // kill_chain_phases[0].phase_name
  tactic: string;        // display name
  hasDetection: boolean; // detection rule covers this technique
  cmCount: number;       // countermeasures mapped to this technique
  alertCount: number;    // recent alerts matching this technique name
  relevanceScore: number;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

interface TacticCoverage {
  tactic: string;
  phase: string;
  techniqueCount: number;
  withDetection: number;
  withCountermeasures: number;
  withAlerts: number;
}

interface RecommendedCountermeasure {
  name: string;
  description: string | null;
  nistControls: string[];
  category: string;
  deployment: string;
  effort: "LOW" | "MEDIUM" | "HIGH";
  targetTechnique: string;
}

interface ThreatBriefingData {
  org: OrgDetails;
  generatedAt: string;
  segments: { space: boolean; ground: boolean; infra: boolean };
  assetTypes: string[];
  stats: {
    totalTechniques: number;
    relevantTechniques: number;
    withDetectionRules: number;
    withCountermeasures: number;
    coveragePct: number;
    recentAlerts: number;
  };
  topThreats: ThreatTechniqueRow[];
  tacticCoverage: TacticCoverage[];
  recentAlertsByTactic: { tactic: string; count: number; techniques: string[] }[];
  recommendations: RecommendedCountermeasure[];
}

// ---------------------------------------------------------------------------
// Phase -> display name map (mirrors frontend)
// ---------------------------------------------------------------------------

const PHASE_DISPLAY: Record<string, string> = {
  "reconnaissance":       "Reconnaissance",
  "resource-development": "Resource Development",
  "initial-access":       "Initial Access",
  "execution":            "Execution",
  "persistence":          "Persistence",
  "privilege-escalation": "Privilege Escalation",
  "defense-evasion":      "Defense Evasion",
  "lateral-movement":     "Lateral Movement",
  "collection":           "Collection",
  "exfiltration":         "Exfiltration",
  "command-and-control":  "Command & Control",
  "impact":               "Impact",
};

function phaseDisplay(phase: string): string {
  return PHASE_DISPLAY[phase] ?? phase;
}

function effortLabel(cmCount: number): "LOW" | "MEDIUM" | "HIGH" {
  if (cmCount <= 1) return "LOW";
  if (cmCount <= 3) return "MEDIUM";
  return "HIGH";
}

function riskLevel(
  relevanceScore: number
): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (relevanceScore >= 80) return "CRITICAL";
  if (relevanceScore >= 55) return "HIGH";
  if (relevanceScore >= 30) return "MEDIUM";
  return "LOW";
}

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH:     "#f97316",
  MEDIUM:   "#f59e0b",
  LOW:      "#6b7280",
};

// ---------------------------------------------------------------------------
// Data builder
// ---------------------------------------------------------------------------

async function buildThreatBriefingData(
  organizationId: string
): Promise<ThreatBriefingData> {
  // 1. Org + assets
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) throw new HTTPException(404, { message: "Organization not found" });

  const orgAssets = await db
    .select({ assetType: spaceAssets.assetType })
    .from(spaceAssets)
    .where(
      and(
        eq(spaceAssets.organizationId, organizationId),
        ne(spaceAssets.status, "DECOMMISSIONED")
      )
    );

  const assetTypeSet = new Set(orgAssets.map((a) => a.assetType));
  const assetTypes = [...assetTypeSet];

  const hasSpace  = assetTypes.some((t) => SPACE_SEGMENT_TYPES.has(t));
  const hasGround = assetTypes.some((t) => GROUND_SEGMENT_TYPES.has(t));
  const hasInfra  = assetTypes.some((t) => INFRA_SEGMENT_TYPES.has(t));

  // 2. Load SPARTA data from DB
  // All parent attack-patterns (stix_id without a dot-suffix is a parent)
  const allTechniques = await db
    .select()
    .from(threatIntel)
    .where(eq(threatIntel.stixType, "attack-pattern"));

  const parentTechniques = allTechniques.filter((t) => {
    const d = t.data as Record<string, unknown>;
    const mid = String(d.x_mitre_id ?? d.x_sparta_id ?? "");
    return !mid.includes(".");
  });

  // All countermeasures
  const allCMs = await db
    .select()
    .from(threatIntel)
    .where(eq(threatIntel.stixType, "course-of-action"));

  // Relationships: related-to (technique <-> CM)
  const relRows = await db
    .select()
    .from(threatIntel)
    .where(eq(threatIntel.stixType, "relationship"));

  // Build: technique stixId -> set of countermeasure stixIds
  const techToCMs = new Map<string, Set<string>>();
  const cmById    = new Map<string, typeof allCMs[0]>();
  for (const cm of allCMs) cmById.set(cm.stixId, cm);

  for (const rel of relRows) {
    const d = rel.data as Record<string, unknown>;
    if (d.relationship_type !== "related-to") continue;
    const src = String(d.source_ref ?? "");
    const tgt = String(d.target_ref ?? "");
    // CM -> technique
    if (src.startsWith("course-of-action--") && tgt.startsWith("attack-pattern--")) {
      if (!techToCMs.has(tgt)) techToCMs.set(tgt, new Set());
      techToCMs.get(tgt)!.add(src);
    }
    // technique -> CM  (some bundles have it the other way)
    if (src.startsWith("attack-pattern--") && tgt.startsWith("course-of-action--")) {
      if (!techToCMs.has(src)) techToCMs.set(src, new Set());
      techToCMs.get(src)!.add(tgt);
    }
  }

  // 3. Load detection rules (YAML files on disk)
  const { loadRules } = await import("./detection/rule-loader.js");
  const detectionRules = loadRules();
  // Build set of (tactic+technique) pairs covered by rules
  const coveredTacticTech = new Set<string>();
  for (const rule of detectionRules) {
    if (rule.sparta) {
      coveredTacticTech.add(
        `${rule.sparta.tactic.toLowerCase()}|${rule.sparta.technique.toLowerCase()}`
      );
    }
  }

  // 4. Recent alerts (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentAlerts = await db
    .select({
      spartaTactic:    alerts.spartaTactic,
      spartaTechnique: alerts.spartaTechnique,
    })
    .from(alerts)
    .where(
      and(
        eq(alerts.organizationId, organizationId),
        gte(alerts.triggeredAt, thirtyDaysAgo)
      )
    );

  // technique name -> alert count
  const techAlertCount = new Map<string, number>();
  for (const a of recentAlerts) {
    if (a.spartaTechnique) {
      const k = a.spartaTechnique.toLowerCase();
      techAlertCount.set(k, (techAlertCount.get(k) ?? 0) + 1);
    }
  }

  // 5. Score and filter techniques
  const scored: ThreatTechniqueRow[] = [];

  for (const tech of parentTechniques) {
    const d = tech.data as Record<string, unknown>;
    const phases = d.kill_chain_phases as { kill_chain_name: string; phase_name: string }[] | undefined;
    const phase = phases?.[0]?.phase_name ?? "unknown";

    // Segment relevance: skip if no matching segment (unless org has all three)
    const isSpacePhase  = SPACE_RELEVANT_PHASES.has(phase);
    const isGroundPhase = GROUND_RELEVANT_PHASES.has(phase);
    const isAllPhase    = ALL_RELEVANT_PHASES.has(phase);

    const segmentMatch =
      isAllPhase ||
      (hasSpace  && isSpacePhase)  ||
      (hasGround && isGroundPhase) ||
      (hasInfra  && (isGroundPhase || isAllPhase));

    if (!segmentMatch && (hasSpace || hasGround || hasInfra)) continue;

    const mitreId = String(d.x_mitre_id ?? d.x_sparta_id ?? "");
    const tacticDisplay = phaseDisplay(phase);

    const cmStixIds = techToCMs.get(tech.stixId) ?? new Set();
    const cmCount = cmStixIds.size;

    const techKey = `${tacticDisplay.toLowerCase()}|${tech.name.toLowerCase()}`;
    const hasDetection = coveredTacticTech.has(techKey) ||
      [...coveredTacticTech].some((k) => k.includes(tech.name.toLowerCase()));

    const alertCnt = techAlertCount.get(tech.name.toLowerCase()) ?? 0;

    // Relevance score (0-100)
    // Higher = more relevant / more dangerous
    let score = 20; // base
    if (alertCnt > 0)    score += Math.min(alertCnt * 10, 40); // recent activity
    if (!hasDetection)   score += 20;                           // no detection = higher risk
    if (cmCount === 0)   score += 15;                           // no CMs = gap
    if (isSpacePhase && hasSpace)   score += 5;
    if (isGroundPhase && hasGround) score += 5;
    score = Math.min(score, 100);

    scored.push({
      id: tech.id,
      stixId: tech.stixId,
      name: tech.name,
      description: tech.description,
      mitreId: mitreId || null,
      phase,
      tactic: tacticDisplay,
      hasDetection,
      cmCount,
      alertCount: alertCnt,
      relevanceScore: score,
      riskLevel: riskLevel(score),
    });
  }

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const topThreats = scored.slice(0, 10);

  // 6. Tactic coverage heat map
  const tacticMap = new Map<string, { count: number; det: number; cm: number; al: number }>();
  for (const t of scored) {
    const cur = tacticMap.get(t.tactic) ?? { count: 0, det: 0, cm: 0, al: 0 };
    cur.count++;
    if (t.hasDetection) cur.det++;
    if (t.cmCount > 0)  cur.cm++;
    if (t.alertCount > 0) cur.al++;
    tacticMap.set(t.tactic, cur);
  }
  const tacticCoverage: TacticCoverage[] = [...tacticMap.entries()]
    .map(([tactic, v]) => ({
      tactic,
      phase: Object.entries(PHASE_DISPLAY).find(([, disp]) => disp === tactic)?.[0] ?? tactic,
      techniqueCount: v.count,
      withDetection: v.det,
      withCountermeasures: v.cm,
      withAlerts: v.al,
    }))
    .sort((a, b) => b.withAlerts - a.withAlerts || b.techniqueCount - a.techniqueCount);

  // 7. Recent alerts by tactic
  const alertTacticMap = new Map<string, Set<string>>();
  for (const a of recentAlerts) {
    const tactic = a.spartaTactic ?? "Unknown";
    if (!alertTacticMap.has(tactic)) alertTacticMap.set(tactic, new Set());
    if (a.spartaTechnique) alertTacticMap.get(tactic)!.add(a.spartaTechnique);
  }
  const recentAlertsByTactic = [...alertTacticMap.entries()]
    .map(([tactic, techs]) => ({ tactic, count: techs.size, techniques: [...techs] }))
    .sort((a, b) => b.count - a.count);

  // 8. Recommended countermeasures
  // Pick top gaps (high-relevance techniques with no detection and no CMs)
  const gaps = scored.filter((t) => !t.hasDetection || t.cmCount === 0).slice(0, 8);
  const recommendedCMs: RecommendedCountermeasure[] = [];
  const seenCmNames = new Set<string>();

  for (const gap of gaps) {
    // Find best-fitting CM for this technique
    const cmStixIds = techToCMs.get(gap.stixId);
    if (!cmStixIds || cmStixIds.size === 0) continue;

    for (const cmStixId of [...cmStixIds].slice(0, 2)) {
      const cm = cmById.get(cmStixId);
      if (!cm || seenCmNames.has(cm.name)) continue;
      seenCmNames.add(cm.name);

      const cd = cm.data as Record<string, unknown>;
      const nistRaw = cd.x_nist_rev5;
      const nistList: string[] = Array.isArray(nistRaw)
        ? (nistRaw as string[])
        : typeof nistRaw === "string" && nistRaw
          ? nistRaw.split(/[,;]\s*/).filter(Boolean)
          : [];

      recommendedCMs.push({
        name: cm.name,
        description: cm.description,
        nistControls: nistList.slice(0, 3),
        category: String(cd.x_sparta_category ?? ""),
        deployment: String(cd.x_sparta_deployment ?? ""),
        effort: effortLabel(recommendedCMs.length),
        targetTechnique: gap.name,
      });

      if (recommendedCMs.length >= 5) break;
    }
    if (recommendedCMs.length >= 5) break;
  }

  // 9. Stats
  const withDetection = scored.filter((t) => t.hasDetection).length;
  const withCMs       = scored.filter((t) => t.cmCount > 0).length;
  const coveragePct   = scored.length > 0
    ? Math.round(((withDetection + withCMs) / (scored.length * 2)) * 100)
    : 0;

  return {
    org: {
      id: org.id,
      name: org.name,
      country: org.country,
      sector: org.sector,
      nis2Classification: org.nis2Classification,
      contactEmail: org.contactEmail,
    },
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
    segments: { space: hasSpace, ground: hasGround, infra: hasInfra },
    assetTypes,
    stats: {
      totalTechniques: parentTechniques.length,
      relevantTechniques: scored.length,
      withDetectionRules: withDetection,
      withCountermeasures: withCMs,
      coveragePct,
      recentAlerts: recentAlerts.length,
    },
    topThreats,
    tacticCoverage,
    recentAlertsByTactic,
    recommendations: recommendedCMs,
  };
}

// ---------------------------------------------------------------------------
// PDF Component
// ---------------------------------------------------------------------------

function ThreatBriefingReport({ data }: { data: ThreatBriefingData }) {
  const { org, generatedAt, segments, assetTypes, stats, topThreats,
          tacticCoverage, recentAlertsByTactic, recommendations } = data;

  const pageStyle = s.contentPage;

  // ---- Title Page ----
  const TitlePage = () => (
    <Page size="A4" style={s.titlePage}>
      <View style={s.titleBanner}>
        <View>
          <Text style={s.titleBrandName}>SPACEGUARD</Text>
          <Text style={s.titleBrandSub}>CYBERSECURITY PLATFORM</Text>
        </View>
        <View>
          <Text style={[s.titleBannerRight, { textAlign: "right" }]}>
            THREAT LANDSCAPE BRIEFING
          </Text>
          <Text style={[s.titleBannerRight, { marginTop: 3 }]}>
            {generatedAt}
          </Text>
        </View>
      </View>

      <View style={s.titleBody}>
        <Text style={s.titleHeading}>Space Threat{"\n"}Landscape Briefing</Text>
        <Text style={s.titleSubheading}>
          SPARTA-mapped threat analysis tailored to your asset profile
        </Text>

        <View style={s.titleOrgBox}>
          <Text style={s.titleOrgLabel}>ORGANISATION</Text>
          <Text style={s.titleOrgName}>{org.name}</Text>
          <Text style={s.titleOrgMeta}>
            {org.country.toUpperCase()} · {org.nis2Classification} Entity · {org.sector.toUpperCase()}
          </Text>
          <Text style={[s.titleOrgMeta, { marginTop: 4 }]}>
            Segments covered:{" "}
            {[
              segments.space  && "Space",
              segments.ground && "Ground",
              segments.infra  && "Infrastructure",
            ].filter(Boolean).join(" · ")}
          </Text>
        </View>

        <View style={s.titleScoreRow}>
          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>RELEVANT TECHNIQUES</Text>
            <Text style={[s.titleScoreValue, { color: C.partial }]}>
              {stats.relevantTechniques}
            </Text>
            <Text style={s.titleScoreSub}>of {stats.totalTechniques} SPARTA</Text>
          </View>
          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>COVERAGE</Text>
            <Text style={[s.titleScoreValue, {
              color: stats.coveragePct >= 70 ? C.compliant
                   : stats.coveragePct >= 40 ? C.partial
                   : C.nonCompliant,
            }]}>
              {stats.coveragePct}%
            </Text>
            <Text style={s.titleScoreSub}>detection + CM</Text>
          </View>
          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>RECENT ALERTS</Text>
            <Text style={[s.titleScoreValue, { color: stats.recentAlerts > 0 ? C.nonCompliant : C.compliant }]}>
              {stats.recentAlerts}
            </Text>
            <Text style={s.titleScoreSub}>last 30 days</Text>
          </View>
          <View style={s.titleScoreCard}>
            <Text style={s.titleScoreLabel}>OPEN GAPS</Text>
            <Text style={[s.titleScoreValue, { color: C.nonCompliant }]}>
              {stats.relevantTechniques - stats.withDetectionRules}
            </Text>
            <Text style={s.titleScoreSub}>without detection</Text>
          </View>
        </View>
      </View>

      <View style={s.titleFooter}>
        <Text style={s.titleFooterText}>Generated {generatedAt}</Text>
        <Text style={s.titleFooterText}>CONFIDENTIAL - INTERNAL USE ONLY</Text>
      </View>
    </Page>
  );

  const PageHeader = ({ title }: { title: string }) => (
    <View style={s.pageHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.sectionBrand}>SPACEGUARD · THREAT BRIEFING</Text>
    </View>
  );

  // ---- Threat Overview page ----
  const OverviewPage = () => (
    <Page size="A4" style={pageStyle}>
      <PageHeader title="Threat Overview" />

      {/* Asset profile */}
      <View style={[s.navyBox, { marginBottom: 14 }]}>
        <Text style={s.navyBoxTitle}>Organisation Asset Profile</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {assetTypes.map((t) => (
            <View key={t} style={{
              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
              backgroundColor: C.navyCard,
            }}>
              <Text style={{ fontSize: 8, color: C.slateLight }}>
                {ASSET_TYPE_LABELS[t] ?? t}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          {[
            { label: "SPACE SEGMENT",   active: segments.space  },
            { label: "GROUND SEGMENT",  active: segments.ground },
            { label: "INFRASTRUCTURE",  active: segments.infra  },
          ].map(({ label, active }) => (
            <View key={label} style={{
              flexDirection: "row", alignItems: "center", gap: 5,
              paddingHorizontal: 10, paddingVertical: 5,
              backgroundColor: active ? C.blueDim : C.navyCard,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: active ? C.blue : C.navyCard,
              borderStyle: "solid",
            }}>
              <View style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: active ? C.blue : C.notAssessed,
              }} />
              <Text style={{ fontSize: 8, color: active ? C.blueLight : C.slate }}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Stats row */}
      <View style={[s.summaryGrid, { marginBottom: 14 }]}>
        {[
          { label: "TOTAL SPARTA TECHNIQUES", value: stats.totalTechniques, color: C.slate },
          { label: "RELEVANT TO PROFILE",      value: stats.relevantTechniques, color: C.partial },
          { label: "DETECTION COVERAGE",        value: stats.withDetectionRules, color: C.blue },
          { label: "WITH COUNTERMEASURES",      value: stats.withCountermeasures, color: C.compliant },
        ].map(({ label, value, color }) => (
          <View key={label} style={[s.summaryCard, { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10 }]}>
            <Text style={[s.summaryLabel, { fontSize: 7, letterSpacing: 1.2, marginBottom: 5 }]}>{label}</Text>
            <Text style={[s.summaryValue, { color }]}>{value}</Text>
          </View>
        ))}
      </View>

      {/* Coverage by tactic (heat map rows) */}
      <View style={s.navyBox}>
        <Text style={s.navyBoxTitle}>Coverage by Tactic</Text>
        {tacticCoverage.slice(0, 8).map((tc) => {
          const detPct = tc.techniqueCount > 0
            ? Math.round((tc.withDetection / tc.techniqueCount) * 100) : 0;
          const cmPct  = tc.techniqueCount > 0
            ? Math.round((tc.withCountermeasures / tc.techniqueCount) * 100) : 0;
          const coveragePctRow = Math.round((detPct + cmPct) / 2);
          const barColor = coveragePctRow >= 70 ? C.compliant
                         : coveragePctRow >= 40 ? C.partial
                         : C.nonCompliant;

          return (
            <View key={tc.tactic} style={{ marginBottom: 7 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <View style={{ width: 110 }}>
                  <Text style={{ fontSize: 8, color: C.slateLight }}>{tc.tactic}</Text>
                </View>
                <View style={{ flex: 1, height: 9, backgroundColor: C.navyCard, borderRadius: 4, overflow: "hidden" }}>
                  <View style={{ width: `${coveragePctRow}%`, height: "100%", backgroundColor: barColor, borderRadius: 4 }} />
                </View>
                <Text style={{ fontSize: 8, color: C.white, width: 28, textAlign: "right" }}>
                  {coveragePctRow}%
                </Text>
                {tc.withAlerts > 0 && (
                  <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, backgroundColor: "#3b1919" }}>
                    <Text style={{ fontSize: 7, color: C.nonCompliant }}>
                      {tc.withAlerts} alert{tc.withAlerts > 1 ? "s" : ""}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: "row", gap: 12, marginLeft: 116 }}>
                <Text style={{ fontSize: 7, color: C.slate }}>
                  {tc.withDetection}/{tc.techniqueCount} detection rules
                </Text>
                <Text style={{ fontSize: 7, color: C.slate }}>
                  {tc.withCountermeasures}/{tc.techniqueCount} CMs
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Page>
  );

  // ---- Top Threats page ----
  const TopThreatsPage = () => (
    <Page size="A4" style={pageStyle}>
      <PageHeader title="Top 10 Threats for This Organisation" />

      {topThreats.length === 0 ? (
        <View style={s.navyBox}>
          <Text style={{ fontSize: 10, color: C.slate, textAlign: "center", paddingVertical: 20 }}>
            No SPARTA techniques relevant to your asset profile.
          </Text>
        </View>
      ) : (
        topThreats.map((t, idx) => {
          const riskColor = RISK_COLORS[t.riskLevel] ?? C.slate;
          return (
            <View key={t.id} style={{
              marginBottom: 7, backgroundColor: C.navyLight,
              borderRadius: 5, padding: 10,
              borderLeftWidth: 3, borderLeftColor: riskColor,
              borderLeftStyle: "solid",
            }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                {/* Rank */}
                <Text style={{ fontSize: 9, color: C.slate, width: 16, marginTop: 1 }}>
                  {String(idx + 1).padStart(2, "0")}.
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* Name row */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                    <Text style={{ fontSize: 10, color: C.white, fontFamily: "Helvetica-Bold" }}>
                      {t.name}
                    </Text>
                    {t.mitreId && (
                      <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold",
                        color: C.slate, backgroundColor: C.navyCard,
                        paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 }}>
                        {t.mitreId}
                      </Text>
                    )}
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
                      backgroundColor: riskColor + "33" }}>
                      <Text style={{ fontSize: 7, color: riskColor, fontFamily: "Helvetica-Bold" }}>
                        {t.riskLevel}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 7, color: C.slate }}>{t.tactic}</Text>
                  </View>
                  {/* Description */}
                  {t.description && (
                    <Text style={{ fontSize: 8, color: C.slate, lineHeight: 1.4, marginBottom: 4 }}>
                      {t.description.slice(0, 180)}{t.description.length > 180 ? "..." : ""}
                    </Text>
                  )}
                  {/* Coverage indicators */}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <View style={{
                        width: 6, height: 6, borderRadius: 3,
                        backgroundColor: t.hasDetection ? C.compliant : C.nonCompliant,
                      }} />
                      <Text style={{ fontSize: 7, color: C.slate }}>
                        {t.hasDetection ? "Detection rule active" : "No detection rule"}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <View style={{
                        width: 6, height: 6, borderRadius: 3,
                        backgroundColor: t.cmCount > 0 ? C.compliant : C.partial,
                      }} />
                      <Text style={{ fontSize: 7, color: C.slate }}>
                        {t.cmCount > 0 ? `${t.cmCount} countermeasure${t.cmCount > 1 ? "s" : ""}` : "No countermeasures"}
                      </Text>
                    </View>
                    {t.alertCount > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.nonCompliant }} />
                        <Text style={{ fontSize: 7, color: C.nonCompliant }}>
                          {t.alertCount} recent alert{t.alertCount > 1 ? "s" : ""}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>
          );
        })
      )}
    </Page>
  );

  // ---- Recent Activity + Recommendations page ----
  const ActivityRecsPage = () => (
    <Page size="A4" style={pageStyle}>
      <PageHeader title="Recent Activity and Recommended Actions" />

      {/* Recent alerts by tactic */}
      <View style={[s.navyBox, { marginBottom: 14 }]}>
        <Text style={s.navyBoxTitle}>Alert Activity - Last 30 Days</Text>
        {stats.recentAlerts === 0 ? (
          <Text style={{ fontSize: 9, color: C.slate, fontStyle: "italic" }}>
            No alerts recorded in the last 30 days.
          </Text>
        ) : (
          recentAlertsByTactic.slice(0, 6).map((item) => (
            <View key={item.tactic} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <View style={{
                paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3,
                backgroundColor: C.nonCompliant + "33", minWidth: 24, alignItems: "center",
              }}>
                <Text style={{ fontSize: 9, color: C.nonCompliant, fontFamily: "Helvetica-Bold" }}>
                  {item.count}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 9, color: C.white, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>
                  {item.tactic}
                </Text>
                <Text style={{ fontSize: 8, color: C.slate }}>
                  Techniques: {item.techniques.slice(0, 4).join(" · ")}
                  {item.techniques.length > 4 ? ` +${item.techniques.length - 4} more` : ""}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Recommended countermeasures */}
      <View style={s.navyBox}>
        <Text style={s.navyBoxTitle}>Top 5 Recommended Actions</Text>
        {recommendations.length === 0 ? (
          <Text style={{ fontSize: 9, color: C.slate, fontStyle: "italic" }}>
            All relevant techniques have countermeasures mapped. Ensure they are implemented and regularly reviewed.
          </Text>
        ) : (
          recommendations.map((rec, i) => (
            <View key={i} style={{
              flexDirection: "row", gap: 10, marginBottom: 10,
              paddingBottom: 10,
              borderBottomWidth: i < recommendations.length - 1 ? 1 : 0,
              borderBottomColor: C.navyCard,
              borderBottomStyle: "solid",
            }}>
              {/* Number circle */}
              <View style={{
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: C.blue, alignItems: "center",
                justifyContent: "center", flexShrink: 0, marginTop: 1,
              }}>
                <Text style={{ fontSize: 9, color: C.white, fontFamily: "Helvetica-Bold" }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: C.white, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>
                  {rec.name}
                </Text>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  {/* Target technique */}
                  <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
                    backgroundColor: C.blueDim }}>
                    <Text style={{ fontSize: 7, color: C.blueLight }}>
                      Addresses: {rec.targetTechnique.slice(0, 35)}
                    </Text>
                  </View>
                  {/* Effort */}
                  <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
                    backgroundColor:
                      rec.effort === "LOW" ? "#14532d" :
                      rec.effort === "MEDIUM" ? "#713f12" : "#450a0a",
                  }}>
                    <Text style={{ fontSize: 7, color:
                      rec.effort === "LOW" ? C.compliant :
                      rec.effort === "MEDIUM" ? C.partial : C.nonCompliant,
                      fontFamily: "Helvetica-Bold",
                    }}>
                      {rec.effort} EFFORT
                    </Text>
                  </View>
                  {/* Category */}
                  {rec.category && (
                    <Text style={{ fontSize: 7, color: C.slate, paddingTop: 3 }}>
                      {rec.category}
                    </Text>
                  )}
                </View>
                {/* Description */}
                {rec.description && (
                  <Text style={{ fontSize: 8, color: C.slate, lineHeight: 1.4, marginBottom: 4 }}>
                    {rec.description.slice(0, 200)}{rec.description.length > 200 ? "..." : ""}
                  </Text>
                )}
                {/* NIST controls */}
                {rec.nistControls.length > 0 && (
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <Text style={{ fontSize: 7, color: C.slate, marginTop: 2 }}>NIST:</Text>
                    {rec.nistControls.map((n) => (
                      <View key={n} style={{
                        paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
                        backgroundColor: C.blueDim,
                      }}>
                        <Text style={{ fontSize: 7, color: C.blueLight, fontFamily: "Helvetica-Bold" }}>{n}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </Page>
  );

  return (
    <Document
      title={`SpaceGuard Threat Briefing - ${org.name}`}
      author="SpaceGuard"
      subject="Space Threat Landscape Briefing"
    >
      <TitlePage />
      <OverviewPage />
      <TopThreatsPage />
      <ActivityRecsPage />
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Exported: PDF generator
// ---------------------------------------------------------------------------

export async function generateThreatBriefingPdf(
  organizationId: string
): Promise<Buffer> {
  const data = await buildThreatBriefingData(organizationId);
  const buffer = await renderToBuffer(<ThreatBriefingReport data={data} />);
  return buffer;
}

// ===========================================================================
//
//  SUPPLY CHAIN RISK ASSESSMENT REPORT
//
// ===========================================================================

interface SupplierRow {
  id: string;
  name: string;
  type: string;
  country: string;
  criticality: string;
  description: string | null;
  securityAssessment: {
    lastAssessed?: string | null;
    nextReview?: string | null;
    iso27001Certified?: boolean;
    soc2Certified?: boolean;
    nis2Compliant?: boolean;
    riskScore?: number;
    notes?: string | null;
  } | null;
}

interface SupplyChainReportData {
  org: OrgDetails;
  suppliers: SupplierRow[];
  generatedAt: string;
  // Pre-computed analytics
  totalSuppliers: number;
  byCriticality: Record<string, number>;
  byType: Record<string, number>;
  countryDistribution: Record<string, number>;
  highRiskSuppliers: SupplierRow[];
  overdueSuppliers: SupplierRow[];
  certGaps: { noIso: SupplierRow[]; noSoc2: SupplierRow[]; noNis2: SupplierRow[] };
  averageRiskScore: number;
  nis2Article21dStatus: "compliant" | "partial" | "non_compliant";
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Data builder
// ---------------------------------------------------------------------------

async function buildSupplyChainData(
  organizationId: string
): Promise<SupplyChainReportData> {
  // Org
  const [orgRow] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!orgRow) {
    throw new HTTPException(404, {
      message: `Organization ${organizationId} not found`,
    });
  }

  const org: OrgDetails = {
    id: orgRow.id,
    name: orgRow.name,
    country: orgRow.country,
    sector: orgRow.sector,
    nis2Classification: orgRow.nis2Classification,
    contactEmail: orgRow.contactEmail,
  };

  // Suppliers
  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.organizationId, organizationId))
    .orderBy(suppliers.criticality);

  const supplierList: SupplierRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    country: r.country,
    criticality: r.criticality,
    description: r.description,
    securityAssessment: r.securityAssessment as SupplierRow["securityAssessment"],
  }));

  // Analytics
  const now = new Date();
  const byCriticality: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const countryDist: Record<string, number> = {};
  const highRisk: SupplierRow[] = [];
  const overdue: SupplierRow[] = [];
  const noIso: SupplierRow[] = [];
  const noSoc2: SupplierRow[] = [];
  const noNis2: SupplierRow[] = [];
  let totalScore = 0;
  let scoreCount = 0;

  for (const s of supplierList) {
    byCriticality[s.criticality] = (byCriticality[s.criticality] ?? 0) + 1;
    byType[s.type] = (byType[s.type] ?? 0) + 1;
    countryDist[s.country] = (countryDist[s.country] ?? 0) + 1;

    const sa = s.securityAssessment;
    const isHighCrit = s.criticality === "CRITICAL" || s.criticality === "HIGH";
    const isHighScore = (sa?.riskScore ?? 0) >= 7;
    if (isHighCrit || isHighScore) highRisk.push(s);

    if (sa?.nextReview && new Date(sa.nextReview) < now) overdue.push(s);
    if (!sa?.iso27001Certified) noIso.push(s);
    if (!sa?.soc2Certified) noSoc2.push(s);
    if (!sa?.nis2Compliant) noNis2.push(s);

    if (sa?.riskScore) {
      totalScore += sa.riskScore;
      scoreCount++;
    }
  }

  const avgScore = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 0;

  // NIS2 Article 21(2)(d) status
  let nis2Status: "compliant" | "partial" | "non_compliant" = "non_compliant";
  if (supplierList.length > 0) {
    const allAssessed = supplierList.every((s) => s.securityAssessment?.lastAssessed);
    const criticalAssessed = supplierList
      .filter((s) => s.criticality === "CRITICAL")
      .every((s) => s.securityAssessment?.lastAssessed);
    const noneOverdue = overdue.length === 0;

    if (allAssessed && noneOverdue && avgScore <= 4) {
      nis2Status = "compliant";
    } else if (criticalAssessed) {
      nis2Status = "partial";
    }
  }

  // Recommendations
  const recs: string[] = [];
  if (overdue.length > 0) {
    recs.push(
      `${overdue.length} supplier${overdue.length > 1 ? "s have" : " has"} overdue security reviews. Prioritise reassessment of: ${overdue
        .slice(0, 3)
        .map((s) => s.name)
        .join(", ")}.`
    );
  }
  if (noIso.length > 0 && noIso.some((s) => s.criticality === "CRITICAL" || s.criticality === "HIGH")) {
    const critNoIso = noIso.filter((s) => s.criticality === "CRITICAL" || s.criticality === "HIGH");
    recs.push(
      `${critNoIso.length} high/critical supplier${critNoIso.length > 1 ? "s lack" : " lacks"} ISO 27001 certification: ${critNoIso
        .map((s) => s.name)
        .join(", ")}. Require certification or conduct independent audits.`
    );
  }
  if (noNis2.length > 0) {
    recs.push(
      `${noNis2.length} supplier${noNis2.length > 1 ? "s are" : " is"} not NIS2 compliant. Engage with these partners to establish compliance roadmaps.`
    );
  }
  const concentrationCountries = Object.entries(countryDist).filter(
    ([, cnt]) => cnt >= 2 && supplierList.length > 2
  );
  if (concentrationCountries.length > 0) {
    recs.push(
      `Potential geographic concentration risk: ${concentrationCountries
        .map(([c, n]) => `${c} (${n} suppliers)`)
        .join(", ")}. Consider diversifying to reduce single-country regulatory or geopolitical risk.`
    );
  }
  const highScoreSuppliers = supplierList.filter((s) => (s.securityAssessment?.riskScore ?? 0) >= 7);
  if (highScoreSuppliers.length > 0) {
    recs.push(
      `${highScoreSuppliers.length} supplier${highScoreSuppliers.length > 1 ? "s have" : " has"} a risk score of 7 or above: ${highScoreSuppliers
        .map((s) => `${s.name} (${s.securityAssessment?.riskScore}/10)`)
        .join(", ")}. Initiate risk mitigation plans.`
    );
  }
  if (recs.length === 0) {
    recs.push("Supply chain security posture is satisfactory. Continue regular assessments per the review schedule.");
  }

  return {
    org,
    suppliers: supplierList,
    generatedAt: new Date().toISOString(),
    totalSuppliers: supplierList.length,
    byCriticality,
    byType,
    countryDistribution: countryDist,
    highRiskSuppliers: highRisk,
    overdueSuppliers: overdue,
    certGaps: { noIso, noSoc2, noNis2 },
    averageRiskScore: avgScore,
    nis2Article21dStatus: nis2Status,
    recommendations: recs,
  };
}

// ---------------------------------------------------------------------------
// PDF Component: Supply Chain Risk Assessment
// ---------------------------------------------------------------------------

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  COMPONENT_MANUFACTURER: "Component Mfr",
  GROUND_STATION_OPERATOR: "Ground Station Op",
  LAUNCH_PROVIDER: "Launch Provider",
  CLOUD_PROVIDER: "Cloud Provider",
  SOFTWARE_VENDOR: "Software Vendor",
  INTEGRATION_PARTNER: "Integration Partner",
  DATA_RELAY_PROVIDER: "Data Relay",
};

const CRIT_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#f59e0b",
  LOW: "#6b7280",
};

function SupplyChainReport({ data }: { data: SupplyChainReportData }) {
  const { org, generatedAt } = data;
  const genDate = new Date(generatedAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // -- Title page --
  const TitlePage = () => (
    <Page size="A4" style={s.titlePage}>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 60 }}>
        <Text style={{ fontSize: 10, color: C.blue, fontFamily: "Helvetica-Bold", letterSpacing: 4, marginBottom: 16 }}>
          SPACEGUARD
        </Text>
        <Text style={{ fontSize: 28, color: C.white, fontFamily: "Helvetica-Bold", lineHeight: 1.2, marginBottom: 8 }}>
          Supply Chain Risk{"\n"}Assessment
        </Text>
        <View style={{ width: 60, height: 3, backgroundColor: C.blue, marginBottom: 20 }} />

        <View style={s.navyBox}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 9, color: C.slate }}>Organisation</Text>
            <Text style={{ fontSize: 9, color: C.white, fontFamily: "Helvetica-Bold" }}>{org.name}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 9, color: C.slate }}>NIS2 Classification</Text>
            <Text style={{ fontSize: 9, color: C.blue, fontFamily: "Helvetica-Bold" }}>{org.nis2Classification}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 9, color: C.slate }}>Country</Text>
            <Text style={{ fontSize: 9, color: C.white }}>{org.country}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 9, color: C.slate }}>Generated</Text>
            <Text style={{ fontSize: 9, color: C.white }}>{genDate}</Text>
          </View>
        </View>

        {/* KPI cards */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          {[
            { label: "Total Suppliers", value: String(data.totalSuppliers), color: C.blue },
            { label: "High Risk", value: String(data.highRiskSuppliers.length), color: data.highRiskSuppliers.length > 0 ? "#ef4444" : C.compliant },
            { label: "Overdue Reviews", value: String(data.overdueSuppliers.length), color: data.overdueSuppliers.length > 0 ? "#f59e0b" : C.compliant },
            { label: "Avg Risk Score", value: String(data.averageRiskScore), color: data.averageRiskScore >= 7 ? "#ef4444" : data.averageRiskScore >= 4 ? "#f59e0b" : C.compliant },
          ].map((kpi) => (
            <View key={kpi.label} style={{ flex: 1, backgroundColor: C.navyCard, borderRadius: 6, padding: 10, alignItems: "center" }}>
              <Text style={{ fontSize: 20, color: kpi.color, fontFamily: "Helvetica-Bold" }}>{kpi.value}</Text>
              <Text style={{ fontSize: 7, color: C.slate, marginTop: 2, textTransform: "uppercase", letterSpacing: 1 }}>{kpi.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: 60, paddingBottom: 30 }}>
        <Text style={{ fontSize: 7, color: C.slate, textAlign: "center" }}>
          SpaceGuard Supply Chain Risk Assessment | Confidential | {genDate}
        </Text>
      </View>
    </Page>
  );

  // -- Supplier Inventory page --
  const InventoryPage = () => (
    <Page size="A4" style={s.contentPage}>
      <Text style={s.sectionTitle}>Supplier Inventory</Text>
      <Text style={{ fontSize: 8, color: C.slate, marginBottom: 10 }}>
        Complete list of registered supply chain partners with risk scores and certification status.
      </Text>

      {/* Table header */}
      <View style={{ flexDirection: "row", backgroundColor: C.navyCard, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 6, marginBottom: 4 }}>
        <Text style={{ flex: 3, fontSize: 7, color: C.slate, fontFamily: "Helvetica-Bold" }}>SUPPLIER</Text>
        <Text style={{ flex: 2, fontSize: 7, color: C.slate, fontFamily: "Helvetica-Bold" }}>TYPE</Text>
        <Text style={{ flex: 1, fontSize: 7, color: C.slate, fontFamily: "Helvetica-Bold", textAlign: "center" }}>COUNTRY</Text>
        <Text style={{ flex: 1, fontSize: 7, color: C.slate, fontFamily: "Helvetica-Bold", textAlign: "center" }}>CRIT</Text>
        <Text style={{ flex: 1, fontSize: 7, color: C.slate, fontFamily: "Helvetica-Bold", textAlign: "center" }}>RISK</Text>
        <Text style={{ flex: 1.5, fontSize: 7, color: C.slate, fontFamily: "Helvetica-Bold", textAlign: "center" }}>CERTS</Text>
      </View>

      {data.suppliers.map((sup, idx) => {
        const sa = sup.securityAssessment;
        const certs: string[] = [];
        if (sa?.iso27001Certified) certs.push("ISO");
        if (sa?.soc2Certified) certs.push("SOC2");
        if (sa?.nis2Compliant) certs.push("NIS2");

        return (
          <View
            key={sup.id}
            style={{
              flexDirection: "row",
              paddingVertical: 5,
              paddingHorizontal: 6,
              backgroundColor: idx % 2 === 0 ? C.navyMid : "transparent",
              borderRadius: 2,
            }}
          >
            <Text style={{ flex: 3, fontSize: 8, color: C.white, fontFamily: "Helvetica-Bold" }}>{sup.name}</Text>
            <Text style={{ flex: 2, fontSize: 7, color: C.slate }}>{SUPPLIER_TYPE_LABELS[sup.type] ?? sup.type}</Text>
            <Text style={{ flex: 1, fontSize: 8, color: C.slateLight, textAlign: "center" }}>{sup.country}</Text>
            <View style={{ flex: 1, alignItems: "center" }}>
              <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: CRIT_COLORS[sup.criticality] ?? C.slate + "30" }}>
                <Text style={{ fontSize: 6, color: C.white, fontFamily: "Helvetica-Bold" }}>{sup.criticality}</Text>
              </View>
            </View>
            <Text style={{ flex: 1, fontSize: 9, color: (sa?.riskScore ?? 0) >= 7 ? "#ef4444" : (sa?.riskScore ?? 0) >= 4 ? "#f59e0b" : C.compliant, textAlign: "center", fontFamily: "Helvetica-Bold" }}>
              {sa?.riskScore ?? "-"}
            </Text>
            <Text style={{ flex: 1.5, fontSize: 7, color: certs.length > 0 ? C.compliant : C.slate, textAlign: "center" }}>
              {certs.length > 0 ? certs.join(", ") : "None"}
            </Text>
          </View>
        );
      })}

      {data.suppliers.length === 0 && (
        <View style={{ ...s.navyBox, marginTop: 10 }}>
          <Text style={{ fontSize: 9, color: C.slate, textAlign: "center" }}>
            No suppliers registered. Add suppliers via the Supply Chain management page.
          </Text>
        </View>
      )}
    </Page>
  );

  // -- Risk Analysis page --
  const RiskPage = () => {
    const critEntries = Object.entries(data.byCriticality).sort(
      ([a], [b]) => ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(a) - ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(b)
    );
    const typeEntries = Object.entries(data.byType).sort(([, a], [, b]) => b - a);
    const countryEntries = Object.entries(data.countryDistribution).sort(([, a], [, b]) => b - a);
    const maxCountry = countryEntries.length > 0 ? countryEntries[0][1] : 1;

    return (
      <Page size="A4" style={s.contentPage}>
        <Text style={s.sectionTitle}>Risk Analysis</Text>

        {/* Criticality + Type distribution side by side */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
          {/* By criticality */}
          <View style={{ flex: 1, ...navyBoxStyle }}>
            <Text style={navyBoxTitleStyle}>By Criticality</Text>
            {critEntries.map(([crit, cnt]) => (
              <View key={crit} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: CRIT_COLORS[crit] ?? C.slate }} />
                <Text style={{ fontSize: 8, color: C.slateLight, flex: 1 }}>{crit}</Text>
                <Text style={{ fontSize: 9, color: C.white, fontFamily: "Helvetica-Bold" }}>{cnt}</Text>
              </View>
            ))}
          </View>

          {/* By type */}
          <View style={{ flex: 1, ...navyBoxStyle }}>
            <Text style={navyBoxTitleStyle}>By Supplier Type</Text>
            {typeEntries.map(([tp, cnt]) => (
              <View key={tp} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 7, color: C.slate, flex: 1 }}>{SUPPLIER_TYPE_LABELS[tp] ?? tp}</Text>
                <Text style={{ fontSize: 9, color: C.white, fontFamily: "Helvetica-Bold" }}>{cnt}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Country risk */}
        <View style={navyBoxStyle}>
          <Text style={navyBoxTitleStyle}>Country Distribution</Text>
          <Text style={{ fontSize: 8, color: C.slate, marginBottom: 8 }}>
            Geographic distribution of supply chain partners. Concentration in a single country increases regulatory and geopolitical risk.
          </Text>
          {countryEntries.map(([code, cnt]) => (
            <View key={code} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <Text style={{ fontSize: 9, color: C.white, width: 24, fontFamily: "Helvetica-Bold" }}>{code}</Text>
              <View style={{ flex: 1, height: 10, backgroundColor: C.navyDark, borderRadius: 3, overflow: "hidden" }}>
                <View style={{ width: `${(cnt / maxCountry) * 100}%`, height: "100%", backgroundColor: C.blue, borderRadius: 3 }} />
              </View>
              <Text style={{ fontSize: 8, color: C.slateLight, width: 16, textAlign: "right" }}>{cnt}</Text>
            </View>
          ))}
        </View>

        {/* Certification gaps */}
        <View style={{ ...navyBoxStyle, marginTop: 14 }}>
          <Text style={navyBoxTitleStyle}>Certification Gaps</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {[
              { label: "No ISO 27001", list: data.certGaps.noIso },
              { label: "No SOC 2", list: data.certGaps.noSoc2 },
              { label: "Not NIS2 Compliant", list: data.certGaps.noNis2 },
            ].map((gap) => (
              <View key={gap.label} style={{ flex: 1 }}>
                <Text style={{ fontSize: 7, color: C.slate, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{gap.label}</Text>
                <Text style={{ fontSize: 16, color: gap.list.length > 0 ? "#ef4444" : C.compliant, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
                  {gap.list.length}
                </Text>
                {gap.list.slice(0, 4).map((s) => (
                  <Text key={s.id} style={{ fontSize: 7, color: C.slateLight, marginBottom: 1 }}>
                    - {s.name} ({s.criticality})
                  </Text>
                ))}
                {gap.list.length > 4 && (
                  <Text style={{ fontSize: 7, color: C.slate, fontStyle: "italic" }}>
                    +{gap.list.length - 4} more
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>
      </Page>
    );
  };

  // -- NIS2 Compliance + Recommendations page --
  const RecsPage = () => {
    const statusColor = data.nis2Article21dStatus === "compliant"
      ? C.compliant
      : data.nis2Article21dStatus === "partial"
        ? C.partial
        : C.nonCompliant;
    const statusLabel = data.nis2Article21dStatus === "compliant"
      ? "Compliant"
      : data.nis2Article21dStatus === "partial"
        ? "Partially Compliant"
        : "Non-Compliant";

    return (
      <Page size="A4" style={s.contentPage}>
        {/* NIS2 Article 21(2)(d) status */}
        <Text style={s.sectionTitle}>NIS2 Article 21(2)(d) Status</Text>
        <View style={{ ...navyBoxStyle, marginBottom: 14 }}>
          <Text style={{ fontSize: 8, color: C.slate, marginBottom: 8 }}>
            Article 21(2)(d) requires entities to implement supply chain security measures, including security-related aspects of relationships with direct suppliers and service providers.
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: statusColor + "30" }}>
              <Text style={{ fontSize: 10, color: statusColor, fontFamily: "Helvetica-Bold" }}>{statusLabel}</Text>
            </View>
            <Text style={{ fontSize: 8, color: C.slateLight, flex: 1 }}>
              {data.nis2Article21dStatus === "compliant"
                ? "All suppliers assessed, no overdue reviews, average risk score within acceptable range."
                : data.nis2Article21dStatus === "partial"
                  ? "Critical suppliers assessed, but gaps remain in lower-tier supplier assessments or review schedules."
                  : "Significant gaps in supply chain security assessment coverage."}
            </Text>
          </View>

          {/* Quick metrics */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { label: "Suppliers assessed", value: `${data.suppliers.filter((s) => s.securityAssessment?.lastAssessed).length}/${data.totalSuppliers}` },
              { label: "Overdue reviews", value: String(data.overdueSuppliers.length) },
              { label: "Avg risk score", value: `${data.averageRiskScore}/10` },
            ].map((m) => (
              <View key={m.label} style={{ flex: 1, backgroundColor: C.navyDark, borderRadius: 4, padding: 6, alignItems: "center" }}>
                <Text style={{ fontSize: 11, color: C.white, fontFamily: "Helvetica-Bold" }}>{m.value}</Text>
                <Text style={{ fontSize: 6, color: C.slate, marginTop: 2 }}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Overdue assessments */}
        {data.overdueSuppliers.length > 0 && (
          <View style={{ ...navyBoxStyle, marginBottom: 14 }}>
            <Text style={navyBoxTitleStyle}>Overdue Assessments</Text>
            {data.overdueSuppliers.map((s) => (
              <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "#f59e0b" }} />
                <Text style={{ fontSize: 8, color: C.white, flex: 1, fontFamily: "Helvetica-Bold" }}>{s.name}</Text>
                <Text style={{ fontSize: 7, color: C.slate }}>
                  Due: {s.securityAssessment?.nextReview ? new Date(s.securityAssessment.nextReview).toLocaleDateString("en-GB") : "Unknown"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Recommendations */}
        <Text style={s.sectionTitle}>Recommendations</Text>
        {data.recommendations.map((rec, idx) => (
          <View key={idx} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.blue, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 9, color: C.white, fontFamily: "Helvetica-Bold" }}>{idx + 1}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 8, color: C.slateLight, lineHeight: 1.4 }}>{rec}</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={{ marginTop: "auto", borderTop: `1px solid ${C.navyLight}`, paddingTop: 8 }}>
          <Text style={{ fontSize: 7, color: C.slate, textAlign: "center" }}>
            SpaceGuard Supply Chain Risk Assessment | {org.name} | Generated {genDate} | Confidential
          </Text>
        </View>
      </Page>
    );
  };

  return (
    <Document
      title={`SpaceGuard Supply Chain Risk Assessment - ${org.name}`}
      author="SpaceGuard"
      subject="Supply Chain Risk Assessment"
    >
      <TitlePage />
      <InventoryPage />
      <RiskPage />
      <RecsPage />
    </Document>
  );
}

// Inline style helpers (avoid duplicating s.navyBox which may not have the right shape)
const navyBoxStyle = {
  backgroundColor: C.navyCard as string,
  borderRadius: 6,
  padding: 12,
} as const;

const navyBoxTitleStyle = {
  fontSize: 9,
  color: C.blue as string,
  fontFamily: "Helvetica-Bold" as const,
  textTransform: "uppercase" as const,
  letterSpacing: 2,
  marginBottom: 8,
} as const;

// ---------------------------------------------------------------------------
// Exported: Supply Chain PDF generator
// ---------------------------------------------------------------------------

export async function generateSupplyChainPdf(
  organizationId: string
): Promise<Buffer> {
  const data = await buildSupplyChainData(organizationId);
  const buffer = await renderToBuffer(<SupplyChainReport data={data} />);
  return buffer;
}

// ===========================================================================
// AUDIT TRAIL REPORT
// ===========================================================================

// ---------------------------------------------------------------------------
// Data builder
// ---------------------------------------------------------------------------

interface AuditEntryData {
  id: string;
  actor: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  timestamp: Date;
}

interface AuditReportData {
  org: OrgDetails;
  from: Date;
  to: Date;
  generatedAt: string;
  total: number;
  uniqueActors: number;
  byAction: Record<string, number>;
  byActor: Record<string, number>;
  byResourceType: Record<string, number>;
  perDay: Array<{ date: string; count: number }>;
  criticalEvents: AuditEntryData[];
  recentEvents: AuditEntryData[];
}

async function buildAuditReportData(
  organizationId: string,
  from: Date,
  to: Date
): Promise<AuditReportData> {
  // Fetch org
  const [orgRow] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!orgRow) {
    throw new HTTPException(404, { message: "Organization not found" });
  }

  const org: OrgDetails = {
    id: orgRow.id,
    name: orgRow.name,
    country: orgRow.country,
    sector: orgRow.sector,
    nis2Classification: orgRow.nis2Classification,
    contactEmail: orgRow.contactEmail,
  };

  // Fetch all audit events in range for this org
  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, organizationId),
        gte(auditLog.timestamp, from),
        lte(auditLog.timestamp, to)
      )
    )
    .orderBy(desc(auditLog.timestamp));

  const byAction: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  const byResourceType: Record<string, number> = {};
  const perDayMap: Record<string, number> = {};
  const actors = new Set<string>();
  const criticalEvents: AuditEntryData[] = [];

  const CRITICAL_ACTIONS = new Set([
    "DELETE", "STATUS_CHANGE", "INCIDENT_CREATED", "MAPPING_CHANGED",
  ]);

  for (const row of rows) {
    byAction[row.action] = (byAction[row.action] ?? 0) + 1;
    byActor[row.actor] = (byActor[row.actor] ?? 0) + 1;
    actors.add(row.actor);

    if (row.resourceType) {
      byResourceType[row.resourceType] = (byResourceType[row.resourceType] ?? 0) + 1;
    }

    const dateKey = row.timestamp.toISOString().slice(0, 10);
    perDayMap[dateKey] = (perDayMap[dateKey] ?? 0) + 1;

    if (CRITICAL_ACTIONS.has(row.action) && criticalEvents.length < 30) {
      criticalEvents.push({
        id: row.id,
        actor: row.actor,
        action: row.action,
        resourceType: row.resourceType ?? null,
        resourceId: row.resourceId ?? null,
        details: (row.details as Record<string, unknown>) ?? null,
        ipAddress: row.ipAddress ?? null,
        timestamp: row.timestamp,
      });
    }
  }

  const perDay = Object.entries(perDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // Most recent 25 events for the timeline section
  const recentEvents = rows.slice(0, 25).map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    resourceType: row.resourceType ?? null,
    resourceId: row.resourceId ?? null,
    details: (row.details as Record<string, unknown>) ?? null,
    ipAddress: row.ipAddress ?? null,
    timestamp: row.timestamp,
  }));

  return {
    org,
    from,
    to,
    generatedAt: new Date().toISOString(),
    total: rows.length,
    uniqueActors: actors.size,
    byAction,
    byActor,
    byResourceType,
    perDay,
    criticalEvents,
    recentEvents,
  };
}

// ---------------------------------------------------------------------------
// Design helpers (reuse C and s from above)
// ---------------------------------------------------------------------------

const auditActionColor: Record<string, string> = {
  CREATE: C.compliant,
  UPDATE: C.blue,
  DELETE: C.nonCompliant,
  STATUS_CHANGE: C.partial,
  INCIDENT_CREATED: "#f97316",
  ALERT_ACKNOWLEDGED: C.compliant,
  MAPPING_CHANGED: "#a78bfa",
  REPORT_GENERATED: "#22d3ee",
  EXPORT: "#22d3ee",
  VIEW: C.notAssessed,
  LOGIN: "#a78bfa",
  LOGOUT: C.notAssessed,
};

function getAuditColor(action: string): string {
  return auditActionColor[action] ?? C.slate;
}

function fmtAuditDateShort(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtAuditDatetime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

// ---------------------------------------------------------------------------
// Audit Report React PDF component
// ---------------------------------------------------------------------------

function AuditReport({ data }: { data: AuditReportData }) {
  const fromStr = fmtAuditDateShort(data.from);
  const toStr = fmtAuditDateShort(data.to);
  const dateRange = `${fromStr} to ${toStr}`;
  const topActions = Object.entries(data.byAction)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);
  const topActors = Object.entries(data.byActor)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);
  const peakDay = data.perDay.reduce(
    (best, d) => (d.count > best.count ? d : best),
    { date: "-", count: 0 }
  );
  const avgPerDay =
    data.perDay.length > 0
      ? Math.round(data.total / data.perDay.length)
      : 0;

  // -------------------------------------------------------------------------
  // Title page
  // -------------------------------------------------------------------------
  function TitlePage() {
    return (
      <Page size="A4" style={s.titlePage}>
        {/* Top banner */}
        <View style={s.titleBanner}>
          <View>
            <Text style={s.titleBrandName}>SPACEGUARD</Text>
            <Text style={s.titleBrandSub}>OPERATIONAL CYBERSECURITY PLATFORM</Text>
          </View>
          <Text style={s.titleBannerRight}>{"CONFIDENTIAL\nFor internal use only"}</Text>
        </View>

        {/* Body */}
        <View style={s.titleBody}>
          <Text style={s.titleHeading}>Audit Trail{"\n"}Report</Text>
          <Text style={s.titleSubheading}>{dateRange}</Text>

          <View style={s.titleOrgBox}>
            <Text style={s.titleOrgLabel}>ORGANIZATION</Text>
            <Text style={s.titleOrgName}>{data.org.name}</Text>
            <Text style={s.titleOrgMeta}>
              {data.org.country} | {data.org.sector.toUpperCase()} |{" "}
              {data.org.nis2Classification}
            </Text>
          </View>

          {/* KPI row */}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            {[
              { label: "TOTAL EVENTS", value: String(data.total), color: C.blue },
              { label: "UNIQUE ACTORS", value: String(data.uniqueActors), color: C.compliant },
              { label: "ACTION TYPES", value: String(Object.keys(data.byAction).length), color: C.partial },
              { label: "DAYS COVERED", value: String(data.perDay.length), color: C.slate },
            ].map(({ label, value, color }) => (
              <View
                key={label}
                style={{
                  flex: 1,
                  backgroundColor: C.navyCard,
                  borderRadius: 6,
                  padding: 14,
                  borderTopWidth: 2,
                  borderTopColor: color,
                  borderTopStyle: "solid",
                }}
              >
                <Text style={{ fontSize: 7, color: C.slate, letterSpacing: 1.5, marginBottom: 6 }}>
                  {label}
                </Text>
                <Text style={{ fontSize: 22, fontFamily: "Helvetica-Bold", color }}>
                  {value}
                </Text>
              </View>
            ))}
          </View>

          {/* NIS2 badge */}
          <View
            style={{
              marginTop: 28,
              backgroundColor: C.blueDim,
              borderRadius: 6,
              padding: 14,
              borderLeftWidth: 3,
              borderLeftColor: C.blue,
              borderLeftStyle: "solid",
            }}
          >
            <Text style={{ fontSize: 8, color: C.blueLight, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
              NIS2 ARTICLE 21(2)(i) - AUDIT TRAIL EVIDENCE
            </Text>
            <Text style={{ fontSize: 9, color: C.slate, lineHeight: 1.5 }}>
              This report constitutes audit trail evidence as required under NIS2 Directive
              Article 21(2)(i) which mandates policies and procedures for the use of
              cryptography and the logging and monitoring of cybersecurity events.
              All events are timestamped, actor-attributed, and tamper-evident.
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.titleFooter}>
          <Text style={s.titleFooterText}>
            {"Generated: " + data.generatedAt.replace("T", " ").slice(0, 19) + " UTC"}
          </Text>
          <Text style={s.titleFooterText}>{"SpaceGuard v1.0 | CONFIDENTIAL"}</Text>
        </View>
      </Page>
    );
  }

  // -------------------------------------------------------------------------
  // Summary page
  // -------------------------------------------------------------------------
  function SummaryPage() {
    return (
      <Page size="A4" style={s.contentPage}>
        <View style={s.pageHeader}>
          <Text style={[s.sectionBrand, { letterSpacing: 0 }]}>SPACEGUARD AUDIT TRAIL</Text>
          <Text style={s.sectionBrand}>{data.org.name}</Text>
        </View>

        <Text style={s.sectionTitle}>Activity Summary</Text>

        {/* Stats row */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
          {[
            { label: "Total Events", value: data.total, color: C.blue },
            { label: "Peak Day Events", value: peakDay.count, color: C.partial },
            { label: "Avg Events/Day", value: avgPerDay, color: C.slate },
            { label: "Critical Actions", value: data.criticalEvents.length, color: C.nonCompliant },
          ].map(({ label, value, color }) => (
            <View
              key={label}
              style={{
                flex: 1,
                backgroundColor: C.navyCard,
                borderRadius: 6,
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 7, color: C.slate, letterSpacing: 1, marginBottom: 5 }}>
                {label.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color }}>
                {value}
              </Text>
            </View>
          ))}
        </View>

        {/* Actions breakdown */}
        <View style={{ ...navyBoxStyle, marginBottom: 14 }}>
          <Text style={navyBoxTitleStyle}>Events by Action Type</Text>
          {topActions.map(([action, count]) => {
            const pct = data.total > 0 ? (count / data.total) * 100 : 0;
            const barColor = getAuditColor(action);
            return (
              <View key={action} style={{ marginBottom: 7 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                  <Text style={{ fontSize: 8, color: C.slateLight }}>{action.replace(/_/g, " ")}</Text>
                  <Text style={{ fontSize: 8, color: barColor, fontFamily: "Helvetica-Bold" }}>
                    {count}
                  </Text>
                </View>
                <View style={{ height: 5, backgroundColor: C.navyLight, borderRadius: 3 }}>
                  <View
                    style={{
                      height: 5,
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: barColor,
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* Actor breakdown */}
        <View style={navyBoxStyle}>
          <Text style={navyBoxTitleStyle}>Events by Actor</Text>
          {topActors.map(([actor, count]) => {
            const pct = data.total > 0 ? (count / data.total) * 100 : 0;
            return (
              <View key={actor} style={{ marginBottom: 7 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                  <Text style={{ fontSize: 8, color: C.slateLight }}>{actor}</Text>
                  <Text style={{ fontSize: 8, color: C.blue, fontFamily: "Helvetica-Bold" }}>
                    {count}
                  </Text>
                </View>
                <View style={{ height: 5, backgroundColor: C.navyLight, borderRadius: 3 }}>
                  <View
                    style={{
                      height: 5,
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: C.blue,
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 24, borderTopWidth: 1, borderTopColor: C.navyCard, borderTopStyle: "solid", paddingTop: 8 }}>
          <Text style={{ fontSize: 7, color: C.notAssessed }}>{dateRange}</Text>
          <Text style={{ fontSize: 7, color: C.notAssessed }} render={({ pageNumber }) => `Page ${pageNumber}`} />
        </View>
      </Page>
    );
  }

  // -------------------------------------------------------------------------
  // Activity timeline page (daily counts + resource breakdown)
  // -------------------------------------------------------------------------
  function TimelinePage() {
    const maxCount = Math.max(...data.perDay.map((d) => d.count), 1);
    const chartHeight = 70;

    return (
      <Page size="A4" style={s.contentPage}>
        <View style={s.pageHeader}>
          <Text style={[s.sectionBrand, { letterSpacing: 0 }]}>SPACEGUARD AUDIT TRAIL</Text>
          <Text style={s.sectionBrand}>{data.org.name}</Text>
        </View>

        <Text style={s.sectionTitle}>Activity Timeline</Text>

        {/* Daily bar chart */}
        {data.perDay.length > 0 ? (
          <View style={{ ...navyBoxStyle, marginBottom: 18 }}>
            <Text style={navyBoxTitleStyle}>Daily Event Volume</Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                height: chartHeight,
                gap: 2,
                paddingHorizontal: 4,
              }}
            >
              {data.perDay.map((d) => {
                const barH = Math.max(4, (d.count / maxCount) * chartHeight);
                return (
                  <View
                    key={d.date}
                    style={{
                      flex: 1,
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "flex-end",
                    }}
                  >
                    <View
                      style={{
                        width: "100%",
                        height: barH,
                        backgroundColor:
                          d.date === peakDay.date ? C.partial : C.blue,
                        borderRadius: 2,
                      }}
                    />
                  </View>
                );
              })}
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 4,
                paddingHorizontal: 4,
              }}
            >
              <Text style={{ fontSize: 7, color: C.notAssessed }}>
                {data.perDay[0]?.date ?? ""}
              </Text>
              <Text style={{ fontSize: 7, color: C.partial }}>
                Peak: {peakDay.date} ({peakDay.count})
              </Text>
              <Text style={{ fontSize: 7, color: C.notAssessed }}>
                {data.perDay[data.perDay.length - 1]?.date ?? ""}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ ...navyBoxStyle, marginBottom: 18 }}>
            <Text style={{ fontSize: 9, color: C.notAssessed }}>No activity in this period.</Text>
          </View>
        )}

        {/* Resource type breakdown */}
        <View style={{ ...navyBoxStyle, marginBottom: 14 }}>
          <Text style={navyBoxTitleStyle}>Events by Resource Type</Text>
          {Object.entries(data.byResourceType)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([rt, count]) => {
              const pct = data.total > 0 ? (count / data.total) * 100 : 0;
              return (
                <View key={rt} style={{ marginBottom: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                    <Text style={{ fontSize: 8, color: C.slateLight }}>
                      {rt.replace(/_/g, " ")}
                    </Text>
                    <Text style={{ fontSize: 8, color: C.slate }}>
                      {count} ({pct.toFixed(0)}%)
                    </Text>
                  </View>
                  <View style={{ height: 4, backgroundColor: C.navyLight, borderRadius: 2 }}>
                    <View
                      style={{
                        height: 4,
                        width: `${pct}%`,
                        backgroundColor: C.blueLight,
                        borderRadius: 2,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          {Object.keys(data.byResourceType).length === 0 && (
            <Text style={{ fontSize: 9, color: C.notAssessed }}>No resource types recorded.</Text>
          )}
        </View>

        {/* Period stats */}
        <View
          style={{
            backgroundColor: C.navyCard,
            borderRadius: 6,
            padding: 12,
            flexDirection: "row",
            gap: 10,
          }}
        >
          {[
            { label: "Period Start", value: fromStr },
            { label: "Period End", value: toStr },
            { label: "Peak Activity", value: peakDay.date !== "-" ? `${peakDay.date} (${peakDay.count} events)` : "N/A" },
            { label: "Avg Events/Day", value: `${avgPerDay} events` },
          ].map(({ label, value }) => (
            <View key={label} style={{ flex: 1 }}>
              <Text style={{ fontSize: 7, color: C.notAssessed, marginBottom: 3, letterSpacing: 1 }}>
                {label.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 9, color: C.slateLight, fontFamily: "Helvetica-Bold" }}>
                {value}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 24, borderTopWidth: 1, borderTopColor: C.navyCard, borderTopStyle: "solid", paddingTop: 8 }}>
          <Text style={{ fontSize: 7, color: C.notAssessed }}>{dateRange}</Text>
          <Text style={{ fontSize: 7, color: C.notAssessed }} render={({ pageNumber }) => `Page ${pageNumber}`} />
        </View>
      </Page>
    );
  }

  // -------------------------------------------------------------------------
  // Critical actions page
  // -------------------------------------------------------------------------
  function CriticalPage() {
    return (
      <Page size="A4" style={s.contentPage}>
        <View style={s.pageHeader}>
          <Text style={[s.sectionBrand, { letterSpacing: 0 }]}>SPACEGUARD AUDIT TRAIL</Text>
          <Text style={s.sectionBrand}>{data.org.name}</Text>
        </View>

        <Text style={s.sectionTitle}>Critical Actions Log</Text>

        <Text style={{ fontSize: 9, color: C.slate, marginBottom: 14, lineHeight: 1.5 }}>
          The following events represent high-impact actions requiring elevated scrutiny:
          deletions, status changes, incident creations, and compliance mapping changes.
          These events are flagged for regulatory review under NIS2 Article 21.
        </Text>

        {/* Table header */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: C.navyCard,
            borderRadius: 4,
            paddingHorizontal: 10,
            paddingVertical: 7,
            marginBottom: 4,
          }}
        >
          {["Timestamp", "Actor", "Action", "Resource", "Details"].map((h, i) => (
            <Text
              key={h}
              style={{
                fontSize: 7,
                color: C.blue,
                fontFamily: "Helvetica-Bold",
                letterSpacing: 1,
                flex: i === 4 ? 2 : 1,
              }}
            >
              {h.toUpperCase()}
            </Text>
          ))}
        </View>

        {data.criticalEvents.length === 0 ? (
          <View style={{ ...navyBoxStyle, marginTop: 8 }}>
            <Text style={{ fontSize: 9, color: C.compliant }}>
              No critical actions recorded in this period.
            </Text>
          </View>
        ) : (
          data.criticalEvents.map((ev, idx) => (
            <View
              key={ev.id}
              style={{
                flexDirection: "row",
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: idx % 2 === 0 ? C.navyMid : C.navyDark,
                borderLeftWidth: 2,
                borderLeftColor: getAuditColor(ev.action),
                borderLeftStyle: "solid",
              }}
            >
              <Text style={{ flex: 1, fontSize: 7, color: C.slateLight, fontFamily: "Helvetica" }}>
                {fmtAuditDatetime(ev.timestamp).slice(0, 16)}
              </Text>
              <Text style={{ flex: 1, fontSize: 7, color: C.slateLight }}>
                {ev.actor.length > 14 ? ev.actor.slice(0, 12) + ".." : ev.actor}
              </Text>
              <Text style={{ flex: 1, fontSize: 7, color: getAuditColor(ev.action), fontFamily: "Helvetica-Bold" }}>
                {ev.action.replace(/_/g, " ")}
              </Text>
              <Text style={{ flex: 1, fontSize: 7, color: C.slate }}>
                {ev.resourceType ?? "-"}
              </Text>
              <Text style={{ flex: 2, fontSize: 7, color: C.slate }}>
                {ev.details
                  ? Object.entries(ev.details).slice(0, 2).map(([k, v]) => `${k}:${String(v)}`).join(" ")
                  : "-"}
              </Text>
            </View>
          ))
        )}

        {/* NIS2 compliance statement */}
        <View
          style={{
            marginTop: 20,
            backgroundColor: C.blueDim,
            borderRadius: 6,
            padding: 14,
            borderLeftWidth: 3,
            borderLeftColor: C.blue,
            borderLeftStyle: "solid",
          }}
        >
          <Text style={{ fontSize: 8, color: C.blueLight, fontFamily: "Helvetica-Bold", marginBottom: 6 }}>
            NIS2 ARTICLE 21(2)(i) COMPLIANCE STATEMENT
          </Text>
          <Text style={{ fontSize: 8.5, color: C.slate, lineHeight: 1.6 }}>
            {data.org.name} maintains a complete, tamper-evident audit trail of all
            cybersecurity-relevant actions on the SpaceGuard platform. This includes
            access controls, compliance mapping changes, incident management actions,
            alert handling, and supply chain modifications. The audit log is timestamped,
            actor-attributed, and retained for regulatory review. This constitutes
            compliance evidence under NIS2 Directive Article 21(2)(i) relating to
            policies and procedures for logging and monitoring of cybersecurity events.
          </Text>
          <Text style={{ fontSize: 7.5, color: C.notAssessed, marginTop: 8 }}>
            {"Report generated: " + data.generatedAt.replace("T", " ").slice(0, 19) + " UTC | SpaceGuard Audit System v1.0"}
          </Text>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 24, borderTopWidth: 1, borderTopColor: C.navyCard, borderTopStyle: "solid", paddingTop: 8 }}>
          <Text style={{ fontSize: 7, color: C.notAssessed }}>{dateRange}</Text>
          <Text style={{ fontSize: 7, color: C.notAssessed }} render={({ pageNumber }) => `Page ${pageNumber}`} />
        </View>
      </Page>
    );
  }

  // -------------------------------------------------------------------------
  // Recent events page
  // -------------------------------------------------------------------------
  function RecentEventsPage() {
    return (
      <Page size="A4" style={s.contentPage}>
        <View style={s.pageHeader}>
          <Text style={[s.sectionBrand, { letterSpacing: 0 }]}>SPACEGUARD AUDIT TRAIL</Text>
          <Text style={s.sectionBrand}>{data.org.name}</Text>
        </View>

        <Text style={s.sectionTitle}>Recent Events (Last 25)</Text>

        {/* Table header */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: C.navyCard,
            borderRadius: 4,
            paddingHorizontal: 10,
            paddingVertical: 7,
            marginBottom: 4,
          }}
        >
          {["Timestamp", "Actor", "Action", "Resource Type", "Resource ID"].map((h, i) => (
            <Text
              key={h}
              style={{
                fontSize: 7,
                color: C.blue,
                fontFamily: "Helvetica-Bold",
                letterSpacing: 1,
                flex: i === 0 ? 1.4 : 1,
              }}
            >
              {h.toUpperCase()}
            </Text>
          ))}
        </View>

        {data.recentEvents.length === 0 ? (
          <View style={navyBoxStyle}>
            <Text style={{ fontSize: 9, color: C.notAssessed }}>No events in this period.</Text>
          </View>
        ) : (
          data.recentEvents.map((ev, idx) => (
            <View
              key={ev.id}
              style={{
                flexDirection: "row",
                paddingHorizontal: 10,
                paddingVertical: 5,
                backgroundColor: idx % 2 === 0 ? C.navyMid : C.navyDark,
              }}
            >
              <Text style={{ flex: 1.4, fontSize: 7, color: C.slate, fontFamily: "Helvetica" }}>
                {fmtAuditDatetime(ev.timestamp).slice(0, 16)}
              </Text>
              <Text style={{ flex: 1, fontSize: 7, color: C.slateLight }}>
                {ev.actor.length > 14 ? ev.actor.slice(0, 12) + ".." : ev.actor}
              </Text>
              <Text style={{ flex: 1, fontSize: 7, color: getAuditColor(ev.action), fontFamily: "Helvetica-Bold" }}>
                {ev.action.replace(/_/g, " ")}
              </Text>
              <Text style={{ flex: 1, fontSize: 7, color: C.slate }}>
                {ev.resourceType ?? "-"}
              </Text>
              <Text style={{ flex: 1, fontSize: 7, color: C.notAssessed, fontFamily: "Helvetica" }}>
                {ev.resourceId ? ev.resourceId.slice(0, 8) + "..." : "-"}
              </Text>
            </View>
          ))
        )}

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 24, borderTopWidth: 1, borderTopColor: C.navyCard, borderTopStyle: "solid", paddingTop: 8 }}>
          <Text style={{ fontSize: 7, color: C.notAssessed }}>{dateRange}</Text>
          <Text style={{ fontSize: 7, color: C.notAssessed }} render={({ pageNumber }) => `Page ${pageNumber}`} />
        </View>
      </Page>
    );
  }

  return (
    <Document
      title={`SpaceGuard Audit Trail - ${data.org.name} (${dateRange})`}
      author="SpaceGuard"
      subject="Audit Trail Report - NIS2 Article 21(2)(i)"
    >
      <TitlePage />
      <SummaryPage />
      <TimelinePage />
      <CriticalPage />
      <RecentEventsPage />
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Exported: Audit Trail PDF generator
// ---------------------------------------------------------------------------

export async function generateAuditTrailPdf(
  organizationId: string,
  from: Date,
  to: Date
): Promise<Buffer> {
  const data = await buildAuditReportData(organizationId, from, to);
  const buffer = await renderToBuffer(<AuditReport data={data} />);
  return buffer;
}
