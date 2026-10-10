import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { testSessionCookie } from "@/lib/auth/session";

import { proxy } from "./proxy";

describe("demo passcode proxy", () => {
  it("redirects pages and rejects API calls until the cookie is present", async () => {
    process.env.DEMO_PASSCODE = "demo-gate";
    const page = await proxy(new NextRequest("http://localhost:3000/mandates"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost:3000/enter?next=%2Fmandates");

    const api = await proxy(new NextRequest("http://localhost:3000/api/runs", { method: "POST" }));
    expect(api.status).toBe(401);

    const cookie = await testSessionCookie();
    const allowed = await proxy(new NextRequest("http://localhost:3000/mandates", { headers: { cookie } }));
    expect(allowed.headers.get("location")).toBeNull();

    const enter = await proxy(new NextRequest("http://localhost:3000/enter"));
    expect(enter.headers.get("location")).toBeNull();

    const health = await proxy(new NextRequest("http://localhost:3000/api/health"));
    expect(health.headers.get("location")).toBeNull();
    expect(health.status).not.toBe(401);
  });

  it("fails closed when DEMO_PASSCODE is unset", async () => {
    const previous = process.env.DEMO_PASSCODE;
    delete process.env.DEMO_PASSCODE;
    try {
      const api = await proxy(new NextRequest("http://localhost:3000/api/wallet"));
      expect(api.status).toBe(500);
    } finally {
      if (previous === undefined) {
        delete process.env.DEMO_PASSCODE;
      } else {
        process.env.DEMO_PASSCODE = previous;
      }
    }
  });
});
