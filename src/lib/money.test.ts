import { describe, expect, it } from "vitest";

import { centsToUsd, usdToCents } from "./money";

describe("money", () => {
  it("converts a two-decimal USD string to integer cents", () => {
    expect(usdToCents("5.00")).toBe(500);
    expect(usdToCents("0.01")).toBe(1);
    expect(usdToCents("10.10")).toBe(1010);
  });

  it("rejects values that are not exact cents", () => {
    expect(() => usdToCents("5")).toThrow(/two fraction digits/);
    expect(() => usdToCents("5.001")).toThrow(/two fraction digits/);
  });

  it("formats integer cents as a USD decimal", () => {
    expect(centsToUsd(500)).toBe("5.00");
    expect(centsToUsd(1)).toBe("0.01");
    expect(centsToUsd(1010)).toBe("10.10");
  });
});
