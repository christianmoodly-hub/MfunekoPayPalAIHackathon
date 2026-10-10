import { describe, expect, it } from "vitest";

import { openSpendCents, type SpendEvent } from "./accounting";

const mandateId = "mandate-1";

describe("openSpendCents", () => {
  it("counts a capture and ignores a settled reservation", () => {
    const events: SpendEvent[] = [
      {
        type: "checkout.reserved",
        mandateId,
        payload: { reservationId: "r1", amountCents: 400 },
      },
      {
        type: "paypal.order.captured",
        mandateId,
        payload: { reservationId: "r1", amount: { currencyCode: "USD", value: "4.00" } },
      },
    ];

    expect(openSpendCents(events, mandateId)).toBe(400);
  });

  it("keeps an open reservation until it is released", () => {
    const held: SpendEvent[] = [
      {
        type: "checkout.reserved",
        mandateId,
        payload: { reservationId: "r2", amountCents: 250 },
      },
    ];
    expect(openSpendCents(held, mandateId)).toBe(250);

    expect(
      openSpendCents(
        [...held, { type: "checkout.released", mandateId, payload: { reservationId: "r2" } }],
        mandateId,
      ),
    ).toBe(0);
  });

  it("ignores a captured payment that has no mandate id", () => {
    const events: SpendEvent[] = [
      {
        type: "paypal.order.captured",
        mandateId: null,
        payload: { amount: { currencyCode: "USD", value: "8.00" } },
      },
    ];

    expect(openSpendCents(events, mandateId)).toBe(0);
  });
});
