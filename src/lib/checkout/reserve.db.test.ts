import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { ledgerEvents } from "@/db/schema";

import { releaseSpendInDb, reserveSpendInDb, SpendReserveError } from "./reserve";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;
const dbIt = it.skipIf(!testDatabaseUrl);

afterAll(async () => {
  await closeDb();
});

dbIt(
  "lets only one of two parallel reservations exceed the cap",
  async () => {
    const mandateId = crypto.randomUUID();
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();

    try {
      const results = await Promise.allSettled([
        reserveSpendInDb({ mandateId, amountCents: 600, capCents: 1000, reservationId: firstId }),
        reserveSpendInDb({ mandateId, amountCents: 600, capCents: 1000, reservationId: secondId }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((result) => result.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SpendReserveError);

      await releaseSpendInDb({ mandateId, reservationId: firstId });
      await releaseSpendInDb({ mandateId, reservationId: secondId });
      await reserveSpendInDb({
        mandateId,
        amountCents: 600,
        capCents: 1000,
        reservationId: crypto.randomUUID(),
      });
    } finally {
      await getDb().delete(ledgerEvents).where(eq(ledgerEvents.mandateId, mandateId));
    }
  },
  20000,
);
