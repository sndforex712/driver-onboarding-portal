CREATE TABLE "recruiting_sheet_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"workbook_id" text NOT NULL,
	"tab_name" text NOT NULL,
	"row_number" integer NOT NULL,
	"external_row_identity" text NOT NULL,
	"normalized_phone" text,
	"raw_fingerprint" text NOT NULL,
	"source_status" text DEFAULT 'active' NOT NULL,
	"readiness_text" text,
	"name" text,
	"phone_raw" text,
	"truck_year_make" text,
	"driver_type" text,
	"legacy_note" text,
	"recruiter_display_name" text,
	"source_text" text,
	"application" text,
	"clearing_house" text,
	"drug_test" text,
	"plate_number" text,
	"tg" text,
	"title" text,
	"ann_insp" text,
	"two_twenty_nine" text,
	"contract" text,
	"med_card" text,
	"tracking_number" text,
	"email" text,
	"address" text,
	"raw_payload" jsonb NOT NULL,
	"mapped_case_id" integer,
	"last_seen_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"missing_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_sheet_rows_status_ck" CHECK ("recruiting_sheet_rows"."source_status" IN ('active', 'missing', 'conflict', 'skipped', 'historical'))
);
--> statement-breakpoint
CREATE TABLE "recruiting_sheet_sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"workbook_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"rows_fetched" integer DEFAULT 0 NOT NULL,
	"rows_created" integer DEFAULT 0 NOT NULL,
	"rows_updated" integer DEFAULT 0 NOT NULL,
	"rows_unchanged" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"rows_conflicted" integer DEFAULT 0 NOT NULL,
	"rows_missing" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"source_fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_sheet_sync_runs_status_ck" CHECK ("recruiting_sheet_sync_runs"."status" IN ('running', 'succeeded', 'failed', 'busy'))
);
--> statement-breakpoint
ALTER TABLE "recruiting_sheet_rows" ADD CONSTRAINT "recruiting_sheet_rows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_sheet_rows" ADD CONSTRAINT "recruiting_sheet_rows_case_workspace_fk" FOREIGN KEY ("workspace_id","mapped_case_id") REFERENCES "public"."recruiting_cases"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_sheet_sync_runs" ADD CONSTRAINT "recruiting_sheet_sync_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_sheet_rows_workspace_identity_uidx" ON "recruiting_sheet_rows" USING btree ("workspace_id","workbook_id","external_row_identity");--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_sheet_rows_workspace_fingerprint_uidx" ON "recruiting_sheet_rows" USING btree ("workspace_id","workbook_id","tab_name","row_number");