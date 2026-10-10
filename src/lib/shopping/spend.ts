import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { ledgerEvents } from "@/db/schema";
import { usdToCents } from "@/lib/money";

const capturedAmountSchema = z.object({
  amount: z
    .object({
      currencyCode: z.string(),
      value: z.string(),
    })
    .nullable(),
});

export class SpendLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendLookupError";
  }
}

export function spentCentsFromPayloads(payloads: unknown[]): number {
  let total = 0;
  for (const payload of payloads) {
    const parsed = capturedAmountSchema.safeParse(payload);
    if (!parsed.success || !parsed.data.amount) {
      throw new SpendLookupError("A captured payment is missing an amount.");
    }
    if (parsed.data.amount.currencyCode !== "USD") {
      throw new SpendLookupError("A captured payment is not in USD.");
    }
    let cents: number;
    try {
      cents = usdToCents(parsed.data.amount.value);
    } catch {
      throw new SpendLookupError("A captured payment amount is not integer cents.");
    }
    if (cents > Number.MAX_SAFE_INTEGER - total) {
      throw new SpendLookupError("Captured spend is not a safe integer number of cents.");
    }
    total += cents;
  }
  return total;
}

export async function spentCentsForMandate(mandateId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ payload: ledgerEvents.payload })
    .from(ledgerEvents)
    .where(and(eq(ledgerEvents.mandateId, mandateId), eq(ledgerEvents.type, "paypal.order.captured")));

  return spentCentsFromPayloads(rows.map((row) => row.payload));
}
