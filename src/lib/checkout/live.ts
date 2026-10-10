import { refetchPrice } from "@/lib/channel3/price";
import { readChannel3Env } from "@/lib/channel3/env";
import { appendLedgerEvent } from "@/lib/ledger";
import { createPayPalClient } from "@/lib/paypal/client";
import { readPayPalEnv } from "@/lib/paypal/config";
import { secretFingerprint } from "@/lib/paypal/fingerprint";
import { latestActivePaymentMethod } from "@/lib/paypal/payment-methods";
import { chargeVaulted } from "@/lib/paypal/vault";

import { guardedCheckout, loadMandateSpendEvents, type CheckoutInput } from "./run";
import { releaseSpendInDb, reserveSpendInDb } from "./reserve";

export async function checkoutSavedPurchase(input: CheckoutInput) {
  const saved = await latestActivePaymentMethod();
  if (!saved) {
    throw new Error("No saved PayPal wallet. Approve POST /api/paypal/link in the sandbox first.");
  }

  const fingerprint = secretFingerprint(saved.vaultId);
  const client = createPayPalClient(readPayPalEnv());
  const { apiKey } = readChannel3Env();

  return guardedCheckout(input, {
    refetchPrice: (productId) => refetchPrice(productId, { apiKey }),
    loadEvents: loadMandateSpendEvents,
    reserve: reserveSpendInDb,
    release: releaseSpendInDb,
    appendLedger: appendLedgerEvent,
    vaultFingerprint: fingerprint,
    charge: async (lineItems, idempotencyKey) => {
      try {
        return await chargeVaulted(client, saved.vaultId, lineItems, idempotencyKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Vault charge failed.";
        throw new Error(message.split(saved.vaultId).join("[redacted]"));
      }
    },
  });
}
