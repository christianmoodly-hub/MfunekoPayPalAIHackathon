import { remainingCents, spendBreakdown } from "@/lib/checkout/accounting";
import { loadMandateSpendEvents } from "@/lib/checkout/run";
import { getMandate, listMandates } from "@/lib/mandate/store";
import type { Mandate } from "@/lib/policy/schema";

export type MandateBalance = Mandate & {
  spentCents: number;
  heldCents: number;
  remainingCents: number;
};

export async function listMandateBalances(): Promise<MandateBalance[]> {
  const mandates = await listMandates();
  const views: MandateBalance[] = [];
  for (const mandate of mandates) {
    views.push(await balanceFor(mandate));
  }
  return views;
}

export async function mandateBalance(id: string): Promise<MandateBalance | null> {
  const mandate = await getMandate(id);
  if (!mandate) {
    return null;
  }
  return balanceFor(mandate);
}

async function balanceFor(mandate: Mandate): Promise<MandateBalance> {
  const events = await loadMandateSpendEvents(mandate.id);
  const { spentCents, heldCents } = spendBreakdown(events, mandate.id);
  return {
    ...mandate,
    spentCents,
    heldCents,
    remainingCents: remainingCents(mandate.maxTotalCents, spentCents, heldCents),
  };
}
