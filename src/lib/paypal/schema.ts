import { z } from "zod";

import { usdToCents } from "@/lib/money";

export const paypalLinkSchema = z.object({
  href: z.string().min(1),
  rel: z.string().min(1),
  method: z.string().optional(),
});

const moneySchema = z.object({
  currency_code: z.string().min(1),
  value: z.string().min(1),
});

const captureSchema = z.looseObject({
  id: z.string().min(1),
  status: z.string().min(1),
  amount: moneySchema.optional(),
});

export const paypalOrderSchema = z.looseObject({
  id: z.string().min(1),
  status: z.string().min(1),
  links: z.array(paypalLinkSchema).optional(),
  purchase_units: z
    .array(
      z.looseObject({
        amount: moneySchema.optional(),
        payments: z
          .looseObject({
            captures: z.array(captureSchema).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

export const paypalErrorSchema = z.looseObject({
  name: z.string().optional(),
  message: z.string().optional(),
  debug_id: z.string().optional(),
  details: z
    .array(
      z.looseObject({
        issue: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

export type PayPalOrder = z.infer<typeof paypalOrderSchema>;
export type PayPalLink = z.infer<typeof paypalLinkSchema>;

export function findLink(order: PayPalOrder, rel: string): PayPalLink | undefined {
  return order.links?.find((link) => link.rel === rel);
}

export function approvalUrl(order: PayPalOrder): string | undefined {
  return findLink(order, "payer-action")?.href ?? findLink(order, "approve")?.href;
}

export function captureId(order: PayPalOrder): string | undefined {
  return order.purchase_units?.[0]?.payments?.captures?.[0]?.id;
}

export function chargedAmountCents(order: PayPalOrder): number | null {
  const captureAmount = order.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
  const amount = captureAmount ?? order.purchase_units?.[0]?.amount;
  if (!amount || amount.currency_code !== "USD") {
    return null;
  }
  try {
    return usdToCents(amount.value);
  } catch {
    return null;
  }
}

export function orderAmount(order: PayPalOrder): { currencyCode: string; value: string } | null {
  const amount = order.purchase_units?.[0]?.amount;
  if (!amount) {
    return null;
  }

  return { currencyCode: amount.currency_code, value: amount.value };
}
