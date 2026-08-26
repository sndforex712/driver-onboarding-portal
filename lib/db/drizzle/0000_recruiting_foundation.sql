CREATE TABLE "recruiting_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"case_number" text NOT NULL,
	"source_id" text,
	"stage" text DEFAULT 'new_lead' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"case_owner_id" integer NOT NULL,
	"task_owner_id" integer,
	"next_action" text,
	"next_action_due_at" timestamp with time zone,
	"sla_deadline_at" timestamp with time zone,
	"follow_up_due_at" timestamp with time zone,
	"resume_stage" text,
	"closed_lost_reason" text,
	"closed_lost_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"transfer_status" text DEFAULT 'not_requested' NOT NULL,
	"transfer_requested_at" timestamp with time zone,
	"transferred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_cases_stage_ck" CHECK ("stage" IN ('new_lead', 'contact_attempted', 'connected_prequalified', 'application_sent', 'application_received', 'manager_review', 'clearinghouse_pending', 'drug_test_scheduled', 'drug_test_passed', 'compliance_documents_pending', 'contract_sent', 'contract_signed', 'ready_for_onboarding', 'hired_transferred_to_onboarding', 'future_follow_up', 'closed_lost')),
	CONSTRAINT "recruiting_cases_lifecycle_stage_ck" CHECK ((("lifecycle" = 'active' AND "stage" NOT IN ('hired_transferred_to_onboarding', 'closed_lost')) OR ("lifecycle" = 'hired_transferred' AND "stage" = 'hired_transferred_to_onboarding') OR ("lifecycle" = 'closed_lost' AND "stage" = 'closed_lost'))),
	CONSTRAINT "recruiting_cases_active_fields_ck" CHECK (("lifecycle" <> 'active' OR ("task_owner_id" IS NOT NULL AND "next_action" IS NOT NULL AND btrim("next_action") <> '' AND "next_action_due_at" IS NOT NULL AND "sla_deadline_at" IS NOT NULL))),
	CONSTRAINT "recruiting_cases_follow_up_fields_ck" CHECK ((("stage" = 'future_follow_up' AND "follow_up_due_at" IS NOT NULL AND "resume_stage" IN ('new_lead', 'contact_attempted', 'connected_prequalified', 'application_sent', 'application_received', 'manager_review', 'clearinghouse_pending', 'drug_test_scheduled', 'drug_test_passed', 'compliance_documents_pending', 'contract_sent', 'contract_signed', 'ready_for_onboarding')) OR ("stage" <> 'future_follow_up' AND "follow_up_due_at" IS NULL AND "resume_stage" IS NULL))),
	CONSTRAINT "recruiting_cases_closed_lost_fields_ck" CHECK ((("stage" = 'closed_lost' AND "closed_lost_reason" IN ('qualification_not_met', 'clearinghouse_issue', 'drug_test_issue', 'compliance_document_issue', 'contract_declined', 'compensation_or_role_mismatch', 'withdrew', 'no_response', 'duplicate_or_merged', 'other') AND ("closed_lost_reason" <> 'other' OR ("closed_lost_note" IS NOT NULL AND btrim("closed_lost_note") <> ''))) OR ("stage" <> 'closed_lost' AND "closed_lost_reason" IS NULL AND "closed_lost_note" IS NULL))),
	CONSTRAINT "recruiting_cases_version_ck" CHECK ("version" >= 1),
	CONSTRAINT "recruiting_cases_transfer_fields_ck" CHECK ((("transfer_status" = 'not_requested' AND "transfer_requested_at" IS NULL AND "transferred_at" IS NULL) OR ("transfer_status" = 'pending' AND "transfer_requested_at" IS NOT NULL AND "transferred_at" IS NULL) OR ("transfer_status" = 'completed' AND "transfer_requested_at" IS NOT NULL AND "transferred_at" IS NOT NULL) OR ("transfer_status" = 'failed' AND "transfer_requested_at" IS NOT NULL AND "transferred_at" IS NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_cases_workspace_id_uidx" ON "recruiting_cases" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE TABLE "recruiting_case_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"recruiting_case_id" integer NOT NULL,
	"transition_idempotency_key" text NOT NULL,
	"event_type" text NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"actor_user_id" integer,
	"case_version" integer NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_case_events_version_ck" CHECK ("case_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "recruiting_transition_effects" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"recruiting_case_id" integer NOT NULL,
	"transition_idempotency_key" text NOT NULL,
	"effect_kind" text NOT NULL,
	"effect_idempotency_key" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_transition_effects_kind_ck" CHECK ("effect_kind" IN ('stage_transition', 'manager_review_task', 'onboarding_transfer')),
	CONSTRAINT "recruiting_transition_effects_status_ck" CHECK ("status" IN ('planned', 'applied', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "onboarding_cases" ADD COLUMN "recruiting_case_id" integer;
--> statement-breakpoint
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_recruiting_case_workspace_fk" FOREIGN KEY ("workspace_id","recruiting_case_id") REFERENCES "recruiting_cases"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_recruiting_case_workspace_ck" CHECK ("recruiting_case_id" IS NULL OR "workspace_id" IS NOT NULL);
--> statement-breakpoint
CREATE TABLE "recruiting_onboarding_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"recruiting_case_id" integer NOT NULL,
	"transfer_idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"onboarding_case_id" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_onboarding_transfers_status_ck" CHECK ((("status" = 'pending' AND "onboarding_case_id" IS NULL AND "completed_at" IS NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL) OR ("status" = 'completed' AND "onboarding_case_id" IS NOT NULL AND "completed_at" IS NOT NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL) OR ("status" = 'failed' AND "onboarding_case_id" IS NULL AND "completed_at" IS NULL AND "failed_at" IS NOT NULL AND "failure_reason" IS NOT NULL AND btrim("failure_reason") <> '')))
);
--> statement-breakpoint
ALTER TABLE "recruiting_cases" ADD CONSTRAINT "recruiting_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_cases" ADD CONSTRAINT "recruiting_cases_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_cases" ADD CONSTRAINT "recruiting_cases_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_cases" ADD CONSTRAINT "recruiting_cases_case_owner_membership_fk" FOREIGN KEY ("workspace_id","case_owner_id") REFERENCES "workspace_memberships"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_cases" ADD CONSTRAINT "recruiting_cases_task_owner_membership_fk" FOREIGN KEY ("workspace_id","task_owner_id") REFERENCES "workspace_memberships"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_case_events" ADD CONSTRAINT "recruiting_case_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_case_events" ADD CONSTRAINT "recruiting_case_events_case_workspace_fk" FOREIGN KEY ("workspace_id","recruiting_case_id") REFERENCES "recruiting_cases"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_transition_effects" ADD CONSTRAINT "recruiting_transition_effects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_transition_effects" ADD CONSTRAINT "recruiting_transition_effects_case_workspace_fk" FOREIGN KEY ("workspace_id","recruiting_case_id") REFERENCES "recruiting_cases"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_onboarding_transfers" ADD CONSTRAINT "recruiting_onboarding_transfers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_onboarding_transfers" ADD CONSTRAINT "recruiting_onboarding_transfers_case_workspace_fk" FOREIGN KEY ("workspace_id","recruiting_case_id") REFERENCES "recruiting_cases"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting_onboarding_transfers" ADD CONSTRAINT "recruiting_onboarding_transfers_onboarding_case_id_onboarding_cases_id_fk" FOREIGN KEY ("onboarding_case_id") REFERENCES "onboarding_cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_cases_workspace_case_number_uidx" ON "recruiting_cases" USING btree ("workspace_id","case_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_cases_workspace_source_id_uidx" ON "recruiting_cases" USING btree ("workspace_id","source_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_cases_one_active_per_driver_workspace_uidx" ON "recruiting_cases" USING btree ("workspace_id","driver_id") WHERE "recruiting_cases"."lifecycle" = 'active';
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_case_events_transition_key_uidx" ON "recruiting_case_events" USING btree ("transition_idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_transition_effects_effect_key_uidx" ON "recruiting_transition_effects" USING btree ("effect_idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_transition_effects_transition_kind_uidx" ON "recruiting_transition_effects" USING btree ("recruiting_case_id","transition_idempotency_key","effect_kind");
--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_cases_recruiting_case_id_uidx" ON "onboarding_cases" USING btree ("recruiting_case_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_onboarding_transfers_case_uidx" ON "recruiting_onboarding_transfers" USING btree ("recruiting_case_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_onboarding_transfers_idempotency_key_uidx" ON "recruiting_onboarding_transfers" USING btree ("transfer_idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_onboarding_transfers_onboarding_case_uidx" ON "recruiting_onboarding_transfers" USING btree ("onboarding_case_id") WHERE "recruiting_onboarding_transfers"."onboarding_case_id" IS NOT NULL;