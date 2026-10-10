import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testSessionCookie } from "@/lib/auth/session";

const state = vi.hoisted(() => ({
  events: [] as { type: string; payload: Record<string, unknown> }[],
  response: {} as unknown,
  body: null as {
    payment_source?: { paypal?: { experience_context?: { return_url?: string; cancel_url?: string } } };
  } | null,
}));

vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("link tests must not touch the database");
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
    request: async (input: { body?: typeof state.body }) => {
      state.body = input.body ?? null;
      if (state.response instanceof Error) {
        throw state.response;
      }
      return state.response;
    },
  }),
  PayPalApiError: class PayPalApiError extends Error {
    readonly status = 403;
    readonly issue = "NOT_ENABLED";
    readonly paypalName = "NOT_AUTHORIZED";
    readonly debugId = "debug-1";

    constructor() {
      super("Vault is not enabled for this REST app.");
      this.name = "PayPalApiError";
    }
  },
}));

import { PayPalApiError } from "@/lib/paypal/client";

import { POST } from "./route";

describe("POST /api/paypal/link", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://mandate.example";
  });
  it("returns the approval URL and omits the setup token id from the ledger", async () => {
    state.events = [];
    state.response = {
      id: "SETUP123",
      status: "PAYER_ACTION_REQUIRED",
      links: [{ href: "https://sandbox.paypal.com/agreements/approve?approval_session_id=SETUP123", rel: "approve" }],
    };

    const response = await POST(
      new NextRequest("http://localhost:3000/api/paypal/link", {
        method: "POST",
        headers: { cookie: await testSessionCookie() },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      approvalUrl: "https://sandbox.paypal.com/agreements/approve?approval_session_id=SETUP123",
    });
    expect(state.events.map((event) => event.type)).toEqual(["paypal.vault.setup_created"]);
    expect(JSON.stringify(state.events)).not.toContain("SETUP123");
    expect(state.body?.payment_source?.paypal?.experience_context?.return_url).toBe(
      "https://mandate.example/api/paypal/link/return",
    );
    expect(state.body?.payment_source?.paypal?.experience_context?.cancel_url).toBe("https://mandate.example/wallet?linked=0");
  });

  it("records a PayPal rejection without a vault id", async () => {
    state.events = [];
    state.response = new PayPalApiError(403, {
      name: "NOT_AUTHORIZED",
      message: "Vault is not enabled for this REST app.",
      debug_id: "debug-1",
      details: [{ issue: "NOT_ENABLED", description: "Vault is not enabled for this REST app." }],
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/paypal/link", {
        method: "POST",
        headers: { cookie: await testSessionCookie() },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Vault is not enabled for this REST app." });
    expect(state.events[0]?.type).toBe("paypal.vault.failed");
    expect(state.events[0]?.payload.issue).toBe("NOT_ENABLED");
  });
});
