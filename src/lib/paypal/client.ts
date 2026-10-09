import { paypalRequestId } from "./request-id";
import { paypalErrorSchema } from "./schema";

const REFRESH_SKEW_MS = 60_000;

export class PayPalApiError extends Error {
  readonly status: number;
  readonly debugId?: string;
  readonly issue?: string;

  constructor(status: number, body: unknown) {
    const parsed = paypalErrorSchema.safeParse(body);
    const name = parsed.success ? parsed.data.name : undefined;
    const message = parsed.success ? parsed.data.message : undefined;
    const detail = parsed.success ? parsed.data.details?.[0] : undefined;
    super(detail?.description ?? message ?? name ?? `PayPal request failed with HTTP ${status}.`);
    this.name = "PayPalApiError";
    this.status = status;
    this.debugId = parsed.success ? parsed.data.debug_id : undefined;
    this.issue = detail?.issue;
  }
}

export type PayPalRequest = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  requestKey: string;
};

type PayPalClientOptions = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type CachedToken = {
  accessToken: string;
  refreshAtMs: number;
};

export function createPayPalClient(options: PayPalClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cachedToken: CachedToken | undefined;

  async function getAccessToken(forceRefresh = false): Promise<string> {
    const currentTime = now();
    if (!forceRefresh && cachedToken && currentTime < cachedToken.refreshAtMs) {
      return cachedToken.accessToken;
    }

    const credentials = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");
    const response = await fetchImpl(`${options.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    const body: unknown = await response.json();

    if (!response.ok) {
      throw new PayPalApiError(response.status, body);
    }

    if (!isTokenResponse(body)) {
      throw new Error("PayPal token response did not include access_token.");
    }

    cachedToken = {
      accessToken: body.access_token,
      refreshAtMs: refreshAt(currentTime, body.expires_in),
    };
    return cachedToken.accessToken;
  }

  async function send(request: PayPalRequest, token: string): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "PayPal-Request-Id": paypalRequestId(request.requestKey),
      Prefer: "return=representation",
    };

    if (request.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    return fetchImpl(`${options.baseUrl}${request.path}`, {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
  }

  return {
    async request(request: PayPalRequest): Promise<unknown> {
      let response = await send(request, await getAccessToken());
      if (response.status === 401) {
        response = await send(request, await getAccessToken(true));
      }

      const text = await response.text();
      const parsed: unknown = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new PayPalApiError(response.status, parsed);
      }

      return parsed;
    },
  };
}

export type PayPalClient = ReturnType<typeof createPayPalClient>;

function isTokenResponse(body: unknown): body is { access_token: string; expires_in?: number } {
  return (
    typeof body === "object" &&
    body !== null &&
    "access_token" in body &&
    typeof body.access_token === "string" &&
    body.access_token.length > 0
  );
}

function refreshAt(nowMs: number, expiresInSeconds: number | undefined): number {
  if (typeof expiresInSeconds !== "number" || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    return nowMs;
  }

  return nowMs + Math.max(0, expiresInSeconds * 1000 - REFRESH_SKEW_MS);
}
