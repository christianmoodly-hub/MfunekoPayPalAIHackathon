ALTER TABLE "approvals" ADD COLUMN "ordered_at" timestamp with time zone;
ALTER TABLE "approvals" ADD COLUMN "captured_order" jsonb;
