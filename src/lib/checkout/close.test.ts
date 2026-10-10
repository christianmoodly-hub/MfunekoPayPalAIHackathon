import { describe, expect, it } from "vitest";

import type { ProposedPurchase } from "@/lib/policy/schema";

import { closeStoredApproval, type StoredApproval } from "./approval";

const purchase: ProposedPurchase = {
  statedTotalCents: 600,
  lineItems: [
    {
      merchant: "staples.com",
      category: "office-supplies/printer-copier-paper",
      unitPriceCents: 600,
      quantity: 1,
      freeReturns: null,
      deliveryDate: null,
    },
  ],
};

function approval(status: StoredApproval["status"], reservationId: string | null): StoredApproval {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    mandateId: "mandate-1",
    purchase,
    productIds: ["paper-1"],
    reasons: ["Needs a person."],
    status,
    orderId: reservationId ? "ORDER1" : null,
    reservationId,
    runId: "22222222-2222-4222-8222-222222222222",
    expectedCents: 600,
    expiresAt: "2026-10-10T13:00:00.000Z",
  };
}

describe("closeStoredApproval", () => {
  it("releases an ordered hold and marks the approval cancelled", async () => {
    const released: string[] = [];
    const events: string[] = [];
    const next = await closeStoredApproval(approval("ordered", "reservation-1"), "cancelled", {
      release: async (input) => {
        released.push(input.reservationId);
        expect(input.runId).toBe("22222222-2222-4222-8222-222222222222");
      },
      save: async () => undefined,
      appendLedger: async (event) => {
        events.push(event.type);
      },
    });

    expect(next.status).toBe("cancelled");
    expect(released).toEqual(["reservation-1"]);
    expect(events).toEqual(["approval.cancelled"]);
  });

  it("does not release a pending approval that has no hold", async () => {
    const released: string[] = [];
    const next = await closeStoredApproval(approval("pending", null), "declined", {
      release: async (input) => {
        released.push(input.reservationId);
      },
      save: async () => undefined,
      appendLedger: async () => undefined,
    });

    expect(next.status).toBe("declined");
    expect(released).toEqual([]);
  });

  it("refuses to close a captured approval", async () => {
    await expect(
      closeStoredApproval(approval("captured", "reservation-1"), "declined", {
        release: async () => {
          throw new Error("release should not run");
        },
        save: async () => {
          throw new Error("save should not run");
        },
        appendLedger: async () => {
          throw new Error("ledger should not run");
        },
      }),
    ).rejects.toThrow(/captured/);
  });
});
