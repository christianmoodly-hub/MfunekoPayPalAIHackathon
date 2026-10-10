import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { approvals } from "@/db/schema";
import type { LedgerEventInput } from "@/lib/ledger/schema";
import { getMandate } from "@/lib/mandate/store";
import { approvalUrl, paypalOrderSchema, type PayPalOrder } from "@/lib/paypal/schema";
import { evaluatePolicy, type PolicyVerdict } from "@/lib/policy";
import { proposedPurchaseSchema, type LineItem, type Mandate, type ProposedPurchase } from "@/lib/policy/schema";

import type { SpendEvent } from "./accounting";
import { openSpendCents } from "./accounting";
import { assertPayPalCharge, assertPayPalOrderAmount } from "./amounts";
import { loadMandateSpendEvents } from "./run";
import { isDefinitivePayPalRejection, settleUncertainCharge } from "./settle";

export type StoredApproval = {
  id: string;
  mandateId: string;
  purchase: ProposedPurchase;
  productIds: string[];
  reasons: string[];
  status: "pending" | "ordering" | "ordered" | "blocked" | "expired" | "captured";
  orderId: string | null;
  reservationId: string | null;
  expectedCents: number;
  expiresAt: string;
  orderedAt?: string | null;
  capturedOrder?: PayPalOrder | null;
};

export type ApprovalResult = {
  verdict: PolicyVerdict;
  reasons: string[];
  purchase: ProposedPurchase;
  chargedCents: number | null;
  orderId: string | null;
  approvalId: string | null;
  approvalUrl: string | null;
};

type BuyerOrderInput = {
  lineItems: LineItem[];
  mandateId: string;
  idempotencyKey: string;
};

export type ApprovalDeps = {
  now: Date;
  loadApproval: (id: string) => Promise<StoredApproval | null>;
  claimApproval: (id: string) => Promise<StoredApproval | null>;
  saveApproval: (approval: StoredApproval) => Promise<void>;
  loadMandate: (id: string) => Promise<Mandate | null>;
  refetchPrice: (productId: string, domain: string) => Promise<number>;
  loadEvents: (mandateId: string) => Promise<SpendEvent[]>;
  reserve: (input: { mandateId: string; amountCents: number; capCents: number; reservationId: string }) => Promise<void>;
  release: (input: { mandateId: string; reservationId: string }) => Promise<void>;
  appendLedger: (input: LedgerEventInput) => Promise<unknown>;
  createBuyerOrder: (input: BuyerOrderInput) => Promise<PayPalOrder>;
  getBuyerOrder: (orderId: string) => Promise<PayPalOrder>;
  captureBuyerOrder: (orderId: string) => Promise<PayPalOrder>;
  createId?: () => string;
};

export async function approveEscalation(
  approvalId: string,
  overrides: Partial<ApprovalDeps> = {},
): Promise<ApprovalResult> {
  const deps = await resolveDeps(overrides);
  const approval = await deps.loadApproval(approvalId);
  if (!approval) {
    throw new Error("Approval was not found.");
  }
  if (approval.status !== "pending") {
    throw new Error("Approval is not pending.");
  }
  if (deps.now.getTime() >= Date.parse(approval.expiresAt)) {
    const expired = { ...approval, status: "expired" as const };
    await deps.saveApproval(expired);
    await deps.appendLedger({
      type: "approval.expired",
      mandateId: approval.mandateId,
      payload: { approvalId },
    });
    return {
      verdict: "BLOCK",
      reasons: ["Approval expired."],
      purchase: approval.purchase,
      chargedCents: null,
      orderId: null,
      approvalId,
      approvalUrl: null,
    };
  }

  const mandate = await deps.loadMandate(approval.mandateId);
  if (!mandate || mandate.status !== "active") {
    throw new Error("Mandate was not found.");
  }

  const purchase = await refreshPurchase(approval, deps.refetchPrice);
  const events = await deps.loadEvents(approval.mandateId);
  const decision = evaluatePolicy({
    mandate,
    purchase,
    spend: { spentCents: openSpendCents(events, approval.mandateId) },
    checkedAt: deps.now.toISOString(),
  });
  if (decision.verdict === "BLOCK") {
    await deps.saveApproval({ ...approval, purchase, reasons: decision.reasons, status: "blocked" });
    await deps.appendLedger({
      type: "approval.blocked",
      mandateId: approval.mandateId,
      payload: { approvalId, reasons: decision.reasons, purchase },
    });
    return {
      verdict: "BLOCK",
      reasons: decision.reasons,
      purchase,
      chargedCents: null,
      orderId: null,
      approvalId,
      approvalUrl: null,
    };
  }

  const claimed = await deps.claimApproval(approvalId);
  if (!claimed) {
    throw new Error("Approval is not pending.");
  }

  const expectedCents = payableCents(purchase);
  const reservationId = deps.createId?.() ?? crypto.randomUUID();
  await deps.reserve({
    mandateId: approval.mandateId,
    amountCents: expectedCents,
    capCents: mandate.maxTotalCents,
    reservationId,
  });

  const requestKey = `approval:${approvalId}`;
  let order: PayPalOrder | undefined;
  try {
    order = await deps.createBuyerOrder({
      lineItems: purchase.lineItems,
      mandateId: approval.mandateId,
      idempotencyKey: requestKey,
    });
    assertPayPalOrderAmount(order, expectedCents);
    const url = approvalUrl(order);
    if (!url) {
      throw new Error("PayPal did not return an approval URL.");
    }
    await deps.saveApproval({
      ...approval,
      purchase,
      reasons: decision.reasons,
      status: "ordered",
      orderId: order.id,
      reservationId,
      expectedCents,
      orderedAt: deps.now.toISOString(),
    });
    await deps.appendLedger({
      type: "paypal.order.created",
      mandateId: approval.mandateId,
      payload: {
        approvalId,
        reservationId,
        orderId: order.id,
        status: order.status,
        amount: orderAmount(order),
      },
    });
    return {
      verdict: decision.verdict,
      reasons: decision.reasons,
      purchase,
      chargedCents: null,
      orderId: order.id,
      approvalId,
      approvalUrl: url,
    };
  } catch (error) {
    await settleUncertainCharge({
      error,
      order,
      mandateId: approval.mandateId,
      reservationId,
      requestKey,
      release: () => deps.release({ mandateId: approval.mandateId, reservationId }),
      appendLedger: deps.appendLedger,
    });
    if (isDefinitivePayPalRejection(error)) {
      await deps.saveApproval({ ...approval, status: "pending", reservationId: null });
    }
    throw error;
  }
}

export async function captureAfterApproval(
  approvalId: string,
  overrides: Partial<ApprovalDeps> = {},
): Promise<PayPalOrder> {
  const deps = await resolveDeps(overrides);
  const approval = await deps.loadApproval(approvalId);
  if (!approval) {
    throw new Error("Approval was not found.");
  }
  if (approval.status === "captured") {
    if (approval.capturedOrder) {
      return approval.capturedOrder;
    }
    if (!approval.orderId) {
      throw new Error("Approval has no PayPal order.");
    }
    return deps.getBuyerOrder(approval.orderId);
  }
  if (approval.status !== "ordered") {
    throw new Error("Approval is not ordered.");
  }
  if (!approval.orderId || !approval.reservationId) {
    throw new Error("Approval has no PayPal order.");
  }

  const requestKey = `approval:capture:${approval.orderId}`;
  let existing: PayPalOrder | undefined;
  try {
    existing = await deps.getBuyerOrder(approval.orderId);
    assertPayPalOrderAmount(existing, approval.expectedCents);
  } catch (error) {
    await settleUncertainCharge({
      error,
      order: existing,
      mandateId: approval.mandateId,
      reservationId: approval.reservationId,
      requestKey,
      release: () => deps.release({ mandateId: approval.mandateId, reservationId: approval.reservationId ?? "" }),
      appendLedger: deps.appendLedger,
    });
    throw error;
  }

  let captured: PayPalOrder | undefined;
  try {
    captured = await deps.captureBuyerOrder(approval.orderId);
    assertPayPalCharge(captured, approval.expectedCents);
  } catch (error) {
    await settleUncertainCharge({
      error,
      order: captured,
      mandateId: approval.mandateId,
      reservationId: approval.reservationId,
      requestKey,
      release: () => deps.release({ mandateId: approval.mandateId, reservationId: approval.reservationId ?? "" }),
      appendLedger: deps.appendLedger,
    });
    if (captured) {
      await deps.saveApproval({ ...approval, status: "captured", capturedOrder: captured });
    }
    throw error;
  }

  const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
  await deps.appendLedger({
    type: "paypal.order.captured",
    mandateId: approval.mandateId,
    payload: {
      approvalId,
      reservationId: approval.reservationId,
      orderId: captured.id,
      status: captured.status,
      captureId: capture?.id ?? null,
      amount: capture?.amount
        ? { currencyCode: capture.amount.currency_code, value: capture.amount.value }
        : null,
    },
  });
  await deps.saveApproval({ ...approval, status: "captured", capturedOrder: captured });
  return captured;
}

export async function loadApprovalRecord(id: string): Promise<StoredApproval | null> {
  const [row] = await getDb().select().from(approvals).where(eq(approvals.id, id)).limit(1);
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    mandateId: row.mandateId,
    purchase: proposedPurchaseSchema.parse(row.purchase),
    productIds: row.productIds,
    reasons: row.reasons,
    status: row.status as StoredApproval["status"],
    orderId: row.orderId,
    reservationId: row.reservationId,
    expectedCents: row.expectedCents,
    expiresAt: row.expiresAt.toISOString(),
    orderedAt: row.orderedAt ? row.orderedAt.toISOString() : null,
    capturedOrder: capturedOrderFrom(row.capturedOrder),
  };
}

export async function claimApprovalRecord(id: string): Promise<StoredApproval | null> {
  const [row] = await getDb()
    .update(approvals)
    .set({ status: "ordering" })
    .where(and(eq(approvals.id, id), eq(approvals.status, "pending")))
    .returning();
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    mandateId: row.mandateId,
    purchase: proposedPurchaseSchema.parse(row.purchase),
    productIds: row.productIds,
    reasons: row.reasons,
    status: "ordering",
    orderId: row.orderId,
    reservationId: row.reservationId,
    expectedCents: row.expectedCents,
    expiresAt: row.expiresAt.toISOString(),
    orderedAt: row.orderedAt ? row.orderedAt.toISOString() : null,
    capturedOrder: capturedOrderFrom(row.capturedOrder),
  };
}

export async function saveApprovalRecord(approval: StoredApproval): Promise<void> {
  const values = {
    id: approval.id,
    mandateId: approval.mandateId,
    purchase: approval.purchase as unknown as Record<string, unknown>,
    productIds: approval.productIds,
    reasons: approval.reasons,
    status: approval.status,
    orderId: approval.orderId,
    reservationId: approval.reservationId,
    expectedCents: approval.expectedCents,
    expiresAt: new Date(approval.expiresAt),
    orderedAt: approval.orderedAt ? new Date(approval.orderedAt) : null,
    capturedOrder: (approval.capturedOrder ?? null) as Record<string, unknown> | null,
  };
  const db = getDb();
  const [existing] = await db.select({ id: approvals.id }).from(approvals).where(eq(approvals.id, approval.id)).limit(1);
  if (!existing) {
    await db.insert(approvals).values(values);
    return;
  }
  await db.update(approvals).set(values).where(eq(approvals.id, approval.id));
}

async function resolveDeps(overrides: Partial<ApprovalDeps>): Promise<ApprovalDeps> {
  if (isComplete(overrides)) {
    return overrides;
  }
  const { releaseSpendInDb, reserveSpendInDb } = await import("./reserve");
  const { createPayPalClient } = await import("@/lib/paypal/client");
  const { readPayPalEnv } = await import("@/lib/paypal/config");
  const { approvalOrderBody } = await import("@/lib/paypal/order-approval");
  const { captureOrder, createOrder, getOrder } = await import("@/lib/paypal/orders");
  const { refetchPrice } = await import("@/lib/channel3/price");
  const { readChannel3Env } = await import("@/lib/channel3/env");
  const { appendLedgerEvent } = await import("@/lib/ledger");
  const client = createPayPalClient(readPayPalEnv());
  const origin = process.env.APP_URL ?? "http://localhost:3000";
  const defaults: ApprovalDeps = {
    now: new Date(),
    loadApproval: loadApprovalRecord,
    claimApproval: claimApprovalRecord,
    saveApproval: saveApprovalRecord,
    loadMandate: getMandate,
    refetchPrice: (productId, domain) => refetchPrice(productId, domain, readChannel3Env()),
    loadEvents: loadMandateSpendEvents,
    reserve: reserveSpendInDb,
    release: releaseSpendInDb,
    appendLedger: appendLedgerEvent,
    createBuyerOrder: (input) =>
      createOrder(
        client,
        approvalOrderBody(
          input.lineItems,
          input.mandateId,
          `${origin}/api/paypal/order/return`,
          `${origin}/mandates?checkout=cancelled`,
        ),
        input.idempotencyKey,
      ),
    getBuyerOrder: (orderId) => getOrder(client, orderId, `approval:get:${orderId}`),
    captureBuyerOrder: (orderId) => captureOrder(client, orderId, `approval:capture:${orderId}`),
  };
  return { ...defaults, ...overrides };
}

function isComplete(overrides: Partial<ApprovalDeps>): overrides is ApprovalDeps {
  return Boolean(
    overrides.now &&
      overrides.loadApproval &&
      overrides.claimApproval &&
      overrides.saveApproval &&
      overrides.loadMandate &&
      overrides.refetchPrice &&
      overrides.loadEvents &&
      overrides.reserve &&
      overrides.release &&
      overrides.appendLedger &&
      overrides.createBuyerOrder &&
      overrides.getBuyerOrder &&
      overrides.captureBuyerOrder,
  );
}

async function refreshPurchase(
  approval: StoredApproval,
  refetchPrice: (productId: string, domain: string) => Promise<number>,
): Promise<ProposedPurchase> {
  const lineItems = await Promise.all(
    approval.purchase.lineItems.map(async (item, index) => {
      const productId = approval.productIds[index] ?? approval.productIds[0];
      if (!productId) {
        throw new Error("Approval snapshot is missing a product.");
      }
      return { ...item, checkoutUnitPriceCents: await refetchPrice(productId, item.merchant) };
    }),
  );
  return { ...approval.purchase, lineItems };
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

function capturedOrderFrom(value: unknown): PayPalOrder | null {
  const parsed = paypalOrderSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function orderAmount(order: PayPalOrder): { currencyCode: string; value: string } | null {
  const amount = order.purchase_units?.[0]?.amount;
  if (!amount) {
    return null;
  }
  return { currencyCode: amount.currency_code, value: amount.value };
}
