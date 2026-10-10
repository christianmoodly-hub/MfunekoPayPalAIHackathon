import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { DEMO_COOKIE } from "@/lib/auth/session";

import { POST } from "./route";

const previous = process.env.DEMO_PASSCODE;

afterEach(() => {
  if (previous === undefined) {
    delete process.env.DEMO_PASSCODE;
  } else {
    process.env.DEMO_PASSCODE = previous;
  }
});

describe("POST /api/session", () => {
  it("sets an httpOnly cookie for the configured passcode", async () => {
    process.env.DEMO_PASSCODE = "demo-gate";
    const response = await POST(
      new NextRequest("http://localhost:3000/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode: "demo-gate" }),
      }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${DEMO_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).not.toContain("demo-gate");
  });

  it("rejects a wrong passcode", async () => {
    process.env.DEMO_PASSCODE = "demo-gate";
    const response = await POST(
      new NextRequest("http://localhost:3000/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode: "nope" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed when DEMO_PASSCODE is unset", async () => {
    delete process.env.DEMO_PASSCODE;
    const response = await POST(
      new NextRequest("http://localhost:3000/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode: "demo-gate" }),
      }),
    );
    expect(response.status).toBe(500);
  });
});
