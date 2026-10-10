import { describe, expect, it } from "vitest";

import { Channel3ApiError } from "./client";
import { refetchPrice } from "./price";

const product = {
  id: "prod-1",
  title: "Copy paper",
  category: { slug: "office", title: "Office", has_children: false },
  offers: [
    {
      url: "https://buy.example/out",
      domain: "out.example",
      price: { price: 1, currency: "USD" },
      availability: "OutOfStock",
    },
    {
      url: "https://buy.example/high",
      domain: "high.example",
      price: { price: 12.5, currency: "USD" },
      availability: "InStock",
    },
    {
      url: "https://buy.example/low",
      domain: "low.example",
      price: { price: 9, currency: "USD" },
      availability: "InStock",
    },
  ],
};

describe("refetchPrice", () => {
  it("reads the lowest in-stock USD price from the product detail endpoint", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify(product), { status: 200, headers: { "content-type": "application/json" } });
    };

    const cents = await refetchPrice("prod-1", { apiKey: "test-key", fetchImpl });

    expect(cents).toBe(900);
    expect(seen?.url).toBe("https://api.trychannel3.com/v1/products/prod-1?currency=USD&country=US&language=en");
    expect(new Headers(seen?.init?.headers).get("x-api-key")).toBe("test-key");
  });

  it("fails when the product has no in-stock USD offer", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ ...product, offers: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await expect(refetchPrice("prod-1", { apiKey: "test-key", fetchImpl })).rejects.toBeInstanceOf(Channel3ApiError);
  });
});
