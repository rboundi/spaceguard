import { z } from "zod";
import { NIS2Classification } from "../enums";

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  nis2Classification: z.nativeEnum(NIS2Classification),
  country: z.string().length(2, "Must be ISO 3166-1 alpha-2 code"),
  sector: z.string().max(100).default("space"),
  contactEmail: z.string().email(),
  contactName: z.string().min(1).max(255),
}).strict();

export const updateOrganizationSchema = createOrganizationSchema.partial();

export const organizationResponseSchema = createOrganizationSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateOrganization = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;
