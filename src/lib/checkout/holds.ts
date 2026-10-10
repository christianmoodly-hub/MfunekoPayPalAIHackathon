import { and, eq, isNotNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { approvals, ledgerEvents } from "@/db/schema";

// PayPal leaves a created order open for about 3 hours.
// docs/NOTES.md, https://developer.paypal.com/docs/api/orders/v2/
const PAYPAL_ORDER_LIFETIME_MS = 3 * 60 * 60 * 1000;

type SpendTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export async function releaseExpiredOrderHolds(mandateId: string, now = new Date(), tx?: SpendTx): Promise<void> {
  if (tx) {
    await expireInside(tx, mandateId, now);
    return;
  }

  await getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${mandateId})::bigint)`);
    await expireInside(transaction, mandateId, now);
  });
}

async function expireInside(tx: SpendTx, mandateId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - PAYPAL_ORDER_LIFETIME_MS);
  const stale = await tx
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.mandateId, mandateId),
        eq(approvals.status, "ordered"),
        isNotNull(approvals.orderedAt),
        lte(approvals.orderedAt, cutoff),
      ),
    );

  for (const row of stale) {
    const [updated] = await tx
      .update(approvals)
      .set({ status: "expired" })
      .where(and(eq(approvals.id, row.id), eq(approvals.status, "ordered")))
      .returning({ id: approvals.id });
    if (!updated || !row.reservationId) {
      continue;
    }
    await tx.insert(ledgerEvents).values({
      type: "checkout.released",
      mandateId,
      runId: row.runId,
      payload: { reservationId: row.reservationId, reason: "PayPal order expired." },
    });
  }
}
