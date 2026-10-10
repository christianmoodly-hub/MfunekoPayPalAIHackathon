import { z } from "zod";

import { mandateSchema, mandateStatusSchema } from "@/lib/policy/schema";

export const draftMandateSchema = mandateSchema.omit({
  id: true,
  description: true,
  status: true,
  expiresAt: true,
});

export const modelDraftSchema = draftMandateSchema.extend({
  escalateAboveCents: z.number().int().nonnegative().nullable(),
});

export const mandateEditsSchema = draftMandateSchema
  .omit({ needsInput: true })
  .extend({
    description: z.string().trim().min(1),
    searchQuery: z.string().trim().min(1),
    maxTotalCents: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.escalateAboveCents > value.maxTotalCents) {
      ctx.addIssue({
        code: "custom",
        message: "escalateAboveCents cannot exceed maxTotalCents.",
        path: ["escalateAboveCents"],
      });
    }
  });

export const parseRequestSchema = z.object({
  text: z.string(),
});

export { mandateSchema, mandateStatusSchema };

export type DraftMandate = z.infer<typeof draftMandateSchema>;
export type MandateEdits = z.infer<typeof mandateEditsSchema>;

export function draftMandateJsonSchema(): Record<string, unknown> {
  const schema = modelDraftSchema.toJSONSchema() as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
