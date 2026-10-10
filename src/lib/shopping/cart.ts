import type { Channel3Offer, Channel3Product } from "@/lib/channel3/schema";
import { majorUnitsToCents } from "@/lib/money";
import { normalizeMerchant } from "@/lib/policy/merchants";
import type { Mandate, ProposedPurchase } from "@/lib/policy/schema";

import type { Ranking } from "./schema";

export type ConsideredCandidate = {
  productId: string;
  title: string;
  domain: string | null;
  category: string | null;
  unitPriceCents: number | null;
  currency: string | null;
  freeReturns: false;
  deliveryDate: null;
  eligible: boolean;
};

type ChosenOffer = {
  domain: string;
  unitPriceCents: number;
  availability: Channel3Offer["availability"];
};

export function considerProducts(mandate: Mandate, products: Channel3Product[]): ConsideredCandidate[] {
  return products.map((product) => {
    const chosen = chooseOffer(mandate, product);
    return {
      productId: product.id,
      title: product.title,
      domain: chosen?.domain ?? null,
      category: product.category?.slug ?? null,
      unitPriceCents: chosen?.unitPriceCents ?? null,
      currency: chosen ? "USD" : null,
      freeReturns: false,
      deliveryDate: null,
      eligible: chosen !== null,
    };
  });
}

export function purchaseFromSelection(
  mandate: Mandate,
  products: Channel3Product[],
  selection: Ranking,
): ProposedPurchase | null {
  const product = products.find((item) => item.id === selection.productId);
  const chosen = product ? chooseOffer(mandate, product) : null;
  if (!product || !chosen) {
    return null;
  }

  const lineTotal = chosen.unitPriceCents * selection.quantity;
  if (!Number.isSafeInteger(lineTotal)) {
    return null;
  }

  return {
    lineItems: [
      {
        merchant: chosen.domain,
        category: categoryForPolicy(mandate, product),
        unitPriceCents: chosen.unitPriceCents,
        quantity: selection.quantity,
        freeReturns: false,
        deliveryDate: null,
      },
    ],
    statedTotalCents: lineTotal,
  };
}

function chooseOffer(mandate: Mandate, product: Channel3Product): ChosenOffer | null {
  const blocked = new Set(mandate.blockedMerchants.map(normalizeMerchant));
  const allowedList = (mandate.allowedMerchants ?? []).map(normalizeMerchant);
  const restrictAllowed = allowedList.length > 0;
  const allowed = new Set(allowedList);
  const choices: ChosenOffer[] = [];

  for (const offer of product.offers ?? []) {
    const domain = normalizeMerchant(offer.domain);
    if (!domain || blocked.has(domain)) {
      continue;
    }
    if (restrictAllowed && !allowed.has(domain)) {
      continue;
    }
    if (offer.price.currency !== "USD") {
      continue;
    }
    const unitPriceCents = majorUnitsToCents(offer.price.price);
    if (unitPriceCents === null) {
      continue;
    }
    choices.push({ domain, unitPriceCents, availability: offer.availability });
  }

  choices.sort((left, right) => {
    const stock = Number(left.availability !== "InStock") - Number(right.availability !== "InStock");
    if (stock !== 0) {
      return stock;
    }
    if (left.unitPriceCents !== right.unitPriceCents) {
      return left.unitPriceCents - right.unitPriceCents;
    }
    if (left.domain < right.domain) {
      return -1;
    }
    if (left.domain > right.domain) {
      return 1;
    }
    return 0;
  });

  return choices[0] ?? null;
}

function categoryForPolicy(mandate: Mandate, product: Channel3Product): string {
  if (product.category?.slug) {
    return product.category.slug;
  }
  if (mandate.allowedCategories !== null) {
    return "missing";
  }
  return "uncategorized";
}
