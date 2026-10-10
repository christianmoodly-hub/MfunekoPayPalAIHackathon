import { majorUnitsToCents } from "@/lib/money";

import { Channel3ApiError } from "./client";
import { channel3ProductSchema, type Channel3Offer } from "./schema";

// Product lookup: GET /v1/products/{product_id}
// https://docs.trychannel3.com/api-reference/v1/product-detail
// https://docs.trychannel3.com/guides/product-detail
// Not used by checkout yet. Call this to re-read the price before capture.
const PRODUCT_DETAIL_URL = "https://api.trychannel3.com/v1/products";

export async function refetchPrice(
  productId: string,
  options: { apiKey: string; fetchImpl?: typeof fetch },
): Promise<number> {
  const id = productId.trim();
  if (!id) {
    throw new Channel3ApiError(400, "Product id is required.");
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

  const cents = lowestInStockUsdCents(parsed.data.offers ?? []);
  if (cents === null) {
    throw new Channel3ApiError(200, "Channel3 product has no in-stock USD price.");
  }
  return cents;
}

function lowestInStockUsdCents(offers: Channel3Offer[]): number | null {
  const prices = offers
    .filter((offer) => offer.availability === "InStock" && offer.price.currency === "USD")
    .map((offer) => majorUnitsToCents(offer.price.price))
    .filter((cents): cents is number => cents !== null)
    .sort((left, right) => left - right);
  return prices[0] ?? null;
}
