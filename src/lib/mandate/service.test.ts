import { describe, expect, it, vi } from "vitest";

import type { GeminiGenerate } from "@/lib/gemini/client";
import type { LedgerEventInput } from "@/lib/ledger/schema";

import { MandateParseError } from "./parse";
import { createMandateFromText } from "./service";

const validDraft = {
  maxTotalCents: 5000,
  maxPerItemCents: 2000,
  allowedCategories: ["office"],
  blockedMerchants: ["blocked mart"],
  allowedMerchants: null,
  requireFreeReturns: true,
  deliverBy: "2026-10-20",
  escalateAboveCents: 3000,
};

describe("createMandateFromText", () => {
  it("records a request and a parsed mandate", async () => {
    const events: LedgerEventInput[] = [];
    const generate: GeminiGenerate = async () => JSON.stringify(validDraft);

    const mandate = await createMandateFromText("Buy paper.", {
      generate,
      model: "gemini-3.8-flash",
      now: new Date("2026-10-09T12:00:00.000Z"),
      createId: () => "11111111-1111-4111-8111-111111111111",
      appendLedger: async (event) => {
        events.push(event);
      },
      save: async () => undefined,
    });

    expect(events.map((event) => event.type)).toEqual(["mandate.parse_requested", "mandate.parsed"]);
    expect(events[0]?.mandateId).toBeNull();
    expect(events[1]?.mandateId).toBe(mandate.id);
  });

  it("records a failed parse without calling save", async () => {
    const events: LedgerEventInput[] = [];
    const save = vi.fn();
    const generate: GeminiGenerate = async () => "not-json";

    await expect(
      createMandateFromText("Buy paper.", {
        generate,
        model: "gemini-3.8-flash",
        appendLedger: async (event) => {
          events.push(event);
        },
        save,
      }),
    ).rejects.toBeInstanceOf(MandateParseError);

    expect(save).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual(["mandate.parse_requested", "mandate.parse_failed"]);
    expect(events[1]?.mandateId).toBeNull();
  });
});
