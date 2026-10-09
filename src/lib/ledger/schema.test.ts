import { describe, expect, it } from "vitest";

import { ledgerEventInputSchema } from "./schema";

describe("ledgerEventInputSchema", () => {
  it("accepts an event with a null mandate id", () => {
    const parsed = ledgerEventInputSchema.parse({
      type: "paypal.order.created",
      payload: { orderId: "ORDER-ID" },
      mandateId: null,
    });

    expect(parsed.mandateId).toBeNull();
  });

  it("rejects an empty event type", () => {
    const result = ledgerEventInputSchema.safeParse({
      type: "  ",
      payload: {},
    });

    expect(result.success).toBe(false);
  });
});
