import { describe, expect, it } from "vitest";

import type { LineItem } from "@/lib/policy/schema";
import type { PayPalClient } from "@/lib/paypal/client";
import { secretFingerprint } from "@/lib/paypal/fingerprint";
import { chargeVaulted } from "@/lib/paypal/vault";

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

describe("chargeVaulted", () => {
  it("charges a vaulted wallet and fingerprints the id without echoing it", async () => {
    const vaultId = "VAULT-SECRET";
    const { client, calls } = clientReturning({
      id: "ORDER1",
      status: "COMPLETED",
      payment_source: { paypal: { vault_id: vaultId } },
      purchase_units: [
        {
          amount: { currency_code: "USD", value: "25.00" },
          payments: { captures: [{ id: "CAP1", status: "COMPLETED" }] },
        },
      ],
    });

    const order = await chargeVaulted(client, vaultId, [lineItem], "charge-vaulted:key");

    expect(calls[0]?.path).toBe("/v2/checkout/orders");
    expect(calls).toHaveLength(1);
    expect(order.id).toBe("ORDER1");
    expect(JSON.stringify(order)).not.toContain(vaultId);
    expect(secretFingerprint(vaultId)).toHaveLength(12);
    expect(secretFingerprint(vaultId)).not.toContain(vaultId);
  });

  it("captures when the vaulted create stops at APPROVED", async () => {
    const { client, calls } = clientReturning(
      { id: "ORDER2", status: "APPROVED" },
      {
        id: "ORDER2",
        status: "COMPLETED",
        purchase_units: [{ payments: { captures: [{ id: "CAP2", status: "COMPLETED" }] } }],
      },
    );

    const order = await chargeVaulted(client, "VAULT123", [lineItem], "charge-vaulted:key");

    expect(calls.map((call) => call.path)).toEqual(["/v2/checkout/orders", "/v2/checkout/orders/ORDER2/capture"]);
    expect(order.status).toBe("COMPLETED");
  });
});
