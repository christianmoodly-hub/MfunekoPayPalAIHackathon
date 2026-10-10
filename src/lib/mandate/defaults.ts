import { normalizeMerchant } from "@/lib/policy/merchants";
import { mandateSchema, type Mandate } from "@/lib/policy/schema";

import type { MandateEdits } from "./schema";

export function finalizeMandateDraft<T extends MandateNumbers>(draft: T): T & MandateNumbers {
  const needsInput = uniqueNeeds(draft.needsInput);
  const needsBudget = needsInput.includes("budget");
  const maxTotalCents = needsBudget ? 0 : draft.maxTotalCents;
  const maxPerItemCents = needsBudget ? 0 : draft.maxPerItemCents;
  const escalateAboveCents = needsBudget
    ? 0
    : draft.escalateAboveCents === null
      ? Math.floor(maxTotalCents / 2)
      : draft.escalateAboveCents;
  const allowedMerchants = draft.allowedMerchants === null || draft.allowedMerchants === undefined
    ? draft.allowedMerchants
    : domains(draft.allowedMerchants);

  return {
    ...draft,
    searchQuery: draft.searchQuery.trim(),
    needsInput,
    maxTotalCents,
    maxPerItemCents,
    escalateAboveCents,
    blockedMerchants: domains(draft.blockedMerchants),
    allowedMerchants,
  };
}

type MandateNumbers = {
  searchQuery: string;
  needsInput: string[];
  maxTotalCents: number;
  maxPerItemCents: number;
  escalateAboveCents: number | null;
  blockedMerchants: string[];
  allowedMerchants?: string[] | null;
};

export function applyMandateConfirmation(existing: Mandate, edits: MandateEdits): Mandate {
  const allowedMerchants = edits.allowedMerchants == null ? null : domains(edits.allowedMerchants);
  return mandateSchema.parse({
    ...existing,
    ...edits,
    id: existing.id,
    status: "active",
    expiresAt: existing.expiresAt,
    blockedMerchants: domains(edits.blockedMerchants),
    allowedMerchants: allowedMerchants === null || allowedMerchants.length === 0 ? null : allowedMerchants,
    needsInput: existing.needsInput.filter((need) => need !== "budget"),
    searchQuery: edits.searchQuery.trim(),
  });
}

function uniqueNeeds(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const need = value.trim().toLowerCase();
    if (!need || seen.has(need)) {
      continue;
    }
    seen.add(need);
    result.push(need);
  }
  return result;
}

function domains(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const domain = normalizeMerchant(value);
    if (!domain || seen.has(domain)) {
      continue;
    }
    seen.add(domain);
    result.push(domain);
  }
  return result;
}
