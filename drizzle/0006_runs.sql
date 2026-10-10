ALTER TABLE "ledger_events" ADD COLUMN "run_id" uuid;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "run_id" uuid;
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mandate_id" text NOT NULL,
	"status" text NOT NULL,
	"outcome" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
