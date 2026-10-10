import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearRateLimits } from "@/lib/auth/rate-limit";
import { testSessionCookie } from "@/lib/auth/session";

const state = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/gemini/env", () => ({
  readGeminiEnv: () => ({ apiKey: "test-key", model: "gemini-3.8-flash" }),
}));

vi.mock("@/lib/gemini/client", () => ({
  createGeminiGenerate: () => async () => "{}",
}));

vi.mock("@/lib/mandate/service", () => ({
  createMandateFromText: async () => {
    state.calls += 1;
    return { id: "11111111-1111-4111-8111-111111111111" };
  },
}));

import { POST } from "./route";

async function parse(ip: string) {
  return POST(
    new NextRequest("http://localhost:3000/api/mandates/parse", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: await testSessionCookie(),
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ text: "Buy paper." }),
    }),
  );
}

describe("POST /api/mandates/parse", () => {
  beforeEach(() => {
    state.calls = 0;
    clearRateLimits();
    process.env.DEMO_PASSCODE = "demo-gate";
  });

  it("requires the demo session", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/mandates/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Buy paper." }),
      }),
    );
    expect(response.status).toBe(401);
    expect(state.calls).toBe(0);
  });

  it("rate limits each IP", async () => {
    for (let count = 0; count < 8; count += 1) {
      expect((await parse("203.0.113.20")).status).toBe(200);
    }
    expect((await parse("203.0.113.20")).status).toBe(429);
    expect((await parse("203.0.113.21")).status).toBe(200);
    expect(state.calls).toBe(9);
  });
});
