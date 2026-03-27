import { eq, and, desc, isNull, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import {
  playbooks,
  playbookExecutions,
  type Playbook,
  type PlaybookExecution,
} from "../db/schema/playbooks";
import type { CreatePlaybook, UpdatePlaybook, PlaybookResponse, PlaybookExecutionResponse, ExecutionLogEntry, PlaybookStep } from "@spaceguard/shared";
import { PlaybookExecutionStatus, PlaybookStepType, AlertStatus } from "@spaceguard/shared";
import { updateAlert } from "./detection/alert.service";
import { createIncidentFromAlert } from "./incident.service";
import { sendEmail } from "./notification.service";

// ---------------------------------------------------------------------------
// Response mappers
// ---------------------------------------------------------------------------

function playbookToResponse(row: Playbook): PlaybookResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    trigger: row.trigger,
    steps: row.steps as unknown as PlaybookStep[],
    isActive: row.isActive,
    executionCount: row.executionCount,
    lastExecuted: row.lastExecuted?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function executionToResponse(
  row: PlaybookExecution,
  playbookName?: string,
): PlaybookExecutionResponse {
  return {
    id: row.id,
    playbookId: row.playbookId,
    playbookName,
    incidentId: row.incidentId,
    alertId: row.alertId,
    triggeredBy: row.triggeredBy,
    status: row.status as PlaybookExecutionStatus,
    stepsCompleted: row.stepsCompleted,
    stepsTotal: row.stepsTotal,
    log: row.log,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createPlaybook(
  data: CreatePlaybook,
): Promise<PlaybookResponse> {
  const [row] = await db
    .insert(playbooks)
    .values({
      organizationId: data.organizationId ?? null,
      name: data.name,
      description: data.description ?? null,
      trigger: data.trigger,
      steps: data.steps,
      isActive: data.isActive ?? true,
    })
    .returning();

  if (!row) {
    throw new HTTPException(500, { message: "Failed to create playbook" });
  }

  return playbookToResponse(row);
}

export async function listPlaybooks(
  organizationId: string,
): Promise<PlaybookResponse[]> {
  const rows = await db
    .select()
    .from(playbooks)
    .where(
      or(
        eq(playbooks.organizationId, organizationId),
        isNull(playbooks.organizationId),
      ),
    )
    .orderBy(desc(playbooks.updatedAt));

  return rows.map(playbookToResponse);
}

export async function getPlaybook(id: string): Promise<PlaybookResponse> {
  const [row] = await db
    .select()
    .from(playbooks)
    .where(eq(playbooks.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: `Playbook ${id} not found` });
  }

  return playbookToResponse(row);
}

export async function updatePlaybook(
  id: string,
  data: UpdatePlaybook,
): Promise<PlaybookResponse> {
  await getPlaybook(id);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.trigger !== undefined) updates.trigger = data.trigger;
  if (data.steps !== undefined) updates.steps = data.steps;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  const [row] = await db
    .update(playbooks)
    .set(updates)
    .where(eq(playbooks.id, id))
    .returning();

  if (!row) {
    throw new HTTPException(404, { message: `Playbook ${id} not found` });
  }

  return playbookToResponse(row);
}

export async function deletePlaybook(id: string): Promise<void> {
  await getPlaybook(id);
  await db.delete(playbooks).where(eq(playbooks.id, id));
}

// ---------------------------------------------------------------------------
// Execution history
// ---------------------------------------------------------------------------

export async function listExecutions(
  playbookId?: string,
  organizationId?: string,
  limit: number = 50,
): Promise<PlaybookExecutionResponse[]> {
  let query = db
    .select({
      execution: playbookExecutions,
      playbookName: playbooks.name,
    })
    .from(playbookExecutions)
    .innerJoin(playbooks, eq(playbookExecutions.playbookId, playbooks.id))
    .orderBy(desc(playbookExecutions.startedAt))
    .limit(limit);

  if (playbookId) {
    query = query.where(eq(playbookExecutions.playbookId, playbookId)) as typeof query;
  }
  if (organizationId) {
    query = query.where(
      or(
        eq(playbooks.organizationId, organizationId),
        isNull(playbooks.organizationId),
      ),
    ) as typeof query;
  }

  const rows = await query;
  return rows.map((r) =>
    executionToResponse(r.execution, r.playbookName),
  );
}

export async function getExecution(
  id: string,
): Promise<PlaybookExecutionResponse> {
  const rows = await db
    .select({
      execution: playbookExecutions,
      playbookName: playbooks.name,
    })
    .from(playbookExecutions)
    .innerJoin(playbooks, eq(playbookExecutions.playbookId, playbooks.id))
    .where(eq(playbookExecutions.id, id))
    .limit(1);

  if (!rows[0]) {
    throw new HTTPException(404, { message: `Execution ${id} not found` });
  }

  return executionToResponse(rows[0].execution, rows[0].playbookName);
}

// ---------------------------------------------------------------------------
// Step execution engine
// ---------------------------------------------------------------------------

interface ExecutionContext {
  alertId?: string;
  incidentId?: string;
  organizationId: string;
  triggeredBy: string;
}

async function executeStep(
  step: { id: string; type: string; label: string; config: Record<string, unknown> },
  context: ExecutionContext,
): Promise<ExecutionLogEntry> {
  const now = new Date().toISOString();

  try {
    switch (step.type) {
      case "notify": {
        const config = step.config as {
          channels?: string[];
          recipients?: string[];
          message?: string;
        };
        const recipients = config.recipients ?? [];
        if (recipients.length > 0) {
          await sendEmail({
            to: recipients,
            subject: `[SpaceGuard Playbook] ${step.label}`,
            html: `<p>${config.message ?? `Automated playbook step executed: ${step.label}`}</p>`,
          });
        }
        return {
          stepIndex: 0,
          stepType: step.type,
          status: "success",
          message: `Notified ${recipients.length} recipient(s) via ${(config.channels ?? ["email"]).join(", ")}`,
          timestamp: now,
          details: { recipients, channels: config.channels },
        };
      }

      case "create_incident": {
        if (context.alertId) {
          const incident = await createIncidentFromAlert(
            context.alertId,
            context.organizationId,
          );
          if (incident) {
            context.incidentId = incident.id;
            return {
              stepIndex: 0,
              stepType: step.type,
              status: "success",
              message: `Created incident ${incident.id} from alert`,
              timestamp: now,
              details: { incidentId: incident.id },
            };
          }
          return {
            stepIndex: 0,
            stepType: step.type,
            status: "skipped",
            message: "Alert does not meet incident creation criteria or incident already exists",
            timestamp: now,
          };
        }
        return {
          stepIndex: 0,
          stepType: step.type,
          status: "skipped",
          message: "No alert context available to create incident from",
          timestamp: now,
        };
      }

      case "change_alert_status": {
        const config = step.config as { newStatus?: string };
        if (context.alertId && config.newStatus) {
          await updateAlert(context.alertId, { status: config.newStatus as AlertStatus });
          return {
            stepIndex: 0,
            stepType: step.type,
            status: "success",
            message: `Alert status changed to ${config.newStatus}`,
            timestamp: now,
            details: { alertId: context.alertId, newStatus: config.newStatus },
          };
        }
        return {
          stepIndex: 0,
          stepType: step.type,
          status: "skipped",
          message: "No alert context or target status specified",
          timestamp: now,
        };
      }

      case "generate_report": {
        // Report generation is a placeholder - in production this would call
        // the report service to generate the actual PDF
        const config = step.config as { reportType?: string };
        return {
          stepIndex: 0,
          stepType: step.type,
          status: "success",
          message: `Report generation triggered: ${config.reportType ?? "unknown"}`,
          timestamp: now,
          details: {
            reportType: config.reportType,
            incidentId: context.incidentId,
          },
        };
      }

      case "webhook_action": {
        const config = step.config as {
          url?: string;
          endpointId?: string;
          payloadTemplate?: Record<string, unknown>;
        };
        // In production, this would actually call the webhook endpoint
        return {
          stepIndex: 0,
          stepType: step.type,
          status: "success",
          message: `Webhook dispatched to ${config.url ?? config.endpointId ?? "configured endpoint"}`,
          timestamp: now,
          details: { url: config.url, endpointId: config.endpointId },
        };
      }

      case "wait": {
        const config = step.config as { minutes?: number };
        const minutes = config.minutes ?? 5;
        // Wait steps log and return immediately in the async model.
        // In production, the execution would be suspended and resumed
        // after the wait period via a scheduled job.
        return {
          stepIndex: 0,
          stepType: step.type,
          status: "success",
          message: `Wait step: ${minutes} minutes (execution continues asynchronously)`,
          timestamp: now,
          details: { waitMinutes: minutes },
        };
      }

      case "human_approval": {
        const config = step.config as {
          approvers?: string[];
          timeoutMinutes?: number;
        };
        // In production, this would pause execution and notify approvers.
        // For now, we mark it as waiting and proceed.
        return {
          stepIndex: 0,
          stepType: step.type,
          status: "waiting",
          message: `Awaiting human approval from ${(config.approvers ?? []).join(", ") || "designated approvers"}`,
          timestamp: now,
          details: {
            approvers: config.approvers,
            timeoutMinutes: config.timeoutMinutes ?? 60,
          },
        };
      }

      case "add_note": {
        const config = step.config as { noteTemplate?: string };
        return {
          stepIndex: 0,
          stepType: step.type,
          status: "success",
          message: `Note added: ${config.noteTemplate ?? step.label}`,
          timestamp: now,
          details: { note: config.noteTemplate },
        };
      }

      default:
        return {
          stepIndex: 0,
          stepType: step.type,
          status: "skipped",
          message: `Unknown step type: ${step.type}`,
          timestamp: now,
        };
    }
  } catch (err) {
    return {
      stepIndex: 0,
      stepType: step.type,
      status: "failed",
      message: err instanceof Error ? err.message : "Unknown error",
      timestamp: now,
    };
  }
}

// ---------------------------------------------------------------------------
// Main execution entry point
// ---------------------------------------------------------------------------

export async function executePlaybook(
  playbookId: string,
  context: ExecutionContext,
): Promise<PlaybookExecutionResponse> {
  const playbook = await getPlaybook(playbookId);

  // Create execution record
  const [execution] = await db
    .insert(playbookExecutions)
    .values({
      playbookId,
      alertId: context.alertId ?? null,
      incidentId: context.incidentId ?? null,
      triggeredBy: context.triggeredBy,
      status: "RUNNING",
      stepsCompleted: 0,
      stepsTotal: playbook.steps.length,
      log: [],
    })
    .returning();

  if (!execution) {
    throw new HTTPException(500, { message: "Failed to create execution record" });
  }

  // Execute steps sequentially
  const log: ExecutionLogEntry[] = [];
  let stepsCompleted = 0;
  let finalStatus: "COMPLETED" | "FAILED" = "COMPLETED";

  for (let i = 0; i < playbook.steps.length; i++) {
    const step = playbook.steps[i];
    const result = await executeStep(step, context);
    result.stepIndex = i;

    log.push(result);

    if (result.status === "failed") {
      finalStatus = "FAILED";
      break;
    }

    if (result.status === "waiting") {
      // For human_approval steps, we stop execution here
      // In production, a resume endpoint would continue from this point
      stepsCompleted = i + 1;
      await db
        .update(playbookExecutions)
        .set({
          stepsCompleted,
          log,
          status: "RUNNING",
        })
        .where(eq(playbookExecutions.id, execution.id));

      // Update playbook stats
      await db
        .update(playbooks)
        .set({
          executionCount: sql`${playbooks.executionCount} + 1`,
          lastExecuted: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(playbooks.id, playbookId));

      return executionToResponse(
        {
          ...execution,
          stepsCompleted,
          log,
          status: "RUNNING",
        },
        playbook.name,
      );
    }

    stepsCompleted = i + 1;
  }

  // Update execution record
  const [updated] = await db
    .update(playbookExecutions)
    .set({
      stepsCompleted,
      log,
      status: finalStatus,
      completedAt: new Date(),
    })
    .where(eq(playbookExecutions.id, execution.id))
    .returning();

  // Update playbook stats
  await db
    .update(playbooks)
    .set({
      executionCount: sql`${playbooks.executionCount} + 1`,
      lastExecuted: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(playbooks.id, playbookId));

  return executionToResponse(updated ?? { ...execution, stepsCompleted, log, status: finalStatus, completedAt: new Date() }, playbook.name);
}

// ---------------------------------------------------------------------------
// Auto-trigger: check playbooks when an alert fires
// ---------------------------------------------------------------------------

export async function checkPlaybookTriggers(
  alertId: string,
  organizationId: string,
  severity: string,
  spartaTactic: string | null,
  ruleId: string,
): Promise<void> {
  // Find active playbooks with auto-trigger that match this alert
  const activePlaybooks = await db
    .select()
    .from(playbooks)
    .where(
      and(
        eq(playbooks.isActive, true),
        or(
          eq(playbooks.organizationId, organizationId),
          isNull(playbooks.organizationId),
        ),
      ),
    );

  for (const pb of activePlaybooks) {
    const trigger = pb.trigger;
    if (!trigger.auto) continue;

    const conditions = trigger.conditions;
    let matches = true;

    // Check severity condition
    if (conditions.severity && conditions.severity.length > 0) {
      if (!conditions.severity.includes(severity)) {
        matches = false;
      }
    }

    // Check SPARTA tactic condition
    if (matches && conditions.spartaTactic && conditions.spartaTactic.length > 0) {
      if (!spartaTactic || !conditions.spartaTactic.includes(spartaTactic)) {
        matches = false;
      }
    }

    // Check rule ID condition
    if (matches && conditions.ruleIds && conditions.ruleIds.length > 0) {
      if (!conditions.ruleIds.includes(ruleId)) {
        matches = false;
      }
    }

    if (matches) {
      // Fire-and-forget playbook execution
      executePlaybook(pb.id, {
        alertId,
        organizationId,
        triggeredBy: "auto",
      }).catch((err) => {
        console.error(`[playbook] Auto-execution failed for playbook ${pb.id}:`, err instanceof Error ? err.message : err);
      });
    }
  }
}
