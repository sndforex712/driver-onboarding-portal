CREATE TABLE "franklin_lead_ingests" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"source_system" text NOT NULL,
	"source_tenant" text NOT NULL,
	"source_lead_id" text NOT NULL,
	"external_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_id" integer NOT NULL,
	"recruiting_case_id" integer NOT NULL,
	"driver_name" text NOT NULL,
	"phone_normalized" text NOT NULL,
	"driver_type" text NOT NULL,
	"cdl_front_received" boolean DEFAULT false NOT NULL,
	"cdl_back_received" boolean DEFAULT false NOT NULL,
	"medical_card_received" boolean DEFAULT false NOT NULL,
	"docs_received" boolean DEFAULT false NOT NULL,
	"displayed_recruiter" text NOT NULL,
	"requested_by_account_id" text NOT NULL,
	"requested_by_full_name" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recruiting_cases" ALTER COLUMN "driver_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "franklin_lead_ingests" ADD CONSTRAINT "franklin_lead_ingests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franklin_lead_ingests" ADD CONSTRAINT "franklin_lead_ingests_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franklin_lead_ingests" ADD CONSTRAINT "franklin_lead_ingests_case_workspace_fk" FOREIGN KEY ("workspace_id","recruiting_case_id") REFERENCES "public"."recruiting_cases"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "franklin_lead_ingests_workspace_key_uidx" ON "franklin_lead_ingests" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "franklin_lead_ingests_workspace_source_uidx" ON "franklin_lead_ingests" USING btree ("workspace_id","source_system","source_tenant","source_lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "franklin_lead_ingests_workspace_case_uidx" ON "franklin_lead_ingests" USING btree ("workspace_id","recruiting_case_id");