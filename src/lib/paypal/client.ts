import { paypalErrorSchema } from "./schema";

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
};

type PayPalClientOptions = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
};

export function createPayPalClient(options: PayPalClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let accessToken: string | undefined;

  async function getAccessToken(): Promise<string> {
    if (accessToken) {
      return accessToken;
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

    accessToken = body.access_token;
    return accessToken;
  }

  return {
    async request({ method, path, body }: PayPalRequest): Promise<unknown> {
      const token = await getAccessToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
        Prefer: "return=representation",
      };

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetchImpl(`${options.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
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

function isTokenResponse(body: unknown): body is { access_token: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "access_token" in body &&
    typeof body.access_token === "string" &&
    body.access_token.length > 0
  );
}
