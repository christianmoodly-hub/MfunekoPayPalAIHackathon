import { describe, expect, it } from "vitest";

import { usdToCents } from "@/lib/money";

import { paypalBaseUrl } from "./config";
import { helloOrderBody } from "./orders";
import { approvalUrl, orderAmount, paypalOrderSchema } from "./schema";

describe("hello order", () => {
  it("creates a $5.00 CAPTURE order whose line items match the total", () => {
    process.env.APP_URL = "https://mandate.example";
    const body = helloOrderBody();
    const purchase = body.purchase_units[0];
    const item = purchase?.items[0];

    expect(body.intent).toBe("CAPTURE");
    expect(purchase?.amount.value).toBe("5.00");
    expect(purchase?.amount.currency_code).toBe("USD");
    expect(purchase?.amount.breakdown.item_total.value).toBe(purchase?.amount.value);
    expect(item?.unit_amount.value).toBe("5.00");
    expect(item?.quantity).toBe("1");
    expect(body.payment_source.paypal.experience_context.shipping_preference).toBe("NO_SHIPPING");
    expect(body.payment_source.paypal.experience_context.user_action).toBe("PAY_NOW");
    expect(body.payment_source.paypal.experience_context.return_url).toBe("https://mandate.example/api/paypal/order/return");
    expect(body.payment_source.paypal.experience_context.cancel_url).toBe("https://mandate.example/api/paypal/order/cancel");
    expect(usdToCents(purchase?.amount.value ?? "0.00")).toBe(
      usdToCents(item?.unit_amount.value ?? "0.00") * Number(item?.quantity),
    );
  });
});

describe("paypal environment", () => {
  it("uses the sandbox API host", () => {
    expect(paypalBaseUrl("sandbox")).toBe("https://api-m.sandbox.paypal.com");
  });

  it("refuses a non-sandbox environment", () => {
    expect(() => paypalBaseUrl("live")).toThrow(/sandbox only/);
    expect(() => paypalBaseUrl(undefined)).toThrow(/sandbox only/);
  });
});

describe("order amount", () => {
  it("reads the amount from the first purchase unit", () => {
    const order = paypalOrderSchema.parse({
      id: "ORDER-ID",
      status: "CREATED",
      purchase_units: [{ amount: { currency_code: "USD", value: "5.00" } }],
    });

    expect(orderAmount(order)).toEqual({ currencyCode: "USD", value: "5.00" });
  });

  it("returns null when the order has no amount", () => {
    const order = paypalOrderSchema.parse({ id: "ORDER-ID", status: "CREATED" });

    expect(orderAmount(order)).toBeNull();
  });
});

describe("order links", () => {
  it("prefers the payer-action link over approve", () => {
    const order = paypalOrderSchema.parse({
      id: "ORDER-ID",
      status: "PAYER_ACTION_REQUIRED",
      links: [
        { href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-ID", rel: "approve", method: "GET" },
        {
          href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-ID&exp_flow=authenticate",
          rel: "payer-action",
          method: "GET",
        },
      ],
    });

    expect(approvalUrl(order)).toBe(
      "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-ID&exp_flow=authenticate",
    );
  });
});
