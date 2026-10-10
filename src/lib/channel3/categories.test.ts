import { describe, expect, it } from "vitest";

import { listCategoryPage, retainKnownCategories, searchCategorySlugs } from "./categories";

const printerPaper = {
  slug: "printer-copier-paper",
  title: "Printer & Copier Paper",
  has_children: false,
  path: [
    { slug: "office-supplies", title: "Office Supplies" },
    { slug: "general-office-supplies", title: "General Office Supplies" },
    { slug: "paper-products", title: "Paper Products" },
    { slug: "printer-copier-paper", title: "Printer & Copier Paper" },
  ],
};

describe("category vocabulary", () => {
  it("drops free-text categories and keeps a real taxonomy slug", () => {
    expect(
      retainKnownCategories(
        ["printer paper", "printer-copier-paper", "Office Supplies"],
        ["printer-copier-paper", "paper-products"],
      ),
    ).toEqual(["printer-copier-paper"]);
    expect(retainKnownCategories(null, ["printer-copier-paper"])).toBeNull();
  });

  it("reads the category list and search endpoints", async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      seen.push(String(url));
      const address = String(url);
      if (address.includes("/v1/categories/search")) {
        return Response.json({ categories: [printerPaper] });
      }
      return Response.json({ items: [printerPaper], page: 1, page_size: 100, total: 11861 });
    };

    const page = await listCategoryPage({ apiKey: "test-key", fetchImpl, page: 1, pageSize: 100 });
    const slugs = await searchCategorySlugs("printer paper", { apiKey: "test-key", fetchImpl });

    expect(page.total).toBe(11861);
    expect(page.items[0]?.slug).toBe("printer-copier-paper");
    expect(slugs).toEqual(["printer-copier-paper"]);
    expect(seen[0]).toBe("https://api.trychannel3.com/v1/categories?page=1&page_size=100");
    expect(seen[1]).toBe("https://api.trychannel3.com/v1/categories/search?query=printer+paper&limit=20");
  });
});
