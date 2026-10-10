import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { ledgerEvents, runs } from "@/db/schema";
import { readChannel3Env } from "@/lib/channel3/env";
import { runGuardedCheckout } from "@/lib/checkout/live";
import { createGeminiGenerate } from "@/lib/gemini/client";
import { readGeminiEnv } from "@/lib/gemini/env";
import { redactSecrets } from "@/lib/gemini/redact";
import { runWithRunId } from "@/lib/ledger/context";
import { MandateStoreError, getMandate } from "@/lib/mandate/store";
import { shopQuery } from "@/lib/shopping/query";
import { runShoppingSearch } from "@/lib/shopping/run";

const runStatusSchema = z.enum(["running", "completed", "failed"]);

const eventSchema = z.object({
  id: z.string(),
  mandateId: z.string().nullable(),
  runId: z.string().nullable(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

const runSchema = z.object({
  id: z.string().uuid(),
  mandateId: z.string(),
  status: runStatusSchema,
  outcome: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RunView = z.infer<typeof runSchema>;
export type RunEventView = z.infer<typeof eventSchema>;

export async function createRun(mandateId: string): Promise<RunView> {
  const mandate = await getMandate(mandateId);
  if (!mandate) {
    throw new MandateStoreError("Mandate was not found.", 404);
  }
  if (mandate.status !== "active") {
    throw new MandateStoreError("Mandate is not active.", 409);
  }

  const [row] = await getDb()
    .insert(runs)
    .values({
      id: crypto.randomUUID(),
      mandateId,
      status: "running",
      outcome: null,
      error: null,
    })
    .returning();

  if (!row) {
    throw new Error("Run was not stored.");
  }
  return toRun(row);
}

export async function executeRun(id: string): Promise<void> {
  const [run] = await getDb().select().from(runs).where(eq(runs.id, id)).limit(1);
  if (!run || run.status !== "running") {
    return;
  }

  try {
    const outcome = await runWithRunId(id, () => shopAndCheckout(run.mandateId));
    await getDb()
      .update(runs)
      .set({
        status: "completed",
        outcome: outcome as Record<string, unknown>,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(runs.id, id));
  } catch (error) {
    const message = error instanceof Error ? redactSecrets(error.message) : "The run failed.";
    await getDb()
      .update(runs)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(runs.id, id));
  }
}

export async function getRun(id: string): Promise<(RunView & { events: RunEventView[] }) | null> {
  const [row] = await getDb().select().from(runs).where(eq(runs.id, id)).limit(1);
  if (!row) {
    return null;
  }
  const events = await getDb()
    .select({
      id: ledgerEvents.id,
      mandateId: ledgerEvents.mandateId,
      runId: ledgerEvents.runId,
      type: ledgerEvents.type,
      payload: ledgerEvents.payload,
      createdAt: ledgerEvents.createdAt,
    })
    .from(ledgerEvents)
    .where(eq(ledgerEvents.runId, id))
    .orderBy(desc(ledgerEvents.createdAt));

  return {
    ...toRun(row),
    events: events.map((event) =>
      eventSchema.parse({
        id: event.id,
        mandateId: event.mandateId,
        runId: event.runId,
        type: event.type,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
      }),
    ),
  };
}

async function shopAndCheckout(mandateId: string) {
  const mandate = await getMandate(mandateId);
  if (!mandate) {
    throw new Error("Mandate was not found.");
  }
  const query = shopQuery(mandate.searchQuery, "");
  if (!query) {
    throw new Error("The mandate has no search query.");
  }
  readChannel3Env();
  const { apiKey, model } = readGeminiEnv();
  const shopped = await runShoppingSearch(mandate, query, {
    generate: createGeminiGenerate(apiKey),
    model,
  });
  const line = shopped.purchase.lineItems[0];
  const shopping = shopped.decision;
  if (!shopped.selection || !line) {
    return { shopping, selection: shopped.selection, checkout: null };
  }

  const checkout = await runGuardedCheckout(mandateId, {
    productId: shopped.selection.productId,
    quantity: shopped.selection.quantity,
    merchant: line.merchant,
    category: line.category,
    unitPriceCents: line.unitPriceCents,
    freeReturns: line.freeReturns,
    deliveryDate: line.deliveryDate,
  });
  return { shopping, checkout };
}

function toRun(row: typeof runs.$inferSelect): RunView {
  return runSchema.parse({
    id: row.id,
    mandateId: row.mandateId,
    status: row.status,
    outcome: row.outcome ?? null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
