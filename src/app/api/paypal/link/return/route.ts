import { NextResponse, type NextRequest } from "next/server";

import { appendLedgerEvent } from "@/lib/ledger";
import { createPayPalClient } from "@/lib/paypal/client";
import { readPayPalEnv } from "@/lib/paypal/config";
import { completeVaultLink, setupTokenIdFromSearch, vaultFailurePayload } from "@/lib/paypal/link";
import { insertPaymentMethod } from "@/lib/paypal/payment-methods";

export async function GET(request: NextRequest) {
  const setupTokenId = setupTokenIdFromSearch(request.nextUrl.searchParams);
  if (!setupTokenId) {
    await appendLedgerEvent({
      type: "paypal.vault.failed",
      mandateId: null,
      payload: { step: "return", message: "PayPal did not return a setup token." },
    }).catch(() => undefined);
    return NextResponse.redirect(new URL("/mandates?linked=0", request.url));
  }

  try {
    await completeVaultLink({
      client: createPayPalClient(readPayPalEnv()),
      setupTokenId,
      appendLedger: appendLedgerEvent,
      save: insertPaymentMethod,
    });
    return NextResponse.redirect(new URL("/mandates?linked=1", request.url));
  } catch (error) {
    await appendLedgerEvent({
      type: "paypal.vault.failed",
      mandateId: null,
      payload: vaultFailurePayload("return", error, setupTokenId),
    }).catch(() => undefined);
    return NextResponse.redirect(new URL("/mandates?linked=0", request.url));
  }
}
