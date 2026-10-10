import { describe, expect, it, vi } from "vitest";

import { PayPalApiError } from "@/lib/paypal/client";
import type { PayPalOrder } from "@/lib/paypal/schema";
import type { Mandate, ProposedPurchase } from "@/lib/policy/schema";
import type { LedgerEventInput } from "@/lib/ledger/schema";

import { openSpendCents, type SpendEvent } from "./accounting";
import { CheckoutAmountError } from "./amounts";
import { guardedCheckout } from "./run";
import { SpendReserveError } from "./reserve";

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
  searchQuery: "office paper",
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

function completedOrder(cents: string): PayPalOrder {
  return {
    id: "ORDER1",
    status: "COMPLETED",
    purchase_units: [
      {
        amount: { currency_code: "USD", value: cents },
        payments: {
          captures: [{ id: "CAP1", status: "COMPLETED", amount: { currency_code: "USD", value: cents } }],
        },
      },
    ],
  };
}

function memoryLedger() {
  const events: SpendEvent[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  let sequence = 0;

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = chain.then(work, work);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    events,
    async loadEvents() {
      return events;
    },
    async appendLedger(input: LedgerEventInput) {
      events.push({ type: input.type, mandateId: input.mandateId ?? null, payload: input.payload });
    },
    async reserve(input: { mandateId: string; amountCents: number; capCents: number; reservationId: string }) {
      await enqueue(async () => {
        const spent = openSpendCents(events, input.mandateId);
        if (spent + input.amountCents > input.capCents) {
          throw new SpendReserveError(spent, input.amountCents, input.capCents);
        }
        events.push({
          type: "checkout.reserved",
          mandateId: input.mandateId,
          payload: { reservationId: input.reservationId, amountCents: input.amountCents },
        });
      });
    },
    async release(input: { mandateId: string; reservationId: string }) {
      events.push({
        type: "checkout.released",
        mandateId: input.mandateId,
        payload: { reservationId: input.reservationId },
      });
    },
    nextId() {
      sequence += 1;
      return `reservation-${sequence}`;
    },
  };
}

describe("guardedCheckout", () => {
  it("judges a second purchase against spend recorded for the mandate", async () => {
    const ledger = memoryLedger();
    const charge = vi.fn(async () => completedOrder("6.00"));
    const refetchPrice = vi.fn(async () => 600);
    const shared = {
      refetchPrice,
      loadEvents: ledger.loadEvents,
      reserve: ledger.reserve,
      release: ledger.release,
      appendLedger: ledger.appendLedger,
      createId: () => ledger.nextId(),
      charge,
    };

    const first = await guardedCheckout(
      {
        mandate,
        purchase: purchase(600),
        productIds: ["paper-1"],
        checkedAt: "2026-10-10T12:00:00.000Z",
      },
      shared,
    );
    const second = await guardedCheckout(
      {
        mandate,
        purchase: purchase(500),
        productIds: ["paper-2"],
        checkedAt: "2026-10-10T12:05:00.000Z",
      },
      { ...shared, refetchPrice: async () => 500, charge: vi.fn(async () => completedOrder("5.00")) },
    );

    expect(first.chargedCents).toBe(600);
    expect(first.purchase.lineItems[0]?.checkoutUnitPriceCents).toBe(600);
    expect(ledger.events.filter((event) => event.type === "paypal.order.captured")).toEqual([
      expect.objectContaining({ mandateId: mandate.id }),
    ]);
    expect(second.verdict).toBe("BLOCK");
    expect(second.reasons.join(" ")).toMatch(/prior spend of 600 cents/);
    expect(second.chargedCents).toBeNull();
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it("does not charge when the refreshed price differs", async () => {
    const ledger = memoryLedger();
    const charge = vi.fn(async () => completedOrder("6.00"));

    const result = await guardedCheckout(
      {
        mandate,
        purchase: purchase(600),
        productIds: ["paper-1"],
        checkedAt: "2026-10-10T12:00:00.000Z",
      },
      {
        refetchPrice: async () => 601,
        loadEvents: ledger.loadEvents,
        reserve: ledger.reserve,
        release: ledger.release,
        appendLedger: ledger.appendLedger,
        charge,
      },
    );

    expect(result.verdict).toBe("BLOCK");
    expect(result.reasons.join(" ")).toMatch(/checkout price changed/);
    expect(charge).not.toHaveBeenCalled();
  });

  it("records a mismatched capture and keeps the hold for reconciliation", async () => {
    const ledger = memoryLedger();

    await expect(
      guardedCheckout(
        {
          mandate,
          purchase: purchase(600),
          productIds: ["paper-1"],
          checkedAt: "2026-10-10T12:00:00.000Z",
        },
        {
          refetchPrice: async () => 600,
          loadEvents: ledger.loadEvents,
          reserve: ledger.reserve,
          release: ledger.release,
          appendLedger: ledger.appendLedger,
          createId: () => "reservation-1",
          charge: async () => completedOrder("6.01"),
        },
      ),
    ).rejects.toBeInstanceOf(CheckoutAmountError);

    expect(ledger.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "paypal.order.captured",
          payload: expect.objectContaining({ amount: { currencyCode: "USD", value: "6.01" } }),
        }),
        expect.objectContaining({
          type: "checkout.needs_reconciliation",
          payload: expect.objectContaining({ reservationId: "reservation-1", orderId: "ORDER1" }),
        }),
      ]),
    );
    expect(ledger.events.some((event) => event.type === "checkout.released")).toBe(false);
    expect(openSpendCents(ledger.events, mandate.id)).toBe(601);
  });

  it("blocks when the selected merchant is out of stock", async () => {
    const ledger = memoryLedger();
    const charge = vi.fn(async () => completedOrder("6.00"));

    const result = await guardedCheckout(
      {
        mandate,
        purchase: purchase(600),
        productIds: ["paper-1"],
        checkedAt: "2026-10-10T12:00:00.000Z",
      },
      {
        refetchPrice: async () => {
          throw new Error("Selected merchant staples.com is out of stock.");
        },
        loadEvents: ledger.loadEvents,
        reserve: ledger.reserve,
        release: ledger.release,
        appendLedger: ledger.appendLedger,
        charge,
      },
    );

    expect(result.verdict).toBe("BLOCK");
    expect(result.reasons.join(" ")).toMatch(/out of stock/);
    expect(charge).not.toHaveBeenCalled();
    expect(ledger.events.some((event) => event.type === "checkout.reserved")).toBe(false);
  });

  it("blocks on the selected merchant's higher price when another merchant is cheaper", async () => {
    const ledger = memoryLedger();
    const charge = vi.fn(async () => completedOrder("7.00"));
    const domains: string[] = [];

    const result = await guardedCheckout(
      {
        mandate,
        purchase: purchase(600),
        productIds: ["paper-1"],
        checkedAt: "2026-10-10T12:00:00.000Z",
      },
      {
        refetchPrice: async (_productId, domain) => {
          domains.push(domain);
          return domain === "staples.com" ? 700 : 100;
        },
        loadEvents: ledger.loadEvents,
        reserve: ledger.reserve,
        release: ledger.release,
        appendLedger: ledger.appendLedger,
        charge,
      },
    );

    expect(domains).toEqual(["staples.com"]);
    expect(result.verdict).toBe("BLOCK");
    expect(result.reasons.join(" ")).toMatch(/700 cents/);
    expect(charge).not.toHaveBeenCalled();
  });

  it("lets only one of two overlapping checkouts reserve the remaining cap", async () => {
    const ledger = memoryLedger();
    const charge = vi.fn(async () => completedOrder("6.00"));
    const start = () =>
      guardedCheckout(
        {
          mandate,
          purchase: purchase(600),
          productIds: ["paper-1"],
          checkedAt: "2026-10-10T12:00:00.000Z",
        },
        {
          refetchPrice: async () => 600,
          loadEvents: ledger.loadEvents,
          reserve: ledger.reserve,
          release: ledger.release,
          appendLedger: ledger.appendLedger,
          createId: () => ledger.nextId(),
          charge,
        },
      );

    const [first, second] = await Promise.all([start(), start()]);
    const charged = [first, second].filter((result) => result.chargedCents === 600);
    const blocked = [first, second].filter((result) => result.verdict === "BLOCK");

    expect(charged).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it("releases the reservation only when PayPal rejects the request", async () => {
    const ledger = memoryLedger();

    await expect(
      guardedCheckout(
        {
          mandate,
          purchase: purchase(600),
          productIds: ["paper-1"],
          checkedAt: "2026-10-10T12:00:00.000Z",
        },
        {
          refetchPrice: async () => 600,
          loadEvents: ledger.loadEvents,
          reserve: ledger.reserve,
          release: ledger.release,
          appendLedger: ledger.appendLedger,
          createId: () => "reservation-rejected",
          charge: async () => {
            throw new PayPalApiError(422, { message: "The instrument was declined." });
          },
        },
      ),
    ).rejects.toThrow(/declined/);

    expect(ledger.events.some((event) => event.type === "checkout.released")).toBe(true);
    expect(openSpendCents(ledger.events, mandate.id)).toBe(0);
  });

  it("keeps the reservation when PayPal times out", async () => {
    const ledger = memoryLedger();

    await expect(
      guardedCheckout(
        {
          mandate,
          purchase: purchase(600),
          productIds: ["paper-1"],
          checkedAt: "2026-10-10T12:00:00.000Z",
        },
        {
          refetchPrice: async () => 600,
          loadEvents: ledger.loadEvents,
          reserve: ledger.reserve,
          release: ledger.release,
          appendLedger: ledger.appendLedger,
          createId: () => "reservation-fail",
          charge: async () => {
            throw new Error("paypal down");
          },
        },
      ),
    ).rejects.toThrow(/paypal down/);

    expect(ledger.events.some((event) => event.type === "paypal.order.captured")).toBe(false);
    expect(ledger.events.some((event) => event.type === "checkout.released")).toBe(false);
    expect(ledger.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "checkout.needs_reconciliation",
          payload: expect.objectContaining({ reservationId: "reservation-fail", requestKey: "checkout:reservation-fail" }),
        }),
      ]),
    );
    expect(openSpendCents(ledger.events, mandate.id)).toBe(600);
  });

  it("keeps the reservation when PayPal returns HTTP 500", async () => {
    const ledger = memoryLedger();

    await expect(
      guardedCheckout(
        {
          mandate,
          purchase: purchase(600),
          productIds: ["paper-1"],
          checkedAt: "2026-10-10T12:00:00.000Z",
        },
        {
          refetchPrice: async () => 600,
          loadEvents: ledger.loadEvents,
          reserve: ledger.reserve,
          release: ledger.release,
          appendLedger: ledger.appendLedger,
          createId: () => "reservation-500",
          charge: async () => {
            throw new PayPalApiError(503, { message: "unavailable" });
          },
        },
      ),
    ).rejects.toThrow(/unavailable/);

    expect(ledger.events.some((event) => event.type === "checkout.released")).toBe(false);
    expect(ledger.events.some((event) => event.type === "checkout.needs_reconciliation")).toBe(true);
    expect(openSpendCents(ledger.events, mandate.id)).toBe(600);
  });

  it("keeps the reservation when PayPal returns an unexpected status", async () => {
    const ledger = memoryLedger();

    await expect(
      guardedCheckout(
        {
          mandate,
          purchase: purchase(600),
          productIds: ["paper-1"],
          checkedAt: "2026-10-10T12:00:00.000Z",
        },
        {
          refetchPrice: async () => 600,
          loadEvents: ledger.loadEvents,
          reserve: ledger.reserve,
          release: ledger.release,
          appendLedger: ledger.appendLedger,
          createId: () => "reservation-status",
          charge: async () => ({
            id: "ORDER9",
            status: "PAYER_ACTION_REQUIRED",
            purchase_units: [{ amount: { currency_code: "USD", value: "6.00" } }],
          }),
        },
      ),
    ).rejects.toBeInstanceOf(CheckoutAmountError);

    expect(ledger.events.some((event) => event.type === "paypal.order.captured")).toBe(false);
    expect(ledger.events.some((event) => event.type === "checkout.released")).toBe(false);
    expect(ledger.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "checkout.needs_reconciliation",
          payload: expect.objectContaining({ reservationId: "reservation-status", orderId: "ORDER9" }),
        }),
      ]),
    );
    expect(openSpendCents(ledger.events, mandate.id)).toBe(600);
  });

  it("stores an escalation and does not create an order", async () => {
    const ledger = memoryLedger();
    const charge = vi.fn(async () => completedOrder("6.00"));
    const saved: unknown[] = [];

    const result = await guardedCheckout(
      {
        mandate: { ...mandate, escalateAboveCents: 100 },
        purchase: purchase(600),
        productIds: ["paper-1"],
        checkedAt: "2026-10-10T12:00:00.000Z",
      },
      {
        refetchPrice: async () => 600,
        loadEvents: ledger.loadEvents,
        reserve: ledger.reserve,
        release: ledger.release,
        appendLedger: ledger.appendLedger,
        charge,
        saveApproval: async (approval) => {
          saved.push(approval);
        },
      },
    );

    expect(result.verdict).toBe("ESCALATE");
    expect(result.chargedCents).toBeNull();
    expect(result.orderId).toBeNull();
    expect(charge).not.toHaveBeenCalled();
    expect(saved).toEqual([
      expect.objectContaining({
        status: "pending",
        expectedCents: 600,
        expiresAt: "2026-10-10T13:00:00.000Z",
      }),
    ]);
  });
});
