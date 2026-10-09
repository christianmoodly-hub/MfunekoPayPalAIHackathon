import { ledgerEvents } from "@/db/schema";
import { getDb } from "@/db/client";

import { ledgerEventInputSchema, type LedgerEventInput } from "./schema";

export async function appendLedgerEvent(input: LedgerEventInput) {
  const event = ledgerEventInputSchema.parse(input);
  const db = getDb();
  const [row] = await db
    .insert(ledgerEvents)
    .values({
      type: event.type,
      payload: event.payload,
      mandateId: event.mandateId ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Ledger insert did not return a row.");
  }

  return row;
}
