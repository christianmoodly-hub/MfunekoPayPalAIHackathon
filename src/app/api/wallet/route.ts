import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { walletStatusFromDatabase } from "@/lib/mandates/balances";

const walletSchema = z.object({
  linked: z.boolean(),
  fingerprint: z.string().nullable(),
});

export async function GET(request: Request) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  return Response.json(walletSchema.parse(await walletStatusFromDatabase()));
}
