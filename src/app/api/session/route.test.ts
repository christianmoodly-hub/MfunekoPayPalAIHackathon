import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearRateLimits } from "@/lib/auth/rate-limit";
import { DEMO_COOKIE } from "@/lib/auth/session";

import { POST } from "./route";

const previous = process.env.DEMO_PASSCODE;

beforeEach(() => {
  clearRateLimits();
});

afterEach(() => {
  if (previous === undefined) {
    delete process.env.DEMO_PASSCODE;
  } else {
    process.env.DEMO_PASSCODE = previous;
  }
});

function post(body: string, headers: HeadersInit = { "content-type": "application/json" }) {
  return POST(
    new NextRequest("http://localhost:3000/api/session", {
      method: "POST",
      headers,
      body,
    }),
  );
}

describe("POST /api/session", () => {
  it("sets an httpOnly cookie for the configured passcode", async () => {
    process.env.DEMO_PASSCODE = "demo-gate";
    const response = await post(JSON.stringify({ passcode: "demo-gate" }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${DEMO_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).not.toContain("demo-gate");
  });

  it("rejects a wrong passcode after a short delay", async () => {
    process.env.DEMO_PASSCODE = "demo-gate";
    const started = Date.now();
    const response = await post(JSON.stringify({ passcode: "nope" }));
    expect(Date.now() - started).toBeGreaterThanOrEqual(500);
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed when DEMO_PASSCODE is unset", async () => {
    delete process.env.DEMO_PASSCODE;
    const response = await post(JSON.stringify({ passcode: "demo-gate" }));
    expect(response.status).toBe(500);
  });

  it("uses the last forwarded hop and blocks the sixth attempt", async () => {
    process.env.DEMO_PASSCODE = "demo-gate";
    const headers = { "content-type": "application/json", "x-forwarded-for": "203.0.113.9, 198.51.100.8" };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await post(JSON.stringify({ passcode: "nope" }), headers);
      expect(response.status).toBe(401);
    }
    const blocked = await post(JSON.stringify({ passcode: "demo-gate" }), headers);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("600");

    const other = await post(JSON.stringify({ passcode: "demo-gate" }), {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.9, 198.51.100.9",
    });
    expect(other.status).toBe(200);
  }, 10_000);
});
