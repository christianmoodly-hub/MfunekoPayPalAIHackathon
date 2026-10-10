import { retainKnownCategories, searchCategorySlugs } from "@/lib/channel3/categories";
import { readChannel3Env } from "@/lib/channel3/env";
import type { GeminiGenerate } from "@/lib/gemini/client";
import { redactSecrets } from "@/lib/gemini/redact";
import { appendLedgerEvent } from "@/lib/ledger";
import type { LedgerEventInput } from "@/lib/ledger/schema";
import type { Mandate } from "@/lib/policy/schema";

import { MandateParseError, parseMandate } from "./parse";
import { mandateEditsSchema } from "./schema";
import { confirmMandate, insertMandate, MandateStoreError } from "./store";

type AppendLedger = (input: LedgerEventInput) => Promise<unknown>;

export async function createMandateFromText(
  text: string,
  options: {
    generate: GeminiGenerate;
    model: string;
    now?: Date;
    createId?: () => string;
    categorySlugs?: readonly string[];
    appendLedger?: AppendLedger;
    save?: (mandate: Mandate) => Promise<void>;
  },
): Promise<Mandate> {
  const append = options.appendLedger ?? appendLedgerEvent;
  const save = options.save ?? insertMandate;

  await append({
    type: "mandate.parse_requested",
    mandateId: null,
    payload: { characterCount: text.length },
  });

  try {
    const mandate = await parseMandate(text, options);
    await save(mandate);
    await append({
      type: "mandate.parsed",
      mandateId: mandate.id,
      payload: { mandate },
    });
    return mandate;
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : "Could not parse the mandate.");
    await append({
      type: "mandate.parse_failed",
      mandateId: null,
      payload: { message },
    }).catch(() => undefined);
    if (error instanceof MandateParseError || error instanceof MandateStoreError) {
      throw error;
    }
    throw new MandateParseError(message);
  }
}

export async function confirmSavedMandate(
  id: string,
  edits: unknown,
  append: AppendLedger = appendLedgerEvent,
): Promise<Mandate> {
  const parsed = mandateEditsSchema.safeParse(edits);
  if (!parsed.success) {
    throw new MandateStoreError("Confirmation fields are invalid.", 400);
  }

  const allowedCategories = parsed.data.allowedCategories
    ? retainKnownCategories(
        parsed.data.allowedCategories,
        await searchCategorySlugs(parsed.data.description, readChannel3Env()),
      )
    : parsed.data.allowedCategories;
  const mandate = await confirmMandate(id, { ...parsed.data, allowedCategories });
  await append({
    type: "mandate.confirmed",
    mandateId: mandate.id,
    payload: { mandate },
  });
  return mandate;
}
