CREATE TABLE "mandates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"max_total_cents" integer NOT NULL,
	"max_per_item_cents" integer NOT NULL,
	"allowed_categories" jsonb,
	"blocked_merchants" jsonb NOT NULL,
	"allowed_merchants" jsonb,
	"require_free_returns" boolean NOT NULL,
	"deliver_by" text,
	"escalate_above_cents" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
