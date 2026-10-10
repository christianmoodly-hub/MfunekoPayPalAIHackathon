import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { ledgerEvents } from "@/db/schema";
import type { LedgerEventInput } from "@/lib/ledger/schema";
import type { PayPalOrder } from "@/lib/paypal/schema";
import { evaluatePolicy, type PolicyVerdict } from "@/lib/policy";
import type { LineItem, Mandate, ProposedPurchase } from "@/lib/policy/schema";

import type { SpendEvent } from "./accounting";
import { openSpendCents } from "./accounting";
import { assertPayPalCharge } from "./amounts";
import type { StoredApproval } from "./approval";
import { releaseExpiredOrderHolds } from "./holds";
import { SpendReserveError } from "./reserve";
import { settleUncertainCharge } from "./settle";

const HOUR_MS = 60 * 60 * 1000;

export type CheckoutInput = {
  mandate: Mandate;
  purchase: ProposedPurchase;
  productIds: string[];
  checkedAt: string;
};

export type CheckoutResult = {
  verdict: PolicyVerdict;
  reasons: string[];
  purchase: ProposedPurchase;
  chargedCents: number | null;
  orderId: string | null;
  approvalId: string | null;
  approvalUrl: string | null;
};

export type CheckoutDeps = {
  refetchPrice: (productId: string, domain: string) => Promise<number>;
  loadEvents: (mandateId: string) => Promise<SpendEvent[]>;
  reserve: (input: { mandateId: string; amountCents: number; capCents: number; reservationId: string }) => Promise<void>;
  release: (input: { mandateId: string; reservationId: string }) => Promise<void>;
  appendLedger: (input: LedgerEventInput) => Promise<unknown>;
  charge: (lineItems: LineItem[], idempotencyKey: string) => Promise<PayPalOrder>;
  createId?: () => string;
  saveApproval?: (approval: StoredApproval) => Promise<void>;
  vaultFingerprint?: string;
};

export async function guardedCheckout(input: CheckoutInput, deps: CheckoutDeps): Promise<CheckoutResult> {
  let purchase: ProposedPurchase;
  try {
    purchase = await withCheckoutPrices(input, deps.refetchPrice);
  } catch (error) {
    const reasons = [error instanceof Error ? error.message : "Price check failed."];
    await deps.appendLedger({
      type: "checkout.blocked",
      mandateId: input.mandate.id,
      payload: { reasons, purchase: input.purchase },
    });
    return outcome("BLOCK", reasons, input.purchase, null, null, null, null);
  }
  const events = await deps.loadEvents(input.mandate.id);
  const spentCents = openSpendCents(events, input.mandate.id);
  const decision = evaluatePolicy({
    mandate: input.mandate,
    purchase,
    spend: { spentCents },
    checkedAt: input.checkedAt,
  });

  if (decision.verdict === "BLOCK") {
    await deps.appendLedger({
      type: "checkout.blocked",
      mandateId: input.mandate.id,
      payload: { reasons: decision.reasons, purchase },
    });
    return outcome(decision.verdict, decision.reasons, purchase, null, null, null, null);
  }

  if (decision.verdict === "ESCALATE") {
    const approvalId = deps.createId?.() ?? crypto.randomUUID();
    const expectedCents = payableCents(purchase);
    const expiresAt = new Date(Date.parse(input.checkedAt) + HOUR_MS).toISOString();
    const approval: StoredApproval = {
      id: approvalId,
      mandateId: input.mandate.id,
      purchase,
      productIds: input.productIds,
      reasons: decision.reasons,
      status: "pending",
      orderId: null,
      reservationId: null,
      expectedCents,
      expiresAt,
    };
    await deps.saveApproval?.(approval);
    await deps.appendLedger({
      type: "checkout.escalated",
      mandateId: input.mandate.id,
      payload: { approvalId, reasons: decision.reasons, purchase, expiresAt },
    });
    return outcome("ESCALATE", decision.reasons, purchase, null, null, approvalId, null);
  }

  const reservationId = deps.createId?.() ?? crypto.randomUUID();
  const expectedCents = payableCents(purchase);
  try {
    await deps.reserve({
      mandateId: input.mandate.id,
      amountCents: expectedCents,
      capCents: input.mandate.maxTotalCents,
      reservationId,
    });
  } catch (error) {
    if (error instanceof SpendReserveError) {
      const reasons = [error.message];
      await deps.appendLedger({
        type: "checkout.blocked",
        mandateId: input.mandate.id,
        payload: { reasons, purchase },
      });
      return outcome("BLOCK", reasons, purchase, null, null, null, null);
    }
    throw error;
  }

  let order: PayPalOrder | undefined;
  try {
    order = await deps.charge(purchase.lineItems, `checkout:${reservationId}`);
    assertPayPalCharge(order, expectedCents);
  } catch (error) {
    await settleUncertainCharge({
      error,
      order,
      mandateId: input.mandate.id,
      reservationId,
      requestKey: `checkout:${reservationId}`,
      release: () => deps.release({ mandateId: input.mandate.id, reservationId }),
      appendLedger: deps.appendLedger,
    });
    throw error;
  }

  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  await deps.appendLedger({
    type: "paypal.order.captured",
    mandateId: input.mandate.id,
    payload: {
      reservationId,
      orderId: order.id,
      status: order.status,
      captureId: capture?.id ?? null,
      amount: capture?.amount
        ? { currencyCode: capture.amount.currency_code, value: capture.amount.value }
        : null,
      vaultFingerprint: deps.vaultFingerprint ?? null,
    },
  });

  return outcome("APPROVE", decision.reasons, purchase, expectedCents, order.id, null, null);
}

export async function loadMandateSpendEvents(mandateId: string): Promise<SpendEvent[]> {
  await releaseExpiredOrderHolds(mandateId);
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

async function withCheckoutPrices(
  input: CheckoutInput,
  refetchPrice: (productId: string, domain: string) => Promise<number>,
): Promise<ProposedPurchase> {
  const lineItems = await Promise.all(
    input.purchase.lineItems.map(async (item, index) => {
      const productId = input.productIds[index] ?? input.productIds[0];
      if (!productId) {
        throw new Error("Checkout is missing a product id.");
      }
      return { ...item, checkoutUnitPriceCents: await refetchPrice(productId, item.merchant) };
    }),
  );
  return { ...input.purchase, lineItems };
}

function payableCents(purchase: ProposedPurchase): number {
  let total = 0;
  for (const item of purchase.lineItems) {
    const line = (item.checkoutUnitPriceCents ?? item.unitPriceCents) * item.quantity;
    if (!Number.isSafeInteger(line) || total > Number.MAX_SAFE_INTEGER - line) {
      throw new Error("Payable total is not a safe integer number of cents.");
    }
    total += line;
  }
  return total;
}

function outcome(
  verdict: PolicyVerdict,
  reasons: string[],
  purchase: ProposedPurchase,
  chargedCents: number | null,
  orderId: string | null,
  approvalId: string | null,
  approvalUrl: string | null,
): CheckoutResult {
  return { verdict, reasons, purchase, chargedCents, orderId, approvalId, approvalUrl };
}
