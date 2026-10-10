import { describe, expect, it } from "vitest";

import { appOrigin } from "./app-url";
import { assertProductionConfig } from "./production";

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

describe("APP_URL", () => {
  it("returns the origin and rejects a path", () => {
    expect(appOrigin(env({ APP_URL: "https://mandate.example/" }))).toBe("https://mandate.example");
    expect(() => appOrigin(env({ APP_URL: "https://mandate.example/wallet" }))).toThrow(/origin/);
    expect(() => appOrigin(env({}))).toThrow(/not set/);
  });
});

describe("production startup", () => {
  it("does nothing outside production", () => {
    expect(() => assertProductionConfig(env({ NODE_ENV: "development" }))).not.toThrow();
  });

  it("accepts a public https origin, a passcode, and sandbox", () => {
    expect(() =>
      assertProductionConfig(
        env({
          NODE_ENV: "production",
          APP_URL: "https://mandate.example",
          DEMO_PASSCODE: "demo-gate",
          PAYPAL_ENV: "sandbox",
        }),
      ),
    ).not.toThrow();
  });

  it("fails loudly when production config is missing or wrong", () => {
    expect(() =>
      assertProductionConfig(
        env({
          NODE_ENV: "production",
          APP_URL: "http://localhost:3000",
          PAYPAL_ENV: "live",
        }),
      ),
    ).toThrow(/APP_URL must be a public https origin[\s\S]*DEMO_PASSCODE is not set[\s\S]*PAYPAL_ENV must be sandbox/);
  });
});
