import { describe, expect, it } from "vitest";

import type { LineItem } from "@/lib/policy/schema";

import type { PayPalClient } from "./client";
import { secretFingerprint } from "./fingerprint";
import { beginVaultLink, completeVaultLink } from "./link";
import { exchangeSetupToken, paymentTokenBody, setupTokenBody, vaultChargeBody } from "./vault";

const lineItem: LineItem = {
  merchant: "shop.example",
  category: "office",
  unitPriceCents: 1250,
  quantity: 2,
  freeReturns: null,
  deliveryDate: null,
};

function clientReturning(...bodies: unknown[]): { client: PayPalClient; calls: { path: string; body?: unknown; requestKey: string }[] } {
  const calls: { path: string; body?: unknown; requestKey: string }[] = [];
  const client: PayPalClient = {
    async request(request) {
      calls.push(request);
      const next = bodies[calls.length - 1];
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  return { client, calls };
}

describe("vault requests", () => {
  it("builds the setup token, payment token, and vault charge bodies", () => {
    expect(setupTokenBody("https://app.example/return", "https://app.example/cancel")).toMatchObject({
      payment_source: {
        paypal: {
          usage_type: "MERCHANT",
          experience_context: {
            shipping_preference: "NO_SHIPPING",
            return_url: "https://app.example/return",
            cancel_url: "https://app.example/cancel",
          },
        },
      },
    });
    expect(paymentTokenBody("SETUP123")).toEqual({
      payment_source: { token: { id: "SETUP123", type: "SETUP_TOKEN" } },
    });
    const charge = vaultChargeBody("VAULT123", [lineItem], "charge-vaulted");
    expect(charge.payment_source.paypal.vault_id).toBe("VAULT123");
    expect(charge.purchase_units[0]?.amount.value).toBe("25.00");
    expect(charge.purchase_units[0]?.items[0]?.unit_amount.value).toBe("12.50");
  });

  it("uses a checkout price override and rejects an empty cart", () => {
    const charge = vaultChargeBody(
      "VAULT123",
      [{ ...lineItem, quantity: 1, checkoutUnitPriceCents: 50 }],
      "charge-vaulted",
    );
    expect(charge.purchase_units[0]?.amount.value).toBe("0.50");
    expect(() => vaultChargeBody("VAULT123", [], "charge-vaulted")).toThrow(/at least one line item/);
  });

  it("exchanges a setup token and does not keep the payment source on a completed charge", async () => {
    const { client, calls } = clientReturning({
      id: "VAULT123",
      customer: { id: "customer-1" },
      payment_source: { paypal: { email_address: "buyer@example.com" } },
    });

    const token = await exchangeSetupToken(client, "SETUP123", "vault:exchange:SETUP123");

    expect(token).toEqual({ id: "VAULT123", customer: { id: "customer-1" } });
    expect(calls[0]?.path).toBe("/v3/vault/payment-tokens");
    expect(JSON.stringify(token)).not.toContain("buyer@example.com");
  });

  it("records a setup fingerprint and returns only the approval URL", async () => {
    const events: { type: string; payload: Record<string, unknown> }[] = [];
    const { client } = clientReturning({
      id: "SETUP123",
      status: "PAYER_ACTION_REQUIRED",
      links: [{ href: "https://sandbox.paypal.com/agreements/approve?approval_session_id=SETUP123", rel: "approve", method: "GET" }],
    });

    const result = await beginVaultLink({
      client,
      returnUrl: "https://app.example/api/paypal/link/return",
      cancelUrl: "https://app.example/mandates?linked=0",
      requestKey: "vault:setup:1",
      appendLedger: async (event) => {
        events.push(event as { type: string; payload: Record<string, unknown> });
      },
    });

    expect(result).toEqual({
      approvalUrl: "https://sandbox.paypal.com/agreements/approve?approval_session_id=SETUP123",
    });
    expect(events[0]?.type).toBe("paypal.vault.setup_created");
    expect(events[0]?.payload.setupFingerprint).toBe(secretFingerprint("SETUP123"));
    expect(JSON.stringify(events)).not.toContain("SETUP123");
  });

  it("stores a payment method and ledgers the fingerprint", async () => {
    const events: { type: string; payload: Record<string, unknown> }[] = [];
    const { client } = clientReturning({ id: "VAULT123", customer: { id: "customer-1" } });
    const saved: { vaultId: string; customerId: string | null }[] = [];

    const result = await completeVaultLink({
      client,
      setupTokenId: "SETUP123",
      createId: () => "pm-1",
      appendLedger: async (event) => {
        events.push(event as { type: string; payload: Record<string, unknown> });
      },
      save: async (input) => {
        saved.push({ vaultId: input.vaultId, customerId: input.customerId });
        return { id: input.id };
      },
    });

    expect(saved).toEqual([{ vaultId: "VAULT123", customerId: "customer-1" }]);
    expect(result).toEqual({ paymentMethodId: "pm-1" });
    expect(events.map((event) => event.type)).toEqual([
      "paypal.vault.token_exchanged",
      "paypal.vault.payment_method_stored",
    ]);
    expect(JSON.stringify(events)).not.toContain("VAULT123");
    expect(events[1]?.payload.vaultFingerprint).toBe(secretFingerprint("VAULT123"));
  });
});
