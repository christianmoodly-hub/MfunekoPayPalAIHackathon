import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testSessionCookie } from "@/lib/auth/session";

const state = vi.hoisted(() => ({
  filter: null as { mandateId?: string; type?: string; limit: number } | null,
}));

vi.mock("@/lib/ledger/query", () => ({
  listLedgerEvents: async (filter: { mandateId?: string; type?: string; limit: number }) => {
    state.filter = filter;
    return [
      {
        id: "event-1",
        mandateId: filter.mandateId ?? null,
        runId: null,
        type: filter.type ?? "checkout.blocked",
        payload: { reasons: ["no"] },
        createdAt: "2026-10-10T12:00:00.000Z",
      },
    ];
  },
}));

import { GET } from "./route";

const mandateId = "11111111-1111-4111-8111-111111111111";

describe("GET /api/ledger", () => {
  beforeEach(() => {
    state.filter = null;
    process.env.DEMO_PASSCODE = "demo-gate";
  });

  it("requires the demo session", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/ledger"));
    expect(response.status).toBe(401);
  });

  it("filters by mandate, event type, and limit", async () => {
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/ledger?mandateId=${mandateId}&type=checkout.blocked&limit=10`, {
        headers: { cookie: await testSessionCookie() },
      }),
    );
    expect(response.status).toBe(200);
    expect(state.filter).toEqual({ mandateId, type: "checkout.blocked", limit: 10 });
    const body = (await response.json()) as { events: { type: string }[] };
    expect(body.events[0]?.type).toBe("checkout.blocked");
  });

  it("defaults the limit and rejects an invalid filter", async () => {
    const cookie = await testSessionCookie();
    const ok = await GET(new NextRequest("http://localhost:3000/api/ledger", { headers: { cookie } }));
    expect(ok.status).toBe(200);
    expect(state.filter?.limit).toBe(50);

    const bad = await GET(new NextRequest("http://localhost:3000/api/ledger?limit=0", { headers: { cookie } }));
    expect(bad.status).toBe(400);
  });
});
