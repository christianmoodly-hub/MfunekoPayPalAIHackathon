import { z } from "zod";

const cents = z.number().int().nonnegative();
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);

export const mandateStatusSchema = z.enum(["draft", "active", "exhausted", "expired"]);

export const mandateSchema = z.object({
  id: z.string().trim().min(1),
  description: z.string(),
  maxTotalCents: cents,
  maxPerItemCents: cents,
  allowedCategories: z.array(z.string().trim().min(1)).nullable(),
  blockedMerchants: z.array(z.string().trim().min(1)),
  allowedMerchants: z.array(z.string().trim().min(1)).nullable().optional(),
  requireFreeReturns: z.boolean(),
  deliverBy: calendarDate.nullable().optional(),
  escalateAboveCents: cents,
  expiresAt: timestamp,
  status: mandateStatusSchema,
  searchQuery: z.string(),
  needsInput: z.array(z.string().trim().min(1)),
});

export const lineItemSchema = z.object({
  merchant: z.string().trim().min(1),
  category: z.string().trim().min(1).nullable(),
  unitPriceCents: cents,
  quantity: z.number().int().positive(),
  freeReturns: z.boolean().nullable(),
  deliveryDate: z.string().nullable(),
  checkoutUnitPriceCents: cents.optional(),
});

export const proposedPurchaseSchema = z.object({
  lineItems: z.array(lineItemSchema),
  statedTotalCents: z.number().int(),
});

export const spendHistorySchema = z.object({
  spentCents: cents,
});

export type Mandate = z.infer<typeof mandateSchema>;
export type LineItem = z.infer<typeof lineItemSchema>;
export type ProposedPurchase = z.infer<typeof proposedPurchaseSchema>;
export type SpendHistory = z.infer<typeof spendHistorySchema>;
