import { majorUnitsToCents } from "@/lib/money";
import { normalizeMerchant } from "@/lib/policy/merchants";

import { Channel3ApiError } from "./client";
import { channel3ProductSchema, type Channel3Offer } from "./schema";

// Product lookup: GET /v1/products/{product_id}
// https://docs.trychannel3.com/api-reference/v1/product-detail
// https://docs.trychannel3.com/guides/product-detail
// Checkout calls this for the selected merchant and passes that offer's price
// to policy as checkoutUnitPriceCents.
const PRODUCT_DETAIL_URL = "https://api.trychannel3.com/v1/products";

export async function refetchPrice(
  productId: string,
  domain: string,
  options: { apiKey: string; fetchImpl?: typeof fetch },
): Promise<number> {
  const id = productId.trim();
  const merchant = normalizeMerchant(domain);
  if (!id) {
    throw new Channel3ApiError(400, "Product id is required.");
  }
  if (!merchant) {
    throw new Channel3ApiError(400, "Selected merchant is missing.");
  }

  const url = new URL(`${PRODUCT_DETAIL_URL}/${encodeURIComponent(id)}`);
  url.searchParams.set("currency", "USD");
  url.searchParams.set("country", "US");
  url.searchParams.set("language", "en");

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": options.apiKey,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Channel3 product lookup failed.";
    throw new Channel3ApiError(500, message);
  }

  if (!response.ok) {
    throw new Channel3ApiError(response.status, `Channel3 product lookup failed with HTTP ${response.status}.`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Channel3ApiError(response.status, "Channel3 product lookup response was not JSON.");
  }

  const parsed = channel3ProductSchema.safeParse(body);
  if (!parsed.success) {
    throw new Channel3ApiError(200, "Channel3 product lookup response did not match the schema.");
  }

  const cents = merchantUsdCents(parsed.data.offers ?? [], merchant);
  if (cents === null) {
    const known = (parsed.data.offers ?? []).some((offer) => normalizeMerchant(offer.domain) === merchant);
    throw new Channel3ApiError(
      200,
      known
        ? `Selected merchant ${merchant} is out of stock.`
        : `Selected merchant ${merchant} is missing.`,
    );
  }
  return cents;
}

function merchantUsdCents(offers: Channel3Offer[], merchant: string): number | null {
  const prices = offers
    .filter(
      (offer) =>
        normalizeMerchant(offer.domain) === merchant &&
        offer.availability === "InStock" &&
        offer.price.currency === "USD",
    )
    .map((offer) => majorUnitsToCents(offer.price.price))
    .filter((cents): cents is number => cents !== null)
    .sort((left, right) => left - right);
  return prices[0] ?? null;
}
