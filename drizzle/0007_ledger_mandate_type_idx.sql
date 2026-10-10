CREATE INDEX "ledger_events_mandate_type_idx" ON "ledger_events" USING btree ("mandate_id", "type");
