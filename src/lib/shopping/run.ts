import { createChannel3Search, type Channel3Search } from "@/lib/channel3/client";
import { readChannel3Env } from "@/lib/channel3/env";
import type { Channel3Product, Channel3SearchResponse } from "@/lib/channel3/schema";
import { createGeminiGenerate, type GeminiGenerate } from "@/lib/gemini/client";
import { readGeminiEnv } from "@/lib/gemini/env";
import { redactSecrets } from "@/lib/gemini/redact";
import { appendLedgerEvent } from "@/lib/ledger";
import type { LedgerEventInput } from "@/lib/ledger/schema";
import { evaluatePolicy, type PolicyDecision } from "@/lib/policy";
import { mandateSchema, type Mandate, type ProposedPurchase } from "@/lib/policy/schema";

import { considerProducts, purchaseFromSelection, type ConsideredCandidate } from "./cart";
import { rankingPrompt } from "./prompt";
import { rankingJsonSchema, rankingSchema, type Ranking } from "./schema";
import { spentCentsForMandate } from "./spend";

const MAX_ATTEMPTS = 2;

type AppendLedger = (input: LedgerEventInput) => Promise<unknown>;
type LoadSpend = (mandateId: string) => Promise<number>;

export type ShoppingResult = {
  query: string;
  candidates: ConsideredCandidate[];
  selection: Ranking | null;
  purchase: ProposedPurchase;
  decision: PolicyDecision;
};

type ShoppingOptions = {
  search?: Channel3Search;
  generate?: GeminiGenerate;
  model?: string;
  appendLedger?: AppendLedger;
  loadSpend?: LoadSpend;
  now?: Date;
};

export async function runShoppingSearch(mandateInput: Mandate, query: string, options: ShoppingOptions = {}): Promise<ShoppingResult> {
  const mandate = mandateSchema.parse(mandateInput);
  const append = options.appendLedger ?? appendLedgerEvent;
  const checkedAt = (options.now ?? new Date()).toISOString();
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return finish(append, mandate, trimmedQuery, [], null, emptyPurchase(), ["Search query is required."], 0, checkedAt);
  }

  let spentCents: number;
  try {
    spentCents = await (options.loadSpend ?? spentCentsForMandate)(mandate.id);
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : "Spend could not be read.");
    return finish(append, mandate, trimmedQuery, [], null, emptyPurchase(), [message], 0, checkedAt);
  }

  let response: Channel3SearchResponse;
  try {
    response = await resolveSearch(options)(trimmedQuery);
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : "Channel3 search failed.");
    await append({
      type: "shopping.search_failed",
      mandateId: mandate.id,
      payload: { query: trimmedQuery, message },
    });
    return finish(append, mandate, trimmedQuery, [], null, emptyPurchase(), [message], spentCents, checkedAt);
  }

  const candidates = considerProducts(mandate, response.products);
  await append({
    type: "shopping.search",
    mandateId: mandate.id,
    payload: { query: trimmedQuery, productIds: response.products.map((product) => product.id) },
  });
  for (const candidate of candidates) {
    await append({
      type: "shopping.candidate",
      mandateId: mandate.id,
      payload: candidatePayload(candidate),
    });
  }

  const eligibleProducts = response.products.filter((product) =>
    candidates.some((candidate) => candidate.productId === product.id && candidate.eligible),
  );
  if (eligibleProducts.length === 0) {
    return finish(
      append,
      mandate,
      trimmedQuery,
      candidates,
      null,
      emptyPurchase(),
      ["No search result had a usable offer."],
      spentCents,
      checkedAt,
    );
  }

  const ranked = await rank(mandate, eligibleProducts, options);
  await append({
    type: "shopping.reasoning",
    mandateId: mandate.id,
    payload: ranked.selection
      ? {
          accepted: true,
          productId: ranked.selection.productId,
          quantity: ranked.selection.quantity,
          reasoning: ranked.selection.reasoning,
        }
      : { accepted: false, message: ranked.problem },
  });

  if (!ranked.selection) {
    return finish(append, mandate, trimmedQuery, candidates, null, emptyPurchase(), [ranked.problem], spentCents, checkedAt);
  }

  const purchase = purchaseFromSelection(mandate, response.products, ranked.selection);
  if (!purchase) {
    return finish(
      append,
      mandate,
      trimmedQuery,
      candidates,
      ranked.selection,
      emptyPurchase(),
      ["The selected product had no usable offer."],
      spentCents,
      checkedAt,
    );
  }

  const decision = evaluatePolicy({
    mandate,
    purchase,
    spend: { spentCents },
    checkedAt,
  });
  await append({
    type: "shopping.verdict",
    mandateId: mandate.id,
    payload: { verdict: decision.verdict, reasons: decision.reasons, statedTotalCents: purchase.statedTotalCents },
  });

  return { query: trimmedQuery, candidates, selection: ranked.selection, purchase, decision };
}

async function rank(
  mandate: Mandate,
  products: Channel3Product[],
  options: ShoppingOptions,
): Promise<{ selection: Ranking | null; problem: string }> {
  const { systemInstruction, prompt } = rankingPrompt(mandate, products);
  const ids = new Set(products.map((product) => product.id));
  const generate = options.generate ?? createGeminiGenerate(readGeminiEnv().apiKey);
  const model = options.model ?? readGeminiEnv().model;
  let problem = "Gemini output was invalid.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let raw: string;
    try {
      raw = await generate({
        model,
        systemInstruction,
        prompt,
        responseSchema: rankingJsonSchema(),
      });
    } catch (error) {
      return {
        selection: null,
        problem: redactSecrets(error instanceof Error ? error.message : "Gemini request failed."),
      };
    }

    const parsed = parseRanking(raw);
    if (parsed.ok && ids.has(parsed.value.productId)) {
      return { selection: parsed.value, problem: "" };
    }
    problem = parsed.ok
      ? `Product ${parsed.value.productId} was not in the search results.`
      : parsed.problem;
  }

  return { selection: null, problem: `${problem} Failed after ${MAX_ATTEMPTS} attempts.` };
}

function parseRanking(raw: string): { ok: true; value: Ranking } | { ok: false; problem: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, problem: "Gemini output was not valid JSON." };
  }

  const result = rankingSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, problem: "Gemini output did not match the ranking schema." };
  }

  return { ok: true, value: result.data };
}

function resolveSearch(options: ShoppingOptions): Channel3Search {
  return options.search ?? createChannel3Search(readChannel3Env().apiKey);
}

async function finish(
  append: AppendLedger,
  mandate: Mandate,
  query: string,
  candidates: ConsideredCandidate[],
  selection: Ranking | null,
  purchase: ProposedPurchase,
  reasons: string[],
  spentCents: number,
  checkedAt: string,
): Promise<ShoppingResult> {
  const decision = blocked(reasons, mandate, purchase, spentCents, checkedAt);
  await append({
    type: "shopping.verdict",
    mandateId: mandate.id,
    payload: { verdict: decision.verdict, reasons: decision.reasons, statedTotalCents: purchase.statedTotalCents },
  });
  return { query, candidates, selection, purchase, decision };
}

function blocked(
  reasons: string[],
  mandate: Mandate,
  purchase: ProposedPurchase,
  spentCents: number,
  checkedAt: string,
): PolicyDecision {
  const decision = evaluatePolicy({ mandate, purchase, spend: { spentCents }, checkedAt });
  const extra = decision.reasons.filter((reason) => !reasons.includes(reason));
  return { verdict: "BLOCK", reasons: [...reasons, ...extra] };
}

function emptyPurchase(): ProposedPurchase {
  return { lineItems: [], statedTotalCents: 0 };
}

function candidatePayload(candidate: ConsideredCandidate): Record<string, unknown> {
  return {
    productId: candidate.productId,
    title: candidate.title,
    domain: candidate.domain,
    category: candidate.category,
    unitPriceCents: candidate.unitPriceCents,
    currency: candidate.currency,
    freeReturns: candidate.freeReturns,
    deliveryDate: candidate.deliveryDate,
    eligible: candidate.eligible,
  };
}
