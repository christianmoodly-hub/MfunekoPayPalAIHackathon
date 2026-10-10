import { describe, expect, it, vi } from "vitest";

import { Channel3ApiError, createChannel3Search } from "./client";

const sampleKey = ["AI", "zaSyExampleSecretKey12"].join("");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const product = {
  id: "prod-1",
  title: "Copy paper",
  description: "A ream of paper",
  brands: [{ id: "brand-1", name: "Paper Co" }],
  category: { slug: "office", title: "Office", has_children: false },
  offers: [
    {
      url: "https://buy.example/paper",
      domain: "shop.example",
      price: { price: 12.5, currency: "USD", compare_at_price: null },
      availability: "InStock",
      condition: "new",
      return_policy: "free",
    },
  ],
  return_policy: { free: true },
};

describe("createChannel3Search", () => {
  it("posts the query and validates the search response", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      seen = { url: String(url), init };
      return jsonResponse({ products: [product], next_page_token: null });
    };
    const search = createChannel3Search("test-key", fetchImpl);

    const result = await search("copy paper");

    expect(seen?.url).toBe("https://api.trychannel3.com/v1/search");
    expect(seen?.init?.method).toBe("POST");
    const headers = new Headers(seen?.init?.headers);
    expect(headers.get("x-api-key")).toBe("test-key");
    expect(JSON.parse(String(seen?.init?.body))).toMatchObject({
      query: "copy paper",
      limit: 10,
      config: { currency: "USD", country: "US", language: "en" },
    });
    expect(result.products[0]?.id).toBe("prod-1");
    expect(result.products[0]).not.toHaveProperty("return_policy");
    expect(result.products[0]?.offers?.[0]).not.toHaveProperty("return_policy");
  });

  it("rejects a response that does not match the documented price field", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        products: [
          {
            ...product,
            offers: [{ ...product.offers[0], price: { amount: 12.5, currency: "USD" } }],
          },
        ],
      }),
    );

    await expect(createChannel3Search("test-key", fetchImpl)("paper")).rejects.toThrow(/did not match the schema/);
  });

  it("redacts secrets in an error body", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ detail: `bad key=${sampleKey}` }, 401));

    await expect(createChannel3Search("test-key", fetchImpl)("paper")).rejects.toThrow(Channel3ApiError);
    await expect(createChannel3Search("test-key", fetchImpl)("paper")).rejects.toThrow(/\[redacted\]/);
  });
});
