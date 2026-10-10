import { describe, expect, it, vi } from "vitest";

import type { PayPalOrder } from "@/lib/paypal/schema";
import type { Mandate, ProposedPurchase } from "@/lib/policy/schema";
import type { LedgerEventInput } from "@/lib/ledger/schema";

import type { SpendEvent } from "./accounting";
import { approveEscalation, captureAfterApproval, type ApprovalDeps, type StoredApproval } from "./approval";
import { CheckoutAmountError } from "./amounts";

const mandate: Mandate = {
  id: "mandate-1",
  description: "Office paper under $10",
  maxTotalCents: 1000,
  maxPerItemCents: 1000,
  allowedCategories: ["printer-copier-paper"],
  blockedMerchants: [],
  allowedMerchants: null,
  requireFreeReturns: false,
  deliverBy: null,
  escalateAboveCents: 1000,
  expiresAt: "2026-12-01T00:00:00.000Z",
  status: "active",
  searchQuery: "printer paper",
  needsInput: [],
};

function purchase(cents: number): ProposedPurchase {
  return {
    statedTotalCents: cents,
    lineItems: [
      {
        merchant: "staples.com",
        category: "office-supplies/printer-copier-paper",
        unitPriceCents: cents,
        quantity: 1,
        freeReturns: null,
        deliveryDate: null,
      },
    ],
  };
}

function buyerOrder(cents: string): PayPalOrder {
  return {
    id: "ORDER1",
    status: "PAYER_ACTION_REQUIRED",
    links: [{ href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1", rel: "payer-action" }],
    purchase_units: [{ amount: { currency_code: "USD", value: cents } }],
  };
}

function capturedOrder(orderCents: string, captureCents: string): PayPalOrder {
  return {
    id: "ORDER1",
    status: "COMPLETED",
    purchase_units: [
      {
        amount: { currency_code: "USD", value: orderCents },
        payments: {
          captures: [{ id: "CAP1", status: "COMPLETED", amount: { currency_code: "USD", value: captureCents } }],
        },
      },
    ],
  };
}

function pending(expiresAt: string): StoredApproval {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    mandateId: mandate.id,
    purchase: purchase(600),
    productIds: ["paper-1"],
    reasons: ["Cart total of 600 cents exceeds the escalate threshold of 100 cents."],
    status: "pending",
    orderId: null,
    reservationId: null,
    expectedCents: 600,
    expiresAt,
  };
}

function deps(events: SpendEvent[] = []): ApprovalDeps & { events: LedgerEventInput[]; saved: StoredApproval | null } {
  const harness: ApprovalDeps & { events: LedgerEventInput[]; saved: StoredApproval | null } = {
    events: [],
    saved: null,
    now: new Date("2026-10-10T12:00:00.000Z"),
    loadApproval: async () => pending("2026-10-10T13:00:00.000Z"),
    saveApproval: async (approval) => {
      harness.saved = approval;
    },
    loadMandate: async () => mandate,
    refetchPrice: async () => 600,
    loadEvents: async () => events,
    reserve: async () => undefined,
    release: async () => undefined,
    appendLedger: async (input) => {
      harness.events.push(input);
    },
    createBuyerOrder: async () => buyerOrder("6.00"),
    getBuyerOrder: async () => buyerOrder("6.00"),
    captureBuyerOrder: async () => capturedOrder("6.00", "6.00"),
    createId: () => "reservation-approval",
  };
  return harness;
}

describe("approveEscalation", () => {
  it("stops an expired approval before creating an order", async () => {
    const harness = deps();
    const createBuyerOrder = vi.fn(harness.createBuyerOrder);
    const result = await approveEscalation(pending("").id, {
      ...harness,
      now: new Date("2026-10-10T14:00:00.000Z"),
      loadApproval: async () => pending("2026-10-10T13:00:00.000Z"),
      createBuyerOrder,
    });

    expect(result.verdict).toBe("BLOCK");
    expect(result.reasons).toEqual(["Approval expired."]);
    expect(result.orderId).toBeNull();
    expect(createBuyerOrder).not.toHaveBeenCalled();
    expect(harness.saved?.status).toBe("expired");
  });

  it("stops when the refreshed price has changed", async () => {
    const harness = deps();
    const createBuyerOrder = vi.fn(harness.createBuyerOrder);
    const result = await approveEscalation(pending("").id, {
      ...harness,
      refetchPrice: async () => 601,
      createBuyerOrder,
    });

    expect(result.verdict).toBe("BLOCK");
    expect(result.reasons.join(" ")).toMatch(/checkout price changed from 600 cents to 601 cents/);
    expect(createBuyerOrder).not.toHaveBeenCalled();
    expect(harness.saved?.status).toBe("blocked");
  });

  it("stops when the re-check is now BLOCK because spend exceeds the cap", async () => {
    const harness = deps([
      {
        type: "paypal.order.captured",
        mandateId: mandate.id,
        payload: { amount: { currencyCode: "USD", value: "5.00" }, reservationId: "earlier" },
      },
    ]);
    const createBuyerOrder = vi.fn(harness.createBuyerOrder);
    const result = await approveEscalation(pending("").id, {
      ...harness,
      createBuyerOrder,
    });

    expect(result.verdict).toBe("BLOCK");
    expect(result.reasons.join(" ")).toMatch(/prior spend of 500 cents/);
    expect(createBuyerOrder).not.toHaveBeenCalled();
    expect(harness.saved?.status).toBe("blocked");
  });

  it("creates a buyer-approval order when the re-check is not BLOCK", async () => {
    const harness = deps();
    const result = await approveEscalation(pending("").id, harness);

    expect(result.verdict).toBe("APPROVE");
    expect(result.orderId).toBe("ORDER1");
    expect(result.approvalUrl).toMatch(/checkoutnow/);
    expect(harness.saved?.status).toBe("ordered");
    expect(harness.events.some((event) => event.type === "paypal.order.created")).toBe(true);
  });
});

describe("captureAfterApproval", () => {
  it("fails before capture when the order amount differs from the snapshot", async () => {
    const harness = deps();
    const captureBuyerOrder = vi.fn(harness.captureBuyerOrder);
    const ordered: StoredApproval = {
      ...pending("2026-10-10T13:00:00.000Z"),
      status: "ordered",
      orderId: "ORDER1",
      reservationId: "reservation-approval",
    };

    await expect(
      captureAfterApproval(ordered.id, {
        ...harness,
        loadApproval: async () => ordered,
        getBuyerOrder: async () => buyerOrder("6.01"),
        captureBuyerOrder,
      }),
    ).rejects.toBeInstanceOf(CheckoutAmountError);

    expect(captureBuyerOrder).not.toHaveBeenCalled();
    expect(harness.events.some((event) => event.type === "paypal.order.captured")).toBe(false);
  });

  it("fails when the capture amount differs from the snapshot", async () => {
    const harness = deps();
    const ordered: StoredApproval = {
      ...pending("2026-10-10T13:00:00.000Z"),
      status: "ordered",
      orderId: "ORDER1",
      reservationId: "reservation-approval",
    };

    await expect(
      captureAfterApproval(ordered.id, {
        ...harness,
        loadApproval: async () => ordered,
        captureBuyerOrder: async () => capturedOrder("6.00", "6.01"),
      }),
    ).rejects.toBeInstanceOf(CheckoutAmountError);

    expect(harness.events.some((event) => event.type === "paypal.order.captured")).toBe(false);
    expect(harness.events.some((event) => event.type === "paypal.order.failed")).toBe(true);
  });

  it("writes the captured event with the mandate id and PayPal's capture amount", async () => {
    const harness = deps();
    const ordered: StoredApproval = {
      ...pending("2026-10-10T13:00:00.000Z"),
      status: "ordered",
      orderId: "ORDER1",
      reservationId: "reservation-approval",
    };

    await captureAfterApproval(ordered.id, {
      ...harness,
      loadApproval: async () => ordered,
    });

    expect(harness.events).toEqual([
      expect.objectContaining({
        type: "paypal.order.captured",
        mandateId: mandate.id,
        payload: expect.objectContaining({
          amount: { currencyCode: "USD", value: "6.00" },
        }),
      }),
    ]);
  });
});
