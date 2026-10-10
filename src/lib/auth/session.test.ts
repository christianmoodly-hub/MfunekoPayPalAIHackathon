import { describe, expect, it } from "vitest";

import { clearRateLimits, takeRateLimit } from "./rate-limit";
import { passcodeMatches, sessionToken } from "./session";

describe("demo session", () => {
  it("accepts only the configured passcode", async () => {
    process.env.DEMO_PASSCODE = "demo-gate";
    const token = await sessionToken("demo-gate");
    expect(token).toBe(await sessionToken("demo-gate"));
    expect(token).not.toBe("demo-gate");
    expect(await passcodeMatches("demo-gate")).toBe(true);
    expect(await passcodeMatches("other-gate")).toBe(false);
  });
});

describe("rate limit", () => {
  it("allows eight calls in a window and blocks the next", () => {
    clearRateLimits();
    const now = 1_000_000;
    for (let count = 0; count < 8; count += 1) {
      expect(takeRateLimit("parse:203.0.113.8", now)).toBe(true);
    }
    expect(takeRateLimit("parse:203.0.113.8", now)).toBe(false);
    expect(takeRateLimit("parse:203.0.113.9", now)).toBe(true);
    expect(takeRateLimit("parse:203.0.113.8", now + 60_000)).toBe(true);
  });
});
