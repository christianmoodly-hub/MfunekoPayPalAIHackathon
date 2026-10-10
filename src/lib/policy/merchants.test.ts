import { describe, expect, it } from "vitest";

import { merchantCoveredBy, normalizeMerchant } from "./merchants";

describe("merchant domains", () => {
  it("lowercases and strips the scheme, www, and path", () => {
    expect(normalizeMerchant("HTTPS://WWW.Amazon.com/dp/B00?ref=1#top")).toBe("amazon.com");
    expect(normalizeMerchant("amazon.com")).toBe("amazon.com");
  });

  it("treats a domain as covering its subdomains only", () => {
    expect(merchantCoveredBy("amazon.com", "https://smile.amazon.com/cart")).toBe(true);
    expect(merchantCoveredBy("amazon.com", "amazon.com")).toBe(true);
    expect(merchantCoveredBy("shop.amazon.com", "amazon.com")).toBe(false);
    expect(merchantCoveredBy("amazon.com", "notamazon.com")).toBe(false);
    expect(merchantCoveredBy("amazon.com", "amazon.com.evil.com")).toBe(false);
  });
});
