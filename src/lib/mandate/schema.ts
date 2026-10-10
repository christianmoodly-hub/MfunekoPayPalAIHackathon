import { z } from "zod";

import { mandateSchema, mandateStatusSchema } from "@/lib/policy/schema";

export const draftMandateSchema = mandateSchema.omit({
  id: true,
  description: true,
  status: true,
  expiresAt: true,
});

export const mandateEditsSchema = draftMandateSchema
  .extend({
    description: z.string().trim().min(1),
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
  const schema = draftMandateSchema.toJSONSchema() as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
