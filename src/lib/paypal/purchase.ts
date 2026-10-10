import { centsToUsd } from "@/lib/money";
import { lineItemSchema, type LineItem } from "@/lib/policy/schema";

const ITEM_TEXT_LIMIT = 127;

export function purchaseUnitFromLineItems(lineItems: LineItem[], referenceId: string) {
  if (lineItems.length === 0) {
    throw new Error("An order needs at least one line item.");
  }

  const reference = referenceId.trim();
  if (!reference) {
    throw new Error("Order reference id is required.");
  }

  const items = lineItems.map((item, index) => {
    const parsed = lineItemSchema.parse(item);
    const unitCents = parsed.checkoutUnitPriceCents ?? parsed.unitPriceCents;
    return {
      name: clip(parsed.merchant, `Item ${index + 1}`),
      description: clip(parsed.category ?? "Mandate item", "Mandate item"),
      quantity: String(parsed.quantity),
      unit_amount: {
        currency_code: "USD" as const,
        value: centsToUsd(unitCents),
      },
      category: "DIGITAL_GOODS" as const,
      unitCents,
      quantityNumber: parsed.quantity,
    };
  });

  let totalCents = 0;
  for (const item of items) {
    const lineCents = item.unitCents * item.quantityNumber;
    if (!Number.isSafeInteger(lineCents) || totalCents > Number.MAX_SAFE_INTEGER - lineCents) {
      throw new Error("Order total is not a safe integer number of cents.");
    }
    totalCents += lineCents;
  }
  if (totalCents <= 0) {
    throw new Error("Order total must be greater than 0 cents.");
  }

  const total = centsToUsd(totalCents);
  return {
    reference_id: reference.slice(0, 256),
    description: "Mandate purchase",
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
    items: items.map(({ name, description, quantity, unit_amount, category }) => ({
      name,
      description,
      quantity,
      unit_amount,
      category,
    })),
  };
}

function clip(value: string, fallback: string): string {
  const text = value.trim();
  return (text || fallback).slice(0, ITEM_TEXT_LIMIT);
}
