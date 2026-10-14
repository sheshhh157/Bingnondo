--
-- PostgreSQL database dump
--

\restrict OYK7cgjuOgd1kAouuT15AfcxF6v1ToBb25BLCAndoJMjhIoln4sL6IB6CDJ9UvI

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
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
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.audit_log OWNER TO postgres;

--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_log_id_seq OWNER TO postgres;

--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: business_hours; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.business_hours OWNER TO postgres;

--
-- Name: business_hours_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.business_hours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.business_hours_id_seq OWNER TO postgres;

--
-- Name: business_hours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.business_hours_id_seq OWNED BY public.business_hours.id;


--
-- Name: chatbot_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chatbot_conversations (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.chatbot_conversations OWNER TO postgres;

--
-- Name: chatbot_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.chatbot_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_conversations_id_seq OWNER TO postgres;

--
-- Name: chatbot_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.chatbot_conversations_id_seq OWNED BY public.chatbot_conversations.id;


--
-- Name: chatbot_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chatbot_messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    sender character varying(10) NOT NULL,
    content text NOT NULL,
    sent_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chatbot_messages_sender_check CHECK (((sender)::text = ANY ((ARRAY['customer'::character varying, 'bot'::character varying])::text[])))
);


ALTER TABLE public.chatbot_messages OWNER TO postgres;

--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.chatbot_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chatbot_messages_id_seq OWNER TO postgres;

--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.chatbot_messages_id_seq OWNED BY public.chatbot_messages.id;


--
-- Name: customer_order_violations; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.customer_order_violations OWNER TO postgres;

--
-- Name: customer_order_violations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.customer_order_violations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customer_order_violations_id_seq OWNER TO postgres;

--
-- Name: customer_order_violations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.customer_order_violations_id_seq OWNED BY public.customer_order_violations.id;


--
-- Name: customer_restrictions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_restrictions (
    customer_id integer NOT NULL,
    restriction_level character varying(20) DEFAULT 'none'::character varying NOT NULL,
    reason text,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT customer_restrictions_restriction_level_check CHECK (((restriction_level)::text = ANY ((ARRAY['none'::character varying, 'warned'::character varying, 'cod_restricted'::character varying, 'suspended'::character varying])::text[])))
);


ALTER TABLE public.customer_restrictions OWNER TO postgres;

--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
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
    CONSTRAINT customers_status_check CHECK (((status)::text = ANY ((ARRAY['awaiting_verification'::character varying, 'active'::character varying, 'suspended'::character varying])::text[])))
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customers_id_seq OWNER TO postgres;

--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: dashboard_switch_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dashboard_switch_config (
    id integer NOT NULL,
    scope character varying(20) NOT NULL,
    staff_id integer,
    target_dashboard character varying(20),
    requires_pin boolean DEFAULT false NOT NULL,
    configured_by integer NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_scope_fields CHECK (((((scope)::text = 'per_staff'::text) AND (staff_id IS NOT NULL) AND (target_dashboard IS NULL)) OR (((scope)::text = 'per_dashboard'::text) AND (target_dashboard IS NOT NULL) AND (staff_id IS NULL)))),
    CONSTRAINT dashboard_switch_config_scope_check CHECK (((scope)::text = ANY ((ARRAY['per_staff'::character varying, 'per_dashboard'::character varying])::text[]))),
    CONSTRAINT dashboard_switch_config_target_dashboard_check CHECK (((target_dashboard)::text = ANY ((ARRAY['cashier'::character varying, 'kitchen_staff'::character varying, 'staff'::character varying, 'owner'::character varying])::text[])))
);


ALTER TABLE public.dashboard_switch_config OWNER TO postgres;

--
-- Name: TABLE dashboard_switch_config; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.dashboard_switch_config IS 'Controls whether PIN verification is required on switch — scoped per staff member or per target dashboard.';


--
-- Name: dashboard_switch_config_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dashboard_switch_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dashboard_switch_config_id_seq OWNER TO postgres;

--
-- Name: dashboard_switch_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dashboard_switch_config_id_seq OWNED BY public.dashboard_switch_config.id;


--
-- Name: deliveries; Type: TABLE; Schema: public; Owner: postgres
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
    CONSTRAINT deliveries_delivery_preference_check CHECK (((delivery_preference)::text = ANY ((ARRAY['own_delivery'::character varying, 'lalamove'::character varying])::text[]))),
    CONSTRAINT deliveries_status_check CHECK (((status)::text = ANY ((ARRAY['pending_assignment'::character varying, 'assigned'::character varying, 'out_for_delivery'::character varying, 'delivered'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.deliveries OWNER TO postgres;

--
-- Name: deliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.deliveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.deliveries_id_seq OWNER TO postgres;

--
-- Name: deliveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.deliveries_id_seq OWNED BY public.deliveries.id;


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_items (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    unit character varying(20) NOT NULL,
    current_stock numeric(10,2) DEFAULT 0 NOT NULL,
    reorder_level numeric(10,2) DEFAULT 0,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.inventory_items OWNER TO postgres;

--
-- Name: inventory_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_items_id_seq OWNER TO postgres;

--
-- Name: inventory_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_items_id_seq OWNED BY public.inventory_items.id;


--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_transactions (
    id integer NOT NULL,
    inventory_item_id integer NOT NULL,
    change_type character varying(20) NOT NULL,
    quantity numeric(10,2) NOT NULL,
    reference_order_id integer,
    performed_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventory_transactions_change_type_check CHECK (((change_type)::text = ANY ((ARRAY['restock'::character varying, 'deduction'::character varying, 'adjustment'::character varying])::text[])))
);


ALTER TABLE public.inventory_transactions OWNER TO postgres;

--
-- Name: inventory_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_transactions_id_seq OWNER TO postgres;

--
-- Name: inventory_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_transactions_id_seq OWNED BY public.inventory_transactions.id;


--
-- Name: kitchen_alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kitchen_alerts (
    id integer NOT NULL,
    order_id integer NOT NULL,
    device_id integer,
    triggered_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at timestamp without time zone,
    acknowledged_by integer
);


ALTER TABLE public.kitchen_alerts OWNER TO postgres;

--
-- Name: kitchen_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.kitchen_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.kitchen_alerts_id_seq OWNER TO postgres;

--
-- Name: kitchen_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.kitchen_alerts_id_seq OWNED BY public.kitchen_alerts.id;


--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.menu_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    display_order smallint DEFAULT 0 NOT NULL
);


ALTER TABLE public.menu_categories OWNER TO postgres;

--
-- Name: menu_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.menu_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.menu_categories_id_seq OWNER TO postgres;

--
-- Name: menu_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.menu_categories_id_seq OWNED BY public.menu_categories.id;


--
-- Name: menu_item_ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.menu_item_ingredients (
    menu_item_id integer NOT NULL,
    inventory_item_id integer NOT NULL,
    quantity_required numeric(10,2)
);


ALTER TABLE public.menu_item_ingredients OWNER TO postgres;

--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.menu_items OWNER TO postgres;

--
-- Name: menu_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.menu_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.menu_items_id_seq OWNER TO postgres;

--
-- Name: menu_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.menu_items_id_seq OWNED BY public.menu_items.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_id_seq OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    menu_item_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    notes character varying(255),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_status_history (
    id integer NOT NULL,
    order_id integer NOT NULL,
    status character varying(20) NOT NULL,
    changed_by integer,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.order_status_history OWNER TO postgres;

--
-- Name: order_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_status_history_id_seq OWNER TO postgres;

--
-- Name: order_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_status_history_id_seq OWNED BY public.order_status_history.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
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
    CONSTRAINT orders_order_type_check CHECK (((order_type)::text = ANY ((ARRAY['online'::character varying, 'counter'::character varying])::text[]))),
    CONSTRAINT orders_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'preparing'::character varying, 'ready'::character varying, 'out_for_delivery'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: otp_verifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.otp_verifications (
    id integer NOT NULL,
    contact character varying(255) NOT NULL,
    otp_code character varying(6) NOT NULL,
    purpose character varying(30) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT otp_verifications_purpose_check CHECK (((purpose)::text = ANY ((ARRAY['email_verification'::character varying, 'mobile_verification'::character varying, 'password_reset'::character varying])::text[])))
);


ALTER TABLE public.otp_verifications OWNER TO postgres;

--
-- Name: otp_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.otp_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.otp_verifications_id_seq OWNER TO postgres;

--
-- Name: otp_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.otp_verifications_id_seq OWNED BY public.otp_verifications.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
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
    CONSTRAINT payments_method_check CHECK (((method)::text = ANY ((ARRAY['gcash'::character varying, 'cash'::character varying, 'cash_on_delivery'::character varying])::text[]))),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'awaiting_verification'::character varying, 'paid'::character varying, 'rejected'::character varying, 'refunded'::character varying])::text[])))
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: pending_registrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pending_registrations (
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.pending_registrations OWNER TO postgres;

--
-- Name: riders; Type: TABLE; Schema: public; Owner: postgres
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
    CONSTRAINT riders_status_check CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'on_delivery'::character varying, 'inactive'::character varying])::text[])))
);


ALTER TABLE public.riders OWNER TO postgres;

--
-- Name: riders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.riders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.riders_id_seq OWNER TO postgres;

--
-- Name: riders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.riders_id_seq OWNED BY public.riders.id;


--
-- Name: staff_accounts; Type: TABLE; Schema: public; Owner: postgres
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
    CONSTRAINT staff_accounts_role_check CHECK (((role)::text = ANY ((ARRAY['cashier'::character varying, 'kitchen_staff'::character varying, 'staff'::character varying, 'owner'::character varying, 'admin'::character varying])::text[]))),
    CONSTRAINT staff_accounts_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'deactivated'::character varying])::text[])))
);


ALTER TABLE public.staff_accounts OWNER TO postgres;

--
-- Name: staff_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_accounts_id_seq OWNER TO postgres;

--
-- Name: staff_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.staff_accounts_id_seq OWNED BY public.staff_accounts.id;


--
-- Name: staff_dashboard_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_dashboard_access (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    target_dashboard character varying(20) NOT NULL,
    granted_by integer NOT NULL,
    granted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT staff_dashboard_access_target_dashboard_check CHECK (((target_dashboard)::text = ANY ((ARRAY['cashier'::character varying, 'kitchen_staff'::character varying, 'staff'::character varying, 'owner'::character varying])::text[])))
);


ALTER TABLE public.staff_dashboard_access OWNER TO postgres;

--
-- Name: TABLE staff_dashboard_access; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.staff_dashboard_access IS 'Admin-granted permission for a staff member to switch into a dashboard without logging out.';


--
-- Name: staff_dashboard_access_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_dashboard_access_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_dashboard_access_id_seq OWNER TO postgres;

--
-- Name: staff_dashboard_access_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.staff_dashboard_access_id_seq OWNED BY public.staff_dashboard_access.id;


--
-- Name: staff_switch_pin; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_switch_pin (
    staff_id integer NOT NULL,
    pin_hash character varying(255) NOT NULL,
    set_by_admin boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.staff_switch_pin OWNER TO postgres;

--
-- Name: TABLE staff_switch_pin; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.staff_switch_pin IS 'Bcrypt-hashed PIN used to authenticate a dashboard switch. Set by Admin; changeable by staff.';


--
-- Name: support_chat_messages; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.support_chat_messages OWNER TO postgres;

--
-- Name: support_chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.support_chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.support_chat_messages_id_seq OWNER TO postgres;

--
-- Name: support_chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.support_chat_messages_id_seq OWNED BY public.support_chat_messages.id;


--
-- Name: support_chats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_chats (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    status character varying(10) DEFAULT 'locked'::character varying,
    opened_at timestamp without time zone,
    locked_at timestamp without time zone,
    CONSTRAINT support_chats_status_check CHECK (((status)::text = ANY ((ARRAY['unlocked'::character varying, 'locked'::character varying])::text[])))
);


ALTER TABLE public.support_chats OWNER TO postgres;

--
-- Name: support_chats_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.support_chats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.support_chats_id_seq OWNER TO postgres;

--
-- Name: support_chats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.support_chats_id_seq OWNED BY public.support_chats.id;


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: business_hours id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_hours ALTER COLUMN id SET DEFAULT nextval('public.business_hours_id_seq'::regclass);


--
-- Name: chatbot_conversations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_conversations ALTER COLUMN id SET DEFAULT nextval('public.chatbot_conversations_id_seq'::regclass);


--
-- Name: chatbot_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_messages ALTER COLUMN id SET DEFAULT nextval('public.chatbot_messages_id_seq'::regclass);


--
-- Name: customer_order_violations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_order_violations ALTER COLUMN id SET DEFAULT nextval('public.customer_order_violations_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: dashboard_switch_config id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_switch_config ALTER COLUMN id SET DEFAULT nextval('public.dashboard_switch_config_id_seq'::regclass);


--
-- Name: deliveries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries ALTER COLUMN id SET DEFAULT nextval('public.deliveries_id_seq'::regclass);


--
-- Name: inventory_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items ALTER COLUMN id SET DEFAULT nextval('public.inventory_items_id_seq'::regclass);


--
-- Name: inventory_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions ALTER COLUMN id SET DEFAULT nextval('public.inventory_transactions_id_seq'::regclass);


--
-- Name: kitchen_alerts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kitchen_alerts ALTER COLUMN id SET DEFAULT nextval('public.kitchen_alerts_id_seq'::regclass);


--
-- Name: menu_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_categories ALTER COLUMN id SET DEFAULT nextval('public.menu_categories_id_seq'::regclass);


--
-- Name: menu_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items ALTER COLUMN id SET DEFAULT nextval('public.menu_items_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: order_status_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_status_history ALTER COLUMN id SET DEFAULT nextval('public.order_status_history_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: otp_verifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp_verifications ALTER COLUMN id SET DEFAULT nextval('public.otp_verifications_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: riders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.riders ALTER COLUMN id SET DEFAULT nextval('public.riders_id_seq'::regclass);


--
-- Name: staff_accounts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_accounts ALTER COLUMN id SET DEFAULT nextval('public.staff_accounts_id_seq'::regclass);


--
-- Name: staff_dashboard_access id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_dashboard_access ALTER COLUMN id SET DEFAULT nextval('public.staff_dashboard_access_id_seq'::regclass);


--
-- Name: support_chat_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_chat_messages ALTER COLUMN id SET DEFAULT nextval('public.support_chat_messages_id_seq'::regclass);


--
-- Name: support_chats id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_chats ALTER COLUMN id SET DEFAULT nextval('public.support_chats_id_seq'::regclass);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: business_hours business_hours_day_of_week_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_day_of_week_key UNIQUE (day_of_week);


--
-- Name: business_hours business_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_pkey PRIMARY KEY (id);


--
-- Name: chatbot_conversations chatbot_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_pkey PRIMARY KEY (id);


--
-- Name: chatbot_messages chatbot_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_pkey PRIMARY KEY (id);


--
-- Name: customer_order_violations customer_order_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_order_violations
    ADD CONSTRAINT customer_order_violations_pkey PRIMARY KEY (id);


--
-- Name: customer_restrictions customer_restrictions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_restrictions
    ADD CONSTRAINT customer_restrictions_pkey PRIMARY KEY (customer_id);


--
-- Name: customers customers_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_email_key UNIQUE (email);


--
-- Name: customers customers_mobile_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_mobile_number_key UNIQUE (mobile_number);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: dashboard_switch_config dashboard_switch_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_switch_config
    ADD CONSTRAINT dashboard_switch_config_pkey PRIMARY KEY (id);


--
-- Name: deliveries deliveries_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_order_id_key UNIQUE (order_id);


--
-- Name: deliveries deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_name_key UNIQUE (name);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);


--
-- Name: kitchen_alerts kitchen_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kitchen_alerts
    ADD CONSTRAINT kitchen_alerts_pkey PRIMARY KEY (id);


--
-- Name: menu_categories menu_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_name_key UNIQUE (name);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: menu_item_ingredients menu_item_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_pkey PRIMARY KEY (menu_item_id, inventory_item_id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: otp_verifications otp_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp_verifications
    ADD CONSTRAINT otp_verifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_key UNIQUE (order_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: pending_registrations pending_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_registrations
    ADD CONSTRAINT pending_registrations_pkey PRIMARY KEY (email);


--
-- Name: riders riders_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_email_key UNIQUE (email);


--
-- Name: riders riders_mobile_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_mobile_number_key UNIQUE (mobile_number);


--
-- Name: riders riders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_pkey PRIMARY KEY (id);


--
-- Name: staff_accounts staff_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_accounts
    ADD CONSTRAINT staff_accounts_email_key UNIQUE (email);


--
-- Name: staff_accounts staff_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_accounts
    ADD CONSTRAINT staff_accounts_pkey PRIMARY KEY (id);


--
-- Name: staff_dashboard_access staff_dashboard_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_dashboard_access
    ADD CONSTRAINT staff_dashboard_access_pkey PRIMARY KEY (id);


--
-- Name: staff_dashboard_access staff_dashboard_access_staff_id_target_dashboard_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_dashboard_access
    ADD CONSTRAINT staff_dashboard_access_staff_id_target_dashboard_key UNIQUE (staff_id, target_dashboard);


--
-- Name: staff_switch_pin staff_switch_pin_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_switch_pin
    ADD CONSTRAINT staff_switch_pin_pkey PRIMARY KEY (staff_id);


--
-- Name: support_chat_messages support_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_chat_messages
    ADD CONSTRAINT support_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: support_chats support_chats_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_chats
    ADD CONSTRAINT support_chats_customer_id_key UNIQUE (customer_id);


--
-- Name: support_chats support_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_chats
    ADD CONSTRAINT support_chats_pkey PRIMARY KEY (id);


--
-- Name: dashboard_switch_config uq_switch_config_dashboard; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_switch_config
    ADD CONSTRAINT uq_switch_config_dashboard UNIQUE (target_dashboard) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: dashboard_switch_config uq_switch_config_staff; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_switch_config
    ADD CONSTRAINT uq_switch_config_staff UNIQUE (staff_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: idx_audit_log_actor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_log_actor ON public.audit_log USING btree (actor_id);


--
-- Name: idx_deliveries_rider; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deliveries_rider ON public.deliveries USING btree (rider_id);


--
-- Name: idx_deliveries_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deliveries_status ON public.deliveries USING btree (status);


--
-- Name: idx_dsc_staff_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dsc_staff_id ON public.dashboard_switch_config USING btree (staff_id) WHERE (staff_id IS NOT NULL);


--
-- Name: idx_dsc_target_dashboard; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dsc_target_dashboard ON public.dashboard_switch_config USING btree (target_dashboard) WHERE (target_dashboard IS NOT NULL);


--
-- Name: idx_inventory_txn_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_txn_item ON public.inventory_transactions USING btree (inventory_item_id);


--
-- Name: idx_kitchen_alerts_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kitchen_alerts_order ON public.kitchen_alerts USING btree (order_id);


--
-- Name: idx_menu_categories_display_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_categories_display_order ON public.menu_categories USING btree (display_order, id);


--
-- Name: idx_menu_items_display_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_display_order ON public.menu_items USING btree (category_id, display_order, id);


--
-- Name: idx_menu_items_not_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_not_deleted ON public.menu_items USING btree (is_deleted) WHERE (is_deleted = false);


--
-- Name: idx_notifications_staff; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_staff ON public.notifications USING btree (staff_id);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_cashier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_cashier ON public.orders USING btree (cashier_id);


--
-- Name: idx_orders_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);


--
-- Name: idx_orders_order_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_order_number ON public.orders USING btree (order_number);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_otp_contact_purpose; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_otp_contact_purpose ON public.otp_verifications USING btree (contact, purpose);


--
-- Name: idx_payments_gcash_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_gcash_pending ON public.payments USING btree (status) WHERE ((status)::text = ANY (ARRAY[('awaiting_verification'::character varying)::text, ('rejected'::character varying)::text]));


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_riders_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_riders_email ON public.riders USING btree (email);


--
-- Name: idx_riders_mobile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_riders_mobile ON public.riders USING btree (mobile_number);


--
-- Name: idx_riders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_riders_status ON public.riders USING btree (status);


--
-- Name: idx_sda_staff_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sda_staff_id ON public.staff_dashboard_access USING btree (staff_id);


--
-- Name: idx_support_chat_messages_chat; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_support_chat_messages_chat ON public.support_chat_messages USING btree (chat_id);


--
-- Name: idx_violations_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_violations_created ON public.customer_order_violations USING btree (created_at);


--
-- Name: idx_violations_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_violations_customer ON public.customer_order_violations USING btree (customer_id);


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.staff_accounts(id);


--
-- Name: business_hours business_hours_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.staff_accounts(id) ON DELETE SET NULL;


--
-- Name: chatbot_conversations chatbot_conversations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: chatbot_messages chatbot_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chatbot_conversations(id) ON DELETE CASCADE;


--
-- Name: customer_order_violations customer_order_violations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_order_violations
    ADD CONSTRAINT customer_order_violations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customer_order_violations customer_order_violations_flagged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_order_violations
    ADD CONSTRAINT customer_order_violations_flagged_by_fkey FOREIGN KEY (flagged_by) REFERENCES public.staff_accounts(id);


--
-- Name: customer_order_violations customer_order_violations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_order_violations
    ADD CONSTRAINT customer_order_violations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: customer_restrictions customer_restrictions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_restrictions
    ADD CONSTRAINT customer_restrictions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customer_restrictions customer_restrictions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_restrictions
    ADD CONSTRAINT customer_restrictions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.staff_accounts(id);


--
-- Name: dashboard_switch_config dashboard_switch_config_configured_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_switch_config
    ADD CONSTRAINT dashboard_switch_config_configured_by_fkey FOREIGN KEY (configured_by) REFERENCES public.staff_accounts(id);


--
-- Name: dashboard_switch_config dashboard_switch_config_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_switch_config
    ADD CONSTRAINT dashboard_switch_config_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_accounts(id) ON DELETE CASCADE;


--
-- Name: deliveries deliveries_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.staff_accounts(id);


--
-- Name: deliveries deliveries_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: deliveries deliveries_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id);


--
-- Name: inventory_transactions fk_inventory_txn_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT fk_inventory_txn_order FOREIGN KEY (reference_order_id) REFERENCES public.orders(id);


--
-- Name: inventory_transactions inventory_transactions_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: inventory_transactions inventory_transactions_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.staff_accounts(id);


--
-- Name: kitchen_alerts kitchen_alerts_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kitchen_alerts
    ADD CONSTRAINT kitchen_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.staff_accounts(id);


--
-- Name: kitchen_alerts kitchen_alerts_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kitchen_alerts
    ADD CONSTRAINT kitchen_alerts_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: menu_item_ingredients menu_item_ingredients_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_ingredients menu_item_ingredients_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id);


--
-- Name: notifications notifications_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_accounts(id);


--
-- Name: order_items order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_status_history order_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.staff_accounts(id);


--
-- Name: order_status_history order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.staff_accounts(id);


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: payments payments_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.staff_accounts(id) ON DELETE SET NULL;


--
-- Name: riders riders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff_accounts(id);


--
-- Name: staff_accounts staff_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_accounts
    ADD CONSTRAINT staff_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff_accounts(id);


--
-- Name: staff_dashboard_access staff_dashboard_access_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_dashboard_access
    ADD CONSTRAINT staff_dashboard_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.staff_accounts(id);


--
-- Name: staff_dashboard_access staff_dashboard_access_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_dashboard_access
    ADD CONSTRAINT staff_dashboard_access_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_accounts(id) ON DELETE CASCADE;


--
-- Name: staff_switch_pin staff_switch_pin_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_switch_pin
    ADD CONSTRAINT staff_switch_pin_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_accounts(id) ON DELETE CASCADE;


--
-- Name: support_chat_messages support_chat_messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_chat_messages
    ADD CONSTRAINT support_chat_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.support_chats(id) ON DELETE CASCADE;


--
-- Name: support_chat_messages support_chat_messages_related_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_chat_messages
    ADD CONSTRAINT support_chat_messages_related_order_id_fkey FOREIGN KEY (related_order_id) REFERENCES public.orders(id);


--
-- Name: support_chats support_chats_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_chats
    ADD CONSTRAINT support_chats_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- PostgreSQL database dump complete
--

\unrestrict OYK7cgjuOgd1kAouuT15AfcxF6v1ToBb25BLCAndoJMjhIoln4sL6IB6CDJ9UvI

