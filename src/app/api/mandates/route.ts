import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { listMandateBalances } from "@/lib/mandates/balances";
import { mandateSchema } from "@/lib/policy/schema";

const balanceSchema = mandateSchema.extend({
  spentCents: z.number().int().nonnegative(),
  heldCents: z.number().int().nonnegative(),
  remainingCents: z.number().int(),
});

export async function GET(request: Request) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const mandates = (await listMandateBalances()).map((mandate) => balanceSchema.parse(mandate));
  return Response.json({ mandates });
}
