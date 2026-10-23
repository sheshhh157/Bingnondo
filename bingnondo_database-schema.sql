--
-- PostgreSQL database dump
--

\restrict OLjGaJveraYQUelOQOQtwExnGv62lOofs54ah0bZgfuaR79dDk1HmVWdejopYvc

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

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

ALTER TABLE IF EXISTS ONLY public.support_chats DROP CONSTRAINT IF EXISTS support_chats_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.support_chat_messages DROP CONSTRAINT IF EXISTS support_chat_messages_related_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.support_chat_messages DROP CONSTRAINT IF EXISTS support_chat_messages_chat_id_fkey;
ALTER TABLE IF EXISTS ONLY public.staff_accounts DROP CONSTRAINT IF EXISTS staff_accounts_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.riders DROP CONSTRAINT IF EXISTS riders_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS payments_verified_by_fkey;
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS payments_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_cashier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_changed_by_fkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_variant_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_menu_item_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_staff_id_fkey;
ALTER TABLE IF EXISTS ONLY public.menu_items DROP CONSTRAINT IF EXISTS menu_items_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.menu_item_variants DROP CONSTRAINT IF EXISTS menu_item_variants_variant_group_id_fkey;
ALTER TABLE IF EXISTS ONLY public.menu_item_variants DROP CONSTRAINT IF EXISTS menu_item_variants_menu_item_id_fkey;
ALTER TABLE IF EXISTS ONLY public.menu_item_reviews DROP CONSTRAINT IF EXISTS menu_item_reviews_menu_item_id_fkey;
ALTER TABLE IF EXISTS ONLY public.menu_item_reviews DROP CONSTRAINT IF EXISTS menu_item_reviews_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.menu_item_ingredients DROP CONSTRAINT IF EXISTS menu_item_ingredients_menu_item_id_fkey;
ALTER TABLE IF EXISTS ONLY public.menu_item_ingredients DROP CONSTRAINT IF EXISTS menu_item_ingredients_inventory_item_id_fkey;
ALTER TABLE IF EXISTS ONLY public.menu_category_variant_groups DROP CONSTRAINT IF EXISTS menu_category_variant_groups_variant_group_id_fkey;
ALTER TABLE IF EXISTS ONLY public.menu_category_variant_groups DROP CONSTRAINT IF EXISTS menu_category_variant_groups_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.kitchen_alerts DROP CONSTRAINT IF EXISTS kitchen_alerts_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.kitchen_alerts DROP CONSTRAINT IF EXISTS kitchen_alerts_device_id_fkey;
ALTER TABLE IF EXISTS ONLY public.kitchen_alerts DROP CONSTRAINT IF EXISTS kitchen_alerts_acknowledged_by_fkey;
ALTER TABLE IF EXISTS ONLY public.inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_performed_by_fkey;
ALTER TABLE IF EXISTS ONLY public.inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_inventory_item_id_fkey;
ALTER TABLE IF EXISTS ONLY public.inventory_item_categories DROP CONSTRAINT IF EXISTS inventory_item_categories_item_id_fkey;
ALTER TABLE IF EXISTS ONLY public.inventory_item_categories DROP CONSTRAINT IF EXISTS inventory_item_categories_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.inventory_transactions DROP CONSTRAINT IF EXISTS fk_inventory_txn_order;
ALTER TABLE IF EXISTS ONLY public.deliveries DROP CONSTRAINT IF EXISTS deliveries_rider_id_fkey;
ALTER TABLE IF EXISTS ONLY public.deliveries DROP CONSTRAINT IF EXISTS deliveries_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.deliveries DROP CONSTRAINT IF EXISTS deliveries_assigned_by_fkey;
ALTER TABLE IF EXISTS ONLY public.customer_restrictions DROP CONSTRAINT IF EXISTS customer_restrictions_updated_by_fkey;
ALTER TABLE IF EXISTS ONLY public.customer_restrictions DROP CONSTRAINT IF EXISTS customer_restrictions_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.customer_order_violations DROP CONSTRAINT IF EXISTS customer_order_violations_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.customer_order_violations DROP CONSTRAINT IF EXISTS customer_order_violations_flagged_by_fkey;
ALTER TABLE IF EXISTS ONLY public.customer_order_violations DROP CONSTRAINT IF EXISTS customer_order_violations_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.customer_notifications DROP CONSTRAINT IF EXISTS customer_notifications_related_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.customer_notifications DROP CONSTRAINT IF EXISTS customer_notifications_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chatbot_messages DROP CONSTRAINT IF EXISTS chatbot_messages_conversation_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chatbot_conversations DROP CONSTRAINT IF EXISTS chatbot_conversations_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.business_hours DROP CONSTRAINT IF EXISTS business_hours_updated_by_fkey;
ALTER TABLE IF EXISTS ONLY public.audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;
DROP INDEX IF EXISTS public.uq_variant_groups_name;
DROP INDEX IF EXISTS public.uq_menu_item_variants_item_name_legacy;
DROP INDEX IF EXISTS public.uq_menu_item_variants_item_group_name;
DROP INDEX IF EXISTS public.uq_menu_item_reviews_item_customer;
DROP INDEX IF EXISTS public.idx_violations_customer;
DROP INDEX IF EXISTS public.idx_violations_created;
DROP INDEX IF EXISTS public.idx_support_chat_messages_chat;
DROP INDEX IF EXISTS public.idx_riders_status;
DROP INDEX IF EXISTS public.idx_riders_mobile;
DROP INDEX IF EXISTS public.idx_riders_email;
DROP INDEX IF EXISTS public.idx_payments_status;
DROP INDEX IF EXISTS public.idx_payments_order_id_unique;
DROP INDEX IF EXISTS public.idx_payments_order_id;
DROP INDEX IF EXISTS public.idx_payments_gcash_pending;
DROP INDEX IF EXISTS public.idx_otp_contact_purpose;
DROP INDEX IF EXISTS public.idx_orders_status;
DROP INDEX IF EXISTS public.idx_orders_order_number;
DROP INDEX IF EXISTS public.idx_orders_customer;
DROP INDEX IF EXISTS public.idx_orders_cashier;
DROP INDEX IF EXISTS public.idx_order_items_order_id;
DROP INDEX IF EXISTS public.idx_order_items_order;
DROP INDEX IF EXISTS public.idx_notifications_staff;
DROP INDEX IF EXISTS public.idx_menu_items_not_deleted;
DROP INDEX IF EXISTS public.idx_menu_items_display_order;
DROP INDEX IF EXISTS public.idx_menu_item_variants_menu_item_id;
DROP INDEX IF EXISTS public.idx_menu_item_variants_menu_item_group;
DROP INDEX IF EXISTS public.idx_menu_item_reviews_menu_item_id;
DROP INDEX IF EXISTS public.idx_menu_item_reviews_customer_id;
DROP INDEX IF EXISTS public.idx_menu_category_variant_groups_variant_group_id;
DROP INDEX IF EXISTS public.idx_menu_category_variant_groups_category_id;
DROP INDEX IF EXISTS public.idx_menu_categories_display_order;
DROP INDEX IF EXISTS public.idx_kitchen_alerts_order;
DROP INDEX IF EXISTS public.idx_inventory_txn_item;
DROP INDEX IF EXISTS public.idx_inventory_item_categories_category_id;
DROP INDEX IF EXISTS public.idx_esp32_devices_device_code_unique;
DROP INDEX IF EXISTS public.idx_deliveries_status;
DROP INDEX IF EXISTS public.idx_deliveries_rider;
DROP INDEX IF EXISTS public.idx_customer_notifications_customer;
DROP INDEX IF EXISTS public.idx_audit_log_actor;
ALTER TABLE IF EXISTS ONLY public.variant_groups DROP CONSTRAINT IF EXISTS variant_groups_pkey;
ALTER TABLE IF EXISTS ONLY public.system_settings DROP CONSTRAINT IF EXISTS system_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.support_chats DROP CONSTRAINT IF EXISTS support_chats_pkey;
ALTER TABLE IF EXISTS ONLY public.support_chats DROP CONSTRAINT IF EXISTS support_chats_customer_id_key;
ALTER TABLE IF EXISTS ONLY public.support_chat_messages DROP CONSTRAINT IF EXISTS support_chat_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.staff_accounts DROP CONSTRAINT IF EXISTS staff_accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.staff_accounts DROP CONSTRAINT IF EXISTS staff_accounts_email_key;
ALTER TABLE IF EXISTS ONLY public.riders DROP CONSTRAINT IF EXISTS riders_pkey;
ALTER TABLE IF EXISTS ONLY public.riders DROP CONSTRAINT IF EXISTS riders_mobile_number_key;
ALTER TABLE IF EXISTS ONLY public.riders DROP CONSTRAINT IF EXISTS riders_email_key;
ALTER TABLE IF EXISTS ONLY public.pending_registrations DROP CONSTRAINT IF EXISTS pending_registrations_pkey;
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS payments_pkey;
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS payments_order_id_key;
ALTER TABLE IF EXISTS ONLY public.otp_verifications DROP CONSTRAINT IF EXISTS otp_verifications_pkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_pkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_order_number_key;
ALTER TABLE IF EXISTS ONLY public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_pkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_pkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.menu_items DROP CONSTRAINT IF EXISTS menu_items_pkey;
ALTER TABLE IF EXISTS ONLY public.menu_item_variants DROP CONSTRAINT IF EXISTS menu_item_variants_pkey;
ALTER TABLE IF EXISTS ONLY public.menu_item_reviews DROP CONSTRAINT IF EXISTS menu_item_reviews_pkey;
ALTER TABLE IF EXISTS ONLY public.menu_item_ingredients DROP CONSTRAINT IF EXISTS menu_item_ingredients_pkey;
ALTER TABLE IF EXISTS ONLY public.menu_category_variant_groups DROP CONSTRAINT IF EXISTS menu_category_variant_groups_pkey;
ALTER TABLE IF EXISTS ONLY public.menu_categories DROP CONSTRAINT IF EXISTS menu_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.menu_categories DROP CONSTRAINT IF EXISTS menu_categories_name_key;
ALTER TABLE IF EXISTS ONLY public.kitchen_alerts DROP CONSTRAINT IF EXISTS kitchen_alerts_pkey;
ALTER TABLE IF EXISTS ONLY public.inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_pkey;
ALTER TABLE IF EXISTS ONLY public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_pkey;
ALTER TABLE IF EXISTS ONLY public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_name_key;
ALTER TABLE IF EXISTS ONLY public.inventory_item_categories DROP CONSTRAINT IF EXISTS inventory_item_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.esp32_devices DROP CONSTRAINT IF EXISTS esp32_devices_pkey;
ALTER TABLE IF EXISTS ONLY public.deliveries DROP CONSTRAINT IF EXISTS deliveries_pkey;
ALTER TABLE IF EXISTS ONLY public.deliveries DROP CONSTRAINT IF EXISTS deliveries_order_id_key;
ALTER TABLE IF EXISTS ONLY public.customers DROP CONSTRAINT IF EXISTS customers_pkey;
ALTER TABLE IF EXISTS ONLY public.customers DROP CONSTRAINT IF EXISTS customers_mobile_number_key;
ALTER TABLE IF EXISTS ONLY public.customers DROP CONSTRAINT IF EXISTS customers_email_key;
ALTER TABLE IF EXISTS ONLY public.customer_restrictions DROP CONSTRAINT IF EXISTS customer_restrictions_pkey;
ALTER TABLE IF EXISTS ONLY public.customer_order_violations DROP CONSTRAINT IF EXISTS customer_order_violations_pkey;
ALTER TABLE IF EXISTS ONLY public.customer_notifications DROP CONSTRAINT IF EXISTS customer_notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.chatbot_messages DROP CONSTRAINT IF EXISTS chatbot_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.chatbot_conversations DROP CONSTRAINT IF EXISTS chatbot_conversations_pkey;
ALTER TABLE IF EXISTS ONLY public.business_hours DROP CONSTRAINT IF EXISTS business_hours_pkey;
ALTER TABLE IF EXISTS ONLY public.business_hours DROP CONSTRAINT IF EXISTS business_hours_day_of_week_key;
ALTER TABLE IF EXISTS ONLY public.audit_log DROP CONSTRAINT IF EXISTS audit_log_pkey;
ALTER TABLE IF EXISTS public.variant_groups ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.support_chats ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.support_chat_messages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.staff_accounts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.riders ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.payments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.otp_verifications ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.orders ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.order_status_history ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.order_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notifications ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.menu_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.menu_item_variants ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.menu_item_reviews ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.menu_categories ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.kitchen_alerts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.inventory_transactions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.inventory_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.esp32_devices ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.deliveries ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.customers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.customer_order_violations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.customer_notifications ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.chatbot_messages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.chatbot_conversations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.business_hours ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.audit_log ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.variant_groups_id_seq;
DROP TABLE IF EXISTS public.variant_groups;
DROP TABLE IF EXISTS public.system_settings;
DROP SEQUENCE IF EXISTS public.support_chats_id_seq;
DROP TABLE IF EXISTS public.support_chats;
DROP SEQUENCE IF EXISTS public.support_chat_messages_id_seq;
DROP TABLE IF EXISTS public.support_chat_messages;
DROP SEQUENCE IF EXISTS public.staff_accounts_id_seq;
DROP TABLE IF EXISTS public.staff_accounts;
DROP SEQUENCE IF EXISTS public.riders_id_seq;
DROP TABLE IF EXISTS public.riders;
DROP TABLE IF EXISTS public.pending_registrations;
DROP SEQUENCE IF EXISTS public.payments_id_seq;
DROP TABLE IF EXISTS public.payments;
DROP SEQUENCE IF EXISTS public.otp_verifications_id_seq;
DROP TABLE IF EXISTS public.otp_verifications;
DROP SEQUENCE IF EXISTS public.orders_id_seq;
DROP TABLE IF EXISTS public.orders;
DROP SEQUENCE IF EXISTS public.order_status_history_id_seq;
DROP TABLE IF EXISTS public.order_status_history;
DROP SEQUENCE IF EXISTS public.order_items_id_seq;
DROP TABLE IF EXISTS public.order_items;
DROP SEQUENCE IF EXISTS public.notifications_id_seq;
DROP TABLE IF EXISTS public.notifications;
DROP SEQUENCE IF EXISTS public.menu_items_id_seq;
DROP TABLE IF EXISTS public.menu_items;
DROP SEQUENCE IF EXISTS public.menu_item_variants_id_seq;
DROP TABLE IF EXISTS public.menu_item_variants;
DROP SEQUENCE IF EXISTS public.menu_item_reviews_id_seq;
DROP TABLE IF EXISTS public.menu_item_reviews;
DROP TABLE IF EXISTS public.menu_item_ingredients;
DROP TABLE IF EXISTS public.menu_category_variant_groups;
DROP SEQUENCE IF EXISTS public.menu_categories_id_seq;
DROP TABLE IF EXISTS public.menu_categories;
DROP SEQUENCE IF EXISTS public.kitchen_alerts_id_seq;
DROP TABLE IF EXISTS public.kitchen_alerts;
DROP SEQUENCE IF EXISTS public.inventory_transactions_id_seq;
DROP TABLE IF EXISTS public.inventory_transactions;
DROP SEQUENCE IF EXISTS public.inventory_items_id_seq;
DROP TABLE IF EXISTS public.inventory_items;
DROP TABLE IF EXISTS public.inventory_item_categories;
DROP SEQUENCE IF EXISTS public.esp32_devices_id_seq;
DROP TABLE IF EXISTS public.esp32_devices;
DROP SEQUENCE IF EXISTS public.deliveries_id_seq;
DROP TABLE IF EXISTS public.deliveries;
DROP SEQUENCE IF EXISTS public.customers_id_seq;
DROP TABLE IF EXISTS public.customers;
DROP TABLE IF EXISTS public.customer_restrictions;
DROP SEQUENCE IF EXISTS public.customer_order_violations_id_seq;
DROP TABLE IF EXISTS public.customer_order_violations;
DROP SEQUENCE IF EXISTS public.customer_notifications_id_seq;
DROP TABLE IF EXISTS public.customer_notifications;
DROP SEQUENCE IF EXISTS public.chatbot_messages_id_seq;
DROP TABLE IF EXISTS public.chatbot_messages;
DROP SEQUENCE IF EXISTS public.chatbot_conversations_id_seq;
DROP TABLE IF EXISTS public.chatbot_conversations;
DROP SEQUENCE IF EXISTS public.business_hours_id_seq;
DROP TABLE IF EXISTS public.business_hours;
DROP SEQUENCE IF EXISTS public.audit_log_id_seq;
DROP TABLE IF EXISTS public.audit_log;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    actor_id integer,
    action character varying(100) NOT NULL,
    target_type character varying(50),
    target_id integer,
    details jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: business_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_hours (
    id integer NOT NULL,
    day_of_week smallint NOT NULL,
    open_time time without time zone,
    close_time time without time zone,
    is_closed boolean DEFAULT false NOT NULL,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_hours_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: business_hours_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_hours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_hours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_hours_id_seq OWNED BY public.business_hours.id;


--
-- Name: chatbot_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_conversations (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chatbot_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_conversations_id_seq OWNED BY public.chatbot_conversations.id;


--
-- Name: chatbot_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    sender character varying(10) NOT NULL,
    content text NOT NULL,
    sent_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chatbot_messages_sender_check CHECK (((sender)::text = ANY (ARRAY[('customer'::character varying)::text, ('bot'::character varying)::text])))
);


--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_messages_id_seq OWNED BY public.chatbot_messages.id;


--
-- Name: customer_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_notifications (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    type character varying(50) NOT NULL,
    message text NOT NULL,
    related_order_id integer,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: customer_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_notifications_id_seq OWNED BY public.customer_notifications.id;


--
-- Name: customer_order_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_order_violations (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    order_id integer NOT NULL,
    violation_type character varying(30) NOT NULL,
    flagged_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT customer_order_violations_violation_type_check CHECK (((violation_type)::text = ANY (ARRAY[('cancelled_before_prep'::character varying)::text, ('cancelled_after_prep'::character varying)::text, ('no_show'::character varying)::text])))
);


--
-- Name: customer_order_violations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_order_violations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_order_violations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_order_violations_id_seq OWNED BY public.customer_order_violations.id;


--
-- Name: customer_restrictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_restrictions (
    customer_id integer NOT NULL,
    restriction_level character varying(20) DEFAULT 'none'::character varying NOT NULL,
    reason text,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT customer_restrictions_restriction_level_check CHECK (((restriction_level)::text = ANY (ARRAY[('none'::character varying)::text, ('warned'::character varying)::text, ('cod_restricted'::character varying)::text, ('suspended'::character varying)::text])))
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    email_verified boolean DEFAULT false,
    first_name character varying(50),
    last_name character varying(50),
    mobile_number character varying(11),
    mobile_verified boolean DEFAULT false,
    address text,
    profile_completed boolean DEFAULT false,
    status character varying(30) DEFAULT 'awaiting_verification'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    latitude numeric(10,7),
    longitude numeric(10,7),
    CONSTRAINT customers_status_check CHECK (((status)::text = ANY (ARRAY[('awaiting_verification'::character varying)::text, ('active'::character varying)::text, ('suspended'::character varying)::text])))
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deliveries (
    id integer NOT NULL,
    order_id integer NOT NULL,
    delivery_preference character varying(20) NOT NULL,
    assigned_by integer,
    rider_name character varying(100),
    rider_contact character varying(20),
    lalamove_booking_id character varying(100),
    status character varying(20) DEFAULT 'pending_assignment'::character varying,
    assigned_at timestamp without time zone,
    delivered_at timestamp without time zone,
    rider_id integer,
    CONSTRAINT deliveries_delivery_preference_check CHECK (((delivery_preference)::text = ANY (ARRAY[('own_delivery'::character varying)::text, ('lalamove'::character varying)::text]))),
    CONSTRAINT deliveries_status_check CHECK (((status)::text = ANY (ARRAY[('pending_assignment'::character varying)::text, ('assigned'::character varying)::text, ('out_for_delivery'::character varying)::text, ('delivered'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: deliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deliveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deliveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.deliveries_id_seq OWNED BY public.deliveries.id;


--
-- Name: esp32_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.esp32_devices (
    id integer NOT NULL,
    device_code text NOT NULL,
    location_label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'offline'::text NOT NULL,
    last_ping_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: esp32_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.esp32_devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: esp32_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.esp32_devices_id_seq OWNED BY public.esp32_devices.id;


--
-- Name: inventory_item_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_item_categories (
    inventory_item_id integer NOT NULL,
    category_id integer NOT NULL
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    unit character varying(20) NOT NULL,
    current_stock numeric(10,2) DEFAULT 0 NOT NULL,
    reorder_level numeric(10,2) DEFAULT 0,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: inventory_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_items_id_seq OWNED BY public.inventory_items.id;


--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transactions (
    id integer NOT NULL,
    inventory_item_id integer NOT NULL,
    change_type character varying(20) NOT NULL,
    quantity numeric(10,2) NOT NULL,
    reference_order_id integer,
    performed_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventory_transactions_change_type_check CHECK (((change_type)::text = ANY (ARRAY[('restock'::character varying)::text, ('deduction'::character varying)::text, ('adjustment'::character varying)::text])))
);


--
-- Name: inventory_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_transactions_id_seq OWNED BY public.inventory_transactions.id;


--
-- Name: kitchen_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kitchen_alerts (
    id integer NOT NULL,
    order_id integer NOT NULL,
    device_id integer,
    triggered_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at timestamp without time zone,
    acknowledged_by integer
);


--
-- Name: kitchen_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kitchen_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kitchen_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kitchen_alerts_id_seq OWNED BY public.kitchen_alerts.id;


--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    display_order smallint DEFAULT 0 NOT NULL
);


--
-- Name: menu_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menu_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menu_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menu_categories_id_seq OWNED BY public.menu_categories.id;


--
-- Name: menu_category_variant_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_category_variant_groups (
    category_id integer NOT NULL,
    variant_group_id integer NOT NULL
);


--
-- Name: menu_item_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_ingredients (
    menu_item_id integer NOT NULL,
    inventory_item_id integer NOT NULL,
    quantity_required numeric(10,2),
    unit character varying(20),
    conversion_factor numeric(14,6)
);


--
-- Name: COLUMN menu_item_ingredients.unit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_item_ingredients.unit IS 'Unit the recipe amount is expressed in (e.g. ml). NULL = same as the inventory item stock unit.';


--
-- Name: COLUMN menu_item_ingredients.conversion_factor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_item_ingredients.conversion_factor IS 'Multiplier converting the recipe unit into the inventory stock unit (e.g. 1 ml = 0.001 liter). NULL = 1 (same unit).';


--
-- Name: menu_item_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_reviews (
    id integer NOT NULL,
    menu_item_id integer NOT NULL,
    customer_id integer,
    author_name character varying(100) NOT NULL,
    rating smallint NOT NULL,
    comment text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT menu_item_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: menu_item_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menu_item_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menu_item_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menu_item_reviews_id_seq OWNED BY public.menu_item_reviews.id;


--
-- Name: menu_item_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_variants (
    id integer NOT NULL,
    menu_item_id integer NOT NULL,
    name character varying(100) NOT NULL,
    price numeric(10,2) NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    display_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    variant_group_id integer
);


--
-- Name: menu_item_variants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menu_item_variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menu_item_variants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menu_item_variants_id_seq OWNED BY public.menu_item_variants.id;


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id integer NOT NULL,
    category_id integer NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    image_url character varying(500),
    is_available boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone,
    display_order smallint DEFAULT 0 NOT NULL,
    image_public_id character varying(255) DEFAULT NULL::character varying
);


--
-- Name: menu_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menu_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menu_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menu_items_id_seq OWNED BY public.menu_items.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    staff_id integer,
    target_role character varying(20),
    type character varying(50) NOT NULL,
    reference_id integer,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    menu_item_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    notes character varying(255),
    variant_id integer,
    variant_name character varying(100),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id integer NOT NULL,
    order_id integer NOT NULL,
    status character varying(20) NOT NULL,
    changed_by integer,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: order_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_status_history_id_seq OWNED BY public.order_status_history.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    order_type character varying(10) NOT NULL,
    customer_id integer,
    cashier_id integer,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    order_channel character varying(20) NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    special_request text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    order_number character varying(30),
    delivery_address text,
    delivery_latitude numeric(10,7),
    delivery_longitude numeric(10,7),
    CONSTRAINT orders_order_type_check CHECK (((order_type)::text = ANY (ARRAY[('online'::character varying)::text, ('counter'::character varying)::text]))),
    CONSTRAINT orders_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text, ('preparing'::character varying)::text, ('ready'::character varying)::text, ('out_for_delivery'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: otp_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_verifications (
    id integer NOT NULL,
    contact character varying(255) NOT NULL,
    otp_code character varying(6) NOT NULL,
    purpose character varying(30) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    consumed_at timestamp without time zone,
    CONSTRAINT otp_verifications_purpose_check CHECK (((purpose)::text = ANY (ARRAY[('email_verification'::character varying)::text, ('mobile_verification'::character varying)::text, ('password_reset'::character varying)::text])))
);


--
-- Name: otp_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.otp_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: otp_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.otp_verifications_id_seq OWNED BY public.otp_verifications.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    order_id integer NOT NULL,
    method character varying(20) NOT NULL,
    amount numeric(10,2) NOT NULL,
    paymongo_payment_id character varying(150),
    status character varying(30) DEFAULT 'pending'::character varying,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    gcash_ref_number character varying(100) DEFAULT NULL::character varying,
    receipt_image_url character varying(500) DEFAULT NULL::character varying,
    receipt_uploaded_at timestamp without time zone,
    verified_by integer,
    verified_at timestamp without time zone,
    rejection_reason character varying(255) DEFAULT NULL::character varying,
    rejected_at timestamp without time zone,
    gcash_amount_sent numeric(10,2) DEFAULT NULL::numeric,
    previous_receipt_image_url text,
    resubmitted_at timestamp without time zone,
    rejection_count integer DEFAULT 0,
    previous_rejection_reason character varying(255) DEFAULT NULL::character varying,
    CONSTRAINT payments_method_check CHECK (((method)::text = ANY (ARRAY[('gcash'::character varying)::text, ('cash'::character varying)::text, ('cash_on_delivery'::character varying)::text]))),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'awaiting_verification'::character varying, 'paid'::character varying, 'rejected'::character varying, 'refunded'::character varying])::text[])))
);


--
-- Name: COLUMN payments.gcash_amount_sent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.gcash_amount_sent IS 'Amount extracted from the customer''s GCash receipt screenshot via OCR. NULL means OCR could not read it — staff must verify manually. Compare against `amount` to detect short payments.';


--
-- Name: COLUMN payments.previous_receipt_image_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.previous_receipt_image_url IS 'The receipt URL that was rejected. Saved when customer re-uploads so cashier can compare the original rejected receipt vs the new one side by side.';


--
-- Name: COLUMN payments.resubmitted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.resubmitted_at IS 'Timestamp of the most recent customer re-upload after a rejection. NULL means never re-submitted.';


--
-- Name: COLUMN payments.rejection_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.rejection_count IS 'How many times this payment has been rejected so far. Incremented when staff rejects. Helps cashier know if this is a repeat offender.';


--
-- Name: COLUMN payments.previous_rejection_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.previous_rejection_reason IS 'Why the receipt was rejected. Copied from rejection_reason when staff rejects a receipt, and kept after the customer re-uploads (the re-upload clears rejection_reason). NULL means the receipt was never rejected.';


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: pending_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_registrations (
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: riders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.riders (
    id integer NOT NULL,
    full_name character varying(100) NOT NULL,
    mobile_number character varying(20) NOT NULL,
    plate_number character varying(30),
    vehicle_type character varying(50),
    notes text,
    status character varying(20) DEFAULT 'available'::character varying NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    email character varying(150),
    password_hash text,
    last_login timestamp without time zone,
    CONSTRAINT riders_status_check CHECK (((status)::text = ANY (ARRAY[('available'::character varying)::text, ('on_delivery'::character varying)::text, ('inactive'::character varying)::text])))
);


--
-- Name: riders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.riders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: riders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.riders_id_seq OWNED BY public.riders.id;


--
-- Name: staff_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_accounts (
    id integer NOT NULL,
    full_name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    notification_seen_at timestamp without time zone,
    CONSTRAINT staff_accounts_role_check CHECK (((role)::text = ANY (ARRAY[('cashier'::character varying)::text, ('kitchen_staff'::character varying)::text, ('staff'::character varying)::text, ('owner'::character varying)::text, ('admin'::character varying)::text]))),
    CONSTRAINT staff_accounts_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('deactivated'::character varying)::text])))
);


--
-- Name: staff_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_accounts_id_seq OWNED BY public.staff_accounts.id;


--
-- Name: support_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_chat_messages (
    id integer NOT NULL,
    chat_id integer NOT NULL,
    sender_type character varying(10) NOT NULL,
    sender_id integer NOT NULL,
    related_order_id integer,
    content text NOT NULL,
    sent_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_read boolean DEFAULT false,
    CONSTRAINT support_chat_messages_sender_type_check CHECK (((sender_type)::text = ANY (ARRAY[('customer'::character varying)::text, ('staff'::character varying)::text])))
);


--
-- Name: support_chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_chat_messages_id_seq OWNED BY public.support_chat_messages.id;


--
-- Name: support_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_chats (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    status character varying(10) DEFAULT 'locked'::character varying,
    opened_at timestamp without time zone,
    locked_at timestamp without time zone,
    CONSTRAINT support_chats_status_check CHECK (((status)::text = ANY (ARRAY[('unlocked'::character varying)::text, ('locked'::character varying)::text])))
);


--
-- Name: support_chats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_chats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_chats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_chats_id_seq OWNED BY public.support_chats.id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key character varying(100) NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: variant_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variant_groups (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    max_options integer DEFAULT 3 NOT NULL,
    CONSTRAINT chk_variant_groups_max_options CHECK (((max_options >= 1) AND (max_options <= 10)))
);


--
-- Name: variant_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.variant_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: variant_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.variant_groups_id_seq OWNED BY public.variant_groups.id;


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: business_hours id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours ALTER COLUMN id SET DEFAULT nextval('public.business_hours_id_seq'::regclass);


--
-- Name: chatbot_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_conversations ALTER COLUMN id SET DEFAULT nextval('public.chatbot_conversations_id_seq'::regclass);


--
-- Name: chatbot_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages ALTER COLUMN id SET DEFAULT nextval('public.chatbot_messages_id_seq'::regclass);


--
-- Name: customer_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notifications ALTER COLUMN id SET DEFAULT nextval('public.customer_notifications_id_seq'::regclass);


--
-- Name: customer_order_violations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_order_violations ALTER COLUMN id SET DEFAULT nextval('public.customer_order_violations_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: deliveries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries ALTER COLUMN id SET DEFAULT nextval('public.deliveries_id_seq'::regclass);


--
-- Name: esp32_devices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.esp32_devices ALTER COLUMN id SET DEFAULT nextval('public.esp32_devices_id_seq'::regclass);


--
-- Name: inventory_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items ALTER COLUMN id SET DEFAULT nextval('public.inventory_items_id_seq'::regclass);


--
-- Name: inventory_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions ALTER COLUMN id SET DEFAULT nextval('public.inventory_transactions_id_seq'::regclass);


--
-- Name: kitchen_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_alerts ALTER COLUMN id SET DEFAULT nextval('public.kitchen_alerts_id_seq'::regclass);


--
-- Name: menu_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories ALTER COLUMN id SET DEFAULT nextval('public.menu_categories_id_seq'::regclass);


--
-- Name: menu_item_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_reviews ALTER COLUMN id SET DEFAULT nextval('public.menu_item_reviews_id_seq'::regclass);


--
-- Name: menu_item_variants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_variants ALTER COLUMN id SET DEFAULT nextval('public.menu_item_variants_id_seq'::regclass);


--
-- Name: menu_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items ALTER COLUMN id SET DEFAULT nextval('public.menu_items_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: order_status_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history ALTER COLUMN id SET DEFAULT nextval('public.order_status_history_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: otp_verifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_verifications ALTER COLUMN id SET DEFAULT nextval('public.otp_verifications_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: riders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.riders ALTER COLUMN id SET DEFAULT nextval('public.riders_id_seq'::regclass);


--
-- Name: staff_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_accounts ALTER COLUMN id SET DEFAULT nextval('public.staff_accounts_id_seq'::regclass);


--
-- Name: support_chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_chat_messages ALTER COLUMN id SET DEFAULT nextval('public.support_chat_messages_id_seq'::regclass);


--
-- Name: support_chats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_chats ALTER COLUMN id SET DEFAULT nextval('public.support_chats_id_seq'::regclass);


--
-- Name: variant_groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_groups ALTER COLUMN id SET DEFAULT nextval('public.variant_groups_id_seq'::regclass);


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, actor_id, action, target_type, target_id, details, created_at) FROM stdin;
1	1	create_menu_category	menu_categories	8	{"name": "Student Meal"}	2026-10-13 18:29:34.600723
2	1	create_menu_category	menu_categories	9	{"name": "Non-Caffenated"}	2026-10-13 21:54:36.744049
3	1	create_menu_category	menu_categories	10	{"name": "Caffenated"}	2026-10-13 21:54:46.561016
4	1	delete_menu_category	menu_categories	9	{"name": "Non-Caffenated"}	2026-10-13 21:55:26.699953
5	1	delete_menu_category	menu_categories	10	{"name": "Caffenated"}	2026-10-13 21:55:27.479426
6	1	create_menu_category	menu_categories	11	{"name": "Non Caffenated Drinks"}	2026-10-13 21:57:10.72833
7	1	create_menu_category	menu_categories	12	{"name": "Caffenated Drinks"}	2026-10-13 21:57:23.140212
8	1	create_menu_category	menu_categories	13	{"name": "Matcha Drinks"}	2026-10-13 21:57:30.572821
9	1	create_menu_category	menu_categories	14	{"name": "Ala Carte"}	2026-10-13 22:08:17.597712
10	1	create_menu_category	menu_categories	15	{"name": "Platter"}	2026-10-13 22:08:23.889876
11	1	update_inventory_item	inventory_items	49	{"name": "Burger Steak Silog", "unit": "pack", "new_stock": 50, "old_stock": 50, "category_ids": [8]}	2026-10-14 15:32:30.722315
12	1	update_inventory_item	inventory_items	49	{"name": "Burger Steak Silog", "unit": "pack", "new_stock": 50, "old_stock": 50, "category_ids": [8]}	2026-10-14 15:32:38.38336
13	1	update_inventory_item	inventory_items	48	{"name": "Chicken Bites", "unit": "pack", "new_stock": 50, "old_stock": 50, "category_ids": [8]}	2026-10-14 15:33:03.361738
14	1	update_inventory_item	inventory_items	45	{"name": "Chicken Siomai Rice", "unit": "pack", "new_stock": 0, "old_stock": 0, "category_ids": [8]}	2026-10-14 15:33:09.825279
15	1	update_inventory_item	inventory_items	51	{"name": "Hot Silog", "unit": "pack", "new_stock": 50, "old_stock": 50, "category_ids": [8]}	2026-10-14 15:33:17.0739
16	1	update_inventory_item	inventory_items	52	{"name": "Long Silog", "unit": "pack", "new_stock": 50, "old_stock": 50, "category_ids": [14, 12, 13, 11, 15]}	2026-10-14 15:34:16.501741
17	1	update_inventory_item	inventory_items	52	{"name": "Long Silog", "unit": "pack", "new_stock": 50, "old_stock": 50, "category_ids": [8]}	2026-10-14 15:34:36.324179
18	1	update_inventory_item	inventory_items	46	{"name": "Pork Siomai Rice", "unit": "pack", "new_stock": 50, "old_stock": 50, "category_ids": [8]}	2026-10-14 15:34:45.580145
19	1	update_inventory_item	inventory_items	50	{"name": "Shanghai Silog", "unit": "pack", "new_stock": 50, "old_stock": 50, "category_ids": [8]}	2026-10-14 15:34:55.291478
20	1	update_inventory_item	inventory_items	47	{"name": "Sharksfin Rice", "unit": "pack", "new_stock": 50, "old_stock": 50, "category_ids": [8]}	2026-10-14 15:35:20.668954
21	1	update_inventory_item	inventory_items	53	{"name": "Spam Silog", "unit": "pack", "new_stock": 50, "old_stock": 50, "category_ids": [8]}	2026-10-14 15:35:28.829519
22	1	update_business_hours	business_hours	\N	{"days_updated": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}	2026-10-14 19:28:04.11529
23	1	update_business_hours	business_hours	\N	{"days_updated": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}	2026-10-14 19:35:21.362944
24	1	deactivate_staff_account	staff_accounts	4	{"new_status": "deactivated"}	2026-10-14 22:48:32.907217
25	1	activate_staff_account	staff_accounts	4	{"new_status": "active"}	2026-10-14 22:48:37.696996
26	1	update_inventory_item	inventory_items	49	{"name": "Burger Steak Silog", "unit": "pack", "new_stock": 20, "old_stock": 99, "category_ids": [8]}	2026-10-14 22:54:19.616476
27	1	create_rider	rider	1	{"email": "rider@bingnondo.com", "full_name": "RiderNyoko", "mobile_number": "09482785422"}	2026-10-15 14:13:11.814234
508	1	create_variant_group	variant_groups	74	{"name": "Solo/Sharing", "max_options": 2}	2026-10-20 11:13:59.066125
515	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [10], "removed_group_ids": []}	2026-10-20 11:25:29.891435
30	1	update_rider	rider	1	{"after": {"email": "rider@bingnondo.com", "full_name": "RiderNyoko", "plate_number": "ABC 1234", "vehicle_type": "motorcycle", "mobile_number": "09482785422"}, "before": {"email": "rider@bingnondo.com", "full_name": "RiderNyoko", "plate_number": "ABC 1234", "vehicle_type": "motorcycle", "mobile_number": "09482785422"}}	2026-10-15 15:42:29.445893
516	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [], "removed_group_ids": [10]}	2026-10-20 11:25:30.379372
517	1	create_variant_group	variant_groups	76	{"name": "adsa", "max_options": 3}	2026-10-20 11:25:47.115995
33	1	reset_rider_password	rider	1	{"rider_name": "RiderNyoko"}	2026-10-15 16:15:58.404767
518	1	delete_variant_group	variant_groups	76	{"name": "adsa"}	2026-10-20 11:25:49.613143
254	1	create_variant_group	variant_groups	10	{"name": "Flavor", "options": [{"name": "flavor1"}, {"name": "flavor"}]}	2026-10-20 01:27:58.70719
255	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [10], "removed_group_ids": []}	2026-10-20 01:28:06.065135
256	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [], "removed_group_ids": [10]}	2026-10-20 01:28:07.342256
85	1	create_staff_account	staff_accounts	56	{"role": "cashier", "email": "buenaflordaniel371@gmail.com"}	2026-10-17 12:10:10.92647
86	56	self_reset_password	staff_account	56	{"email": "buenaflordaniel371@gmail.com", "account_type": "staff"}	2026-10-17 12:13:46.755099
145	1	create_menu_category	menu_categories	25	{"name": "dsf"}	2026-10-17 22:51:39.305589
146	1	delete_menu_category	menu_categories	25	{"name": "dsf"}	2026-10-17 22:51:43.540236
509	1	create_variant_group	variant_groups	75	{"name": "Hot/Cold", "max_options": 2}	2026-10-20 11:15:14.303465
519	56	self_reset_password	staff_account	56	{"email": "buenaflordaniel371@gmail.com", "account_type": "staff"}	2026-10-20 11:29:16.811306
510	1	update_variant_group	variant_groups	10	{"new_name": "Flavors", "old_name": "Flavors", "max_options": 10}	2026-10-20 11:15:46.126127
466	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [10], "removed_group_ids": []}	2026-10-20 02:33:27.355184
467	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [], "removed_group_ids": [10]}	2026-10-20 02:33:28.044143
338	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [10], "removed_group_ids": []}	2026-10-20 01:38:24.439664
559	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [10], "removed_group_ids": []}	2026-10-20 14:00:06.883068
560	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [10, 74], "removed_group_ids": []}	2026-10-20 14:00:07.634981
561	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [10, 74, 75], "removed_group_ids": []}	2026-10-20 14:00:08.345913
511	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [10], "removed_group_ids": []}	2026-10-20 11:22:25.04519
512	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [], "removed_group_ids": [10]}	2026-10-20 11:22:25.988611
513	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [10], "removed_group_ids": []}	2026-10-20 11:22:26.548472
514	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [], "removed_group_ids": [10]}	2026-10-20 11:22:27.316937
643	\N	self_reset_password	rider_account	473	{"email": "__fp_test_1792598523666_4@example.test", "account_type": "rider"}	2026-10-22 00:02:03.685535
404	1	update_category_variants	menu_categories	8	{"category": "Student Meal", "group_ids": [], "removed_group_ids": [10]}	2026-10-20 02:20:46.473014
405	1	update_variant_group	variant_groups	10	{"new_name": "Flavors", "old_name": "Flavor", "max_options": 3}	2026-10-20 02:20:53.123194
\.


--
-- Data for Name: business_hours; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.business_hours (id, day_of_week, open_time, close_time, is_closed, updated_by, updated_at) FROM stdin;
2	1	08:00:00	21:00:00	f	1	2026-10-14 19:35:21.362944
3	2	08:00:00	21:00:00	f	1	2026-10-14 19:35:21.362944
4	3	08:00:00	21:00:00	f	1	2026-10-14 19:35:21.362944
5	4	08:00:00	21:00:00	f	1	2026-10-14 19:35:21.362944
6	5	08:00:00	21:00:00	f	1	2026-10-14 19:35:21.362944
7	6	08:00:00	21:00:00	f	1	2026-10-14 19:35:21.362944
1	0	08:00:00	21:00:00	f	1	2026-10-14 19:35:21.362944
\.


--
-- Data for Name: chatbot_conversations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chatbot_conversations (id, customer_id, started_at) FROM stdin;
\.


--
-- Data for Name: chatbot_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chatbot_messages (id, conversation_id, sender, content, sent_at) FROM stdin;
\.


--
-- Data for Name: customer_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_notifications (id, customer_id, type, message, related_order_id, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: customer_order_violations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_order_violations (id, customer_id, order_id, violation_type, flagged_by, created_at) FROM stdin;
\.


--
-- Data for Name: customer_restrictions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_restrictions (customer_id, restriction_level, reason, updated_by, updated_at) FROM stdin;
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (id, email, password_hash, email_verified, first_name, last_name, mobile_number, mobile_verified, address, profile_completed, status, created_at, updated_at, latitude, longitude) FROM stdin;
159	__probe@example.com	x	f	A	B	\N	f	\N	f	active	2026-10-21 21:31:17.73402	2026-10-21 21:31:17.73402	\N	\N
\.


--
-- Data for Name: deliveries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.deliveries (id, order_id, delivery_preference, assigned_by, rider_name, rider_contact, lalamove_booking_id, status, assigned_at, delivered_at, rider_id) FROM stdin;
\.


--
-- Data for Name: esp32_devices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.esp32_devices (id, device_code, location_label, created_at, status, last_ping_at) FROM stdin;
1	ESP32-KitchenA	Kitchen Counter A	2026-10-13 00:17:38.674952+08	online	2026-10-17 12:00:50.356796+08
\.


--
-- Data for Name: inventory_item_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_item_categories (inventory_item_id, category_id) FROM stdin;
48	8
45	8
51	8
52	8
46	8
50	8
47	8
53	8
49	8
\.


--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_items (id, name, unit, current_stock, reorder_level, updated_at) FROM stdin;
51	Hot Silog	pack	45.00	0.00	2026-10-17 11:57:01.713682
52	Long Silog	pack	50.00	0.00	2026-10-14 15:34:36.324179
50	Shanghai Silog	pack	50.00	0.00	2026-10-14 15:34:55.291478
47	Sharksfin Rice	pack	50.00	0.00	2026-10-14 15:35:20.668954
49	Burger Steak Silog	pack	19.00	0.00	2026-10-15 12:51:01.553445
46	Pork Siomai Rice	pack	49.00	0.00	2026-10-15 12:51:03.97809
48	Chicken Bites	pack	0.00	0.00	2026-10-15 12:51:05.465004
53	Spam Silog	pack	49.00	0.00	2026-10-16 11:38:58.013665
45	Chicken Siomai Rice	pack	23.00	0.00	2026-10-16 19:17:55.843533
\.


--
-- Data for Name: inventory_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_transactions (id, inventory_item_id, change_type, quantity, reference_order_id, performed_by, created_at) FROM stdin;
236	51	deduction	1.00	1268	4	2026-10-17 11:57:01.713682
143	51	deduction	1.00	833	4	2026-10-16 17:59:00.884991
144	51	deduction	1.00	875	4	2026-10-16 18:22:47.778592
145	45	deduction	1.00	877	4	2026-10-16 19:17:55.843533
23	49	adjustment	50.00	\N	3	2026-10-13 21:37:28.750449
24	49	restock	50.00	\N	3	2026-10-13 21:37:41.035315
25	45	adjustment	50.00	\N	3	2026-10-13 21:40:27.418496
26	48	adjustment	50.00	\N	3	2026-10-14 22:46:03.072782
27	49	restock	49.00	\N	3	2026-10-14 22:46:44.543356
28	49	adjustment	20.00	\N	1	2026-10-14 22:54:19.616476
29	48	restock	3.00	\N	1	2026-10-14 22:54:33.402363
30	45	restock	25.00	\N	1	2026-10-14 22:54:45.091702
31	49	deduction	1.00	253	4	2026-10-15 12:51:01.553445
32	51	deduction	1.00	254	4	2026-10-15 12:51:03.177398
33	48	deduction	1.00	254	4	2026-10-15 12:51:03.177398
34	45	deduction	1.00	254	4	2026-10-15 12:51:03.177398
35	46	deduction	1.00	255	4	2026-10-15 12:51:03.97809
36	48	deduction	2.00	256	4	2026-10-15 12:51:05.465004
37	51	deduction	1.00	257	4	2026-10-15 12:51:06.106107
115	53	deduction	1.00	753	4	2026-10-16 11:38:58.013665
\.


--
-- Data for Name: kitchen_alerts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.kitchen_alerts (id, order_id, device_id, triggered_at, acknowledged_at, acknowledged_by) FROM stdin;
16	833	1	2026-10-16 15:06:07.572905	2026-10-16 17:37:32.367676	4
17	834	1	2026-10-16 15:06:43.272603	2026-10-16 17:57:41.9003	4
24	875	1	2026-10-16 18:20:49.921908	2026-10-16 18:22:44.827578	4
25	876	1	2026-10-16 18:40:05.849307	2026-10-16 18:44:25.125855	4
26	877	1	2026-10-16 19:15:22.367247	2026-10-16 19:17:52.88369	4
77	1268	1	2026-10-17 11:56:31.316423	2026-10-17 11:57:00.138237	4
\.


--
-- Data for Name: menu_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_categories (id, name, display_order) FROM stdin;
8	Student Meal	0
11	Non Caffenated Drinks	0
12	Caffenated Drinks	0
13	Matcha Drinks	0
14	Ala Carte	0
15	Platter	0
\.


--
-- Data for Name: menu_category_variant_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_category_variant_groups (category_id, variant_group_id) FROM stdin;
8	10
8	74
8	75
\.


--
-- Data for Name: menu_item_ingredients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required, unit, conversion_factor) FROM stdin;
119	49	1.00	\N	\N
116	46	1.00	\N	\N
117	47	1.00	\N	\N
120	51	1.00	\N	\N
121	52	\N	\N	\N
123	50	\N	\N	\N
115	45	1.00	\N	\N
118	48	1.00	\N	\N
122	53	1.00	\N	\N
\.


--
-- Data for Name: menu_item_reviews; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_item_reviews (id, menu_item_id, customer_id, author_name, rating, comment, created_at) FROM stdin;
1	115	\N	Mariel S.	5	Sobrang sarap! Authentic ang lasa, parang nasa Binondo talaga. Bababalik-balikan ko ito.	2026-09-28 09:12:00
2	115	\N	Jonas R.	4	Great value for the portion. Medyo matagal lang ang waiting time noong peak hour.	2026-09-24 14:05:00
3	115	\N	Alyssa T.	5	Perfectly seasoned and served hot. Recommended!	2026-09-19 18:40:00
4	115	\N	Marco D.	3	Okay naman, pero sana mas malaki ang serving para sa price.	2026-09-15 11:22:00
5	115	\N	Katrina L.	5	Favourite ko na! Consistent ang quality every order.	2026-09-10 20:15:00
6	115	\N	Paolo M.	4	Solid comfort food. Presentation is neat and appetising.	2026-09-04 12:30:00
7	115	\N	Bea C.	4	Masarap at bagong luto. Ang packaging ay maayos din.	2026-08-30 16:48:00
\.


--
-- Data for Name: menu_item_variants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_item_variants (id, menu_item_id, name, price, is_available, display_order, created_at, variant_group_id) FROM stdin;
\.


--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_items (id, category_id, name, description, price, image_url, is_available, created_at, updated_at, is_deleted, deleted_at, display_order, image_public_id) FROM stdin;
119	8	Burger Steak Silog		95.00	https://res.cloudinary.com/roumuyf1/image/upload/v1791963803/bingnondo/menu/uytp3ozegmpucdtwye8l.png	t	2026-10-13 21:43:00.70016	2026-10-15 19:45:52.353231	f	\N	0	bingnondo/menu/uytp3ozegmpucdtwye8l
122	8	Spam Silog		90.00	\N	t	2026-10-13 21:52:45.01285	2026-10-15 16:14:07.009259	f	\N	0	\N
117	8	Sharksfin Rice		90.00	\N	t	2026-10-13 18:32:50.661132	2026-10-14 22:52:53.75422	f	\N	0	\N
123	8	Shanghai Silog		90.00	\N	t	2026-10-13 21:53:23.791188	2026-10-14 22:52:56.579502	f	\N	0	\N
116	8	Pork Shomai Rice		90.00	\N	t	2026-10-13 18:31:23.325148	2026-10-14 22:52:59.752574	f	\N	0	\N
121	8	Long Silog		80.00	\N	t	2026-10-13 21:52:23.622124	2026-10-14 22:53:02.354424	f	\N	0	\N
120	8	Hot Silog		90.00	\N	t	2026-10-13 21:51:27.43207	2026-10-14 22:53:22.400405	f	\N	0	\N
115	8	Chicken Shomai Rice		85.00	\N	t	2026-10-13 18:30:39.830341	2026-10-14 22:54:45.091702	f	\N	0	\N
118	8	Chicken Bites		90.00	\N	f	2026-10-13 18:33:54.133543	2026-10-15 12:51:05.465004	f	\N	0	\N
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, staff_id, target_role, type, reference_id, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_items (id, order_id, menu_item_id, quantity, unit_price, notes, variant_id, variant_name) FROM stdin;
263	253	119	1	95.00	\N	\N	\N
264	254	118	1	90.00	\N	\N	\N
265	254	115	1	85.00	\N	\N	\N
266	254	120	1	90.00	\N	\N	\N
267	255	116	1	90.00	\N	\N	\N
268	255	123	2	90.00	\N	\N	\N
269	256	118	3	90.00	\N	\N	\N
270	257	120	1	90.00	\N	\N	\N
796	752	121	1	80.00	\N	\N	\N
797	753	122	1	90.00	\N	\N	\N
798	754	121	1	80.00	\N	\N	\N
877	833	120	1	90.00	\N	\N	\N
878	834	121	1	80.00	\N	\N	\N
1311	1268	120	1	90.00	\N	\N	\N
918	875	120	1	90.00	\N	\N	\N
919	876	121	1	80.00	\N	\N	\N
920	877	115	1	85.00	\N	\N	\N
\.


--
-- Data for Name: order_status_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_status_history (id, order_id, status, changed_by, changed_at) FROM stdin;
122	253	pending	3	2026-10-14 22:45:31.900671
123	254	pending	3	2026-10-15 12:49:24.98439
124	255	pending	3	2026-10-15 12:49:32.848972
125	256	pending	3	2026-10-15 12:49:40.128487
126	257	pending	3	2026-10-15 12:49:45.897507
127	253	confirmed	4	2026-10-15 12:50:15.256883
128	254	confirmed	4	2026-10-15 12:50:16.08741
129	255	confirmed	4	2026-10-15 12:50:16.816317
130	256	confirmed	4	2026-10-15 12:50:17.567271
131	257	confirmed	4	2026-10-15 12:50:18.215715
132	253	preparing	4	2026-10-15 12:51:01.553445
133	253	ready	4	2026-10-15 12:51:01.73854
134	253	completed	4	2026-10-15 12:51:01.73854
135	254	preparing	4	2026-10-15 12:51:03.177398
136	254	ready	4	2026-10-15 12:51:03.362346
137	254	completed	4	2026-10-15 12:51:03.362346
138	255	preparing	4	2026-10-15 12:51:03.97809
139	255	ready	4	2026-10-15 12:51:04.265539
140	255	completed	4	2026-10-15 12:51:04.265539
141	256	preparing	4	2026-10-15 12:51:05.465004
142	256	ready	4	2026-10-15 12:51:05.657501
143	256	completed	4	2026-10-15 12:51:05.657501
144	257	preparing	4	2026-10-15 12:51:06.106107
145	257	ready	4	2026-10-15 12:51:06.289737
146	257	completed	4	2026-10-15 12:51:06.289737
394	752	pending	3	2026-10-16 00:08:14.50445
395	753	pending	3	2026-10-16 08:16:13.220702
396	754	pending	3	2026-10-16 08:26:02.422425
397	754	confirmed	4	2026-10-16 11:38:54.640056
398	754	preparing	4	2026-10-16 11:38:55.854375
399	754	ready	4	2026-10-16 11:38:56.166913
400	754	completed	4	2026-10-16 11:38:56.166913
401	753	confirmed	4	2026-10-16 11:38:56.982485
402	753	preparing	4	2026-10-16 11:38:58.013665
403	753	ready	4	2026-10-16 11:38:58.222747
404	753	completed	4	2026-10-16 11:38:58.222747
405	752	confirmed	4	2026-10-16 11:38:58.741373
406	752	preparing	4	2026-10-16 11:38:59.469696
407	752	ready	4	2026-10-16 11:39:02.206264
408	752	completed	4	2026-10-16 11:39:02.206264
682	1268	pending	3	2026-10-17 11:56:31.316423
683	1268	confirmed	4	2026-10-17 11:57:00.138237
684	1268	preparing	4	2026-10-17 11:57:01.713682
685	1268	ready	4	2026-10-17 11:57:01.936731
686	1268	completed	4	2026-10-17 11:57:01.936731
447	833	pending	3	2026-10-16 15:06:07.572905
448	834	pending	3	2026-10-16 15:06:43.272603
469	833	confirmed	4	2026-10-16 17:57:41.837321
470	834	confirmed	4	2026-10-16 17:57:41.9003
471	833	preparing	4	2026-10-16 17:59:00.884991
472	833	ready	4	2026-10-16 17:59:01.755699
473	833	completed	4	2026-10-16 17:59:01.755699
474	834	preparing	4	2026-10-16 17:59:02.562425
475	834	ready	4	2026-10-16 17:59:03.034943
476	834	completed	4	2026-10-16 17:59:03.034943
477	875	pending	3	2026-10-16 18:20:49.921908
478	875	confirmed	4	2026-10-16 18:22:44.827578
479	875	preparing	4	2026-10-16 18:22:47.778592
480	875	ready	4	2026-10-16 18:22:48.537588
481	875	completed	4	2026-10-16 18:22:48.537588
482	876	pending	3	2026-10-16 18:40:05.849307
483	876	confirmed	4	2026-10-16 18:44:25.125855
484	876	preparing	4	2026-10-16 19:15:12.513348
485	876	ready	4	2026-10-16 19:15:13.124425
486	876	completed	4	2026-10-16 19:15:13.124425
487	877	pending	3	2026-10-16 19:15:22.367247
488	877	confirmed	4	2026-10-16 19:17:52.88369
489	877	preparing	4	2026-10-16 19:17:55.843533
490	877	ready	4	2026-10-16 19:17:56.459252
491	877	completed	4	2026-10-16 19:17:56.459252
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, order_type, customer_id, cashier_id, status, order_channel, total_amount, special_request, created_at, updated_at, order_number, delivery_address, delivery_latitude, delivery_longitude) FROM stdin;
1268	counter	\N	3	completed	web_counter	90.00	\N	2026-10-17 11:56:31.316423	2026-10-17 11:57:01.936731	\N	\N	\N	\N
754	counter	\N	3	completed	web_counter	80.00	\N	2026-10-16 08:26:02.422425	2026-10-16 11:38:56.166913	\N	\N	\N	\N
753	counter	\N	3	completed	web_counter	90.00	\N	2026-10-16 08:16:13.220702	2026-10-16 11:38:58.222747	\N	\N	\N	\N
833	counter	\N	3	completed	web_counter	90.00	\N	2026-10-16 15:06:07.572905	2026-10-16 17:59:01.755699	\N	\N	\N	\N
253	counter	\N	3	completed	web_counter	95.00	\N	2026-10-14 22:45:31.900671	2026-10-15 12:51:01.73854	\N	\N	\N	\N
752	counter	\N	3	completed	web_counter	80.00	\N	2026-10-16 00:08:14.50445	2026-10-16 11:39:02.206264	\N	\N	\N	\N
254	counter	\N	3	completed	web_counter	265.00	\N	2026-10-15 12:49:24.98439	2026-10-15 12:51:03.362346	\N	\N	\N	\N
834	counter	\N	3	completed	web_counter	80.00	\N	2026-10-16 15:06:43.272603	2026-10-16 17:59:03.034943	\N	\N	\N	\N
255	counter	\N	3	completed	web_counter	270.00	\N	2026-10-15 12:49:32.848972	2026-10-15 12:51:04.265539	\N	\N	\N	\N
256	counter	\N	3	completed	web_counter	270.00	\N	2026-10-15 12:49:40.128487	2026-10-15 12:51:05.657501	\N	\N	\N	\N
257	counter	\N	3	completed	web_counter	90.00	\N	2026-10-15 12:49:45.897507	2026-10-15 12:51:06.289737	\N	\N	\N	\N
875	counter	\N	3	completed	web_counter	90.00	\N	2026-10-16 18:20:49.921908	2026-10-16 18:22:48.537588	\N	\N	\N	\N
876	counter	\N	3	completed	web_counter	80.00	\N	2026-10-16 18:40:05.849307	2026-10-16 19:15:13.124425	\N	\N	\N	\N
877	counter	\N	3	completed	web_counter	85.00	\N	2026-10-16 19:15:22.367247	2026-10-16 19:17:56.459252	\N	\N	\N	\N
\.


--
-- Data for Name: otp_verifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.otp_verifications (id, contact, otp_code, purpose, expires_at, verified_at, created_at, consumed_at) FROM stdin;
47	cashier@bingnondo.com	874310	password_reset	2026-10-16 22:10:48.005	\N	2026-10-16 22:00:48.008024	\N
53	buenaflordaniel371@gmail.com	628620	password_reset	2026-10-17 12:20:38.804	2026-10-17 12:13:46.755099	2026-10-17 12:10:38.807686	\N
21	cashier@bingnondo.com	535925	password_reset	2026-10-16 21:38:45.4	\N	2026-10-16 21:28:45.40364	\N
127	buenaflordaniel371@gmail.com	171443	password_reset	2026-10-20 11:38:10.732	2026-10-20 11:29:16.811306	2026-10-20 11:28:10.733974	\N
192	__dbg_1792598959964@example.test	807519	email_verification	2026-10-22 00:19:20.386	2026-10-22 00:09:20.413882	2026-10-22 00:09:20.392962	\N
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, order_id, method, amount, paymongo_payment_id, status, paid_at, created_at, gcash_ref_number, receipt_image_url, receipt_uploaded_at, verified_by, verified_at, rejection_reason, rejected_at, gcash_amount_sent, previous_receipt_image_url, resubmitted_at, rejection_count, previous_rejection_reason) FROM stdin;
666	875	cash	90.00	\N	paid	2026-10-16 18:20:49.921908	2026-10-16 18:20:49.921908	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
667	876	cash	80.00	\N	paid	2026-10-16 18:40:05.849307	2026-10-16 18:40:05.849307	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
668	877	cash	85.00	\N	paid	2026-10-16 19:15:22.367247	2026-10-16 19:15:22.367247	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
909	1268	cash	90.00	\N	paid	2026-10-17 11:56:31.316423	2026-10-17 11:56:31.316423	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
589	752	cash	80.00	\N	paid	2026-10-16 00:08:14.50445	2026-10-16 00:08:14.50445	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
590	753	cash	90.00	\N	paid	2026-10-16 08:16:13.220702	2026-10-16 08:16:13.220702	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
591	754	cash	80.00	\N	paid	2026-10-16 08:26:02.422425	2026-10-16 08:26:02.422425	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
640	833	cash	90.00	\N	paid	2026-10-16 15:06:07.572905	2026-10-16 15:06:07.572905	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
641	834	cash	80.00	\N	paid	2026-10-16 15:06:43.272603	2026-10-16 15:06:43.272603	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
235	253	cash	95.00	\N	paid	2026-10-14 22:45:31.900671	2026-10-14 22:45:31.900671	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
236	254	cash	265.00	\N	paid	2026-10-15 12:49:24.98439	2026-10-15 12:49:24.98439	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
237	255	cash	270.00	\N	paid	2026-10-15 12:49:32.848972	2026-10-15 12:49:32.848972	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
238	256	cash	270.00	\N	paid	2026-10-15 12:49:40.128487	2026-10-15 12:49:40.128487	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
239	257	cash	90.00	\N	paid	2026-10-15 12:49:45.897507	2026-10-15 12:49:45.897507	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N
\.


--
-- Data for Name: pending_registrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pending_registrations (email, password_hash, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: riders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.riders (id, full_name, mobile_number, plate_number, vehicle_type, notes, status, created_by, created_at, updated_at, email, password_hash, last_login) FROM stdin;
1	RiderNyoko	09482785422	ABC 1234	motorcycle	\N	available	1	2026-10-15 14:13:11.814234	2026-10-20 12:21:15.693442	rider@bingnondo.com	$2b$12$bxYm9KwA5JYHjxXk1GIk/OU/EPev2wJ3LfULlb/0vvnXuXtxuXjKy	2026-10-20 11:30:38.426626
\.


--
-- Data for Name: staff_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.staff_accounts (id, full_name, email, password_hash, role, status, created_by, created_at, updated_at, notification_seen_at) FROM stdin;
3	Cashier One	cashier@bingnondo.com	$2b$12$VHxWiJDzMyy9..udZAG.4uZMIIyw8Knb01KQZ8LICYXj2e90M2ksK	cashier	active	\N	2026-10-13 00:02:24.280064	2026-10-13 00:02:24.280064	\N
4	Kitchen Staff	kitchen@bingnondo.com	$2b$12$1Cwh2bqIxanUIrZC8vRbfOTsZar9oba1kwkbiSnT./qFUqmw5LAXi	kitchen_staff	active	\N	2026-10-13 00:02:24.520095	2026-10-14 22:48:37.696996	\N
1	Admin User	admin@bingnondo.com	$2b$12$JURyzssCxXhchWcJPHNOPOC.8Kx9w/S7CpsyIb9JnNYzosvNY3D0e	admin	active	\N	2026-10-13 00:02:23.780245	2026-10-13 00:02:23.780245	2026-10-21 22:20:27.084
56	Daniel	buenaflordaniel371@gmail.com	$2b$12$6eYkN.sAQXamnq9mpIfLouY35wiImE2eEXflvV9MHgueRFErsAp52	cashier	active	1	2026-10-17 12:10:10.92647	2026-10-20 11:29:16.811306	\N
\.


--
-- Data for Name: support_chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.support_chat_messages (id, chat_id, sender_type, sender_id, related_order_id, content, sent_at, is_read) FROM stdin;
\.


--
-- Data for Name: support_chats; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.support_chats (id, customer_id, status, opened_at, locked_at) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_settings (key, value, updated_at) FROM stdin;
notifications	{"categories": {"orders": true, "system": true, "kitchen": true, "payments": true, "customers": true, "inventory": true, "deliveries": true}}	2026-10-22 19:25:59.32549
\.


--
-- Data for Name: variant_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.variant_groups (id, name, created_at, updated_at, max_options) FROM stdin;
74	Solo/Sharing	2026-10-20 11:13:59.066125	2026-10-20 11:13:59.066125	2
75	Hot/Cold	2026-10-20 11:15:14.303465	2026-10-20 11:15:14.303465	2
10	Flavors	2026-10-20 01:27:58.70719	2026-10-20 11:15:46.126127	10
\.


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 993, true);


--
-- Name: business_hours_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.business_hours_id_seq', 7, true);


--
-- Name: chatbot_conversations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chatbot_conversations_id_seq', 12, true);


--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chatbot_messages_id_seq', 24, true);


--
-- Name: customer_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_notifications_id_seq', 282, true);


--
-- Name: customer_order_violations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_order_violations_id_seq', 1, false);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customers_id_seq', 638, true);


--
-- Name: deliveries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.deliveries_id_seq', 769, true);


--
-- Name: esp32_devices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.esp32_devices_id_seq', 12, true);


--
-- Name: inventory_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_items_id_seq', 763, true);


--
-- Name: inventory_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_transactions_id_seq', 536, true);


--
-- Name: kitchen_alerts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.kitchen_alerts_id_seq', 260, true);


--
-- Name: menu_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.menu_categories_id_seq', 191, true);


--
-- Name: menu_item_reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.menu_item_reviews_id_seq', 113, true);


--
-- Name: menu_item_variants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.menu_item_variants_id_seq', 412, true);


--
-- Name: menu_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.menu_items_id_seq', 2695, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notifications_id_seq', 1, false);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_items_id_seq', 2804, true);


--
-- Name: order_status_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_status_history_id_seq', 1549, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.orders_id_seq', 2761, true);


--
-- Name: otp_verifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.otp_verifications_id_seq', 426, true);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payments_id_seq', 1898, true);


--
-- Name: riders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.riders_id_seq', 572, true);


--
-- Name: staff_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.staff_accounts_id_seq', 182, true);


--
-- Name: support_chat_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.support_chat_messages_id_seq', 10, true);


--
-- Name: support_chats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.support_chats_id_seq', 210, true);


--
-- Name: variant_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.variant_groups_id_seq', 184, true);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: business_hours business_hours_day_of_week_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_day_of_week_key UNIQUE (day_of_week);


--
-- Name: business_hours business_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_pkey PRIMARY KEY (id);


--
-- Name: chatbot_conversations chatbot_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_pkey PRIMARY KEY (id);


--
-- Name: chatbot_messages chatbot_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_pkey PRIMARY KEY (id);


--
-- Name: customer_notifications customer_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notifications
    ADD CONSTRAINT customer_notifications_pkey PRIMARY KEY (id);


--
-- Name: customer_order_violations customer_order_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_order_violations
    ADD CONSTRAINT customer_order_violations_pkey PRIMARY KEY (id);


--
-- Name: customer_restrictions customer_restrictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_restrictions
    ADD CONSTRAINT customer_restrictions_pkey PRIMARY KEY (customer_id);


--
-- Name: customers customers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_email_key UNIQUE (email);


--
-- Name: customers customers_mobile_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_mobile_number_key UNIQUE (mobile_number);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: deliveries deliveries_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_order_id_key UNIQUE (order_id);


--
-- Name: deliveries deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);


--
-- Name: esp32_devices esp32_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.esp32_devices
    ADD CONSTRAINT esp32_devices_pkey PRIMARY KEY (id);


--
-- Name: inventory_item_categories inventory_item_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_categories
    ADD CONSTRAINT inventory_item_categories_pkey PRIMARY KEY (inventory_item_id, category_id);


--
-- Name: inventory_items inventory_items_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_name_key UNIQUE (name);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);


--
-- Name: kitchen_alerts kitchen_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_alerts
    ADD CONSTRAINT kitchen_alerts_pkey PRIMARY KEY (id);


--
-- Name: menu_categories menu_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_name_key UNIQUE (name);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: menu_category_variant_groups menu_category_variant_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_category_variant_groups
    ADD CONSTRAINT menu_category_variant_groups_pkey PRIMARY KEY (category_id, variant_group_id);


--
-- Name: menu_item_ingredients menu_item_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_pkey PRIMARY KEY (menu_item_id, inventory_item_id);


--
-- Name: menu_item_reviews menu_item_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_reviews
    ADD CONSTRAINT menu_item_reviews_pkey PRIMARY KEY (id);


--
-- Name: menu_item_variants menu_item_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_variants
    ADD CONSTRAINT menu_item_variants_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: otp_verifications otp_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_verifications
    ADD CONSTRAINT otp_verifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_key UNIQUE (order_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: pending_registrations pending_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_registrations
    ADD CONSTRAINT pending_registrations_pkey PRIMARY KEY (email);


--
-- Name: riders riders_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_email_key UNIQUE (email);


--
-- Name: riders riders_mobile_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_mobile_number_key UNIQUE (mobile_number);


--
-- Name: riders riders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_pkey PRIMARY KEY (id);


--
-- Name: staff_accounts staff_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_accounts
    ADD CONSTRAINT staff_accounts_email_key UNIQUE (email);


--
-- Name: staff_accounts staff_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_accounts
    ADD CONSTRAINT staff_accounts_pkey PRIMARY KEY (id);


--
-- Name: support_chat_messages support_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_chat_messages
    ADD CONSTRAINT support_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: support_chats support_chats_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_chats
    ADD CONSTRAINT support_chats_customer_id_key UNIQUE (customer_id);


--
-- Name: support_chats support_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_chats
    ADD CONSTRAINT support_chats_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: variant_groups variant_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_groups
    ADD CONSTRAINT variant_groups_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_log_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_actor ON public.audit_log USING btree (actor_id);


--
-- Name: idx_customer_notifications_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_notifications_customer ON public.customer_notifications USING btree (customer_id, created_at DESC);


--
-- Name: idx_deliveries_rider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_rider ON public.deliveries USING btree (rider_id);


--
-- Name: idx_deliveries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_status ON public.deliveries USING btree (status);


--
-- Name: idx_esp32_devices_device_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_esp32_devices_device_code_unique ON public.esp32_devices USING btree (device_code);


--
-- Name: idx_inventory_item_categories_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_item_categories_category_id ON public.inventory_item_categories USING btree (category_id);


--
-- Name: idx_inventory_txn_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_txn_item ON public.inventory_transactions USING btree (inventory_item_id);


--
-- Name: idx_kitchen_alerts_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kitchen_alerts_order ON public.kitchen_alerts USING btree (order_id);


--
-- Name: idx_menu_categories_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_categories_display_order ON public.menu_categories USING btree (display_order, id);


--
-- Name: idx_menu_category_variant_groups_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_category_variant_groups_category_id ON public.menu_category_variant_groups USING btree (category_id);


--
-- Name: idx_menu_category_variant_groups_variant_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_category_variant_groups_variant_group_id ON public.menu_category_variant_groups USING btree (variant_group_id);


--
-- Name: idx_menu_item_reviews_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_reviews_customer_id ON public.menu_item_reviews USING btree (customer_id);


--
-- Name: idx_menu_item_reviews_menu_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_reviews_menu_item_id ON public.menu_item_reviews USING btree (menu_item_id);


--
-- Name: idx_menu_item_variants_menu_item_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_variants_menu_item_group ON public.menu_item_variants USING btree (menu_item_id, variant_group_id);


--
-- Name: idx_menu_item_variants_menu_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_variants_menu_item_id ON public.menu_item_variants USING btree (menu_item_id);


--
-- Name: idx_menu_items_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_display_order ON public.menu_items USING btree (category_id, display_order, id);


--
-- Name: idx_menu_items_not_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_not_deleted ON public.menu_items USING btree (is_deleted) WHERE (is_deleted = false);


--
-- Name: idx_notifications_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_staff ON public.notifications USING btree (staff_id);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_cashier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_cashier ON public.orders USING btree (cashier_id);


--
-- Name: idx_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);


--
-- Name: idx_orders_order_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_order_number ON public.orders USING btree (order_number);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_otp_contact_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_contact_purpose ON public.otp_verifications USING btree (contact, purpose);


--
-- Name: idx_payments_gcash_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_gcash_pending ON public.payments USING btree (status) WHERE ((status)::text = ANY (ARRAY[('awaiting_verification'::character varying)::text, ('rejected'::character varying)::text]));


--
-- Name: idx_payments_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_order_id ON public.payments USING btree (order_id);


--
-- Name: idx_payments_order_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payments_order_id_unique ON public.payments USING btree (order_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_riders_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_riders_email ON public.riders USING btree (email);


--
-- Name: idx_riders_mobile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_riders_mobile ON public.riders USING btree (mobile_number);


--
-- Name: idx_riders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_riders_status ON public.riders USING btree (status);


--
-- Name: idx_support_chat_messages_chat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_chat_messages_chat ON public.support_chat_messages USING btree (chat_id);


--
-- Name: idx_violations_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_violations_created ON public.customer_order_violations USING btree (created_at);


--
-- Name: idx_violations_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_violations_customer ON public.customer_order_violations USING btree (customer_id);


--
-- Name: uq_menu_item_reviews_item_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_menu_item_reviews_item_customer ON public.menu_item_reviews USING btree (menu_item_id, customer_id) WHERE (customer_id IS NOT NULL);


--
-- Name: uq_menu_item_variants_item_group_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_menu_item_variants_item_group_name ON public.menu_item_variants USING btree (menu_item_id, variant_group_id, lower((name)::text)) WHERE (variant_group_id IS NOT NULL);


--
-- Name: uq_menu_item_variants_item_name_legacy; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_menu_item_variants_item_name_legacy ON public.menu_item_variants USING btree (menu_item_id, name) WHERE (variant_group_id IS NULL);


--
-- Name: uq_variant_groups_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_variant_groups_name ON public.variant_groups USING btree (lower((name)::text));


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.staff_accounts(id);


--
-- Name: business_hours business_hours_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.staff_accounts(id) ON DELETE SET NULL;


--
-- Name: chatbot_conversations chatbot_conversations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: chatbot_messages chatbot_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chatbot_conversations(id) ON DELETE CASCADE;


--
-- Name: customer_notifications customer_notifications_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notifications
    ADD CONSTRAINT customer_notifications_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_notifications customer_notifications_related_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notifications
    ADD CONSTRAINT customer_notifications_related_order_id_fkey FOREIGN KEY (related_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: customer_order_violations customer_order_violations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_order_violations
    ADD CONSTRAINT customer_order_violations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customer_order_violations customer_order_violations_flagged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_order_violations
    ADD CONSTRAINT customer_order_violations_flagged_by_fkey FOREIGN KEY (flagged_by) REFERENCES public.staff_accounts(id);


--
-- Name: customer_order_violations customer_order_violations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_order_violations
    ADD CONSTRAINT customer_order_violations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: customer_restrictions customer_restrictions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_restrictions
    ADD CONSTRAINT customer_restrictions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customer_restrictions customer_restrictions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_restrictions
    ADD CONSTRAINT customer_restrictions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.staff_accounts(id);


--
-- Name: deliveries deliveries_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.staff_accounts(id);


--
-- Name: deliveries deliveries_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: deliveries deliveries_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id);


--
-- Name: inventory_transactions fk_inventory_txn_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT fk_inventory_txn_order FOREIGN KEY (reference_order_id) REFERENCES public.orders(id);


--
-- Name: inventory_item_categories inventory_item_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_categories
    ADD CONSTRAINT inventory_item_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;


--
-- Name: inventory_item_categories inventory_item_categories_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_categories
    ADD CONSTRAINT inventory_item_categories_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: inventory_transactions inventory_transactions_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: inventory_transactions inventory_transactions_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.staff_accounts(id);


--
-- Name: kitchen_alerts kitchen_alerts_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_alerts
    ADD CONSTRAINT kitchen_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.staff_accounts(id);


--
-- Name: kitchen_alerts kitchen_alerts_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_alerts
    ADD CONSTRAINT kitchen_alerts_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.esp32_devices(id);


--
-- Name: kitchen_alerts kitchen_alerts_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_alerts
    ADD CONSTRAINT kitchen_alerts_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: menu_category_variant_groups menu_category_variant_groups_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_category_variant_groups
    ADD CONSTRAINT menu_category_variant_groups_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;


--
-- Name: menu_category_variant_groups menu_category_variant_groups_variant_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_category_variant_groups
    ADD CONSTRAINT menu_category_variant_groups_variant_group_id_fkey FOREIGN KEY (variant_group_id) REFERENCES public.variant_groups(id) ON DELETE CASCADE;


--
-- Name: menu_item_ingredients menu_item_ingredients_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_ingredients menu_item_ingredients_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_reviews menu_item_reviews_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_reviews
    ADD CONSTRAINT menu_item_reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: menu_item_reviews menu_item_reviews_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_reviews
    ADD CONSTRAINT menu_item_reviews_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_variants menu_item_variants_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_variants
    ADD CONSTRAINT menu_item_variants_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_variants menu_item_variants_variant_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_variants
    ADD CONSTRAINT menu_item_variants_variant_group_id_fkey FOREIGN KEY (variant_group_id) REFERENCES public.variant_groups(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id);


--
-- Name: notifications notifications_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_accounts(id);


--
-- Name: order_items order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_item_variants(id) ON DELETE SET NULL;


--
-- Name: order_status_history order_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.staff_accounts(id);


--
-- Name: order_status_history order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.staff_accounts(id);


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: payments payments_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.staff_accounts(id) ON DELETE SET NULL;


--
-- Name: riders riders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff_accounts(id);


--
-- Name: staff_accounts staff_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_accounts
    ADD CONSTRAINT staff_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff_accounts(id);


--
-- Name: support_chat_messages support_chat_messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_chat_messages
    ADD CONSTRAINT support_chat_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.support_chats(id) ON DELETE CASCADE;


--
-- Name: support_chat_messages support_chat_messages_related_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_chat_messages
    ADD CONSTRAINT support_chat_messages_related_order_id_fkey FOREIGN KEY (related_order_id) REFERENCES public.orders(id);


--
-- Name: support_chats support_chats_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_chats
    ADD CONSTRAINT support_chats_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- PostgreSQL database dump complete
--

\unrestrict OLjGaJveraYQUelOQOQtwExnGv62lOofs54ah0bZgfuaR79dDk1HmVWdejopYvc

