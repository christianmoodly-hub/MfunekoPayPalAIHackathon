import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { secretFingerprint } from "@/lib/paypal/fingerprint";
import { latestActivePaymentMethod } from "@/lib/paypal/payment-methods";

const walletSchema = z.object({
  linked: z.boolean(),
  fingerprint: z.string().nullable(),
});

export async function GET(request: Request) {
  const denied = await requireSession(request);
  if (denied) {
    return denied;
  }

  const saved = await latestActivePaymentMethod();
  if (!saved) {
    return Response.json(walletSchema.parse({ linked: false, fingerprint: null }));
  }
  return Response.json(walletSchema.parse({ linked: true, fingerprint: secretFingerprint(saved.vaultId) }));
}
