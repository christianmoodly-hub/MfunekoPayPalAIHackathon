import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const ledgerEvents = pgTable("ledger_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  mandateId: text("mandate_id"),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mandates = pgTable("mandates", {
  id: uuid("id").primaryKey(),
  description: text("description").notNull(),
  maxTotalCents: integer("max_total_cents").notNull(),
  maxPerItemCents: integer("max_per_item_cents").notNull(),
  allowedCategories: jsonb("allowed_categories").$type<string[] | null>(),
  blockedMerchants: jsonb("blocked_merchants").$type<string[]>().notNull(),
  allowedMerchants: jsonb("allowed_merchants").$type<string[] | null>(),
  requireFreeReturns: boolean("require_free_returns").notNull(),
  deliverBy: text("deliver_by"),
  escalateAboveCents: integer("escalate_above_cents").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  searchQuery: text("search_query").notNull().default(""),
  needsInput: jsonb("needs_input").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey(),
  paypalVaultId: text("paypal_vault_id").notNull().unique(),
  paypalCustomerId: text("paypal_customer_id"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
