import { Hono } from "hono";
import { createPlaybookSchema, updatePlaybookSchema, executePlaybookSchema } from "@spaceguard/shared";
import {
  createPlaybook,
  listPlaybooks,
  getPlaybook,
  updatePlaybook as updatePlaybookService,
  deletePlaybook as deletePlaybookService,
  executePlaybook,
  listExecutions,
  getExecution,
} from "../services/playbook.service";
import { assertUUID, assertTenant } from "../middleware/validate";

const app = new Hono();

// ---------------------------------------------------------------------------
// CRUD: /playbooks
// ---------------------------------------------------------------------------

// List playbooks for organization
app.get("/playbooks", async (c) => {
  const user = c.get("user");
  const organizationId = (c.req.query("organizationId") ?? user.organizationId);
  assertUUID(organizationId, "organizationId");
  assertTenant(c, organizationId);

  const data = await listPlaybooks(organizationId);
  return c.json({ data });
});

// Get single playbook
app.get("/playbooks/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");

  const playbook = await getPlaybook(id);

  // Tenant check: org-scoped playbooks are restricted
  if (playbook.organizationId) {
    assertTenant(c, playbook.organizationId);
  }

  return c.json(playbook);
});

// Create playbook
app.post("/playbooks", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createPlaybookSchema.parse(body);

  // Default to user's org if not specified
  if (!parsed.organizationId) {
    parsed.organizationId = user.organizationId;
  }

  assertTenant(c, parsed.organizationId);

  const playbook = await createPlaybook(parsed);
  return c.json(playbook, 201);
});

// Update playbook
app.put("/playbooks/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");

  // Verify ownership
  const existing = await getPlaybook(id);
  if (existing.organizationId) {
    assertTenant(c, existing.organizationId);
  }

  const body = await c.req.json();
  const parsed = updatePlaybookSchema.parse(body);

  const playbook = await updatePlaybookService(id, parsed);
  return c.json(playbook);
});

// Delete playbook
app.delete("/playbooks/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");

  const existing = await getPlaybook(id);
  if (existing.organizationId) {
    assertTenant(c, existing.organizationId);
  }

  await deletePlaybookService(id);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

// Execute a playbook manually
app.post("/playbooks/:id/execute", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");

  const existing = await getPlaybook(id);
  if (existing.organizationId) {
    assertTenant(c, existing.organizationId);
  }

  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = executePlaybookSchema.parse(body);

  const execution = await executePlaybook(id, {
    alertId: parsed.alertId,
    incidentId: parsed.incidentId,
    organizationId: existing.organizationId ?? user.organizationId,
    triggeredBy: user.email,
  });

  return c.json(execution, 201);
});

// List executions (optionally filtered by playbook)
app.get("/playbooks/executions/list", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertUUID(organizationId, "organizationId");
  assertTenant(c, organizationId);

  const playbookId = c.req.query("playbookId");
  if (playbookId) assertUUID(playbookId, "playbookId");

  const data = await listExecutions(playbookId, organizationId);
  return c.json({ data });
});

// Get single execution
app.get("/playbooks/executions/:executionId", async (c) => {
  const executionId = c.req.param("executionId");
  assertUUID(executionId, "executionId");

  const execution = await getExecution(executionId);
  return c.json(execution);
});

export const playbookRoutes = app;
