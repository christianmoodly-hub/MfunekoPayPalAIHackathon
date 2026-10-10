import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testSessionCookie } from "@/lib/auth/session";
import { secretFingerprint } from "@/lib/paypal/fingerprint";

const state = vi.hoisted(() => ({
  method: null as { id: string; vaultId: string } | null,
}));

vi.mock("@/lib/paypal/payment-methods", () => ({
  latestActivePaymentMethod: async () => state.method,
}));

import { GET } from "./route";

describe("GET /api/wallet", () => {
  beforeEach(() => {
    state.method = null;
    process.env.DEMO_PASSCODE = "demo-gate";
  });

  it("requires the demo session", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/wallet"));
    expect(response.status).toBe(401);
  });

  it("returns linked status and a fingerprint only", async () => {
    const empty = await GET(
      new NextRequest("http://localhost:3000/api/wallet", { headers: { cookie: await testSessionCookie() } }),
    );
    await expect(empty.json()).resolves.toEqual({ linked: false, fingerprint: null });

    state.method = { id: "pm-1", vaultId: "VAULT-SECRET" };
    const linked = await GET(
      new NextRequest("http://localhost:3000/api/wallet", { headers: { cookie: await testSessionCookie() } }),
    );
    const body = await linked.json();
    expect(body).toEqual({ linked: true, fingerprint: secretFingerprint("VAULT-SECRET") });
    expect(JSON.stringify(body)).not.toContain("VAULT-SECRET");
  });
});
