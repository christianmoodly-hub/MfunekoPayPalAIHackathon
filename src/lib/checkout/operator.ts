import { appendLedgerEvent } from "@/lib/ledger";
import { PayPalApiError, createPayPalClient } from "@/lib/paypal/client";
import { readPayPalEnv } from "@/lib/paypal/config";
import { secretFingerprint } from "@/lib/paypal/fingerprint";
import { latestActivePaymentMethod } from "@/lib/paypal/payment-methods";
import { captureId, orderAmount, type PayPalOrder } from "@/lib/paypal/schema";
import { chargeVaulted } from "@/lib/paypal/vault";
import type { LineItem } from "@/lib/policy/schema";

export async function operatorChargeVaulted(cents: number, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("charge-vaulted cannot run when NODE_ENV=production.");
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  const paypal = readPayPalEnv(env);
  const client = createPayPalClient(paypal);
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
