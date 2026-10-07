--
-- PostgreSQL database dump
--


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
    day_of_week integer NOT NULL,
    open_time time without time zone,
    close_time time without time zone,
    is_closed boolean DEFAULT false NOT NULL,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
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
    CONSTRAINT chatbot_messages_sender_check CHECK (((sender)::text = ANY ((ARRAY['customer'::character varying, 'bot'::character varying])::text[])))
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
-- Name: customer_order_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_order_violations (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    order_id integer NOT NULL,
    violation_type character varying(30) NOT NULL,
    flagged_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT customer_order_violations_violation_type_check CHECK (((violation_type)::text = ANY ((ARRAY['cancelled_before_prep'::character varying, 'cancelled_after_prep'::character varying, 'no_show'::character varying])::text[])))
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
    CONSTRAINT customer_restrictions_restriction_level_check CHECK (((restriction_level)::text = ANY ((ARRAY['none'::character varying, 'warned'::character varying, 'cod_restricted'::character varying, 'suspended'::character varying])::text[])))
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
    mobile_number character varying(20),
    mobile_verified boolean DEFAULT false,
    address text,
    profile_completed boolean DEFAULT false,
    status character varying(30) DEFAULT 'awaiting_verification'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT customers_status_check CHECK (((status)::text = ANY ((ARRAY['awaiting_verification'::character varying, 'active'::character varying, 'suspended'::character varying])::text[])))
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
-- Name: dashboard_switch_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_switch_config (
    id integer NOT NULL,
    scope text NOT NULL,
    staff_id integer,
    target_dashboard text,
    requires_pin boolean DEFAULT false NOT NULL,
    configured_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dashboard_switch_config_scope_check CHECK ((scope = ANY (ARRAY['per_staff'::text, 'per_dashboard'::text])))
);


--
-- Name: dashboard_switch_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dashboard_switch_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dashboard_switch_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dashboard_switch_config_id_seq OWNED BY public.dashboard_switch_config.id;


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
    CONSTRAINT deliveries_delivery_preference_check CHECK (((delivery_preference)::text = ANY ((ARRAY['own_delivery'::character varying, 'lalamove'::character varying])::text[]))),
    CONSTRAINT deliveries_status_check CHECK (((status)::text = ANY ((ARRAY['pending_assignment'::character varying, 'assigned'::character varying, 'out_for_delivery'::character varying, 'delivered'::character varying, 'cancelled'::character varying])::text[])))
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
    menu_category_id integer NOT NULL
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id integer NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    current_stock numeric(12,3) DEFAULT 0 NOT NULL,
    reorder_level numeric(12,3) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
    change_type text NOT NULL,
    quantity numeric(12,3) NOT NULL,
    performed_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reference_order_id integer,
    CONSTRAINT inventory_transactions_change_type_check CHECK ((change_type = ANY (ARRAY['restock'::text, 'deduction'::text, 'adjustment'::text])))
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
    triggered_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged_at timestamp with time zone,
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
    name text NOT NULL
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
-- Name: menu_item_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_ingredients (
    menu_item_id integer NOT NULL,
    inventory_item_id integer NOT NULL,
    quantity_required numeric(12,3) DEFAULT 0 NOT NULL
);


--
-- Name: menu_item_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_options (
    id integer NOT NULL,
    menu_item_id integer NOT NULL,
    name text NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    option_kind text DEFAULT 'variant'::text NOT NULL,
    CONSTRAINT menu_item_options_option_kind_check CHECK ((option_kind = ANY (ARRAY['variant'::text, 'flavor'::text]))),
    CONSTRAINT menu_item_options_price_check CHECK ((price >= (0)::numeric))
);


--
-- Name: TABLE menu_item_options; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.menu_item_options IS 'Sellable variants of a menu item (e.g. Hot / Iced for one coffee). price is the absolute amount charged for this variant.';


--
-- Name: COLUMN menu_item_options.option_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_item_options.option_kind IS 'What the option represents: a variant of the item''s form (variant) or an add-on flavor choice (flavor). Variant and flavor prices stack on a line.';


--
-- Name: menu_item_options_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menu_item_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menu_item_options_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menu_item_options_id_seq OWNED BY public.menu_item_options.id;


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id integer NOT NULL,
    category_id integer NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    image_url text,
    is_available boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone
);


--
-- Name: COLUMN menu_items.archived_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.archived_at IS 'Set when the item is removed from the menu. The row is kept because order_items reference it and store no name snapshot.';


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
    notes text,
    menu_item_option_id integer,
    menu_item_flavor_id integer
);


--
-- Name: COLUMN order_items.menu_item_option_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_items.menu_item_option_id IS 'Variant sold on this line. NULL for items that have no options. The referenced row is archived, never deleted, so the variant name on an old receipt keeps resolving.';


--
-- Name: COLUMN order_items.menu_item_flavor_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_items.menu_item_flavor_id IS 'Flavor sold on this line, on top of menu_item_option_id (NULL when the customer picked no flavor). Archived, never deleted, same history guarantee as menu_item_option_id.';


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
    status text NOT NULL,
    changed_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
    order_type text DEFAULT 'counter'::text NOT NULL,
    cashier_id integer,
    status text DEFAULT 'pending'::text NOT NULL,
    order_channel text DEFAULT 'web_counter'::text NOT NULL,
    total_amount numeric(10,2) DEFAULT 0 NOT NULL,
    special_request text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_id integer,
    CONSTRAINT orders_order_type_check CHECK ((order_type = ANY (ARRAY['online'::text, 'counter'::text]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'preparing'::text, 'ready'::text, 'out_for_delivery'::text, 'completed'::text, 'cancelled'::text])))
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
    contact text NOT NULL,
    otp_code text NOT NULL,
    purpose text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT otp_verifications_purpose_check CHECK ((purpose = ANY (ARRAY['email_verification'::text, 'mobile_verification'::text, 'password_reset'::text])))
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
    method text DEFAULT 'cash'::text NOT NULL,
    amount numeric(10,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    paymongo_payment_id character varying(150),
    cash_given numeric(10,2) DEFAULT NULL::numeric,
    change_given numeric(10,2) DEFAULT NULL::numeric,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'gcash'::text, 'cash_on_delivery'::text]))),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text])))
);


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
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    staff_account_id integer NOT NULL,
    token_hash text NOT NULL,
    family_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by integer
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.refresh_tokens IS 'Server-side registry of refresh-token hashes. One row per issued token; revoked_at is set when rotated, and presenting a revoked token revokes its whole family_id line.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: staff_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_accounts (
    id integer NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'staff'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    CONSTRAINT staff_accounts_role_check CHECK ((role = ANY (ARRAY['cashier'::text, 'kitchen_staff'::text, 'staff'::text, 'owner'::text, 'admin'::text, 'manager'::text]))),
    CONSTRAINT staff_accounts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deactivated'::text, 'suspended'::text])))
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
-- Name: staff_dashboard_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_dashboard_access (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    target_dashboard text NOT NULL,
    granted_by integer,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_dashboard_access_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_dashboard_access_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_dashboard_access_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_dashboard_access_id_seq OWNED BY public.staff_dashboard_access.id;


--
-- Name: staff_switch_pin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_switch_pin (
    staff_id integer NOT NULL,
    pin_hash text NOT NULL,
    set_by_admin boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


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
    CONSTRAINT support_chat_messages_sender_type_check CHECK (((sender_type)::text = ANY ((ARRAY['customer'::character varying, 'staff'::character varying])::text[])))
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
    CONSTRAINT support_chats_status_check CHECK (((status)::text = ANY ((ARRAY['unlocked'::character varying, 'locked'::character varying])::text[])))
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
-- Name: customer_order_violations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_order_violations ALTER COLUMN id SET DEFAULT nextval('public.customer_order_violations_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: dashboard_switch_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_switch_config ALTER COLUMN id SET DEFAULT nextval('public.dashboard_switch_config_id_seq'::regclass);


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
-- Name: menu_item_options id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_options ALTER COLUMN id SET DEFAULT nextval('public.menu_item_options_id_seq'::regclass);


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
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: staff_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_accounts ALTER COLUMN id SET DEFAULT nextval('public.staff_accounts_id_seq'::regclass);


--
-- Name: staff_dashboard_access id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_dashboard_access ALTER COLUMN id SET DEFAULT nextval('public.staff_dashboard_access_id_seq'::regclass);


--
-- Name: support_chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_chat_messages ALTER COLUMN id SET DEFAULT nextval('public.support_chat_messages_id_seq'::regclass);


--
-- Name: support_chats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_chats ALTER COLUMN id SET DEFAULT nextval('public.support_chats_id_seq'::regclass);


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
-- Name: dashboard_switch_config dashboard_switch_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_switch_config
    ADD CONSTRAINT dashboard_switch_config_pkey PRIMARY KEY (id);


--
-- Name: dashboard_switch_config dashboard_switch_config_staff_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_switch_config
    ADD CONSTRAINT dashboard_switch_config_staff_id_key UNIQUE (staff_id);


--
-- Name: dashboard_switch_config dashboard_switch_config_target_dashboard_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_switch_config
    ADD CONSTRAINT dashboard_switch_config_target_dashboard_key UNIQUE (target_dashboard);


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
    ADD CONSTRAINT inventory_item_categories_pkey PRIMARY KEY (inventory_item_id, menu_category_id);


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
-- Name: menu_item_ingredients menu_item_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_pkey PRIMARY KEY (menu_item_id, inventory_item_id);


--
-- Name: menu_item_options menu_item_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_options
    ADD CONSTRAINT menu_item_options_pkey PRIMARY KEY (id);


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
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


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
-- Name: staff_dashboard_access staff_dashboard_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_dashboard_access
    ADD CONSTRAINT staff_dashboard_access_pkey PRIMARY KEY (id);


--
-- Name: staff_dashboard_access staff_dashboard_access_staff_id_target_dashboard_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_dashboard_access
    ADD CONSTRAINT staff_dashboard_access_staff_id_target_dashboard_key UNIQUE (staff_id, target_dashboard);


--
-- Name: staff_switch_pin staff_switch_pin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_switch_pin
    ADD CONSTRAINT staff_switch_pin_pkey PRIMARY KEY (staff_id);


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
-- Name: idx_audit_log_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_actor ON public.audit_log USING btree (actor_id);


--
-- Name: idx_deliveries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_status ON public.deliveries USING btree (status);


--
-- Name: idx_esp32_devices_device_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_esp32_devices_device_code_unique ON public.esp32_devices USING btree (device_code);


--
-- Name: idx_inventory_item_categories_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_item_categories_category ON public.inventory_item_categories USING btree (menu_category_id);


--
-- Name: idx_inventory_txn_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_txn_item ON public.inventory_transactions USING btree (inventory_item_id);


--
-- Name: idx_inventory_txns_order_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inventory_txns_order_item ON public.inventory_transactions USING btree (reference_order_id, inventory_item_id) WHERE ((change_type = 'deduction'::text) AND (reference_order_id IS NOT NULL));


--
-- Name: idx_kitchen_alerts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kitchen_alerts_active ON public.kitchen_alerts USING btree (acknowledged_at) WHERE (acknowledged_at IS NULL);


--
-- Name: idx_kitchen_alerts_one_open_per_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_kitchen_alerts_one_open_per_order ON public.kitchen_alerts USING btree (order_id) WHERE (acknowledged_at IS NULL);


--
-- Name: idx_kitchen_alerts_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kitchen_alerts_order ON public.kitchen_alerts USING btree (order_id);


--
-- Name: idx_menu_item_options_active_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_menu_item_options_active_name ON public.menu_item_options USING btree (menu_item_id, name) WHERE (archived_at IS NULL);


--
-- Name: INDEX idx_menu_item_options_active_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_menu_item_options_active_name IS 'One live variant per name per item. Archived rows are excluded so a name can be reused after a toggle-off, without losing the row that old orders still reference.';


--
-- Name: idx_menu_item_options_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_options_item ON public.menu_item_options USING btree (menu_item_id) WHERE (archived_at IS NULL);


--
-- Name: idx_notifications_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_staff ON public.notifications USING btree (staff_id);


--
-- Name: idx_order_items_flavor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_flavor ON public.order_items USING btree (menu_item_flavor_id) WHERE (menu_item_flavor_id IS NOT NULL);


--
-- Name: idx_order_items_option; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_option ON public.order_items USING btree (menu_item_option_id) WHERE (menu_item_option_id IS NOT NULL);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_cashier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_cashier ON public.orders USING btree (cashier_id);


--
-- Name: idx_orders_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_otp_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_lookup ON public.otp_verifications USING btree (contact, purpose, created_at DESC);


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
-- Name: idx_refresh_tokens_family; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_family ON public.refresh_tokens USING btree (family_id);


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
-- Name: dashboard_switch_config dashboard_switch_config_configured_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_switch_config
    ADD CONSTRAINT dashboard_switch_config_configured_by_fkey FOREIGN KEY (configured_by) REFERENCES public.staff_accounts(id) ON DELETE SET NULL;


--
-- Name: dashboard_switch_config dashboard_switch_config_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_switch_config
    ADD CONSTRAINT dashboard_switch_config_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_accounts(id) ON DELETE CASCADE;


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
-- Name: inventory_item_categories inventory_item_categories_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_categories
    ADD CONSTRAINT inventory_item_categories_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: inventory_item_categories inventory_item_categories_menu_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_categories
    ADD CONSTRAINT inventory_item_categories_menu_category_id_fkey FOREIGN KEY (menu_category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;


--
-- Name: inventory_transactions inventory_transactions_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE RESTRICT;


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
-- Name: menu_item_options menu_item_options_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_options
    ADD CONSTRAINT menu_item_options_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


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
-- Name: order_items order_items_menu_item_flavor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_flavor_id_fkey FOREIGN KEY (menu_item_flavor_id) REFERENCES public.menu_item_options(id);


--
-- Name: order_items order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: order_items order_items_menu_item_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_option_id_fkey FOREIGN KEY (menu_item_option_id) REFERENCES public.menu_item_options(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


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
-- Name: refresh_tokens refresh_tokens_replaced_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_replaced_by_fkey FOREIGN KEY (replaced_by) REFERENCES public.refresh_tokens(id);


--
-- Name: refresh_tokens refresh_tokens_staff_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_staff_account_id_fkey FOREIGN KEY (staff_account_id) REFERENCES public.staff_accounts(id) ON DELETE CASCADE;


--
-- Name: staff_accounts staff_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_accounts
    ADD CONSTRAINT staff_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff_accounts(id) ON DELETE SET NULL;


--
-- Name: staff_dashboard_access staff_dashboard_access_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_dashboard_access
    ADD CONSTRAINT staff_dashboard_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.staff_accounts(id) ON DELETE SET NULL;


--
-- Name: staff_dashboard_access staff_dashboard_access_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_dashboard_access
    ADD CONSTRAINT staff_dashboard_access_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_accounts(id) ON DELETE CASCADE;


--
-- Name: staff_switch_pin staff_switch_pin_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_switch_pin
    ADD CONSTRAINT staff_switch_pin_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_accounts(id) ON DELETE CASCADE;


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


