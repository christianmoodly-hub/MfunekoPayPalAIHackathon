import { centsToUsd } from "@/lib/money";
import { captureId, orderAmount, type PayPalOrder } from "@/lib/paypal/schema";
import { evaluatePolicy, type PolicyDecision } from "@/lib/policy";
import { mandateSchema, proposedPurchaseSchema, type LineItem, type Mandate, type ProposedPurchase } from "@/lib/policy/schema";
import type { LedgerEventInput } from "@/lib/ledger/schema";

import { assertPayPalCharge } from "./amounts";
import { openSpendCents, type SpendEvent } from "./accounting";
import { releaseSpendInDb, reserveSpendInDb, SpendReserveError } from "./reserve";

type AppendLedger = (input: LedgerEventInput) => Promise<unknown>;

export type CheckoutInput = {
  mandate: Mandate;
  purchase: ProposedPurchase;
  productIds: string[];
  checkedAt?: string;
  userApproved?: boolean;
};

export type CheckoutResult = {
  verdict: PolicyDecision["verdict"];
  reasons: string[];
  chargedCents: number | null;
  orderId: string | null;
  purchase: ProposedPurchase;
};

type CheckoutDeps = {
  refetchPrice: (productId: string) => Promise<number>;
  loadEvents: (mandateId: string) => Promise<SpendEvent[]>;
  reserve: (input: { mandateId: string; amountCents: number; capCents: number; reservationId: string }) => Promise<void>;
  release: (input: { mandateId: string; reservationId: string }) => Promise<void>;
  charge: (lineItems: LineItem[], idempotencyKey: string) => Promise<PayPalOrder>;
  appendLedger: AppendLedger;
  createId?: () => string;
  vaultFingerprint?: string;
};

export async function guardedCheckout(input: CheckoutInput, deps: CheckoutDeps): Promise<CheckoutResult> {
  const mandate = mandateSchema.parse(input.mandate);
  const proposed = proposedPurchaseSchema.parse(input.purchase);
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const purchase = await purchaseWithRefetchedPrices(proposed, input.productIds, deps, mandate.id);
  if (!purchase.ok) {
    return blockedResult(proposed, [purchase.reason]);
  }

  const events = await deps.loadEvents(mandate.id);
  const spentCents = openSpendCents(events, mandate.id);
  const decision = evaluatePolicy({
    mandate,
    purchase: purchase.value,
    spend: { spentCents },
    checkedAt,
  });
  await deps.appendLedger({
    type: "checkout.verdict",
    mandateId: mandate.id,
    payload: {
      verdict: decision.verdict,
      reasons: decision.reasons,
      statedTotalCents: purchase.value.statedTotalCents,
      spentCents,
    },
  });

  const payable = payableCents(purchase.value.lineItems);
  const chargeable = decision.verdict === "APPROVE" || (decision.verdict === "ESCALATE" && input.userApproved === true);
  if (!chargeable || payable === null) {
    return {
      verdict: decision.verdict,
      reasons: decision.reasons,
      chargedCents: null,
      orderId: null,
      purchase: purchase.value,
    };
  }

  const reservationId = (deps.createId ?? (() => crypto.randomUUID()))();
  try {
    await deps.reserve({
      mandateId: mandate.id,
      amountCents: payable,
      capCents: mandate.maxTotalCents,
      reservationId,
    });
  } catch (error) {
    if (error instanceof SpendReserveError) {
      const reasons = [
        `Cart total of ${payable} cents plus prior spend of ${error.spentCents} cents exceeds the mandate cap of ${error.capCents} cents.`,
      ];
      await deps.appendLedger({
        type: "checkout.verdict",
        mandateId: mandate.id,
        payload: { verdict: "BLOCK", reasons, statedTotalCents: purchase.value.statedTotalCents },
      });
      return blockedResult(purchase.value, reasons);
    }
    throw error;
  }

  try {
    const order = await deps.charge(purchase.value.lineItems, `checkout:${mandate.id}:${reservationId}`);
    assertPayPalCharge(order, payable);
    const payload = capturedPayload(order, payable, reservationId, deps.vaultFingerprint);
    await deps.appendLedger({
      type: "paypal.order.created",
      mandateId: mandate.id,
      payload,
    });
    await deps.appendLedger({
      type: "paypal.order.captured",
      mandateId: mandate.id,
      payload: { ...payload, captureId: captureId(order) ?? null },
    });
    return {
      verdict: decision.verdict,
      reasons: decision.reasons,
      chargedCents: payable,
      orderId: order.id,
      purchase: purchase.value,
    };
  } catch (error) {
    await deps.release({ mandateId: mandate.id, reservationId }).catch(() => undefined);
    await deps.appendLedger({
      type: "paypal.order.failed",
      mandateId: mandate.id,
      payload: {
        reservationId,
        approvedCents: payable,
        message: error instanceof Error ? error.message : "PayPal charge failed.",
      },
    }).catch(() => undefined);
    throw error;
  }
}

async function purchaseWithRefetchedPrices(
  purchase: ProposedPurchase,
  productIds: string[],
  deps: CheckoutDeps,
  mandateId: string,
): Promise<{ ok: true; value: ProposedPurchase } | { ok: false; reason: string }> {
  if (productIds.length !== purchase.lineItems.length) {
    return { ok: false, reason: "Each line item needs a product id for a price refresh." };
  }

  const prices: number[] = [];
  for (const productId of productIds) {
    try {
      prices.push(await deps.refetchPrice(productId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Price refresh failed.";
      await deps.appendLedger({
        type: "checkout.price_failed",
        mandateId,
        payload: { productId, message },
      });
      return { ok: false, reason: message };
    }
  }

  return {
    ok: true,
    value: {
      statedTotalCents: purchase.statedTotalCents,
      lineItems: purchase.lineItems.map((item, index) => ({
        ...item,
        checkoutUnitPriceCents: prices[index],
      })),
    },
  };
}

function payableCents(items: LineItem[]): number | null {
  let total = 0;
  for (const item of items) {
    const unit = item.checkoutUnitPriceCents ?? item.unitPriceCents;
    const line = unit * item.quantity;
    if (!Number.isSafeInteger(line) || line > Number.MAX_SAFE_INTEGER - total) {
      return null;
    }
    total += line;
  }
  return total;
}

function capturedPayload(
  order: PayPalOrder,
  approvedCents: number,
  reservationId: string,
  vaultFingerprint: string | undefined,
): Record<string, unknown> {
  return {
    orderId: order.id,
    status: order.status,
    amount: orderAmount(order) ?? { currencyCode: "USD", value: centsToUsd(approvedCents) },
    reservationId,
    vaultFingerprint: vaultFingerprint ?? null,
  };
}

function blockedResult(purchase: ProposedPurchase, reasons: string[]): CheckoutResult {
  return {
    verdict: "BLOCK",
    reasons,
    chargedCents: null,
    orderId: null,
    purchase,
  };
}

export async function loadMandateSpendEvents(mandateId: string): Promise<SpendEvent[]> {
  const { getDb } = await import("@/db/client");
  const { ledgerEvents } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select({
      type: ledgerEvents.type,
      mandateId: ledgerEvents.mandateId,
      payload: ledgerEvents.payload,
    })
    .from(ledgerEvents)
    .where(eq(ledgerEvents.mandateId, mandateId));
  return rows;
}

export const databaseCheckoutDeps = {
  reserve: reserveSpendInDb,
  release: releaseSpendInDb,
  loadEvents: loadMandateSpendEvents,
};
