CREATE TYPE "public"."booking_status" AS ENUM('inquiry', 'proposal', 'awaiting_payment', 'funded', 'in_production', 'delivered', 'approved', 'paid_out', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('none', 'funded', 'refunded', 'paid_out');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('projection', 'fooh', 'anamorphic', 'drone', 'street');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('brand', 'creator', 'admin');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"actor_id" uuid,
	"from_status" "booking_status" NOT NULL,
	"to_status" "booking_status" NOT NULL,
	"price_cents_snapshot" integer,
	"fee_cents_snapshot" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"usage_rights_option_id" uuid NOT NULL,
	"title" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"status" "booking_status" DEFAULT 'inquiry' NOT NULL,
	"payment_state" "payment_state" DEFAULT 'none' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_price_nonneg" CHECK ("bookings"."price_cents" >= 0),
	CONSTRAINT "bookings_fee_nonneg" CHECK ("bookings"."fee_cents" >= 0),
	CONSTRAINT "bookings_title_len" CHECK (char_length("bookings"."title") <= 140),
	CONSTRAINT "bookings_brief_len" CHECK (char_length("bookings"."brief") <= 8000)
);
--> statement-breakpoint
CREATE TABLE "brief_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"budget_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"theme" "theme" DEFAULT 'projection' NOT NULL,
	"formats" text[] DEFAULT '{}' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "creator_profiles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "creator_profiles_slug_shape" CHECK ("creator_profiles"."slug" ~ '^[a-z0-9-]{3,40}$'),
	CONSTRAINT "creator_profiles_formats_subset" CHECK ("creator_profiles"."formats" <@ ARRAY['projection','fooh','anamorphic','drone','street']::text[]),
	CONSTRAINT "creator_profiles_bio_len" CHECK (char_length("creator_profiles"."bio") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliverables_note_len" CHECK (char_length("deliverables"."note") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_body_len" CHECK (char_length("messages"."body") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"turnaround_days" integer DEFAULT 14 NOT NULL,
	"deliverable_summary" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_price_nonneg" CHECK ("packages"."price_cents" >= 0),
	CONSTRAINT "packages_name_len" CHECK (char_length("packages"."name") <= 120),
	CONSTRAINT "packages_description_len" CHECK (char_length("packages"."description") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "platform_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fee_bps" integer DEFAULT 1000 NOT NULL,
	CONSTRAINT "platform_config_singleton" CHECK ("platform_config"."id" = 1),
	CONSTRAINT "platform_config_fee_range" CHECK ("platform_config"."fee_bps" BETWEEN 0 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"media_key" text NOT NULL,
	"media_type" text DEFAULT 'image' NOT NULL,
	"format" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_title_len" CHECK (char_length("portfolio_items"."title") <= 200)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" "user_role" NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "reviews_body_len" CHECK (char_length("reviews"."body") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "usage_rights_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_delta_cents" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_rights_delta_nonneg" CHECK ("usage_rights_options"."price_delta_cents" >= 0),
	CONSTRAINT "usage_rights_name_len" CHECK (char_length("usage_rights_options"."name") <= 120),
	CONSTRAINT "usage_rights_description_len" CHECK (char_length("usage_rights_options"."description") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_brand_id_profiles_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_usage_rights_option_id_usage_rights_options_id_fk" FOREIGN KEY ("usage_rights_option_id") REFERENCES "public"."usage_rights_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_responses" ADD CONSTRAINT "brief_responses_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_responses" ADD CONSTRAINT "brief_responses_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_brand_id_profiles_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_uploader_id_profiles_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_brand_id_profiles_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_rights_options" ADD CONSTRAINT "usage_rights_options_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "booking_events_booking_idx" ON "booking_events" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "bookings_brand_idx" ON "bookings" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "bookings_creator_idx" ON "bookings" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "deliverables_booking_idx" ON "deliverables" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "messages_booking_idx" ON "messages" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event" ON "webhook_events" USING btree ("provider","event_id");