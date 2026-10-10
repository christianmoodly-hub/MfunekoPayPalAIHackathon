import type { LineItem } from "@/lib/policy/schema";

import type { PayPalClient } from "./client";
import { captureOrder, createOrder } from "./orders";
import { purchaseUnitFromLineItems } from "./purchase";
import { approvalUrl, type PayPalOrder } from "./schema";

// Per-order buyer approval. return_url and cancel_url live on
// payment_source.paypal.experience_context, not application_context.
// https://developer.paypal.com/api/orders/v2/orders-create
// https://developer.paypal.com/api/rest/integration/orders-api/v1-v2-migration
// Checked 2026-10-10.

export function approvalOrderBody(lineItems: LineItem[], mandateId: string, returnUrl: string, cancelUrl: string) {
  return {
    intent: "CAPTURE" as const,
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Mandate",
          locale: "en-US",
          shipping_preference: "NO_SHIPPING" as const,
          user_action: "PAY_NOW" as const,
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      },
    },
    purchase_units: [purchaseUnitFromLineItems(lineItems, mandateId)],
  };
}

export async function createOrderForApproval(
  client: PayPalClient,
  lineItems: LineItem[],
  mandateId: string,
  returnUrl: string,
  cancelUrl: string,
): Promise<string> {
  const order = await createOrder(
    client,
    approvalOrderBody(lineItems, mandateId, returnUrl, cancelUrl),
    `order-approval:create:${mandateId}:${returnUrl}`,
  );
  const url = approvalUrl(order);
  if (!url) {
    throw new Error("PayPal did not return an approval URL.");
  }
  return url;
}

export async function captureAfterApproval(client: PayPalClient, orderId: string): Promise<PayPalOrder> {
  return captureOrder(client, orderId, `order-approval:capture:${orderId}`);
}
