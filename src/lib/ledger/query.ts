import { and, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { ledgerEvents } from "@/db/schema";

const eventSchema = z.object({
  id: z.string(),
  mandateId: z.string().nullable(),
  runId: z.string().nullable(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export type LedgerEventView = z.infer<typeof eventSchema>;

export async function listLedgerEvents(filter: {
  mandateId?: string;
  type?: string;
  limit: number;
}): Promise<LedgerEventView[]> {
  const conditions: SQL[] = [];
  if (filter.mandateId) {
    conditions.push(eq(ledgerEvents.mandateId, filter.mandateId));
  }
  if (filter.type) {
    conditions.push(eq(ledgerEvents.type, filter.type));
  }

  const rows = await getDb()
    .select({
      id: ledgerEvents.id,
      mandateId: ledgerEvents.mandateId,
      runId: ledgerEvents.runId,
      type: ledgerEvents.type,
      payload: ledgerEvents.payload,
      createdAt: ledgerEvents.createdAt,
    })
    .from(ledgerEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ledgerEvents.createdAt))
    .limit(filter.limit);

  return rows.map((row) =>
    eventSchema.parse({
      id: row.id,
      mandateId: row.mandateId,
      runId: row.runId,
      type: row.type,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }),
  );
}
