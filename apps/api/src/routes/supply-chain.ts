import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createSupplierSchema,
  updateSupplierSchema,
  supplierQuerySchema,
} from "@spaceguard/shared";
import {
  createSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
  deleteSupplier,
  getSupplierRiskSummary,
} from "../services/supply-chain.service";
import {
  createQuestionnaire,
  getQuestionnaire,
  listQuestionnaires,
  submitResponses,
  sendQuestionnaire,
  QUESTIONNAIRE_TEMPLATE,
} from "../services/questionnaire.service";
import { logAudit, extractActor, extractIp } from "../middleware/audit";

export const supplyChainRoutes = new Hono();

import { assertUUID, assertTenant, UUID_RE } from "../middleware/validate";

// POST /api/v1/supply-chain/suppliers
supplyChainRoutes.post(
  "/supply-chain/suppliers",
  zValidator("json", createSupplierSchema),
  async (c) => {
    const data = c.req.valid("json");
    assertTenant(c, data.organizationId);
    const supplier = await createSupplier(data);
    logAudit({
      organizationId: supplier.organizationId,
      actor: extractActor(c),
      action: "CREATE",
      resourceType: "supplier",
      resourceId: supplier.id,
      details: { name: supplier.name, type: supplier.type, criticality: supplier.criticality },
      ipAddress: extractIp(c),
    });
    return c.json(supplier, 201);
  }
);

// GET /api/v1/supply-chain/suppliers?organizationId=&type=&criticality=&page=&perPage=
supplyChainRoutes.get(
  "/supply-chain/suppliers",
  zValidator("query", supplierQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const user = c.get("user");
    // Enforce tenant isolation: non-admin users must filter by their own org
    if (query.organizationId) {
      assertTenant(c, query.organizationId);
    } else if (user.role !== "ADMIN") {
      query.organizationId = user.organizationId;
    }
    const result = await listSuppliers(query);
    return c.json(result);
  }
);

// GET /api/v1/supply-chain/suppliers/:id
supplyChainRoutes.get("/supply-chain/suppliers/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const supplier = await getSupplier(id);
  assertTenant(c, supplier.organizationId);
  return c.json(supplier);
});

// PUT /api/v1/supply-chain/suppliers/:id
supplyChainRoutes.put(
  "/supply-chain/suppliers/:id",
  zValidator("json", updateSupplierSchema),
  async (c) => {
    const id = c.req.param("id");
    assertUUID(id, "id");
    const existing = await getSupplier(id);
    assertTenant(c, existing.organizationId);
    const data = c.req.valid("json");
    const supplier = await updateSupplier(id, data);
    logAudit({
      organizationId: supplier.organizationId,
      actor: extractActor(c),
      action: "UPDATE",
      resourceType: "supplier",
      resourceId: id,
      details: { name: supplier.name, changes: data },
      ipAddress: extractIp(c),
    });
    return c.json(supplier);
  }
);

// DELETE /api/v1/supply-chain/suppliers/:id
supplyChainRoutes.delete("/supply-chain/suppliers/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const existing = await getSupplier(id);
  assertTenant(c, existing.organizationId);
  const supplier = await deleteSupplier(id);
  logAudit({
    organizationId: supplier.organizationId,
    actor: extractActor(c),
    action: "DELETE",
    resourceType: "supplier",
    resourceId: id,
    details: { name: supplier.name },
    ipAddress: extractIp(c),
  });
  return c.json(supplier);
});

// GET /api/v1/supply-chain/risk-summary?organizationId=
supplyChainRoutes.get("/supply-chain/risk-summary", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) {
    return c.json({ error: "organizationId query parameter is required" }, 400);
  }
  if (!UUID_RE.test(organizationId)) {
    return c.json({ error: "organizationId must be a valid UUID" }, 400);
  }
  assertTenant(c, organizationId);
  const summary = await getSupplierRiskSummary(organizationId);
  return c.json(summary);
});

// ---------------------------------------------------------------------------
// Vendor Questionnaires
// ---------------------------------------------------------------------------

// Get questionnaire template
supplyChainRoutes.get("/supply-chain/questionnaire-template", async (c) => {
  return c.json({ questions: QUESTIONNAIRE_TEMPLATE, totalQuestions: QUESTIONNAIRE_TEMPLATE.length });
});

// List questionnaires for a supplier
supplyChainRoutes.get("/supply-chain/suppliers/:supplierId/questionnaires", async (c) => {
  const supplierId = c.req.param("supplierId");
  const questionnaires = await listQuestionnaires(supplierId);
  return c.json({ data: questionnaires, total: questionnaires.length });
});

// Create new questionnaire for a supplier
supplyChainRoutes.post("/supply-chain/suppliers/:supplierId/questionnaires", async (c) => {
  const supplierId = c.req.param("supplierId");
  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertTenant(c, organizationId);
  const q = await createQuestionnaire(supplierId, organizationId);
  return c.json(q, 201);
});

// Send questionnaire
supplyChainRoutes.post("/supply-chain/questionnaires/:id/send", async (c) => {
  const id = c.req.param("id");
  const q = await sendQuestionnaire(id);
  return c.json(q);
});

// Submit responses
supplyChainRoutes.post("/supply-chain/questionnaires/:id/submit", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const q = await submitResponses(id, body.responses ?? {});
  return c.json(q);
});

// Get single questionnaire
supplyChainRoutes.get("/supply-chain/questionnaires/:id", async (c) => {
  const id = c.req.param("id");
  const q = await getQuestionnaire(id);
  return c.json(q);
});
