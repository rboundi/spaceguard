import { z } from "zod";
import { ScheduledReportType, ReportSchedule } from "../enums";

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createScheduledReportSchema = z.object({
  organizationId: z.string().uuid(),
  reportType: z.nativeEnum(ScheduledReportType),
  schedule: z.nativeEnum(ReportSchedule),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  recipients: z.array(z.string().email()).min(1, "At least one recipient is required"),
  isActive: z.boolean().optional().default(true),
}).strict();

export type CreateScheduledReport = z.infer<typeof createScheduledReportSchema>;

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export const updateScheduledReportSchema = z.object({
  schedule: z.nativeEnum(ReportSchedule).optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  recipients: z.array(z.string().email()).min(1).optional(),
  isActive: z.boolean().optional(),
}).strict();

export type UpdateScheduledReport = z.infer<typeof updateScheduledReportSchema>;

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export const scheduledReportResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  reportType: z.nativeEnum(ScheduledReportType),
  schedule: z.nativeEnum(ReportSchedule),
  dayOfWeek: z.number().int().nullable(),
  dayOfMonth: z.number().int().nullable(),
  recipients: z.array(z.string()),
  lastGenerated: z.string().nullable(),
  nextRun: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ScheduledReportResponse = z.infer<typeof scheduledReportResponseSchema>;
