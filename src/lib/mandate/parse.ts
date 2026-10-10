import { redactSecrets } from "@/lib/gemini/redact";
import type { GeminiGenerate } from "@/lib/gemini/client";
import type { Mandate } from "@/lib/policy/schema";

import { mandatePrompt } from "./prompt";
import { draftMandateJsonSchema, draftMandateSchema, mandateSchema } from "./schema";

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
  },
): Promise<Mandate> {
  if (!text.trim()) {
    throw new MandateParseError("Mandate text is required.", 400);
  }

  const { systemInstruction, prompt } = mandatePrompt(text);
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
      return mandateSchema.parse({
        ...parsed.value,
        id: options.createId?.() ?? crypto.randomUUID(),
        description: text,
        status: "draft",
        expiresAt: defaultExpiresAt(options.now ?? new Date()),
        allowedMerchants: parsed.value.allowedMerchants ?? null,
        deliverBy: parsed.value.deliverBy ?? null,
      });
    }

    lastProblem = parsed.problem;
  }

  throw new MandateParseError(`${lastProblem} Failed after ${MAX_ATTEMPTS} attempts.`);
}

function parseDraft(raw: string): { ok: true; value: ReturnType<typeof draftMandateSchema.parse> } | { ok: false; problem: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, problem: "Gemini output was not valid JSON." };
  }

  const result = draftMandateSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, problem: "Gemini output did not match the mandate schema." };
  }

  return { ok: true, value: result.data };
}
