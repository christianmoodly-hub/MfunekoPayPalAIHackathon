import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { testSessionCookie } from "@/lib/auth/session";

const state = vi.hoisted(() => ({
  events: [] as { type: string; payload: Record<string, unknown> }[],
  saved: [] as { vaultId: string; customerId: string | null }[],
  response: {} as unknown,
}));

vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("return tests must not touch the database");
  },
}));

vi.mock("@/lib/ledger", () => ({
  appendLedgerEvent: async (event: { type: string; payload: Record<string, unknown> }) => {
    state.events.push(event);
  },
}));

vi.mock("@/lib/paypal/config", () => ({
  readPayPalEnv: () => ({ clientId: "id", clientSecret: "secret", baseUrl: "https://api-m.sandbox.paypal.com" }),
}));

vi.mock("@/lib/paypal/client", () => ({
  createPayPalClient: () => ({
    request: async () => state.response,
  }),
}));

vi.mock("@/lib/paypal/payment-methods", () => ({
  insertPaymentMethod: async (input: { vaultId: string; customerId: string | null }) => {
    state.saved.push({ vaultId: input.vaultId, customerId: input.customerId });
    return { id: "pm-1" };
  },
}));

import { GET } from "./route";

describe("GET /api/paypal/link/return", () => {
  it("stores the payment token and redirects without putting it in the URL", async () => {
    state.events = [];
    state.saved = [];
    state.response = { id: "VAULT123", customer: { id: "customer-1" } };

    const response = await GET(
      new NextRequest("http://localhost:3000/api/paypal/link/return?approval_token_id=SETUP123", {
        headers: { cookie: await testSessionCookie() },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/wallet?linked=1");
    expect(state.saved).toEqual([{ vaultId: "VAULT123", customerId: "customer-1" }]);
    expect(JSON.stringify(state.events)).not.toContain("VAULT123");
    expect(state.events.map((event) => event.type)).toEqual([
      "paypal.vault.token_exchanged",
      "paypal.vault.payment_method_stored",
    ]);
  });

  it("redirects to linked=0 when PayPal omits the setup token", async () => {
    state.events = [];
    const response = await GET(
      new NextRequest("http://localhost:3000/api/paypal/link/return", {
        headers: { cookie: await testSessionCookie() },
      }),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/wallet?linked=0");
    expect(state.events[0]?.type).toBe("paypal.vault.failed");
  });
});
