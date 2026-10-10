import { closeDb } from "../src/db/client";
import { appendLedgerEvent } from "../src/lib/ledger";
import { PayPalApiError, createPayPalClient } from "../src/lib/paypal/client";
import { readPayPalEnv } from "../src/lib/paypal/config";
import { secretFingerprint } from "../src/lib/paypal/fingerprint";
import { latestActivePaymentMethod } from "../src/lib/paypal/payment-methods";
import { captureId, orderAmount, type PayPalOrder } from "../src/lib/paypal/schema";
import { chargeVaulted } from "../src/lib/paypal/vault";
import type { LineItem } from "../src/lib/policy/schema";

async function main() {
  const cents = readCents(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  const paypal = readPayPalEnv();
  const client = createPayPalClient(paypal);

  try {
    const saved = await latestActivePaymentMethod();
    if (!saved) {
      throw new Error("No saved PayPal wallet. Approve POST /api/paypal/link in the sandbox first.");
    }

    const fingerprint = secretFingerprint(saved.vaultId);
    const lineItems: LineItem[] = [
      {
        merchant: "paypal.com",
        category: "sandbox",
        unitPriceCents: cents,
        quantity: 1,
        freeReturns: null,
        deliveryDate: null,
      },
    ];
    const idempotencyKey = `charge-vaulted:${saved.id}:${cents}:${new Date().toISOString().slice(0, 16)}`;

    let order: PayPalOrder;
    try {
      order = await chargeVaulted(client, saved.vaultId, lineItems, idempotencyKey);
    } catch (error) {
      await recordFailure(fingerprint, error, saved.vaultId);
      const message = error instanceof Error ? error.message : "Vault charge failed.";
      throw new Error(message.split(saved.vaultId).join("[redacted]"));
    }

    const payload = orderPayload(order, fingerprint);
    await appendLedgerEvent({
      type: "paypal.order.created",
      mandateId: null,
      payload,
    });
    if (order.status === "COMPLETED") {
      await appendLedgerEvent({
        type: "paypal.order.captured",
        mandateId: null,
        payload: { ...payload, captureId: captureId(order) ?? null },
      });
    }
    console.log(`Charged order ${order.id} (${order.status}). Wallet fingerprint ${fingerprint}.`);
  } finally {
    await closeDb();
  }
}

function orderPayload(order: PayPalOrder, vaultFingerprint: string): Record<string, unknown> {
  return {
    orderId: order.id,
    status: order.status,
    amount: orderAmount(order),
    vaultFingerprint,
  };
}

async function recordFailure(vaultFingerprint: string, error: unknown, vaultId: string) {
  const message = error instanceof Error ? error.message : "Vault charge failed.";
  await appendLedgerEvent({
    type: "paypal.order.failed",
    mandateId: null,
    payload: {
      step: "charge-vaulted",
      message: message.split(vaultId).join("[redacted]"),
      vaultFingerprint,
      status: error instanceof PayPalApiError ? error.status : null,
      issue: error instanceof PayPalApiError ? (error.issue ?? null) : null,
      paypalName: error instanceof PayPalApiError ? (error.paypalName ?? null) : null,
      debugId: error instanceof PayPalApiError ? (error.debugId ?? null) : null,
    },
  }).catch(() => undefined);
}

function readCents(args: string[]): number {
  const raw = args[0];
  if (!raw || !/^[1-9]\d*$/.test(raw)) {
    throw new Error("Usage: npm run charge-vaulted -- <cents>");
  }
  const cents = Number(raw);
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Usage: npm run charge-vaulted -- <cents>");
  }
  return cents;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Vault charge failed.";
  console.error(message);
  process.exitCode = 1;
});
