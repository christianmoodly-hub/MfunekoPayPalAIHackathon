import { z } from "zod";

export const rankingSchema = z
  .object({
    productId: z.string().trim().min(1),
    quantity: z.number().int().positive(),
    reasoning: z.string(),
  })
  .strict();

export type Ranking = z.infer<typeof rankingSchema>;

export function rankingJsonSchema(): Record<string, unknown> {
  const schema = rankingSchema.toJSONSchema() as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
