import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearRateLimits } from "@/lib/auth/rate-limit";
import { testSessionCookie } from "@/lib/auth/session";

const runId = "44444444-4444-4444-8444-444444444444";
const mandateId = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  created: 0,
  scheduled: [] as Array<() => unknown>,
  executed: [] as string[],
  run: null as { id: string; events: unknown[] } | null,
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (task: () => unknown) => {
      state.scheduled.push(task);
    },
  };
});

vi.mock("@/lib/runs/service", () => ({
  createRun: async () => {
    state.created += 1;
    return {
      id: runId,
      mandateId,
      status: "running",
      outcome: null,
      error: null,
      createdAt: "2026-10-10T12:00:00.000Z",
      updatedAt: "2026-10-10T12:00:00.000Z",
    };
  },
  executeRun: async (id: string) => {
    state.executed.push(id);
  },
  getRun: async (id: string) => (state.run && state.run.id === id ? state.run : null),
}));

import { GET } from "./[id]/route";
import { POST } from "./route";

async function start(ip: string) {
  return POST(
    new NextRequest("http://localhost:3000/api/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: await testSessionCookie(),
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ mandateId }),
    }),
  );
}

describe("run routes", () => {
  beforeEach(() => {
    state.created = 0;
    state.scheduled = [];
    state.executed = [];
    state.run = null;
    clearRateLimits();
    process.env.DEMO_PASSCODE = "demo-gate";
  });

  it("requires the demo session", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mandateId }),
      }),
    );
    expect(response.status).toBe(401);
    expect(state.created).toBe(0);
  });

  it("stores a run and schedules shop plus checkout", async () => {
    const response = await start("203.0.113.30");
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ run: { id: runId, status: "running" } });
    expect(state.executed).toEqual([]);
    await state.scheduled[0]?.();
    expect(state.executed).toEqual([runId]);
  });

  it("rate limits each IP", async () => {
    for (let count = 0; count < 8; count += 1) {
      expect((await start("203.0.113.31")).status).toBe(202);
    }
    expect((await start("203.0.113.31")).status).toBe(429);
    expect(state.created).toBe(8);
  });

  it("returns the run and its ledger events", async () => {
    state.run = {
      id: runId,
      events: [{ id: "event-1", type: "checkout.blocked", runId }],
    };
    const response = await GET(new NextRequest(`http://localhost:3000/api/runs/${runId}`, { headers: { cookie: await testSessionCookie() } }), {
      params: Promise.resolve({ id: runId }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ run: state.run });
  });
});
