import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testSessionCookie } from "@/lib/auth/session";
import type { ProposedPurchase } from "@/lib/policy/schema";

const approvalId = "11111111-1111-4111-8111-111111111111";
const purchase: ProposedPurchase = {
  statedTotalCents: 600,
  lineItems: [
    {
      merchant: "staples.com",
      category: "office-supplies/printer-copier-paper",
      unitPriceCents: 600,
      quantity: 1,
      freeReturns: null,
      deliveryDate: null,
    },
  ],
};

const state = vi.hoisted(() => ({
  approval: null as Record<string, unknown> | null,
  saved: null as Record<string, unknown> | null,
  approved: 0,
  declined: 0,
  events: [] as string[],
}));

vi.mock("@/lib/checkout/approval", async () => {
  const actual = await vi.importActual<typeof import("@/lib/checkout/approval")>("@/lib/checkout/approval");
  return {
    ...actual,
    loadApprovalRecord: async () => state.approval,
    saveApprovalRecord: async (approval: Record<string, unknown>) => {
      state.saved = approval;
    },
    approveEscalation: async () => {
      state.approved += 1;
      return {
        verdict: "ESCALATE",
        reasons: ["Needs a person."],
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1",
        orderId: "ORDER1",
      };
    },
    declineApproval: async () => {
      state.declined += 1;
      return state.approval ? { ...state.approval, status: "declined" } : null;
    },
  };
});

vi.mock("@/lib/ledger", () => ({
  appendLedgerEvent: async (event: { type: string }) => {
    state.events.push(event.type);
  },
}));

import { POST as approve } from "./approve/route";
import { POST as decline } from "./decline/route";
import { GET } from "./route";

function stored(expiresAt: string) {
  return {
    id: approvalId,
    mandateId: "mandate-1",
    purchase,
    productIds: ["paper-1"],
    reasons: ["Needs a person."],
    status: "pending",
    orderId: null,
    reservationId: null,
    runId: null,
    expectedCents: 600,
    expiresAt,
    capturedOrder: { payer: { email_address: "buyer@example.com" } },
  };
}

describe("approval routes", () => {
  beforeEach(() => {
    state.approval = stored("2099-01-01T00:00:00.000Z");
    state.saved = null;
    state.approved = 0;
    state.declined = 0;
    state.events = [];
    process.env.DEMO_PASSCODE = "demo-gate";
  });

  it("requires the demo session", async () => {
    const response = await GET(new NextRequest(`http://localhost:3000/api/approvals/${approvalId}`), {
      params: Promise.resolve({ id: approvalId }),
    });
    expect(response.status).toBe(401);
  });

  it("returns the approval without the captured order", async () => {
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/approvals/${approvalId}`, { headers: { cookie: await testSessionCookie() } }),
      { params: Promise.resolve({ id: approvalId }) },
    );
    const body = await response.json();
    expect(body.approval.id).toBe(approvalId);
    expect(JSON.stringify(body)).not.toContain("buyer@example.com");
  });

  it("returns the PayPal approval URL", async () => {
    const response = await approve(
      new NextRequest(`http://localhost:3000/api/approvals/${approvalId}/approve`, {
        method: "POST",
        headers: { cookie: await testSessionCookie() },
      }),
      { params: Promise.resolve({ id: approvalId }) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1",
      orderId: "ORDER1",
    });
    expect(state.approved).toBe(1);
  });

  it("rejects an approval that has expired", async () => {
    state.approval = stored("2020-01-01T00:00:00.000Z");
    const response = await approve(
      new NextRequest(`http://localhost:3000/api/approvals/${approvalId}/approve`, {
        method: "POST",
        headers: { cookie: await testSessionCookie() },
      }),
      { params: Promise.resolve({ id: approvalId }) },
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.approvalUrl).toBeNull();
    expect(body.reasons).toEqual(["Approval expired."]);
    expect(state.approved).toBe(0);
    expect(state.saved).toMatchObject({ status: "expired" });
    expect(state.events).toEqual(["approval.expired"]);
  });

  it("declines an approval", async () => {
    const response = await decline(
      new NextRequest(`http://localhost:3000/api/approvals/${approvalId}/decline`, {
        method: "POST",
        headers: { cookie: await testSessionCookie() },
      }),
      { params: Promise.resolve({ id: approvalId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.approval.status).toBe("declined");
    expect(JSON.stringify(body)).not.toContain("buyer@example.com");
    expect(state.declined).toBe(1);
  });
});
