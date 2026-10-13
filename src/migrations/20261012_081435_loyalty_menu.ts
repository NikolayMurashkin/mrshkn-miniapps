import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_menu_items_category" AS ENUM('coffee', 'tea', 'bakery', 'breakfast');
  CREATE TYPE "public"."enum_orders_platform" AS ENUM('telegram', 'max');
  CREATE TYPE "public"."enum_orders_pickup" AS ENUM('asap', 'in15', 'in30');
  CREATE TYPE "public"."enum_orders_status" AS ENUM('new', 'preparing', 'ready', 'done', 'cancelled');
  CREATE TYPE "public"."enum_staff_platform" AS ENUM('telegram', 'max');
  CREATE TYPE "public"."enum_loyalty_events_type" AS ENUM('stamp', 'referral', 'coupon-issued', 'coupon-redeemed');
  CREATE TYPE "public"."enum_coupons_status" AS ENUM('active', 'redeemed');
  CREATE TABLE "menu_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"price" numeric NOT NULL,
  	"category" "enum_menu_items_category" NOT NULL,
  	"available" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "orders_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"menu_item_id" integer,
  	"name" varchar NOT NULL,
  	"price" numeric NOT NULL,
  	"qty" numeric NOT NULL
  );
  
  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"platform" "enum_orders_platform" NOT NULL,
  	"total" numeric NOT NULL,
  	"pickup" "enum_orders_pickup" NOT NULL,
  	"pickup_at" timestamp(3) with time zone,
  	"status" "enum_orders_status" DEFAULT 'new' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "staff" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"platform" "enum_staff_platform" NOT NULL,
  	"platform_user_id" varchar NOT NULL,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "loyalty_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"type" "enum_loyalty_events_type" NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"staff_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "coupons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"status" "enum_coupons_status" DEFAULT 'active' NOT NULL,
  	"issued_at" timestamp(3) with time zone NOT NULL,
  	"redeemed_at" timestamp(3) with time zone,
  	"redeemed_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "qr_tokens" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"token" varchar NOT NULL,
  	"client_id" integer NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"used_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "clients" ADD COLUMN "referral_code" varchar;
  ALTER TABLE "clients" ADD COLUMN "referred_by_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "menu_items_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "orders_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "staff_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "loyalty_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "coupons_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "qr_tokens_id" integer;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "loyalty_events" ADD CONSTRAINT "loyalty_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "loyalty_events" ADD CONSTRAINT "loyalty_events_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_redeemed_by_id_staff_id_fk" FOREIGN KEY ("redeemed_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "menu_items_updated_at_idx" ON "menu_items" USING btree ("updated_at");
  CREATE INDEX "menu_items_created_at_idx" ON "menu_items" USING btree ("created_at");
  CREATE INDEX "orders_items_order_idx" ON "orders_items" USING btree ("_order");
  CREATE INDEX "orders_items_parent_id_idx" ON "orders_items" USING btree ("_parent_id");
  CREATE INDEX "orders_items_menu_item_idx" ON "orders_items" USING btree ("menu_item_id");
  CREATE INDEX "orders_client_idx" ON "orders" USING btree ("client_id");
  CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "staff_updated_at_idx" ON "staff" USING btree ("updated_at");
  CREATE INDEX "staff_created_at_idx" ON "staff" USING btree ("created_at");
  CREATE UNIQUE INDEX "platform_platformUserId_1_idx" ON "staff" USING btree ("platform","platform_user_id");
  CREATE INDEX "loyalty_events_client_idx" ON "loyalty_events" USING btree ("client_id");
  CREATE INDEX "loyalty_events_staff_idx" ON "loyalty_events" USING btree ("staff_id");
  CREATE INDEX "loyalty_events_updated_at_idx" ON "loyalty_events" USING btree ("updated_at");
  CREATE INDEX "loyalty_events_created_at_idx" ON "loyalty_events" USING btree ("created_at");
  CREATE INDEX "coupons_client_idx" ON "coupons" USING btree ("client_id");
  CREATE INDEX "coupons_redeemed_by_idx" ON "coupons" USING btree ("redeemed_by_id");
  CREATE INDEX "coupons_updated_at_idx" ON "coupons" USING btree ("updated_at");
  CREATE INDEX "coupons_created_at_idx" ON "coupons" USING btree ("created_at");
  CREATE UNIQUE INDEX "qr_tokens_token_idx" ON "qr_tokens" USING btree ("token");
  CREATE INDEX "qr_tokens_client_idx" ON "qr_tokens" USING btree ("client_id");
  CREATE INDEX "qr_tokens_updated_at_idx" ON "qr_tokens" USING btree ("updated_at");
  CREATE INDEX "qr_tokens_created_at_idx" ON "qr_tokens" USING btree ("created_at");
  ALTER TABLE "clients" ADD CONSTRAINT "clients_referred_by_id_clients_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_menu_items_fk" FOREIGN KEY ("menu_items_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_staff_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_loyalty_events_fk" FOREIGN KEY ("loyalty_events_id") REFERENCES "public"."loyalty_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_coupons_fk" FOREIGN KEY ("coupons_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_qr_tokens_fk" FOREIGN KEY ("qr_tokens_id") REFERENCES "public"."qr_tokens"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "clients_referral_code_idx" ON "clients" USING btree ("referral_code");
  CREATE INDEX "clients_referred_by_idx" ON "clients" USING btree ("referred_by_id");
  CREATE INDEX "payload_locked_documents_rels_menu_items_id_idx" ON "payload_locked_documents_rels" USING btree ("menu_items_id");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_staff_id_idx" ON "payload_locked_documents_rels" USING btree ("staff_id");
  CREATE INDEX "payload_locked_documents_rels_loyalty_events_id_idx" ON "payload_locked_documents_rels" USING btree ("loyalty_events_id");
  CREATE INDEX "payload_locked_documents_rels_coupons_id_idx" ON "payload_locked_documents_rels" USING btree ("coupons_id");
  CREATE INDEX "payload_locked_documents_rels_qr_tokens_id_idx" ON "payload_locked_documents_rels" USING btree ("qr_tokens_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "menu_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "staff" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "loyalty_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "coupons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "qr_tokens" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "menu_items" CASCADE;
  DROP TABLE "orders_items" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "staff" CASCADE;
  DROP TABLE "loyalty_events" CASCADE;
  DROP TABLE "coupons" CASCADE;
  DROP TABLE "qr_tokens" CASCADE;
  ALTER TABLE "clients" DROP CONSTRAINT "clients_referred_by_id_clients_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_menu_items_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_orders_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_staff_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_loyalty_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_coupons_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_qr_tokens_fk";
  
  DROP INDEX "clients_referral_code_idx";
  DROP INDEX "clients_referred_by_idx";
  DROP INDEX "payload_locked_documents_rels_menu_items_id_idx";
  DROP INDEX "payload_locked_documents_rels_orders_id_idx";
  DROP INDEX "payload_locked_documents_rels_staff_id_idx";
  DROP INDEX "payload_locked_documents_rels_loyalty_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_coupons_id_idx";
  DROP INDEX "payload_locked_documents_rels_qr_tokens_id_idx";
  ALTER TABLE "clients" DROP COLUMN "referral_code";
  ALTER TABLE "clients" DROP COLUMN "referred_by_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "menu_items_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "orders_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "staff_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "loyalty_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "coupons_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "qr_tokens_id";
  DROP TYPE "public"."enum_menu_items_category";
  DROP TYPE "public"."enum_orders_platform";
  DROP TYPE "public"."enum_orders_pickup";
  DROP TYPE "public"."enum_orders_status";
  DROP TYPE "public"."enum_staff_platform";
  DROP TYPE "public"."enum_loyalty_events_type";
  DROP TYPE "public"."enum_coupons_status";`)
}
