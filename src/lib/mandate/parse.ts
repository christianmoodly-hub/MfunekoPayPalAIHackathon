import { redactSecrets } from "@/lib/gemini/redact";
import type { GeminiGenerate } from "@/lib/gemini/client";
import { readChannel3Env } from "@/lib/channel3/env";
import { retainKnownCategories, searchCategorySlugs } from "@/lib/channel3/categories";
import type { Mandate } from "@/lib/policy/schema";

import { finalizeMandateDraft } from "./defaults";
import { mandatePrompt } from "./prompt";
import { draftMandateJsonSchema, mandateSchema, modelDraftSchema } from "./schema";

const DEFAULT_MANDATE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 2;

export class MandateParseError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = "MandateParseError";
    this.statusCode = statusCode;
  }
}

export function defaultExpiresAt(now: Date): string {
  return new Date(now.getTime() + DEFAULT_MANDATE_MS).toISOString();
}

export async function parseMandate(
  text: string,
  options: {
    generate: GeminiGenerate;
    model: string;
    now?: Date;
    createId?: () => string;
    categorySlugs?: readonly string[];
    loadCategorySlugs?: (text: string) => Promise<readonly string[]>;
  },
): Promise<Mandate> {
  if (!text.trim()) {
    throw new MandateParseError("Mandate text is required.", 400);
  }

  const categorySlugs = options.categorySlugs ?? (await resolveCategorySlugs(text, options.loadCategorySlugs));
  const { systemInstruction, prompt } = mandatePrompt(text, categorySlugs);
  const responseSchema = draftMandateJsonSchema();
  let lastProblem = "Gemini output was invalid.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let raw: string;
    try {
      raw = await options.generate({
        model: options.model,
        systemInstruction,
        prompt,
        responseSchema,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini request failed.";
      throw new MandateParseError(redactSecrets(message));
    }

    const parsed = parseDraft(raw);
    if (parsed.ok) {
      const finalized = finalizeMandateDraft(parsed.value);
      return mandateSchema.parse({
        ...finalized,
        id: options.createId?.() ?? crypto.randomUUID(),
        description: text,
        status: "draft",
        expiresAt: defaultExpiresAt(options.now ?? new Date()),
        allowedMerchants: finalized.allowedMerchants ?? null,
        allowedCategories: retainKnownCategories(finalized.allowedCategories, categorySlugs),
        deliverBy: finalized.deliverBy ?? null,
      });
    }

    lastProblem = parsed.problem;
  }

  throw new MandateParseError(`${lastProblem} Failed after ${MAX_ATTEMPTS} attempts.`);
}

function parseDraft(raw: string): { ok: true; value: ReturnType<typeof modelDraftSchema.parse> } | { ok: false; problem: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, problem: "Gemini output was not valid JSON." };
  }

  const result = modelDraftSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, problem: "Gemini output did not match the mandate schema." };
  }

  return { ok: true, value: result.data };
}

async function resolveCategorySlugs(
  text: string,
  load: ((text: string) => Promise<readonly string[]>) | undefined,
): Promise<readonly string[]> {
  if (load) {
    return load(text);
  }
  return searchCategorySlugs(text, readChannel3Env());
}
