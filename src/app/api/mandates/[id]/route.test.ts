import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testSessionCookie } from "@/lib/auth/session";

const mandate = {
  id: "11111111-1111-4111-8111-111111111111",
  description: "Buy paper.",
  maxTotalCents: 5000,
  maxPerItemCents: 2000,
  allowedCategories: ["office"],
  blockedMerchants: [],
  allowedMerchants: null,
  requireFreeReturns: true,
  deliverBy: "2026-10-20",
  escalateAboveCents: 3000,
  expiresAt: "2026-12-01T00:00:00.000Z",
  status: "active",
  searchQuery: "office paper",
  needsInput: [],
  spentCents: 400,
  heldCents: 250,
  remainingCents: 4350,
};

vi.mock("@/lib/mandates/balances", () => ({
  listMandateBalances: async () => [mandate],
  mandateBalance: async (id: string) => (id === mandate.id ? mandate : null),
}));

import { GET as listMandates } from "../route";
import { GET as getMandate } from "./route";

describe("mandate routes", () => {
  beforeEach(() => {
    process.env.DEMO_PASSCODE = "demo-gate";
  });

  it("requires the demo session", async () => {
    const response = await listMandates(new NextRequest("http://localhost:3000/api/mandates"));
    expect(response.status).toBe(401);
  });

  it("returns spent, held, and remaining cents", async () => {
    const cookie = await testSessionCookie();
    const list = await listMandates(new NextRequest("http://localhost:3000/api/mandates", { headers: { cookie } }));
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual({ mandates: [mandate] });

    const one = await getMandate(new NextRequest(`http://localhost:3000/api/mandates/${mandate.id}`, { headers: { cookie } }), {
      params: Promise.resolve({ id: mandate.id }),
    });
    expect(one.status).toBe(200);
    await expect(one.json()).resolves.toEqual({ mandate });
  });
});
