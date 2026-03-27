import { z } from "zod";
import { PlaybookStepType, PlaybookExecutionStatus } from "../enums";

// ---------------------------------------------------------------------------
// Trigger condition
// ---------------------------------------------------------------------------

export const playbookTriggerSchema = z.object({
  auto: z.boolean(),
  conditions: z.object({
    severity: z.array(z.string()).optional(),
    spartaTactic: z.array(z.string()).optional(),
    ruleIds: z.array(z.string()).optional(),
  }),
});

export type PlaybookTrigger = z.infer<typeof playbookTriggerSchema>;

// ---------------------------------------------------------------------------
// Step definition
// ---------------------------------------------------------------------------

export const playbookStepSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(PlaybookStepType),
  label: z.string(),
  config: z.record(z.unknown()),
});

export type PlaybookStep = z.infer<typeof playbookStepSchema>;

// ---------------------------------------------------------------------------
// Create / Update
// ---------------------------------------------------------------------------

export const createPlaybookSchema = z.object({
  organizationId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  trigger: playbookTriggerSchema,
  steps: z.array(playbookStepSchema).min(1),
  isActive: z.boolean().optional().default(true),
}).strict();

export type CreatePlaybook = z.infer<typeof createPlaybookSchema>;

export const updatePlaybookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  trigger: playbookTriggerSchema.optional(),
  steps: z.array(playbookStepSchema).min(1).optional(),
  isActive: z.boolean().optional(),
}).strict();

export type UpdatePlaybook = z.infer<typeof updatePlaybookSchema>;

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export const playbookResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  trigger: playbookTriggerSchema,
  steps: z.array(playbookStepSchema),
  isActive: z.boolean(),
  executionCount: z.number(),
  lastExecuted: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PlaybookResponse = z.infer<typeof playbookResponseSchema>;

// ---------------------------------------------------------------------------
// Execution log entry
// ---------------------------------------------------------------------------

export const executionLogEntrySchema = z.object({
  stepIndex: z.number(),
  stepType: z.string(),
  status: z.enum(["success", "failed", "skipped", "waiting"]),
  message: z.string(),
  timestamp: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type ExecutionLogEntry = z.infer<typeof executionLogEntrySchema>;

// ---------------------------------------------------------------------------
// Execution response
// ---------------------------------------------------------------------------

export const playbookExecutionResponseSchema = z.object({
  id: z.string().uuid(),
  playbookId: z.string().uuid(),
  playbookName: z.string().optional(),
  incidentId: z.string().uuid().nullable(),
  alertId: z.string().uuid().nullable(),
  triggeredBy: z.string(),
  status: z.nativeEnum(PlaybookExecutionStatus),
  stepsCompleted: z.number(),
  stepsTotal: z.number(),
  log: z.array(executionLogEntrySchema),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type PlaybookExecutionResponse = z.infer<typeof playbookExecutionResponseSchema>;

// ---------------------------------------------------------------------------
// Manual execution request
// ---------------------------------------------------------------------------

export const executePlaybookSchema = z.object({
  alertId: z.string().uuid().optional(),
  incidentId: z.string().uuid().optional(),
}).strict();

export type ExecutePlaybookRequest = z.infer<typeof executePlaybookSchema>;
