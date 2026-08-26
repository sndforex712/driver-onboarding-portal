ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "operational_owner_id" integer;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "operational_owner_name" text;