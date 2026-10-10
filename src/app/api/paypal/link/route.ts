import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { appendLedgerEvent } from "@/lib/ledger";
import { PayPalApiError, createPayPalClient } from "@/lib/paypal/client";
import { readPayPalEnv } from "@/lib/paypal/config";
import { appOrigin } from "@/lib/env/app-url";
import { beginVaultLink, vaultFailurePayload } from "@/lib/paypal/link";

export async function POST(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }
  try {
    const origin = appOrigin();
    const result = await beginVaultLink({
      client: createPayPalClient(readPayPalEnv()),
      returnUrl: `${origin}/api/paypal/link/return`,
      cancelUrl: `${origin}/wallet?linked=0`,
      requestKey: `vault:setup:${crypto.randomUUID()}`,
      appendLedger: appendLedgerEvent,
    });
    return Response.json({ approvalUrl: result.approvalUrl });
  } catch (error) {
    await appendLedgerEvent({
      type: "paypal.vault.failed",
      mandateId: null,
      payload: vaultFailurePayload("setup", error),
    }).catch(() => undefined);
    return Response.json({ error: publicError(error) }, { status: errorStatus(error) });
  }
}

function publicError(error: unknown): string {
  if (error instanceof PayPalApiError) {
    return error.message;
  }
  if (error instanceof Error && (error.message.endsWith("are required.") || error.message.startsWith("APP_URL"))) {
    return error.message;
  }
  return "Could not start PayPal wallet linking.";
}

function errorStatus(error: unknown): number {
  if (error instanceof PayPalApiError) {
    return error.status >= 400 && error.status < 500 ? 400 : 502;
  }
  if (error instanceof Error && (error.message.endsWith("are required.") || error.message.startsWith("APP_URL"))) {
    return 500;
  }
  return 502;
}
