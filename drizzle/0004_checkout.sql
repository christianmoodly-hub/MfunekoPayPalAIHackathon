CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mandate_id" text NOT NULL,
	"purchase" jsonb NOT NULL,
	"product_ids" jsonb NOT NULL,
	"reasons" jsonb NOT NULL,
	"status" text NOT NULL,
	"order_id" text,
	"reservation_id" text,
	"expected_cents" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
