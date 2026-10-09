import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const ledgerEvents = pgTable("ledger_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  mandateId: text("mandate_id"),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
