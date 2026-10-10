import { describe, expect, it } from "vitest";

import { applyMandateConfirmation, finalizeMandateDraft } from "./defaults";

const draft = {
  searchQuery: " office paper ",
  needsInput: [] as string[],
  maxTotalCents: 5001,
  maxPerItemCents: 2000,
  escalateAboveCents: 3000 as number | null,
  allowedCategories: ["office"],
  blockedMerchants: ["HTTPS://www.Amazon.com/dp/1"],
  allowedMerchants: ["http://smile.amazon.com/cart"] as string[] | null,
  requireFreeReturns: false,
  deliverBy: null,
};

describe("finalizeMandateDraft", () => {
  it("sets caps to zero and lists budget when the user stated none", () => {
    const result = finalizeMandateDraft({
      ...draft,
      needsInput: ["Budget"],
      maxTotalCents: 4000,
      maxPerItemCents: 1000,
      escalateAboveCents: 2000,
    });

    expect(result.maxTotalCents).toBe(0);
    expect(result.maxPerItemCents).toBe(0);
    expect(result.escalateAboveCents).toBe(0);
    expect(result.needsInput).toEqual(["budget"]);
  });

  it("defaults the escalate threshold to half the max when the user did not state one", () => {
    const result = finalizeMandateDraft({ ...draft, escalateAboveCents: null });

    expect(result.escalateAboveCents).toBe(2500);
    expect(result.maxTotalCents).toBe(5001);
  });

  it("keeps a stated escalate threshold and stores merchant domains", () => {
    const result = finalizeMandateDraft(draft);

    expect(result.escalateAboveCents).toBe(3000);
    expect(result.searchQuery).toBe("office paper");
    expect(result.blockedMerchants).toEqual(["amazon.com"]);
    expect(result.allowedMerchants).toEqual(["smile.amazon.com"]);
  });

  it("confirms with normalized domains and drops a filled budget gap", () => {
    const confirmed = applyMandateConfirmation(
      {
        id: "mandate-1",
        description: "Buy paper.",
        maxTotalCents: 0,
        maxPerItemCents: 0,
        allowedCategories: ["office"],
        blockedMerchants: [],
        allowedMerchants: null,
        requireFreeReturns: false,
        deliverBy: null,
        escalateAboveCents: 0,
        expiresAt: "2026-11-08T12:00:00.000Z",
        status: "draft",
        searchQuery: "",
        needsInput: ["budget", "color"],
      },
      {
        description: "Buy paper.",
        searchQuery: " office paper ",
        maxTotalCents: 5000,
        maxPerItemCents: 2000,
        allowedCategories: ["office"],
        blockedMerchants: ["HTTPS://www.Amazon.com/dp/1"],
        allowedMerchants: ["https://"],
        requireFreeReturns: false,
        deliverBy: null,
        escalateAboveCents: 2500,
      },
    );

    expect(confirmed.status).toBe("active");
    expect(confirmed.expiresAt).toBe("2026-11-08T12:00:00.000Z");
    expect(confirmed.searchQuery).toBe("office paper");
    expect(confirmed.needsInput).toEqual(["color"]);
    expect(confirmed.blockedMerchants).toEqual(["amazon.com"]);
    expect(confirmed.allowedMerchants).toBeNull();
  });
});
