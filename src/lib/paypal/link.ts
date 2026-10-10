import type { LedgerEventInput } from "@/lib/ledger/schema";

import type { PayPalClient } from "./client";
import { PayPalApiError } from "./client";
import { secretFingerprint, redactSecret } from "./fingerprint";
import { createSetupToken, exchangeSetupToken, setupApprovalUrl } from "./vault";

type AppendLedger = (input: LedgerEventInput) => Promise<unknown>;

export async function beginVaultLink(options: {
  client: PayPalClient;
  returnUrl: string;
  cancelUrl: string;
  requestKey: string;
  appendLedger: AppendLedger;
}): Promise<{ approvalUrl: string }> {
  const setup = await createSetupToken(options.client, options.returnUrl, options.cancelUrl, options.requestKey);
  await options.appendLedger({
    type: "paypal.vault.setup_created",
    mandateId: null,
    payload: {
      setupFingerprint: secretFingerprint(setup.id),
      status: setup.status,
    },
  });

  return { approvalUrl: setupApprovalUrl(setup) };
}

export async function completeVaultLink(options: {
  client: PayPalClient;
  setupTokenId: string;
  appendLedger: AppendLedger;
  save: (input: { id: string; vaultId: string; customerId: string | null }) => Promise<{ id: string }>;
  createId?: () => string;
}): Promise<{ paymentMethodId: string }> {
  const token = await exchangeSetupToken(
    options.client,
    options.setupTokenId,
    `vault:exchange:${options.setupTokenId}`,
  );
  const vaultFingerprint = secretFingerprint(token.id);
  await options.appendLedger({
    type: "paypal.vault.token_exchanged",
    mandateId: null,
    payload: { vaultFingerprint },
  });

  const saved = await options.save({
    id: options.createId?.() ?? crypto.randomUUID(),
    vaultId: token.id,
    customerId: token.customer?.id ?? null,
  });
  await options.appendLedger({
    type: "paypal.vault.payment_method_stored",
    mandateId: null,
    payload: {
      paymentMethodId: saved.id,
      vaultFingerprint,
      status: "active",
    },
  });

  return { paymentMethodId: saved.id };
}

export function setupTokenIdFromSearch(params: URLSearchParams): string | null {
  for (const key of ["approval_token_id", "approval_session_id", "token"]) {
    const value = params.get(key)?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export function vaultFailurePayload(step: string, error: unknown, secret = ""): Record<string, unknown> {
  const message = error instanceof Error ? error.message : "PayPal vault request failed.";
  return {
    step,
    message: redactSecret(message, secret),
    status: error instanceof PayPalApiError ? error.status : null,
    issue: error instanceof PayPalApiError ? (error.issue ?? null) : null,
    paypalName: error instanceof PayPalApiError ? (error.paypalName ?? null) : null,
    debugId: error instanceof PayPalApiError ? (error.debugId ?? null) : null,
  };
}
