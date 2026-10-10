import { describe, expect, it } from "vitest";

import { SpendLookupError, spentCentsFromPayloads } from "./spend";

describe("spentCentsFromPayloads", () => {
  it("sums captured USD amounts", () => {
    const total = spentCentsFromPayloads([
      { amount: { currencyCode: "USD", value: "4.00" } },
      { amount: { currencyCode: "USD", value: "1.50" } },
    ]);

    expect(total).toBe(550);
  });

  it("rejects a captured amount that is not USD cents", () => {
    expect(() => spentCentsFromPayloads([{ amount: { currencyCode: "EUR", value: "1.00" } }])).toThrow(SpendLookupError);
    expect(() => spentCentsFromPayloads([{ amount: null }])).toThrow(SpendLookupError);
  });
});
