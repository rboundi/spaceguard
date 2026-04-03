/**
 * Vendor security questionnaire service.
 *
 * 20-question template based on NIS2 Article 21(2)(d) supply chain
 * requirements. Auto-scored: Yes=10, Partial=5, No=0, normalized 0-100.
 */

import { eq, and, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { vendorQuestionnaires, suppliers } from "../db/schema/index";

// ---------------------------------------------------------------------------
// Questionnaire template
// ---------------------------------------------------------------------------

export interface QuestionTemplate {
  id: string;
  category: string;
  question: string;
  nis2Reference: string;
}

export const QUESTIONNAIRE_TEMPLATE: QuestionTemplate[] = [
  { id: "Q01", category: "Security Policies", question: "Does your organization have a documented information security policy?", nis2Reference: "Art 21(2)(a)" },
  { id: "Q02", category: "Security Policies", question: "Is the security policy reviewed and updated at least annually?", nis2Reference: "Art 21(2)(a)" },
  { id: "Q03", category: "Incident Response", question: "Do you have a documented incident response plan?", nis2Reference: "Art 21(2)(b)" },
  { id: "Q04", category: "Incident Response", question: "What is your SLA for notifying customers of security incidents? (hours)", nis2Reference: "Art 21(2)(b)" },
  { id: "Q05", category: "Business Continuity", question: "Do you maintain and test a business continuity plan?", nis2Reference: "Art 21(2)(c)" },
  { id: "Q06", category: "Business Continuity", question: "What is your disaster recovery RTO/RPO for critical services?", nis2Reference: "Art 21(2)(c)" },
  { id: "Q07", category: "Encryption", question: "Is data encrypted in transit using TLS 1.2 or higher?", nis2Reference: "Art 21(2)(h)" },
  { id: "Q08", category: "Encryption", question: "Is data encrypted at rest using AES-256 or equivalent?", nis2Reference: "Art 21(2)(h)" },
  { id: "Q09", category: "Access Control", question: "Is multi-factor authentication required for all privileged access?", nis2Reference: "Art 21(2)(j)" },
  { id: "Q10", category: "Access Control", question: "Are user access reviews conducted at least quarterly?", nis2Reference: "Art 21(2)(i)" },
  { id: "Q11", category: "Vulnerability Management", question: "Do you perform regular vulnerability scanning of your systems?", nis2Reference: "Art 21(2)(e)" },
  { id: "Q12", category: "Vulnerability Management", question: "What is your SLA for patching critical vulnerabilities? (days)", nis2Reference: "Art 21(2)(e)" },
  { id: "Q13", category: "Certifications", question: "Do you hold ISO 27001 or equivalent certification?", nis2Reference: "Art 21(2)(f)" },
  { id: "Q14", category: "Certifications", question: "When was your last external penetration test conducted?", nis2Reference: "Art 21(2)(f)" },
  { id: "Q15", category: "Data Locations", question: "Where is customer data stored? (EU/EEA only, or other regions)", nis2Reference: "Art 21(2)(d)" },
  { id: "Q16", category: "Data Locations", question: "Do you use any sub-processors or subcontractors with access to customer data?", nis2Reference: "Art 21(2)(d)" },
  { id: "Q17", category: "Subcontractors", question: "Do your subcontractors meet the same security requirements?", nis2Reference: "Art 21(2)(d)" },
  { id: "Q18", category: "Subcontractors", question: "Can you provide a list of subcontractors with access to our data?", nis2Reference: "Art 21(2)(d)" },
  { id: "Q19", category: "Training", question: "Do all employees receive annual cybersecurity awareness training?", nis2Reference: "Art 21(2)(g)" },
  { id: "Q20", category: "Right to Audit", question: "Do you accept the right-to-audit clause in security contracts?", nis2Reference: "Art 21(2)(d)" },
];

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

function calculateScore(responses: Record<string, string>): number {
  let total = 0;
  let maxScore = QUESTIONNAIRE_TEMPLATE.length * 10;

  for (const q of QUESTIONNAIRE_TEMPLATE) {
    const answer = (responses[q.id] ?? "").toUpperCase().trim();
    if (answer === "YES" || answer === "Y") total += 10;
    else if (answer === "PARTIAL" || answer === "P") total += 5;
    // NO or empty = 0
  }

  return Math.round((total / maxScore) * 100);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createQuestionnaire(
  supplierId: string,
  organizationId: string,
) {
  // Verify supplier exists
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.organizationId, organizationId)))
    .limit(1);

  if (!supplier) {
    throw new HTTPException(404, { message: `Supplier ${supplierId} not found` });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30-day expiry

  const [row] = await db
    .insert(vendorQuestionnaires)
    .values({
      supplierId,
      organizationId,
      status: "DRAFT",
      expiresAt,
    })
    .returning();

  return questionnaireToResponse(row);
}

export async function getQuestionnaire(id: string) {
  const [row] = await db
    .select()
    .from(vendorQuestionnaires)
    .where(eq(vendorQuestionnaires.id, id))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: `Questionnaire ${id} not found` });
  return questionnaireToResponse(row);
}

export async function listQuestionnaires(supplierId: string) {
  const rows = await db
    .select()
    .from(vendorQuestionnaires)
    .where(eq(vendorQuestionnaires.supplierId, supplierId))
    .orderBy(desc(vendorQuestionnaires.createdAt));

  return rows.map(questionnaireToResponse);
}

export async function submitResponses(
  id: string,
  responses: Record<string, string>,
) {
  const [existing] = await db
    .select()
    .from(vendorQuestionnaires)
    .where(eq(vendorQuestionnaires.id, id))
    .limit(1);

  if (!existing) throw new HTTPException(404, { message: `Questionnaire ${id} not found` });

  const score = calculateScore(responses);

  const [row] = await db
    .update(vendorQuestionnaires)
    .set({
      responses,
      riskScoreCalculated: score,
      status: "COMPLETED",
      completedAt: new Date(),
    })
    .where(eq(vendorQuestionnaires.id, id))
    .returning();

  return questionnaireToResponse(row);
}

export async function sendQuestionnaire(id: string) {
  const [row] = await db
    .update(vendorQuestionnaires)
    .set({ status: "SENT", sentAt: new Date() })
    .where(eq(vendorQuestionnaires.id, id))
    .returning();

  if (!row) throw new HTTPException(404, { message: `Questionnaire ${id} not found` });
  return questionnaireToResponse(row);
}

function questionnaireToResponse(row: typeof vendorQuestionnaires.$inferSelect) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    organizationId: row.organizationId,
    status: row.status,
    sentAt: row.sentAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    responses: row.responses,
    riskScoreCalculated: row.riskScoreCalculated,
    createdAt: row.createdAt.toISOString(),
  };
}
