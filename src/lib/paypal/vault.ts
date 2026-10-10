import { z } from "zod";

import type { LineItem } from "@/lib/policy/schema";

import type { PayPalClient } from "./client";
import { purchaseUnitFromLineItems } from "./purchase";
import { approvalUrl, paypalLinkSchema, paypalOrderSchema, type PayPalOrder } from "./schema";

// Setup token, payment token, and vault_id charge shapes:
// https://developer.paypal.com/docs/checkout/save-payment-methods/purchase-later/payment-tokens-api/paypal/
// Checked 2026-10-10.

const setupTokenSchema = z.looseObject({
  id: z.string().min(1),
  status: z.string().min(1),
  customer: z
    .object({
      id: z.string().min(1),
    })
    .optional(),
  links: z.array(paypalLinkSchema).optional(),
});

const paymentTokenSchema = z.object({
  id: z.string().min(1),
  customer: z
    .object({
      id: z.string().min(1),
    })
    .optional(),
});

export type SetupToken = z.infer<typeof setupTokenSchema>;
export type PaymentToken = z.infer<typeof paymentTokenSchema>;

export function setupTokenBody(returnUrl: string, cancelUrl: string) {
  return {
    payment_source: {
      paypal: {
        description: "Mandate saved PayPal wallet",
        permit_multiple_payment_tokens: false,
        usage_pattern: "IMMEDIATE" as const,
        usage_type: "MERCHANT" as const,
        customer_type: "CONSUMER" as const,
        experience_context: {
          shipping_preference: "NO_SHIPPING" as const,
          payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED" as const,
          brand_name: "Mandate",
          locale: "en-US",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      },
    },
  };
}

export function paymentTokenBody(setupTokenId: string) {
  return {
    payment_source: {
      token: {
        id: setupTokenId,
        type: "SETUP_TOKEN" as const,
      },
    },
  };
}

export function vaultChargeBody(vaultId: string, lineItems: LineItem[], referenceId: string) {
  return {
    intent: "CAPTURE" as const,
    purchase_units: [purchaseUnitFromLineItems(lineItems, referenceId)],
    payment_source: {
      paypal: {
        vault_id: vaultId,
      },
    },
  };
}

export async function createSetupToken(
  client: PayPalClient,
  returnUrl: string,
  cancelUrl: string,
  requestKey: string,
): Promise<SetupToken> {
  const body = await client.request({
    method: "POST",
    path: "/v3/vault/setup-tokens",
    body: setupTokenBody(returnUrl, cancelUrl),
    requestKey,
  });
  return setupTokenSchema.parse(body);
}

export async function exchangeSetupToken(
  client: PayPalClient,
  setupTokenId: string,
  requestKey: string,
): Promise<PaymentToken> {
  const body = await client.request({
    method: "POST",
    path: "/v3/vault/payment-tokens",
    body: paymentTokenBody(setupTokenId),
    requestKey,
  });
  return paymentTokenSchema.parse(body);
}

export async function chargeVaulted(
  client: PayPalClient,
  vaultId: string,
  lineItems: LineItem[],
  idempotencyKey: string,
): Promise<PayPalOrder> {
  const created = withoutPaymentSource(
    await client.request({
      method: "POST",
      path: "/v2/checkout/orders",
      body: vaultChargeBody(vaultId, lineItems, "charge-vaulted"),
      requestKey: idempotencyKey,
    }),
  );

  if (created.status === "COMPLETED" || created.status === "PAYER_ACTION_REQUIRED") {
    return created;
  }

  if (created.status !== "APPROVED") {
    throw new Error(`Vault charge returned status ${created.status}.`);
  }

  return withoutPaymentSource(
    await client.request({
      method: "POST",
      path: `/v2/checkout/orders/${encodeURIComponent(created.id)}/capture`,
      body: {},
      requestKey: `${idempotencyKey}:capture`,
    }),
  );
}

export function setupApprovalUrl(token: SetupToken): string {
  const url = approvalUrl(token);
  if (!url) {
    throw new Error("PayPal did not return an approval URL.");
  }
  return url;
}

function withoutPaymentSource(body: unknown): PayPalOrder {
  if (body && typeof body === "object") {
    const copy = { ...(body as Record<string, unknown>) };
    delete copy.payment_source;
    delete copy.payer;
    return paypalOrderSchema.parse(copy);
  }

  return paypalOrderSchema.parse(body);
}
