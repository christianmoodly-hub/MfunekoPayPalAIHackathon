import { describe, expect, it } from "vitest";

import type { LineItem } from "@/lib/policy/schema";

import type { PayPalClient } from "./client";
import { approvalOrderBody, captureAfterApproval, createOrderForApproval } from "./order-approval";

const lineItem: LineItem = {
  merchant: "shop.example",
  category: null,
  unitPriceCents: 500,
  quantity: 1,
  freeReturns: null,
  deliveryDate: null,
};

describe("order approval", () => {
  it("puts return and cancel URLs on the PayPal experience context", () => {
    const body = approvalOrderBody(
      [lineItem],
      "mandate-1",
      "https://app.example/return",
      "https://app.example/cancel",
    );

    expect(body.intent).toBe("CAPTURE");
    expect(body.payment_source.paypal.experience_context).toMatchObject({
      return_url: "https://app.example/return",
      cancel_url: "https://app.example/cancel",
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING",
    });
    expect(body.purchase_units[0]?.reference_id).toBe("mandate-1");
    expect(body.purchase_units[0]?.amount.value).toBe("5.00");
    expect(body.purchase_units[0]?.items[0]?.description).toBe("Mandate item");
    expect(body).not.toHaveProperty("application_context");
  });

  it("returns the payer-action URL and captures an approved order", async () => {
    const calls: string[] = [];
    const client: PayPalClient = {
      async request(request) {
        calls.push(`${request.method} ${request.path}`);
        if (request.path.endsWith("/capture")) {
          return { id: "ORDER1", status: "COMPLETED" };
        }
        return {
          id: "ORDER1",
          status: "PAYER_ACTION_REQUIRED",
          links: [
            { href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1", rel: "approve", method: "GET" },
            { href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1&exp_flow=authenticate", rel: "payer-action", method: "GET" },
          ],
        };
      },
    };

    const approvalUrl = await createOrderForApproval(
      client,
      [lineItem],
      "mandate-1",
      "https://app.example/return",
      "https://app.example/cancel",
    );
    const captured = await captureAfterApproval(client, "ORDER1");

    expect(approvalUrl).toBe("https://www.sandbox.paypal.com/checkoutnow?token=ORDER1&exp_flow=authenticate");
    expect(captured.status).toBe("COMPLETED");
    expect(calls).toEqual([
      "POST /v2/checkout/orders",
      "POST /v2/checkout/orders/ORDER1/capture",
    ]);
  });
});
