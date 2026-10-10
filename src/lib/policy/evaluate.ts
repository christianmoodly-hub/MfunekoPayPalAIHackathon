import { categoryMatches } from "./categories";
import { merchantCoveredBy } from "./merchants";
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
  const blockReasons: string[] = [];
  const escalateReasons: string[] = [];

  if (mandate.status !== "active") {
    blockReasons.push(`Mandate status is ${mandate.status}.`);
  } else if (checkedAtMs >= Date.parse(mandate.expiresAt)) {
    blockReasons.push(`Mandate expired at ${mandate.expiresAt}.`);
  }

  if (purchase.lineItems.length === 0) {
    blockReasons.push("Cart has no line items.");
  }

  const proposedTotal = totalCents(purchase.lineItems, "proposed");
  const payableTotal = totalCents(purchase.lineItems, "payable");
  if (proposedTotal === null || payableTotal === null) {
    blockReasons.push("A line total is not a safe integer number of cents.");
  } else if (purchase.statedTotalCents !== proposedTotal) {
    blockReasons.push("Stated total does not match the line items.");
  }

  for (const [index, item] of purchase.lineItems.entries()) {
    const itemResult = itemReasons(mandate, item, index);
    blockReasons.push(...itemResult.block);
    escalateReasons.push(...itemResult.escalate);
  }

  if (proposedTotal !== null && payableTotal !== null) {
    const payable = payableTotal;
    for (const [index, item] of purchase.lineItems.entries()) {
      const unit = payableUnitCents(item);
      if (unit > mandate.maxPerItemCents) {
        blockReasons.push(
          `Item ${index + 1} price of ${unit} cents exceeds the per-item cap of ${mandate.maxPerItemCents} cents.`,
        );
      }
    }

    if (payable > MAX_SAFE_CENTS - spend.spentCents) {
      blockReasons.push("Cumulative spend is not a safe integer number of cents.");
    } else if (spend.spentCents + payable > mandate.maxTotalCents) {
      blockReasons.push(
        `Cart total of ${payable} cents plus prior spend of ${spend.spentCents} cents exceeds the mandate cap of ${mandate.maxTotalCents} cents.`,
      );
    }
  }

  if (blockReasons.length > 0) {
    return { verdict: "BLOCK", reasons: [...blockReasons, ...escalateReasons] };
  }

  if (proposedTotal !== null && payableTotal !== null && payableTotal > mandate.escalateAboveCents) {
    escalateReasons.push(
      `Cart total of ${payableTotal} cents exceeds the escalate threshold of ${mandate.escalateAboveCents} cents.`,
    );
  }

  if (escalateReasons.length > 0) {
    return { verdict: "ESCALATE", reasons: escalateReasons };
  }

  return { verdict: "APPROVE", reasons: ["Within the mandate limits."] };
}

function itemReasons(mandate: Mandate, item: LineItem, index: number): { block: string[]; escalate: string[] } {
  const block: string[] = [];
  const escalate: string[] = [];
  const label = `Item ${index + 1}`;
  if (mandate.allowedCategories !== null) {
    if (item.category === null) {
      escalate.push(unknownCatalogReason(label, "category"));
    } else if (!categoryMatches(mandate.allowedCategories, item.category)) {
      block.push(`${label} category "${item.category}" is not allowed.`);
    }
  }

  if (mandate.blockedMerchants.some((rule) => merchantCoveredBy(rule, item.merchant))) {
    block.push(`${label} merchant "${item.merchant}" is blocked.`);
  }

  if (mandate.allowedMerchants && mandate.allowedMerchants.length > 0) {
    const allowed = mandate.allowedMerchants.some((rule) => merchantCoveredBy(rule, item.merchant));
    if (!allowed) {
      block.push(`${label} merchant "${item.merchant}" is not in the allowed merchant list.`);
    }
  }

  if (mandate.requireFreeReturns) {
    if (item.freeReturns === null) {
      escalate.push(unknownCatalogReason(label, "free returns"));
    } else if (!item.freeReturns) {
      block.push(`${label} does not include free returns.`);
    }
  }

  if (mandate.deliverBy) {
    if (!isCalendarDate(mandate.deliverBy)) {
      block.push("Mandate deliver-by date is invalid.");
    } else if (item.deliveryDate === null) {
      escalate.push(unknownCatalogReason(label, "delivery date"));
    } else if (!isCalendarDate(item.deliveryDate)) {
      block.push(`${label} delivery date "${item.deliveryDate}" is not a calendar date.`);
    } else if (item.deliveryDate > mandate.deliverBy) {
      block.push(`${label} delivery date ${item.deliveryDate} is after ${mandate.deliverBy}.`);
    }
  }

  if (item.checkoutUnitPriceCents !== undefined && item.checkoutUnitPriceCents !== item.unitPriceCents) {
    block.push(
      `${label} checkout price changed from ${item.unitPriceCents} cents to ${item.checkoutUnitPriceCents} cents.`,
    );
  }

  return { block, escalate };
}

function unknownCatalogReason(label: string, rule: string): string {
  return `${label}: Cannot verify ${rule} from catalog data`;
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
