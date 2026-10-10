import { z } from "zod";

// Search response shape from the OpenAPI schema on
// https://docs.trychannel3.com/api-reference/v1/search
// Checked 2026-10-10. Product text is untrusted data.

const finiteNumber = z.number().finite();

export const channel3PriceSchema = z.object({
  price: finiteNumber.nonnegative(),
  compare_at_price: finiteNumber.nonnegative().nullable().optional(),
  currency: z.string().trim().min(1),
});

export const channel3OfferSchema = z.object({
  url: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  price: channel3PriceSchema,
  availability: z.enum(["InStock", "OutOfStock"]),
  condition: z.enum(["new", "used"]).nullable().optional(),
});

export const channel3CategorySchema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  has_children: z.boolean(),
});

export const channel3ProductSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string(),
  description: z.string().nullable().optional(),
  brands: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .optional(),
  category: channel3CategorySchema.nullable().optional(),
  offers: z.array(channel3OfferSchema).optional(),
});

export const channel3SearchResponseSchema = z.object({
  products: z.array(channel3ProductSchema),
  next_page_token: z.string().nullable().optional(),
});

export type Channel3Product = z.infer<typeof channel3ProductSchema>;
export type Channel3Offer = z.infer<typeof channel3OfferSchema>;
export type Channel3SearchResponse = z.infer<typeof channel3SearchResponseSchema>;
