CREATE TABLE "app_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_operational_handoffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"from_owner_id" integer,
	"from_owner_name" text,
	"to_owner_id" integer NOT NULL,
	"to_owner_name" text NOT NULL,
	"completed_by_user_id" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"handed_off_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "operational_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "blocker_code" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "hardy_handoff_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "password_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_operational_handoffs" ADD CONSTRAINT "driver_operational_handoffs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_operational_handoffs" ADD CONSTRAINT "driver_operational_handoffs_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_operational_handoffs" ADD CONSTRAINT "driver_operational_handoffs_to_owner_id_app_users_id_fk" FOREIGN KEY ("to_owner_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_operational_handoffs" ADD CONSTRAINT "driver_operational_handoffs_completed_by_user_id_app_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_sessions_token_hash_uidx" ON "app_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "app_sessions_user_idx" ON "app_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_operational_handoffs_workspace_driver_uidx" ON "driver_operational_handoffs" USING btree ("workspace_id","driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_operational_handoffs_idempotency_uidx" ON "driver_operational_handoffs" USING btree ("idempotency_key");