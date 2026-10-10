import { describe, expect, it } from "vitest";

import { categoryMatches, categorySegments, joinCategoryParts } from "./categories";

describe("category matching", () => {
  it("treats hyphens, underscores, and spaces as the same separator", () => {
    expect(categorySegments("Office-Supplies")).toEqual(categorySegments("office_supplies"));
    expect(categorySegments("office supplies")).toEqual(["officesupplies"]);
    expect(categoryMatches(["office supplies"], "office-supplies")).toBe(true);
    expect(categoryMatches(["office_supplies"], "Office Supplies")).toBe(true);
  });

  it("matches any segment of a hierarchical path", () => {
    expect(categoryMatches(["office supplies"], "home/office-supplies/paper")).toBe(true);
    expect(categoryMatches(["Home > Office"], "office/paper")).toBe(true);
    expect(categoryMatches(["electronics"], "home/office/paper")).toBe(false);
    expect(categoryMatches(["office"], "officesupplies")).toBe(false);
  });

  it("joins catalog parts in order and drops duplicate segments", () => {
    expect(joinCategoryParts(["home", "office-supplies", "Office Supplies", "paper"])).toBe(
      "home/office-supplies/paper",
    );
    expect(joinCategoryParts(["", "   "])).toBeNull();
  });
});
