CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"paypal_vault_id" text NOT NULL,
	"paypal_customer_id" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_paypal_vault_id_unique" UNIQUE("paypal_vault_id")
);
