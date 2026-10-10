import { describe, expect, it } from "vitest";

import { shopQuery } from "./query";

describe("shopQuery", () => {
  it("uses the mandate search query when no argument is passed", () => {
    expect(shopQuery("office paper", "")).toBe("office paper");
    expect(shopQuery(" office paper ", "  ")).toBe("office paper");
  });

  it("prefers an explicit query", () => {
    expect(shopQuery("office paper", "toner")).toBe("toner");
  });
});
