import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createCryptoEntry,
  listCryptoEntries,
  getCryptoEntry,
  deleteCryptoEntry,
  getCryptoPosture,
  getPqcReadinessReport,
} from "../services/crypto.service";
import { assertUUID, assertTenant } from "../middleware/validate";
import { logAudit, extractActor, extractIp } from "../middleware/audit";

export const cryptoRoutes = new Hono();

const createSchema = z.object({
  organizationId: z.string().uuid(),
  assetId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  mechanismType: z.enum([
    "LINK_ENCRYPTION", "DATA_AT_REST", "DATA_IN_TRANSIT",
    "KEY_MANAGEMENT", "AUTHENTICATION", "DIGITAL_SIGNATURE", "OTAR",
  ]),
  algorithm: z.string().min(1).max(100),
  keyLengthBits: z.number().int().positive().nullable().optional(),
  protocol: z.string().max(100).nullable().optional(),
  implementation: z.string().max(255).nullable().optional(),
  pqcVulnerable: z.boolean().optional(),
  pqcMigrationStatus: z.enum([
    "NOT_STARTED", "EVALUATING", "MIGRATION_PLANNED",
    "IN_PROGRESS", "COMPLETED", "NOT_APPLICABLE",
  ]).optional(),
  keyLastRotated: z.string().nullable().optional(),
  keyRotationIntervalDays: z.number().int().positive().nullable().optional(),
  keyNextRotation: z.string().nullable().optional(),
  certificateExpiry: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "DEPRECATED", "DISABLED"]).optional(),
  notes: z.string().nullable().optional(),
});

// List
cryptoRoutes.get("/crypto/inventory", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertUUID(organizationId, "organizationId");
  assertTenant(c, organizationId);
  const data = await listCryptoEntries(organizationId);
  return c.json({ data, total: data.length });
});

// Create
cryptoRoutes.post(
  "/crypto/inventory",
  zValidator("json", createSchema),
  async (c) => {
    const data = c.req.valid("json");
    assertTenant(c, data.organizationId);
    const entry = await createCryptoEntry(data);
    logAudit({
      organizationId: data.organizationId,
      actor: extractActor(c),
      action: "CREATE",
      resourceType: "crypto_mechanism",
      resourceId: entry.id,
      details: { name: data.name, algorithm: data.algorithm },
      ipAddress: extractIp(c),
    });
    return c.json(entry, 201);
  }
);

// Get single
cryptoRoutes.get("/crypto/inventory/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const entry = await getCryptoEntry(id);
  assertTenant(c, entry.organizationId);
  return c.json(entry);
});

// Delete
cryptoRoutes.delete("/crypto/inventory/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const entry = await getCryptoEntry(id);
  assertTenant(c, entry.organizationId);
  await deleteCryptoEntry(id);
  return c.json({ success: true });
});

// Posture dashboard
cryptoRoutes.get("/crypto/posture", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertUUID(organizationId, "organizationId");
  assertTenant(c, organizationId);
  const posture = await getCryptoPosture(organizationId);
  return c.json(posture);
});

// PQC readiness report
cryptoRoutes.get("/crypto/pqc-readiness", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertUUID(organizationId, "organizationId");
  assertTenant(c, organizationId);
  const report = await getPqcReadinessReport(organizationId);
  return c.json(report);
});
