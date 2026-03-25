import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { listAuditLogs } from "../services/audit.service";

export const auditRoutes = new Hono();

const auditQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  from:           z.string().optional(),
  to:             z.string().optional(),
  actor:          z.string().optional(),
  action:         z.string().optional(),
  resourceType:   z.string().optional(),
  page:           z.coerce.number().int().positive().default(1),
  perPage:        z.coerce.number().int().positive().max(200).default(50),
});

// GET /api/v1/audit
auditRoutes.get(
  "/audit",
  zValidator("query", auditQuerySchema),
  async (c) => {
    const q = c.req.valid("query");

    let from: Date | undefined;
    let to: Date | undefined;

    if (q.from) {
      from = new Date(q.from);
      if (isNaN(from.getTime())) return c.json({ error: "Invalid 'from' date" }, 400);
    }
    if (q.to) {
      to = new Date(q.to);
      if (isNaN(to.getTime())) return c.json({ error: "Invalid 'to' date" }, 400);
      to.setHours(23, 59, 59, 999);
    }

    const result = await listAuditLogs({
      organizationId: q.organizationId,
      from,
      to,
      actor:        q.actor,
      action:       q.action,
      resourceType: q.resourceType,
      page:         q.page,
      perPage:      q.perPage,
    });

    return c.json(result);
  }
);
