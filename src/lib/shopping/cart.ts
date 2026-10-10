import type { Channel3Offer, Channel3Product } from "@/lib/channel3/schema";
import { majorUnitsToCents } from "@/lib/money";
import { joinCategoryParts } from "@/lib/policy/categories";
import { merchantCoveredBy, normalizeMerchant } from "@/lib/policy/merchants";
import type { Mandate, ProposedPurchase } from "@/lib/policy/schema";

import type { Ranking } from "./schema";

export type ConsideredCandidate = {
  productId: string;
  title: string;
  domain: string | null;
  category: string | null;
  unitPriceCents: number | null;
  currency: string | null;
  freeReturns: null;
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
      freeReturns: null,
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
        category: catalogCategory(product),
        unitPriceCents: chosen.unitPriceCents,
        quantity: selection.quantity,
        freeReturns: null,
        deliveryDate: null,
      },
    ],
    statedTotalCents: lineTotal,
  };
}

function chooseOffer(mandate: Mandate, product: Channel3Product): ChosenOffer | null {
  const restrictAllowed = (mandate.allowedMerchants ?? []).length > 0;
  const choices: ChosenOffer[] = [];

  for (const offer of product.offers ?? []) {
    const domain = normalizeMerchant(offer.domain);
    if (!domain || mandate.blockedMerchants.some((rule) => merchantCoveredBy(rule, domain))) {
      continue;
    }
    if (restrictAllowed && !mandate.allowedMerchants?.some((rule) => merchantCoveredBy(rule, domain))) {
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

function catalogCategory(product: Channel3Product): string | null {
  const category = product.category;
  if (!category) {
    return null;
  }

  const nodes = [...(category.path ?? []), { slug: category.slug, title: category.title }];
  return joinCategoryParts(nodes.flatMap((node) => [node.slug, node.title]));
}
