import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testSessionCookie } from "@/lib/auth/session";

const state = vi.hoisted(() => ({
  approval: {
    id: "11111111-1111-4111-8111-111111111111",
    status: "ordered",
    runId: "22222222-2222-4222-8222-222222222222",
  },
  lookedUp: [] as string[],
  captured: 0,
  cancelled: [] as string[],
}));

const runId = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/checkout/approval", () => ({
  findApprovalByOrderId: async (orderId: string) => {
    state.lookedUp.push(orderId);
    return { ...state.approval };
  },
  captureAfterApproval: async () => {
    state.captured += 1;
    state.approval.status = "captured";
    return { id: "ORDER1" };
  },
  cancelApprovalByOrderId: async (orderId: string) => {
    state.cancelled.push(orderId);
    return { ...state.approval, status: "cancelled" };
  },
}));

import { GET as cancel } from "./cancel/route";
import { GET as orderReturn } from "./return/route";

describe("PayPal order return and cancel", () => {
  beforeEach(() => {
    state.approval = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "ordered",
      runId,
    };
    state.lookedUp = [];
    state.captured = 0;
    state.cancelled = [];
    process.env.DEMO_PASSCODE = "demo-gate";
    process.env.APP_URL = "http://localhost:3000";
  });

  it("requires the demo session", async () => {
    const response = await orderReturn(new NextRequest("http://localhost:3000/api/paypal/order/return?token=ORDER1"));
    expect(response.status).toBe(401);
    expect(state.captured).toBe(0);
  });

  it("captures from the PayPal order id and ignores a replay", async () => {
    const cookie = await testSessionCookie();
    const url = "http://localhost:3000/api/paypal/order/return?token=ORDER1&approvalId=forged&PayerID=PAYER";
    const first = await orderReturn(new NextRequest(url, { headers: { cookie } }));
    const second = await orderReturn(new NextRequest(url, { headers: { cookie } }));

    expect(first.headers.get("location")).toBe(`http://localhost:3000/runs/${runId}`);
    expect(second.headers.get("location")).toBe(`http://localhost:3000/runs/${runId}`);
    expect(state.lookedUp).toEqual(["ORDER1", "ORDER1"]);
    expect(state.captured).toBe(1);
  });

  it("cancels from the PayPal order id and releases through that lookup", async () => {
    const response = await cancel(
      new NextRequest("http://localhost:3000/api/paypal/order/cancel?token=ORDER1&mandateId=forged", {
        headers: { cookie: await testSessionCookie() },
      }),
    );
    expect(response.headers.get("location")).toBe(`http://localhost:3000/runs/${runId}`);
    expect(state.cancelled).toEqual(["ORDER1"]);
    expect(state.lookedUp).toEqual([]);
  });
});
