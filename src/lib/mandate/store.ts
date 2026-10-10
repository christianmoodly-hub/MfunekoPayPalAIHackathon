import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mandates } from "@/db/schema";
import { mandateSchema, type Mandate } from "@/lib/policy/schema";

import { mandateEditsSchema } from "./schema";
import { applyMandateConfirmation } from "./defaults";

export class MandateStoreError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "MandateStoreError";
    this.statusCode = statusCode;
  }
}

export async function insertMandate(mandate: Mandate): Promise<void> {
  const db = getDb();
  await db.insert(mandates).values(toRow(mandate));
}

export async function confirmMandate(id: string, edits: unknown): Promise<Mandate> {
  const parsedEdits = mandateEditsSchema.safeParse(edits);
  if (!parsedEdits.success) {
    throw new MandateStoreError("Confirmation fields are invalid.", 400);
  }

  const existing = await getMandate(id);
  if (!existing) {
    throw new MandateStoreError("Mandate was not found.", 404);
  }
  if (existing.status !== "draft") {
    throw new MandateStoreError("Only a draft mandate can be confirmed.", 409);
  }

  const next = applyMandateConfirmation(existing, parsedEdits.data);
  const db = getDb();
  const [row] = await db
    .update(mandates)
    .set(toRow(next))
    .where(and(eq(mandates.id, id), eq(mandates.status, "draft")))
    .returning();

  if (!row) {
    throw new MandateStoreError("Only a draft mandate can be confirmed.", 409);
  }

  return fromRow(row);
}

export async function listMandates(): Promise<Mandate[]> {
  const rows = await getDb().select().from(mandates).orderBy(desc(mandates.createdAt));
  return rows.map(fromRow);
}

export async function getMandate(id: string): Promise<Mandate | null> {
  const db = getDb();
  const [row] = await db.select().from(mandates).where(eq(mandates.id, id)).limit(1);
  return row ? fromRow(row) : null;
}

function toRow(mandate: Mandate) {
  return {
    id: mandate.id,
    description: mandate.description,
    maxTotalCents: mandate.maxTotalCents,
    maxPerItemCents: mandate.maxPerItemCents,
    allowedCategories: mandate.allowedCategories,
    blockedMerchants: mandate.blockedMerchants,
    allowedMerchants: mandate.allowedMerchants ?? null,
    requireFreeReturns: mandate.requireFreeReturns,
    deliverBy: mandate.deliverBy ?? null,
    escalateAboveCents: mandate.escalateAboveCents,
    expiresAt: new Date(mandate.expiresAt),
    status: mandate.status,
    searchQuery: mandate.searchQuery,
    needsInput: mandate.needsInput,
  };
}

function fromRow(row: typeof mandates.$inferSelect): Mandate {
  return mandateSchema.parse({
    id: row.id,
    description: row.description,
    maxTotalCents: row.maxTotalCents,
    maxPerItemCents: row.maxPerItemCents,
    allowedCategories: row.allowedCategories,
    blockedMerchants: row.blockedMerchants,
    allowedMerchants: row.allowedMerchants,
    requireFreeReturns: row.requireFreeReturns,
    deliverBy: row.deliverBy,
    escalateAboveCents: row.escalateAboveCents,
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
    searchQuery: row.searchQuery,
    needsInput: row.needsInput,
  });
}
