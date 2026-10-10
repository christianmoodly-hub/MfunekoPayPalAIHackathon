import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { paymentMethods } from "@/db/schema";

export async function insertPaymentMethod(input: {
  id: string;
  vaultId: string;
  customerId: string | null;
}): Promise<{ id: string }> {
  const db = getDb();
  const [inserted] = await db
    .insert(paymentMethods)
    .values({
      id: input.id,
      paypalVaultId: input.vaultId,
      paypalCustomerId: input.customerId,
      status: "active",
    })
    .onConflictDoNothing({ target: paymentMethods.paypalVaultId })
    .returning({ id: paymentMethods.id });

  if (inserted) {
    return inserted;
  }

  const [existing] = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(eq(paymentMethods.paypalVaultId, input.vaultId))
    .limit(1);

  if (!existing) {
    throw new Error("Payment method was not stored.");
  }

  return existing;
}

export async function latestActivePaymentMethod(): Promise<{ id: string; vaultId: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: paymentMethods.id, vaultId: paymentMethods.paypalVaultId })
    .from(paymentMethods)
    .where(eq(paymentMethods.status, "active"))
    .orderBy(desc(paymentMethods.createdAt))
    .limit(1);

  return row ?? null;
}
