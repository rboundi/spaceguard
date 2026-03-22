import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { eq, and, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import {
  organizations,
  complianceRequirements,
  complianceMappings,
  spaceAssets,
} from "../db/schema/index";
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
    dashboard.byStatus.NOT_ASSESSED + dashboard.byStatus.NON_COMPLIANT;

  return (
    <Page size="A4" style={s.titlePage}>
      {/* Blue top banner */}
      <View style={s.titleBanner}>
        <View>
          <Text style={s.titleBrandName}>SPACEGUARD</Text>
          <Text style={s.titleBrandSub}>CYBERSECURITY PLATFORM</Text>
        </View>
        <View>
          <Text style={s.titleBannerRight}>NIS2 Directive - Article 21</Text>
          <Text style={s.titleBannerRight}>Compliance Assessment Report</Text>
        </View>
      </View>

      {/* Body */}
      <View style={s.titleBody}>
        <Text style={s.titleHeading}>NIS2 Compliance{"\n"}Report</Text>
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
      count: dashboard.byStatus.COMPLIANT,
    },
    {
      key: "PARTIALLY_COMPLIANT",
      label: "Partially Compliant",
      color: C.partial,
      count: dashboard.byStatus.PARTIALLY_COMPLIANT,
    },
    {
      key: "NON_COMPLIANT",
      label: "Non-Compliant",
      color: C.nonCompliant,
      count: dashboard.byStatus.NON_COMPLIANT,
    },
    {
      key: "NOT_ASSESSED",
      label: "Not Assessed",
      color: C.notAssessed,
      count: dashboard.byStatus.NOT_ASSESSED,
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
                  dashboard.byStatus.NON_COMPLIANT > 0
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
                  dashboard.byStatus.NOT_ASSESSED > 0
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
            <Text style={[s.tdCellBold, { marginBottom: 2 }]} numberOfLines={2}>
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
          <Text style={[s.tdCell, s.matCol4]} numberOfLines={3}>
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
              <Text style={[s.tdCell, s.asCol5]} numberOfLines={2}>
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
// Root PDF document
// ---------------------------------------------------------------------------

function ComplianceReport({ data }: { data: ReportData }) {
  return (
    <Document
      title={`NIS2 Compliance Report - ${data.org.name}`}
      author="SpaceGuard Platform"
      subject="NIS2 Article 21 Compliance Assessment"
      creator="SpaceGuard"
      producer="SpaceGuard v0.1"
    >
      <TitlePage data={data} />
      <ExecutiveSummaryPage data={data} />
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
