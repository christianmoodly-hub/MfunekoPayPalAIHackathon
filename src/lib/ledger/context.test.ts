import { describe, expect, it, vi } from "vitest";

const inserted = vi.hoisted((): { values: Record<string, unknown> | null } => ({ values: null }));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.values = values;
        return {
          returning: async () => [{ id: "event-1", ...values }],
        };
      },
    }),
  }),
}));

import { appendLedgerEvent } from "./index";
import { currentRunId, runWithRunId } from "./context";

const runId = "33333333-3333-4333-8333-333333333333";

describe("run ledger context", () => {
  it("stamps ledger rows written inside a run", async () => {
    inserted.values = null;
    await runWithRunId(runId, async () => {
      expect(currentRunId()).toBe(runId);
      await appendLedgerEvent({
        type: "checkout.blocked",
        mandateId: "mandate-1",
        payload: { reasons: ["no"] },
      });
    });

    expect((inserted.values as { runId?: string | null } | null)?.runId).toBe(runId);
    expect(currentRunId()).toBeNull();
  });

  it("leaves the run id empty outside a run", async () => {
    inserted.values = null;
    await appendLedgerEvent({
      type: "checkout.blocked",
      mandateId: "mandate-1",
      payload: { reasons: ["no"] },
    });
    expect((inserted.values as { runId?: string | null } | null)?.runId).toBeNull();
  });
});
