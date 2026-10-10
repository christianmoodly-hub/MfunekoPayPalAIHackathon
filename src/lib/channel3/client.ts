import { redactSecrets } from "@/lib/gemini/redact";

import { channel3SearchResponseSchema, type Channel3SearchResponse } from "./schema";

// POST /v1/search
// https://docs.trychannel3.com/api-reference/v1/search
const SEARCH_URL = "https://api.trychannel3.com/v1/search";
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
  return async (query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new Channel3ApiError(400, "Search query is required.");
    }

    const response = await fetchImpl(SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: trimmed,
        limit: SEARCH_LIMIT,
        config: { currency: "USD", country: "US", language: "en" },
      }),
    });

    const body = await readJson(response);
    if (!response.ok) {
      throw new Channel3ApiError(response.status, errorMessage(response.status, body));
    }

    const parsed = channel3SearchResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new Channel3ApiError(response.status, "Channel3 search response did not match the schema.");
    }

    return parsed.data;
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorMessage(status: number, body: unknown): string {
  const detail =
    body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : "";
  const message = detail || `Channel3 search failed with HTTP ${status}.`;
  return redactSecrets(message);
}
