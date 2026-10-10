import { Channel3, Channel3Error } from "@channel3/sdk";

import { redactSecrets } from "@/lib/gemini/redact";

import { channel3SearchResponseSchema, type Channel3SearchResponse } from "./schema";

// Official SDK search: client.products.search
// https://docs.trychannel3.com/sdk
// https://docs.trychannel3.com/api-reference/v1/search
const SEARCH_LIMIT = 10;

export class Channel3ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "Channel3ApiError";
    this.status = status;
  }
}

export type Channel3Search = (query: string) => Promise<Channel3SearchResponse>;

export function createChannel3Search(apiKey: string, fetchImpl: typeof fetch = fetch): Channel3Search {
  const client = new Channel3({
    apiKey,
    fetch: fetchImpl,
    maxRetries: 0,
    language: "en",
    country: "US",
    currency: "USD",
  });

  return async (query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new Channel3ApiError(400, "Search query is required.");
    }

    try {
      const page = await client.products.search({
        query: trimmed,
        limit: SEARCH_LIMIT,
        config: { currency: "USD", country: "US", language: "en" },
      });
      const parsed = channel3SearchResponseSchema.safeParse(page.response);
      if (!parsed.success) {
        throw new Channel3ApiError(200, "Channel3 search response did not match the schema.");
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof Channel3ApiError) {
        throw error;
      }
      if (error instanceof Channel3Error) {
        throw new Channel3ApiError(error.statusCode ?? 500, errorMessage(error.statusCode ?? 500, error.body ?? error.message));
      }
      const message = error instanceof Error ? error.message : "Channel3 search failed.";
      throw new Channel3ApiError(500, redactSecrets(message));
    }
  };
}

function errorMessage(status: number, body: unknown): string {
  const detail =
    body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
      ? body.detail
      : typeof body === "string"
        ? body
        : "";
  const message = detail || `Channel3 search failed with HTTP ${status}.`;
  return redactSecrets(message);
}
