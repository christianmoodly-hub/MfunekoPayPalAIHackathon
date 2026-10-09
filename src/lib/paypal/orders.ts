import { centsToUsd, usdToCents } from "@/lib/money";

import type { PayPalClient } from "./client";
import { paypalOrderSchema, type PayPalOrder } from "./schema";

export const HELLO_ORDER_CENTS = 500;

/**
 * Published sandbox Visa from PayPal card testing. Not a live card.
 * https://developer.paypal.com/sandbox-testing/card-testing
 */
const SANDBOX_TEST_CARD = {
  number: "4012888888881881",
  expiry: "2028-12",
  security_code: "123",
  name: "Sandbox Buyer",
  billing_address: {
    address_line_1: "123 Main St.",
    admin_area_1: "CA",
    admin_area_2: "Anytown",
    postal_code: "12345",
    country_code: "US",
  },
} as const;

type HelloOrderItem = {
  name: string;
  description: string;
  quantity: string;
  unit_amount: {
    currency_code: "USD";
    value: string;
  };
  category: "DIGITAL_GOODS";
};

export function helloOrderBody() {
  const items: HelloOrderItem[] = [
    {
      name: "Hello order",
      description: "Hardcoded sandbox hello order",
      quantity: "1",
      unit_amount: {
        currency_code: "USD",
        value: centsToUsd(HELLO_ORDER_CENTS),
      },
      category: "DIGITAL_GOODS",
    },
  ];
  const totalCents = items.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Item quantity must be a positive integer.");
    }
    return sum + usdToCents(item.unit_amount.value) * quantity;
  }, 0);
  const total = centsToUsd(totalCents);

  return {
    intent: "CAPTURE" as const,
    purchase_units: [
      {
        reference_id: "hello-order",
        description: "Mandate hello order",
        amount: {
          currency_code: "USD" as const,
          value: total,
          breakdown: {
            item_total: {
              currency_code: "USD" as const,
              value: total,
            },
          },
        },
        items,
      },
    ],
  };
}

export function confirmCardBody() {
  return {
    payment_source: {
      card: SANDBOX_TEST_CARD,
    },
  };
}

export async function createOrder(client: PayPalClient, body: ReturnType<typeof helloOrderBody>) {
  return parseOrder(await client.request({ method: "POST", path: "/v2/checkout/orders", body }));
}

export async function confirmCardPayment(client: PayPalClient, orderId: string) {
  return parseOrder(
    await client.request({
      method: "POST",
      path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/confirm-payment-source`,
      body: confirmCardBody(),
    }),
  );
}

export async function captureOrder(client: PayPalClient, orderId: string) {
  return parseOrder(
    await client.request({
      method: "POST",
      path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      body: {},
    }),
  );
}

export async function getOrder(client: PayPalClient, orderId: string) {
  return parseOrder(
    await client.request({
      method: "GET",
      path: `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    }),
  );
}

function parseOrder(body: unknown): PayPalOrder {
  return paypalOrderSchema.parse(body);
}
