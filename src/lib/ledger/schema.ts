import { z } from "zod";

export const ledgerEventInputSchema = z.object({
  type: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()),
  mandateId: z.string().trim().min(1).nullable().optional(),
});

export type LedgerEventInput = z.infer<typeof ledgerEventInputSchema>;
