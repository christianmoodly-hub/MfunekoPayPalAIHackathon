import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { mandateBalance } from "@/lib/mandates/balances";
import { mandateSchema } from "@/lib/policy/schema";

const balanceSchema = mandateSchema.extend({
  spentCents: z.number().int().nonnegative(),
  heldCents: z.number().int().nonnegative(),
  remainingCents: z.number().int(),
});

export async function GET(request: Request, context: RouteContext<"/api/mandates/[id]">) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Mandate id is invalid." }, { status: 400 });
  }

  const mandate = await mandateBalance(id);
  if (!mandate) {
    return Response.json({ error: "Mandate was not found." }, { status: 404 });
  }
  return Response.json({ mandate: balanceSchema.parse(mandate) });
}
