import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  const origin = "https://mandate.example";

  it("keeps same-origin paths, query strings, and fragments", () => {
    expect(safeNextPath("/ledger?type=capture#latest", origin)).toBe("/ledger?type=capture#latest");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "ledger", "javascript:alert(1)"])(
    "rejects unsafe destination %s",
    (next) => {
      expect(safeNextPath(next, origin)).toBe("/");
    },
  );

  it("falls back for an invalid current origin", () => {
    expect(safeNextPath("/ledger", "not an origin")).toBe("/");
  });
});
