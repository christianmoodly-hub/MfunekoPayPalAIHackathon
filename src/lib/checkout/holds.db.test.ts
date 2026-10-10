import { readFileSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { approvals, ledgerEvents } from "@/db/schema";

import { openSpendCents } from "./accounting";
import { loadMandateSpendEvents } from "./run";

const purchase = {
  statedTotalCents: 600,
  lineItems: [
    {
      merchant: "staples.com",
      category: "printer-copier-paper",
      unitPriceCents: 600,
      quantity: 1,
      freeReturns: null,
      deliveryDate: null,
    },
  ],
};

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return;
  }
  const line = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith("DATABASE_URL="));
  if (!line) {
    throw new Error("DATABASE_URL is not set.");
  }
  process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
}

afterAll(async () => {
  await closeDb();
});

it(
  "releases an ordered hold older than 3 hours when spend is computed",
  async () => {
    ensureDatabaseUrl();
    const mandateId = crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const reservationId = crypto.randomUUID();
    const freshId = crypto.randomUUID();
    const freshReservation = crypto.randomUUID();
    const db = getDb();

    try {
      await db.insert(approvals).values([
        {
          id: approvalId,
          mandateId,
          purchase,
          productIds: ["paper-1"],
          reasons: [],
          status: "ordered",
          orderId: "ORDER-OLD",
          reservationId,
          expectedCents: 600,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
        {
          id: freshId,
          mandateId,
          purchase,
          productIds: ["paper-2"],
          reasons: [],
          status: "ordered",
          orderId: "ORDER-FRESH",
          reservationId: freshReservation,
          expectedCents: 200,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      ]);
      await db.execute(sql`
        update approvals
        set ordered_at = now() - interval '4 hours'
        where id = ${approvalId}::uuid
      `);
      await db.execute(sql`
        update approvals
        set ordered_at = now() - interval '1 hour'
        where id = ${freshId}::uuid
      `);
      await db.insert(ledgerEvents).values([
        {
          type: "checkout.reserved",
          mandateId,
          payload: { reservationId, amountCents: 600 },
        },
        {
          type: "checkout.reserved",
          mandateId,
          payload: { reservationId: freshReservation, amountCents: 200 },
        },
      ]);

      const events = await loadMandateSpendEvents(mandateId);

      expect(openSpendCents(events, mandateId)).toBe(200);
      const rows = await db.select().from(approvals).where(eq(approvals.mandateId, mandateId));
      expect(rows.find((row) => row.id === approvalId)?.status).toBe("expired");
      expect(rows.find((row) => row.id === freshId)?.status).toBe("ordered");
    } finally {
      await db.delete(ledgerEvents).where(eq(ledgerEvents.mandateId, mandateId));
      await db.delete(approvals).where(eq(approvals.mandateId, mandateId));
    }
  },
  20000,
);
