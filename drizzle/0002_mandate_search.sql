ALTER TABLE "mandates" ADD COLUMN "search_query" text DEFAULT '' NOT NULL;
ALTER TABLE "mandates" ADD COLUMN "needs_input" jsonb DEFAULT '[]'::jsonb NOT NULL;
