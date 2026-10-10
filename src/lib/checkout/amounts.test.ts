import { describe, expect, it } from "vitest";

import type { PayPalOrder } from "@/lib/paypal/schema";

import { assertPayPalCharge, CheckoutAmountError } from "./amounts";

function completedOrder(cents: string, captureCents = cents): PayPalOrder {
  return {
    id: "ORDER1",
    status: "COMPLETED",
    purchase_units: [
      {
        amount: { currency_code: "USD", value: cents },
        payments: {
          captures: [{ id: "CAP1", status: "COMPLETED", amount: { currency_code: "USD", value: captureCents } }],
        },
      },
    ],
  };
}

describe("assertPayPalCharge", () => {
  it("accepts an order and capture that match the approved total", () => {
    expect(() => assertPayPalCharge(completedOrder("9.99"), 999)).not.toThrow();
  });

  it("fails when the capture amount differs from the approved total", () => {
    expect(() => assertPayPalCharge(completedOrder("9.99", "10.00"), 999)).toThrow(CheckoutAmountError);
    expect(() => assertPayPalCharge(completedOrder("9.99", "10.00"), 999)).toThrow(/do not match the approved total/);
  });
});
