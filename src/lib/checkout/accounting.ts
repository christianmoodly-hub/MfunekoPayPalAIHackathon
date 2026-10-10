import { z } from "zod";

import { SpendLookupError, spentCentsFromPayloads } from "@/lib/shopping/spend";

const reservedSchema = z.object({
  reservationId: z.string().trim().min(1),
  amountCents: z.number().int().positive(),
});

const reservationIdSchema = z.object({
  reservationId: z.string().trim().min(1),
});

const orderIdSchema = z.object({
  orderId: z.string().trim().min(1),
});

export type SpendEvent = {
  type: string;
  mandateId: string | null;
  payload: unknown;
};

export function openSpendCents(events: readonly SpendEvent[], mandateId: string): number {
  const mine = events.filter((event) => event.mandateId === mandateId);
  const captured = mine.filter((event) => event.type === "paypal.order.captured");
  const capturedCents = spentCentsFromPayloads(uniqueCaptures(captured).map((event) => event.payload));
  const settled = new Set(ids(captured));
  const released = new Set(ids(mine.filter((event) => event.type === "checkout.released")));

  let holds = 0;
  for (const event of mine) {
    if (event.type !== "checkout.reserved") {
      continue;
    }
    const parsed = reservedSchema.safeParse(event.payload);
    if (!parsed.success) {
      throw new SpendLookupError("A spend reservation is missing an amount.");
    }
    if (settled.has(parsed.data.reservationId) || released.has(parsed.data.reservationId)) {
      continue;
    }
    if (parsed.data.amountCents > Number.MAX_SAFE_INTEGER - holds) {
      throw new SpendLookupError("Reserved spend is not a safe integer number of cents.");
    }
    holds += parsed.data.amountCents;
  }

  if (holds > Number.MAX_SAFE_INTEGER - capturedCents) {
    throw new SpendLookupError("Committed spend is not a safe integer number of cents.");
  }
  return capturedCents + holds;
}

function uniqueCaptures(events: readonly SpendEvent[]): SpendEvent[] {
  const seen = new Set<string>();
  const unique: SpendEvent[] = [];
  for (const event of events) {
    const parsed = orderIdSchema.safeParse(event.payload);
    if (parsed.success) {
      if (seen.has(parsed.data.orderId)) {
        continue;
      }
      seen.add(parsed.data.orderId);
    }
    unique.push(event);
  }
  return unique;
}

function ids(events: readonly SpendEvent[]): string[] {
  const result: string[] = [];
  for (const event of events) {
    const parsed = reservationIdSchema.safeParse(event.payload);
    if (parsed.success) {
      result.push(parsed.data.reservationId);
    }
  }
  return result;
}
