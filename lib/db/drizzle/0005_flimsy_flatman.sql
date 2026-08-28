CREATE TABLE "twenty_document_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"step_key" text NOT NULL,
	"requirement_key" text NOT NULL,
	"label" text NOT NULL,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"allows_manual_completion" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "twenty_step_advancement_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"candidate_id" text NOT NULL,
	"from_step_key" text NOT NULL,
	"to_step_key" text,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"error_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_documents" ALTER COLUMN "driver_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "twenty_candidate_id" text;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "step_key" text;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "requirement_key" text;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD COLUMN "reviewed_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "twenty_document_requirements" ADD CONSTRAINT "twenty_document_requirements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twenty_step_advancement_attempts" ADD CONSTRAINT "twenty_step_advancement_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "twenty_document_requirements_workspace_step_requirement_uidx" ON "twenty_document_requirements" USING btree ("workspace_id","step_key","requirement_key");--> statement-breakpoint
CREATE INDEX "twenty_document_requirements_workspace_step_idx" ON "twenty_document_requirements" USING btree ("workspace_id","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "twenty_step_advancement_attempts_transition_uidx" ON "twenty_step_advancement_attempts" USING btree ("workspace_id","candidate_id","from_step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "twenty_step_advancement_attempts_idempotency_uidx" ON "twenty_step_advancement_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "driver_documents_workspace_candidate_step_idx" ON "driver_documents" USING btree ("workspace_id","twenty_candidate_id","step_key");--> statement-breakpoint
CREATE INDEX "driver_documents_workspace_requirement_idx" ON "driver_documents" USING btree ("workspace_id","requirement_key");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_documents_storage_key_uidx" ON "driver_documents" USING btree ("storage_key");