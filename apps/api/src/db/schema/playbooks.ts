import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  jsonb,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { incidents } from "./incidents";
import { alerts } from "./alerts";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const playbookExecutionStatusEnum = pgEnum("playbook_execution_status", [
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

// ---------------------------------------------------------------------------
// Playbooks table
// ---------------------------------------------------------------------------

export const playbooks = pgTable(
  "playbooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    trigger: jsonb("trigger").notNull().$type<{
      auto: boolean;
      conditions: {
        severity?: string[];
        spartaTactic?: string[];
        ruleIds?: string[];
      };
    }>(),
    steps: jsonb("steps").notNull().$type<
      Array<{
        id: string;
        type: string;
        label: string;
        config: Record<string, unknown>;
      }>
    >(),
    isActive: boolean("is_active").notNull().default(true),
    executionCount: integer("execution_count").notNull().default(0),
    lastExecuted: timestamp("last_executed", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("playbooks_org_id_idx").on(table.organizationId),
    activeIdx: index("playbooks_active_idx").on(table.isActive),
  }),
);

// ---------------------------------------------------------------------------
// Playbook Executions table
// ---------------------------------------------------------------------------

export const playbookExecutions = pgTable(
  "playbook_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").references(() => incidents.id, {
      onDelete: "set null",
    }),
    alertId: uuid("alert_id").references(() => alerts.id, {
      onDelete: "set null",
    }),
    triggeredBy: varchar("triggered_by", { length: 255 }).notNull(),
    status: playbookExecutionStatusEnum("status").notNull().default("RUNNING"),
    stepsCompleted: integer("steps_completed").notNull().default(0),
    stepsTotal: integer("steps_total").notNull(),
    log: jsonb("log")
      .notNull()
      .default([])
      .$type<
        Array<{
          stepIndex: number;
          stepType: string;
          status: "success" | "failed" | "skipped" | "waiting";
          message: string;
          timestamp: string;
          details?: Record<string, unknown>;
        }>
      >(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    playbookIdx: index("pb_exec_playbook_id_idx").on(table.playbookId),
    statusIdx: index("pb_exec_status_idx").on(table.status),
    alertIdx: index("pb_exec_alert_id_idx").on(table.alertId),
    incidentIdx: index("pb_exec_incident_id_idx").on(table.incidentId),
  }),
);

export type Playbook = typeof playbooks.$inferSelect;
export type NewPlaybook = typeof playbooks.$inferInsert;
export type PlaybookExecution = typeof playbookExecutions.$inferSelect;
export type NewPlaybookExecution = typeof playbookExecutions.$inferInsert;
