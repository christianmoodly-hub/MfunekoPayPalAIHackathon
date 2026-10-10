import {
  mandateSchema,
  proposedPurchaseSchema,
  spendHistorySchema,
  type LineItem,
  type Mandate,
  type ProposedPurchase,
  type SpendHistory,
} from "./schema";

export type PolicyVerdict = "APPROVE" | "ESCALATE" | "BLOCK";

export type PolicyDecision = {
  verdict: PolicyVerdict;
  reasons: string[];
};

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

export function evaluatePolicy(input: {
  mandate: unknown;
  purchase: unknown;
  spend: unknown;
  checkedAt: string;
}): PolicyDecision {
  const mandate = mandateSchema.safeParse(input.mandate);
  const purchase = proposedPurchaseSchema.safeParse(input.purchase);
  const spend = spendHistorySchema.safeParse(input.spend);
  const checkedAt = Date.parse(input.checkedAt);

  if (!mandate.success || !purchase.success || !spend.success || Number.isNaN(checkedAt)) {
    return { verdict: "BLOCK", reasons: ["Input failed validation."] };
  }

  return decide(mandate.data, purchase.data, spend.data, checkedAt);
}

function decide(
  mandate: Mandate,
  purchase: ProposedPurchase,
  spend: SpendHistory,
  checkedAtMs: number,
): PolicyDecision {
  const reasons: string[] = [];

  if (mandate.status !== "active") {
    reasons.push(`Mandate status is ${mandate.status}.`);
  } else if (checkedAtMs >= Date.parse(mandate.expiresAt)) {
    reasons.push(`Mandate expired at ${mandate.expiresAt}.`);
  }

  if (purchase.lineItems.length === 0) {
    reasons.push("Cart has no line items.");
  }

  const proposedTotal = totalCents(purchase.lineItems, "proposed");
  const payableTotal = totalCents(purchase.lineItems, "payable");
  if (proposedTotal === null || payableTotal === null) {
    reasons.push("A line total is not a safe integer number of cents.");
  } else if (purchase.statedTotalCents !== proposedTotal) {
    reasons.push("Stated total does not match the line items.");
  }

  for (const [index, item] of purchase.lineItems.entries()) {
    reasons.push(...itemReasons(mandate, item, index));
  }

  if (proposedTotal !== null && payableTotal !== null) {
    const payable = payableTotal;
    for (const [index, item] of purchase.lineItems.entries()) {
      const unit = payableUnitCents(item);
      if (unit > mandate.maxPerItemCents) {
        reasons.push(
          `Item ${index + 1} price of ${unit} cents exceeds the per-item cap of ${mandate.maxPerItemCents} cents.`,
        );
      }
    }

    if (payable > MAX_SAFE_CENTS - spend.spentCents) {
      reasons.push("Cumulative spend is not a safe integer number of cents.");
    } else if (spend.spentCents + payable > mandate.maxTotalCents) {
      reasons.push(
        `Cart total of ${payable} cents plus prior spend of ${spend.spentCents} cents exceeds the mandate cap of ${mandate.maxTotalCents} cents.`,
      );
    } else if (reasons.length === 0 && payable > mandate.escalateAboveCents) {
      return {
        verdict: "ESCALATE",
        reasons: [
          `Cart total of ${payable} cents exceeds the escalate threshold of ${mandate.escalateAboveCents} cents.`,
        ],
      };
    }
  }

  if (reasons.length > 0) {
    return { verdict: "BLOCK", reasons };
  }

  return { verdict: "APPROVE", reasons: ["Within the mandate limits."] };
}

function itemReasons(mandate: Mandate, item: LineItem, index: number): string[] {
  const reasons: string[] = [];
  const label = `Item ${index + 1}`;
  if (mandate.allowedCategories !== null) {
    const allowedCategories = new Set(mandate.allowedCategories.map(normalize));
    if (!allowedCategories.has(normalize(item.category))) {
      reasons.push(`${label} category "${item.category}" is not allowed.`);
    }
  }

  const merchant = normalize(item.merchant);
  const blocked = new Set(mandate.blockedMerchants.map(normalize));
  if (blocked.has(merchant)) {
    reasons.push(`${label} merchant "${item.merchant}" is blocked.`);
  }

  if (mandate.allowedMerchants && mandate.allowedMerchants.length > 0) {
    const allowed = new Set(mandate.allowedMerchants.map(normalize));
    if (!allowed.has(merchant)) {
      reasons.push(`${label} merchant "${item.merchant}" is not in the allowed merchant list.`);
    }
  }

  if (mandate.requireFreeReturns && !item.freeReturns) {
    reasons.push(`${label} does not include free returns.`);
  }

  if (mandate.deliverBy) {
    if (!isCalendarDate(mandate.deliverBy)) {
      reasons.push("Mandate deliver-by date is invalid.");
    } else if (!item.deliveryDate || !isCalendarDate(item.deliveryDate)) {
      reasons.push(`${label} is missing a delivery date.`);
    } else if (item.deliveryDate > mandate.deliverBy) {
      reasons.push(`${label} delivery date ${item.deliveryDate} is after ${mandate.deliverBy}.`);
    }
  }

  if (item.checkoutUnitPriceCents !== undefined && item.checkoutUnitPriceCents !== item.unitPriceCents) {
    reasons.push(
      `${label} checkout price changed from ${item.unitPriceCents} cents to ${item.checkoutUnitPriceCents} cents.`,
    );
  }

  return reasons;
}

function payableUnitCents(item: LineItem): number {
  return item.checkoutUnitPriceCents ?? item.unitPriceCents;
}

function totalCents(items: LineItem[], basis: "proposed" | "payable"): number | null {
  let total = 0;
  for (const item of items) {
    const unit = basis === "proposed" ? item.unitPriceCents : payableUnitCents(item);
    const line = unit * item.quantity;
    if (!Number.isSafeInteger(line) || line > MAX_SAFE_CENTS - total) {
      return null;
    }
    total += line;
  }
  return total;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
