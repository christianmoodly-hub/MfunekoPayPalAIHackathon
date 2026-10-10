import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("confirm rejection tests must not touch the database");
  },
}));

vi.mock("@/lib/ledger", () => ({
  appendLedgerEvent: async () => {
    throw new Error("confirm rejection tests must not write the ledger");
  },
}));

import { mandateEditsSchema } from "@/lib/mandate/schema";

import { POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";

const validEdits = {
  description: "Buy paper.",
  maxTotalCents: 5000,
  maxPerItemCents: 2000,
  allowedCategories: ["office"],
  blockedMerchants: [],
  allowedMerchants: null,
  requireFreeReturns: true,
  deliverBy: "2026-10-20",
  escalateAboveCents: 3000,
};

async function confirm(body: unknown) {
  const request = new NextRequest(`http://localhost/api/mandates/${id}/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

async function expectRejected(body: unknown) {
  const response = await confirm(body);
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Confirmation fields are invalid." });
}

describe("POST /api/mandates/[id]/confirm", () => {
  it("accepts the editable fields", () => {
    expect(mandateEditsSchema.safeParse(validEdits).success).toBe(true);
  });

  it("rejects an edit to id, status, or expiresAt", async () => {
    await expectRejected({ ...validEdits, id: "other-id" });
    await expectRejected({ ...validEdits, id });
    await expectRejected({ ...validEdits, status: "exhausted" });
    await expectRejected({ ...validEdits, status: "active" });
    await expectRejected({ ...validEdits, expiresAt: "2099-01-01T00:00:00.000Z" });
  });

  it("rejects invalid caps", async () => {
    await expectRejected({ ...validEdits, maxTotalCents: -1 });
    await expectRejected({ ...validEdits, maxPerItemCents: 10.5 });
    await expectRejected({ ...validEdits, escalateAboveCents: 1.5 });
    await expectRejected({ ...validEdits, maxTotalCents: 5000, escalateAboveCents: 5001 });
  });
});
