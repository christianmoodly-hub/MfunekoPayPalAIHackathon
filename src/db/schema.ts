import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const ledgerEvents = pgTable("ledger_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  mandateId: text("mandate_id"),
  runId: uuid("run_id"),
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

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey(),
  mandateId: text("mandate_id").notNull(),
  purchase: jsonb("purchase").$type<Record<string, unknown>>().notNull(),
  productIds: jsonb("product_ids").$type<string[]>().notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull(),
  status: text("status").notNull(),
  orderId: text("order_id"),
  reservationId: text("reservation_id"),
  runId: uuid("run_id"),
  expectedCents: integer("expected_cents").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  orderedAt: timestamp("ordered_at", { withTimezone: true }),
  capturedOrder: jsonb("captured_order").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey(),
  mandateId: text("mandate_id").notNull(),
  status: text("status").notNull(),
  outcome: jsonb("outcome").$type<Record<string, unknown> | null>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
