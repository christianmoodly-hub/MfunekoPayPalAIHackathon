import { describe, expect, it } from "vitest";

import { createPayPalClient } from "./client";
import { paypalRequestId } from "./request-id";

const baseUrl = "https://api-m.sandbox.paypal.com";

describe("PayPal client", () => {
  it("sends a PayPal-Request-Id derived from the caller key", async () => {
    const seen: string[] = [];
    const client = createPayPalClient({
      baseUrl,
      clientId: "id",
      clientSecret: "secret",
      now: () => 0,
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith("/v1/oauth2/token")) {
          return json({ access_token: "token-1", expires_in: 3600 });
        }
        seen.push(new Headers(init?.headers).get("PayPal-Request-Id") ?? "");
        return json({ id: "ORDER" });
      },
    });

    await client.request({ method: "POST", path: "/v2/checkout/orders", body: {}, requestKey: "hello-order:create" });
    await client.request({ method: "POST", path: "/v2/checkout/orders", body: {}, requestKey: "hello-order:create" });

    expect(seen).toEqual([paypalRequestId("hello-order:create"), paypalRequestId("hello-order:create")]);
  });

  it("refreshes the access token 60 seconds before it expires", async () => {
    let now = 1_000_000;
    const tokens: string[] = [];
    let tokenCalls = 0;
    const client = createPayPalClient({
      baseUrl,
      clientId: "id",
      clientSecret: "secret",
      now: () => now,
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith("/v1/oauth2/token")) {
          tokenCalls += 1;
          return json({ access_token: `token-${tokenCalls}`, expires_in: 120 });
        }
        tokens.push(new Headers(init?.headers).get("Authorization") ?? "");
        return json({ ok: true });
      },
    });

    await client.request({ method: "GET", path: "/v2/checkout/orders/1", requestKey: "get:1" });
    now += 59_999;
    await client.request({ method: "GET", path: "/v2/checkout/orders/1", requestKey: "get:1" });
    expect(tokenCalls).toBe(1);
    expect(tokens).toEqual(["Bearer token-1", "Bearer token-1"]);

    now += 1;
    await client.request({ method: "GET", path: "/v2/checkout/orders/1", requestKey: "get:1" });
    expect(tokenCalls).toBe(2);
    expect(tokens[2]).toBe("Bearer token-2");
  });

  it("refreshes after a 401 and retries the request once", async () => {
    let apiCalls = 0;
    const client = createPayPalClient({
      baseUrl,
      clientId: "id",
      clientSecret: "secret",
      now: () => 0,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/v1/oauth2/token")) {
          return json({ access_token: `token-${apiCalls + 1}`, expires_in: 3600 });
        }
        apiCalls += 1;
        if (apiCalls === 1) {
          return json({ name: "AUTHENTICATION_FAILURE" }, 401);
        }
        return json({ id: "ORDER", status: "CREATED" });
      },
    });

    const body = await client.request({ method: "GET", path: "/v2/checkout/orders/1", requestKey: "get:1" });
    expect(body).toMatchObject({ id: "ORDER" });
    expect(apiCalls).toBe(2);
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
