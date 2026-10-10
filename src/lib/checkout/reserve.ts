import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { ledgerEvents } from "@/db/schema";
import { appendLedgerEvent } from "@/lib/ledger";

import { openSpendCents } from "./accounting";
import { releaseExpiredOrderHolds } from "./holds";

export class SpendReserveError extends Error {
  readonly spentCents: number;
  readonly amountCents: number;
  readonly capCents: number;

  constructor(spentCents: number, amountCents: number, capCents: number) {
    super(
      `Reserving ${amountCents} cents would exceed the mandate cap of ${capCents} cents after ${spentCents} cents already committed.`,
    );
    this.name = "SpendReserveError";
    this.spentCents = spentCents;
    this.amountCents = amountCents;
    this.capCents = capCents;
  }
}

export async function reserveSpendInDb(input: {
  mandateId: string;
  amountCents: number;
  capCents: number;
  reservationId: string;
}): Promise<void> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new SpendReserveError(0, input.amountCents, input.capCents);
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.mandateId})::bigint)`);
    await releaseExpiredOrderHolds(input.mandateId, new Date(), tx);
    const rows = await tx
      .select({
        type: ledgerEvents.type,
        mandateId: ledgerEvents.mandateId,
        payload: ledgerEvents.payload,
      })
      .from(ledgerEvents)
      .where(eq(ledgerEvents.mandateId, input.mandateId));
    const spent = openSpendCents(rows, input.mandateId);
    if (!Number.isSafeInteger(spent + input.amountCents) || spent + input.amountCents > input.capCents) {
      throw new SpendReserveError(spent, input.amountCents, input.capCents);
    }

    await tx.insert(ledgerEvents).values({
      type: "checkout.reserved",
      mandateId: input.mandateId,
      payload: { reservationId: input.reservationId, amountCents: input.amountCents },
    });
  });
}

export async function releaseSpendInDb(input: { mandateId: string; reservationId: string }): Promise<void> {
  await appendLedgerEvent({
    type: "checkout.released",
    mandateId: input.mandateId,
    payload: { reservationId: input.reservationId },
  });
}
