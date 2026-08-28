ALTER TABLE "driver_documents" ADD COLUMN "uploaded_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "uploaded_by_name" text;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "reviewed_by_name" text;--> statement-breakpoint
ALTER TABLE "twenty_step_advancement_attempts" ADD COLUMN "actor_user_id" integer;--> statement-breakpoint
ALTER TABLE "twenty_step_advancement_attempts" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "twenty_step_advancement_attempts" ADD COLUMN "actor_role" text;