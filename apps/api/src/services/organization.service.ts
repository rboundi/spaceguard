import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { organizations } from "../db/schema/index";
import type {
  CreateOrganization,
  UpdateOrganization,
  OrganizationResponse,
} from "@spaceguard/shared";

function toResponse(row: typeof organizations.$inferSelect): OrganizationResponse {
  return {
    id: row.id,
    name: row.name,
    nis2Classification: row.nis2Classification as OrganizationResponse["nis2Classification"],
    country: row.country,
    sector: row.sector,
    contactEmail: row.contactEmail,
    contactName: row.contactName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createOrganization(
  data: CreateOrganization
): Promise<OrganizationResponse> {
  const [row] = await db
    .insert(organizations)
    .values({
      name: data.name,
      nis2Classification: data.nis2Classification,
      country: data.country,
      sector: data.sector ?? "space",
      contactEmail: data.contactEmail,
      contactName: data.contactName,
    })
    .returning();

  return toResponse(row);
}

export async function getOrganization(id: string): Promise<OrganizationResponse> {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: `Organization ${id} not found` });
  }

  return toResponse(row);
}

export async function listOrganizations(): Promise<OrganizationResponse[]> {
  const rows = await db
    .select()
    .from(organizations)
    .orderBy(organizations.createdAt);

  return rows.map(toResponse);
}

export async function updateOrganization(
  id: string,
  data: UpdateOrganization
): Promise<OrganizationResponse> {
  // Confirm the record exists first
  await getOrganization(id);

  const [row] = await db
    .update(organizations)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, id))
    .returning();

  return toResponse(row);
}
