import { z } from "zod";

import { Channel3ApiError } from "./client";
import { channel3CategorySchema } from "./schema";

// Taxonomy list: GET /v1/categories
// https://docs.trychannel3.com/api-reference/v1/list-categories
// Search within that taxonomy: GET /v1/categories/search
// https://docs.trychannel3.com/api-reference/v1/search-categories
// Checked 2026-10-10. The list has thousands of slugs, so a parse uses the
// search hits (the same CategorySummary records) as the allowed vocabulary.

const LIST_URL = "https://api.trychannel3.com/v1/categories";
const SEARCH_URL = "https://api.trychannel3.com/v1/categories/search";

export const categoryListPageSchema = z.object({
  items: z.array(channel3CategorySchema),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const categorySearchResponseSchema = z.object({
  categories: z.array(channel3CategorySchema),
});

export function retainKnownCategories(
  values: string[] | null,
  known: readonly string[],
): string[] | null {
  if (values === null) {
    return null;
  }

  const allowed = new Set(known);
  const kept: string[] = [];
  for (const value of values) {
    const slug = value.trim();
    if (!slug || !allowed.has(slug) || kept.includes(slug)) {
      continue;
    }
    kept.push(slug);
  }
  return kept;
}

export async function listCategoryPage(
  options: { apiKey: string; fetchImpl?: typeof fetch; page?: number; pageSize?: number },
) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 100;
  const url = new URL(LIST_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));
  const body = await channel3Get(url, options.apiKey, options.fetchImpl ?? fetch, "Channel3 category list");
  const parsed = categoryListPageSchema.safeParse(body);
  if (!parsed.success) {
    throw new Channel3ApiError(200, "Channel3 category list did not match the schema.");
  }
  return parsed.data;
}

export async function searchCategorySlugs(
  query: string,
  options: { apiKey: string; fetchImpl?: typeof fetch; limit?: number },
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const url = new URL(SEARCH_URL);
  url.searchParams.set("query", trimmed.slice(0, 200));
  url.searchParams.set("limit", String(options.limit ?? 20));
  const body = await channel3Get(url, options.apiKey, options.fetchImpl ?? fetch, "Channel3 category search");
  const parsed = categorySearchResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Channel3ApiError(200, "Channel3 category search did not match the schema.");
  }
  return parsed.data.categories.map((category) => category.slug);
}

async function channel3Get(url: URL, apiKey: string, fetchImpl: typeof fetch, label: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json", "x-api-key": apiKey },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label} failed.`;
    throw new Channel3ApiError(500, message);
  }

  if (!response.ok) {
    throw new Channel3ApiError(response.status, `${label} failed with HTTP ${response.status}.`);
  }

  try {
    return await response.json();
  } catch {
    throw new Channel3ApiError(response.status, `${label} response was not JSON.`);
  }
}
