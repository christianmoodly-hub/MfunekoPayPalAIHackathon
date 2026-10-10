import { refetchPrice } from "@/lib/channel3/price";
import { readChannel3Env } from "@/lib/channel3/env";
import { appendLedgerEvent } from "@/lib/ledger";
import { getMandate } from "@/lib/mandate/store";
import { createPayPalClient } from "@/lib/paypal/client";
import { readPayPalEnv } from "@/lib/paypal/config";
import { secretFingerprint } from "@/lib/paypal/fingerprint";
import { latestActivePaymentMethod } from "@/lib/paypal/payment-methods";
import { chargeVaulted } from "@/lib/paypal/vault";
import type { ProposedPurchase } from "@/lib/policy/schema";

import { saveApprovalRecord } from "./approval";
import { guardedCheckout, loadMandateSpendEvents, type CheckoutInput, type CheckoutResult } from "./run";
import { releaseSpendInDb, reserveSpendInDb } from "./reserve";

export type CheckoutSelection = {
  productId: string;
  quantity: number;
  merchant: string;
  category: string | null;
  unitPriceCents: number;
  freeReturns: boolean | null;
  deliveryDate: string | null;
};

export async function checkoutSavedPurchase(input: CheckoutInput): Promise<CheckoutResult> {
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
    saveApproval: saveApprovalRecord,
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

export async function runGuardedCheckout(mandateId: string, selection: CheckoutSelection): Promise<CheckoutResult> {
  const mandate = await getMandate(mandateId);
  if (!mandate) {
    throw new Error("Mandate was not found.");
  }

  const lineTotal = selection.unitPriceCents * selection.quantity;
  if (!Number.isSafeInteger(lineTotal)) {
    throw new Error("Selection total is not a safe integer number of cents.");
  }
  const purchase: ProposedPurchase = {
    statedTotalCents: lineTotal,
    lineItems: [
      {
        merchant: selection.merchant,
        category: selection.category,
        unitPriceCents: selection.unitPriceCents,
        quantity: selection.quantity,
        freeReturns: selection.freeReturns,
        deliveryDate: selection.deliveryDate,
      },
    ],
  };

  if (mandate.status !== "active") {
    const reasons = [`Mandate status is ${mandate.status}.`];
    await appendLedgerEvent({
      type: "checkout.blocked",
      mandateId,
      payload: { reasons, purchase },
    });
    return {
      verdict: "BLOCK",
      reasons,
      purchase,
      chargedCents: null,
      orderId: null,
      approvalId: null,
      approvalUrl: null,
    };
  }

  return checkoutSavedPurchase({
    mandate,
    purchase,
    productIds: [selection.productId],
    checkedAt: new Date().toISOString(),
  });
}
