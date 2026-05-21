


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ai_drafts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_ai_drafts_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_outbound_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_outbound_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "thread_id" "uuid",
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "subject" "text",
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_note" "text",
    "sent_at" timestamp with time zone,
    "generated_by" "text" DEFAULT 'gemini'::"text",
    CONSTRAINT "ai_drafts_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'whatsapp'::"text"]))),
    CONSTRAINT "ai_drafts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'sent'::"text"])))
);


ALTER TABLE "public"."ai_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "domain" "text",
    "type" "text",
    "industry" "text",
    "address" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "companies_type_check" CHECK (("type" = ANY (ARRAY['institution'::"text", 'sme'::"text", 'corporate'::"text"])))
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "is_primary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "company_contacts_role_check" CHECK (("role" = ANY (ARRAY['decision_maker'::"text", 'cc'::"text", 'stakeholder'::"text", 'billing'::"text"])))
);


ALTER TABLE "public"."company_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "source" "text",
    "crm_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "engagement_stage" "text",
    "inbound_lead_id" "uuid",
    "outbound_lead_id" "uuid",
    CONSTRAINT "contacts_email_or_phone" CHECK ((("email" IS NOT NULL) OR ("phone" IS NOT NULL))),
    CONSTRAINT "contacts_engagement_stage_check" CHECK (("engagement_stage" = ANY (ARRAY['engaged'::"text", 'qualified'::"text", 'proposal'::"text", 'converted'::"text"]))),
    CONSTRAINT "contacts_source_check" CHECK (("source" = ANY (ARRAY['website'::"text", 'whatsapp'::"text", 'email'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "company_id" "uuid",
    "account_manager" "text",
    "status" "text" DEFAULT 'active'::"text",
    "customer_since" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "customers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'renewal_due'::"text", 'lapsed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "customers_type_check" CHECK (("type" = ANY (ARRAY['individual'::"text", 'company'::"text"])))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "product_type" "text",
    "stage" "text" DEFAULT 'new'::"text",
    "value_estimate" numeric,
    "close_date_estimate" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "deals_product_type_check" CHECK (("product_type" = ANY (ARRAY['motor'::"text", 'travel'::"text", 'property'::"text", 'cyber'::"text", 'foreign_worker'::"text", 'workmen'::"text", 'medical'::"text", 'other'::"text"]))),
    CONSTRAINT "deals_stage_check" CHECK (("stage" = ANY (ARRAY['new'::"text", 'discovery'::"text", 'proposal'::"text", 'negotiation'::"text", 'closed_won'::"text", 'closed_lost'::"text"])))
);


ALTER TABLE "public"."deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "gmail_message_id" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "from_address" "text",
    "subject" "text",
    "body_text" "text",
    "body_html" "text",
    "sent_at" timestamp with time zone,
    "has_attachments" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "email_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);


ALTER TABLE "public"."email_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "role" "text" NOT NULL,
    "contact_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "email_participants_role_check" CHECK (("role" = ANY (ARRAY['from'::"text", 'to'::"text", 'cc'::"text", 'bcc'::"text"])))
);


ALTER TABLE "public"."email_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gmail_thread_id" "text" NOT NULL,
    "customer_id" "uuid",
    "deal_id" "uuid",
    "subject" "text",
    "snippet" "text",
    "last_message_at" timestamp with time zone,
    "message_count" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "contact_id" "uuid",
    CONSTRAINT "email_threads_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'resolved'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."email_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbound_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid",
    "company_id" "uuid",
    "source" "text" NOT NULL,
    "message" "text",
    "page_url" "text",
    "session_id" "text",
    "status" "text" DEFAULT 'new'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "phone" "text",
    "company" "text",
    "contact_type" "text",
    "topic" "text",
    "details" "text",
    "first_name" "text",
    "last_name" "text",
    "department" "text",
    CONSTRAINT "inbound_leads_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'website_form'::"text", 'whatsapp_click'::"text", 'email'::"text"]))),
    CONSTRAINT "inbound_leads_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'engaged'::"text", 'qualified'::"text", 'closed'::"text", 'spam'::"text"])))
);


ALTER TABLE "public"."inbound_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "contact_id" "uuid",
    "deal_id" "uuid",
    "type" "text" NOT NULL,
    "summary" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "interactions_type_check" CHECK (("type" = ANY (ARRAY['call'::"text", 'meeting'::"text", 'note'::"text", 'email'::"text", 'whatsapp'::"text"])))
);


ALTER TABLE "public"."interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ob_company_dump" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "search_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "source_rank" integer,
    "people_fetched" boolean DEFAULT false NOT NULL,
    "people_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ob_company_dump" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ob_people_dump" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "search_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "company_name" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "full_name" "text",
    "username" "text",
    "headline" "text",
    "linkedin_url" "text",
    "profile_picture" "text",
    "location" "text",
    "summary" "text",
    "email_requested" boolean DEFAULT false NOT NULL,
    "email" "text",
    "email_status" "text",
    "outbound_lead_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ob_people_dump" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ob_search_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sector" "text" NOT NULL,
    "location" "text" NOT NULL,
    "geo_id" "text" NOT NULL,
    "product_type" "text" NOT NULL,
    "roles_targeted" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "cron_preference" "text",
    "company_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ob_search_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outbound_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "record_type" "text" NOT NULL,
    "source" "text" NOT NULL,
    "linkedin_id" bigint,
    "linkedin_url" "text",
    "username" "text",
    "first_name" "text",
    "last_name" "text",
    "full_name" "text",
    "headline" "text",
    "summary" "text",
    "profile_picture" "text",
    "location" "text",
    "country_code" "text",
    "current_title" "text",
    "current_company" "text",
    "current_company_id" bigint,
    "current_company_url" "text",
    "current_industry" "text",
    "company_tagline" "text",
    "company_description" "text",
    "company_size" "text",
    "employee_count" integer,
    "headquarters" "text",
    "logo_url" "text",
    "website" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "notes" "text",
    "search_query" "jsonb",
    "raw_payload" "jsonb",
    "email" "text",
    "email_status" "text",
    CONSTRAINT "outbound_leads_record_type_check" CHECK (("record_type" = ANY (ARRAY['person'::"text", 'company'::"text"]))),
    CONSTRAINT "outbound_leads_source_check" CHECK (("source" = ANY (ARRAY['url_lookup'::"text", 'people_search'::"text", 'company_search'::"text"]))),
    CONSTRAINT "outbound_leads_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'engaged'::"text", 'qualified'::"text", 'proposal'::"text", 'converted'::"text", 'closed'::"text", 'spam'::"text"])))
);


ALTER TABLE "public"."outbound_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "deal_id" "uuid",
    "policy_number" "text",
    "insurer" "text",
    "product_type" "text",
    "sum_insured" numeric,
    "premium" numeric,
    "start_date" "date",
    "end_date" "date",
    "renewal_date" "date",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "policies_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "pending_question" "jsonb",
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "whatsapp_conversations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."whatsapp_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "inbound_message_id" "uuid",
    "content" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "whatsapp_drafts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."whatsapp_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid",
    "conversation_id" "uuid",
    "direction" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "message" "text",
    "media_url" "text",
    "whatsapp_message_id" "text",
    "sent_at" timestamp with time zone,
    "status" "text" DEFAULT 'sent'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "whatsapp_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "whatsapp_messages_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."whatsapp_messages" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_drafts"
    ADD CONSTRAINT "ai_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_contacts"
    ADD CONSTRAINT "company_contacts_company_id_contact_id_key" UNIQUE ("company_id", "contact_id");



ALTER TABLE ONLY "public"."company_contacts"
    ADD CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_gmail_message_id_key" UNIQUE ("gmail_message_id");



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_participants"
    ADD CONSTRAINT "email_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_threads"
    ADD CONSTRAINT "email_threads_gmail_thread_id_key" UNIQUE ("gmail_thread_id");



ALTER TABLE ONLY "public"."email_threads"
    ADD CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbound_leads"
    ADD CONSTRAINT "inbound_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ob_company_dump"
    ADD CONSTRAINT "ob_company_dump_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."ob_company_dump"
    ADD CONSTRAINT "ob_company_dump_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ob_people_dump"
    ADD CONSTRAINT "ob_people_dump_linkedin_url_key" UNIQUE ("linkedin_url");



ALTER TABLE ONLY "public"."ob_people_dump"
    ADD CONSTRAINT "ob_people_dump_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ob_search_log"
    ADD CONSTRAINT "ob_search_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outbound_leads"
    ADD CONSTRAINT "outbound_leads_linkedin_url_key" UNIQUE ("linkedin_url");



ALTER TABLE ONLY "public"."outbound_leads"
    ADD CONSTRAINT "outbound_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."policies"
    ADD CONSTRAINT "policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."policies"
    ADD CONSTRAINT "policies_policy_number_key" UNIQUE ("policy_number");



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_drafts"
    ADD CONSTRAINT "whatsapp_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_whatsapp_message_id_key" UNIQUE ("whatsapp_message_id");



CREATE INDEX "idx_ai_drafts_contact_id" ON "public"."ai_drafts" USING "btree" ("contact_id");



CREATE INDEX "idx_ai_drafts_status" ON "public"."ai_drafts" USING "btree" ("status");



CREATE INDEX "idx_cc_company" ON "public"."company_contacts" USING "btree" ("company_id");



CREATE INDEX "idx_cc_contact" ON "public"."company_contacts" USING "btree" ("contact_id");



CREATE INDEX "idx_cc_primary" ON "public"."company_contacts" USING "btree" ("company_id", "is_primary");



CREATE INDEX "idx_contacts_email" ON "public"."contacts" USING "btree" ("email");



CREATE INDEX "idx_contacts_engagement_stage" ON "public"."contacts" USING "btree" ("engagement_stage") WHERE ("engagement_stage" IS NOT NULL);



CREATE INDEX "idx_contacts_phone" ON "public"."contacts" USING "btree" ("phone");



CREATE INDEX "idx_customers_company" ON "public"."customers" USING "btree" ("company_id");



CREATE INDEX "idx_customers_contact" ON "public"."customers" USING "btree" ("contact_id");



CREATE INDEX "idx_customers_status" ON "public"."customers" USING "btree" ("status");



CREATE INDEX "idx_deals_customer" ON "public"."deals" USING "btree" ("customer_id");



CREATE INDEX "idx_deals_stage" ON "public"."deals" USING "btree" ("stage");



CREATE INDEX "idx_email_threads_contact_id" ON "public"."email_threads" USING "btree" ("contact_id") WHERE ("contact_id" IS NOT NULL);



CREATE INDEX "idx_interactions_created" ON "public"."interactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_interactions_customer" ON "public"."interactions" USING "btree" ("customer_id");



CREATE INDEX "idx_interactions_deal" ON "public"."interactions" USING "btree" ("deal_id");



CREATE INDEX "idx_leads_contact" ON "public"."inbound_leads" USING "btree" ("contact_id");



CREATE INDEX "idx_leads_created" ON "public"."inbound_leads" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_leads_status" ON "public"."inbound_leads" USING "btree" ("status");



CREATE INDEX "idx_messages_sent" ON "public"."email_messages" USING "btree" ("sent_at" DESC);



CREATE INDEX "idx_messages_thread" ON "public"."email_messages" USING "btree" ("thread_id");



CREATE INDEX "idx_participants_contact" ON "public"."email_participants" USING "btree" ("contact_id");



CREATE INDEX "idx_participants_email" ON "public"."email_participants" USING "btree" ("email");



CREATE INDEX "idx_participants_thread" ON "public"."email_participants" USING "btree" ("thread_id");



CREATE INDEX "idx_policies_customer" ON "public"."policies" USING "btree" ("customer_id");



CREATE INDEX "idx_policies_renewal" ON "public"."policies" USING "btree" ("renewal_date");



CREATE INDEX "idx_threads_customer" ON "public"."email_threads" USING "btree" ("customer_id");



CREATE INDEX "idx_threads_deal" ON "public"."email_threads" USING "btree" ("deal_id");



CREATE INDEX "idx_threads_last_message" ON "public"."email_threads" USING "btree" ("last_message_at" DESC);



CREATE INDEX "idx_wa_conv_contact" ON "public"."whatsapp_conversations" USING "btree" ("contact_id");



CREATE INDEX "idx_wa_conv_last_msg" ON "public"."whatsapp_conversations" USING "btree" ("last_message_at" DESC);



CREATE INDEX "idx_wa_drafts_conversation" ON "public"."whatsapp_drafts" USING "btree" ("conversation_id", "status");



CREATE INDEX "idx_wa_msg_contact" ON "public"."whatsapp_messages" USING "btree" ("contact_id");



CREATE INDEX "idx_wa_msg_conversation" ON "public"."whatsapp_messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_wa_msg_phone" ON "public"."whatsapp_messages" USING "btree" ("phone_number");



CREATE INDEX "idx_wa_msg_sent" ON "public"."whatsapp_messages" USING "btree" ("sent_at" DESC);



CREATE INDEX "ob_company_dump_search_id_idx" ON "public"."ob_company_dump" USING "btree" ("search_id");



CREATE INDEX "ob_people_dump_company_id_idx" ON "public"."ob_people_dump" USING "btree" ("company_id");



CREATE INDEX "ob_people_dump_email_idx" ON "public"."ob_people_dump" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "ob_people_dump_search_id_idx" ON "public"."ob_people_dump" USING "btree" ("search_id");



CREATE INDEX "ob_search_log_created_at_idx" ON "public"."ob_search_log" USING "btree" ("created_at" DESC);



CREATE INDEX "outbound_leads_created_at_idx" ON "public"."outbound_leads" USING "btree" ("created_at" DESC);



CREATE INDEX "outbound_leads_email_idx" ON "public"."outbound_leads" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "outbound_leads_record_type_idx" ON "public"."outbound_leads" USING "btree" ("record_type");



CREATE INDEX "outbound_leads_source_idx" ON "public"."outbound_leads" USING "btree" ("source");



CREATE INDEX "outbound_leads_status_idx" ON "public"."outbound_leads" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "outbound_leads_updated_at" BEFORE UPDATE ON "public"."outbound_leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_outbound_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ai_drafts_updated_at" BEFORE UPDATE ON "public"."ai_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."update_ai_drafts_updated_at"();



CREATE OR REPLACE TRIGGER "trg_companies_updated" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_contacts_updated" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customers_updated" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_deals_updated" BEFORE UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_leads_updated" BEFORE UPDATE ON "public"."inbound_leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_policies_updated" BEFORE UPDATE ON "public"."policies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_threads_updated" BEFORE UPDATE ON "public"."email_threads" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wa_conv_updated" BEFORE UPDATE ON "public"."whatsapp_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wa_drafts_updated" BEFORE UPDATE ON "public"."whatsapp_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."ai_drafts"
    ADD CONSTRAINT "ai_drafts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_drafts"
    ADD CONSTRAINT "ai_drafts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_contacts"
    ADD CONSTRAINT "company_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_contacts"
    ADD CONSTRAINT "company_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_inbound_lead_id_fkey" FOREIGN KEY ("inbound_lead_id") REFERENCES "public"."inbound_leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_outbound_lead_id_fkey" FOREIGN KEY ("outbound_lead_id") REFERENCES "public"."outbound_leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_participants"
    ADD CONSTRAINT "email_participants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."email_participants"
    ADD CONSTRAINT "email_participants_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_participants"
    ADD CONSTRAINT "email_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_threads"
    ADD CONSTRAINT "email_threads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_threads"
    ADD CONSTRAINT "email_threads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."email_threads"
    ADD CONSTRAINT "email_threads_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."inbound_leads"
    ADD CONSTRAINT "inbound_leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."inbound_leads"
    ADD CONSTRAINT "inbound_leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."ob_company_dump"
    ADD CONSTRAINT "ob_company_dump_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "public"."ob_search_log"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ob_people_dump"
    ADD CONSTRAINT "ob_people_dump_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."ob_company_dump"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ob_people_dump"
    ADD CONSTRAINT "ob_people_dump_outbound_lead_id_fkey" FOREIGN KEY ("outbound_lead_id") REFERENCES "public"."outbound_leads"("id");



ALTER TABLE ONLY "public"."ob_people_dump"
    ADD CONSTRAINT "ob_people_dump_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "public"."ob_search_log"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."policies"
    ADD CONSTRAINT "policies_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."policies"
    ADD CONSTRAINT "policies_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_drafts"
    ADD CONSTRAINT "whatsapp_drafts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_drafts"
    ADD CONSTRAINT "whatsapp_drafts_inbound_message_id_fkey" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id");



ALTER TABLE "public"."ai_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon_insert_leads" ON "public"."inbound_leads" FOR INSERT WITH CHECK (true);



CREATE POLICY "anon_insert_wa_messages" ON "public"."whatsapp_messages" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inbound_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ob_company_dump" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ob_people_dump" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ob_search_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outbound_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service role full access" ON "public"."ai_drafts" USING (true) WITH CHECK (true);



CREATE POLICY "staff_companies" ON "public"."companies" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_company_contacts" ON "public"."company_contacts" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_contacts" ON "public"."contacts" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_customers" ON "public"."customers" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_deals" ON "public"."deals" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_interactions" ON "public"."interactions" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_leads" ON "public"."inbound_leads" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_messages" ON "public"."email_messages" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_participants" ON "public"."email_participants" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_policies" ON "public"."policies" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_threads" ON "public"."email_threads" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_wa_conversations" ON "public"."whatsapp_conversations" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_wa_drafts" ON "public"."whatsapp_drafts" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "staff_wa_messages" ON "public"."whatsapp_messages" USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."whatsapp_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_messages" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."whatsapp_conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."whatsapp_drafts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."whatsapp_messages";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ai_drafts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ai_drafts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ai_drafts_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_outbound_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_outbound_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_outbound_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."ai_drafts" TO "anon";
GRANT ALL ON TABLE "public"."ai_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."company_contacts" TO "anon";
GRANT ALL ON TABLE "public"."company_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."company_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



GRANT ALL ON TABLE "public"."email_messages" TO "anon";
GRANT ALL ON TABLE "public"."email_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."email_messages" TO "service_role";



GRANT ALL ON TABLE "public"."email_participants" TO "anon";
GRANT ALL ON TABLE "public"."email_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."email_participants" TO "service_role";



GRANT ALL ON TABLE "public"."email_threads" TO "anon";
GRANT ALL ON TABLE "public"."email_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."email_threads" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_leads" TO "anon";
GRANT ALL ON TABLE "public"."inbound_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_leads" TO "service_role";



GRANT ALL ON TABLE "public"."interactions" TO "anon";
GRANT ALL ON TABLE "public"."interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."interactions" TO "service_role";



GRANT ALL ON TABLE "public"."ob_company_dump" TO "anon";
GRANT ALL ON TABLE "public"."ob_company_dump" TO "authenticated";
GRANT ALL ON TABLE "public"."ob_company_dump" TO "service_role";



GRANT ALL ON TABLE "public"."ob_people_dump" TO "anon";
GRANT ALL ON TABLE "public"."ob_people_dump" TO "authenticated";
GRANT ALL ON TABLE "public"."ob_people_dump" TO "service_role";



GRANT ALL ON TABLE "public"."ob_search_log" TO "anon";
GRANT ALL ON TABLE "public"."ob_search_log" TO "authenticated";
GRANT ALL ON TABLE "public"."ob_search_log" TO "service_role";



GRANT ALL ON TABLE "public"."outbound_leads" TO "anon";
GRANT ALL ON TABLE "public"."outbound_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."outbound_leads" TO "service_role";



GRANT ALL ON TABLE "public"."policies" TO "anon";
GRANT ALL ON TABLE "public"."policies" TO "authenticated";
GRANT ALL ON TABLE "public"."policies" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_drafts" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_messages" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































