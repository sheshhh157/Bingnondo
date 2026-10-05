# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the manager of a single physical Bingnondo store. During service hours, on a desktop in the shop, they watch live operations across kitchen, stock, delivery, and sales from one screen. No multi-store or area-management role is in scope. The system also serves cashier (counter orders and cash payments), kitchen staff (order queue), and staff (inventory/menu) roles, each with its own role-gated screen; an `owner` / `admin` / `manager` / `cashier` / `kitchen_staff` / `staff` role set governs access.

## Product Purpose

Give the store manager a single live, read-only view of everything happening in the operation right now — kitchen orders, inventory levels, deliveries, and sales — so they can spot problems (low stock, overdue orders, stalled deliveries) and intervene early. Success means the manager never needs to open the POS, the kitchen display, or a spreadsheet to know the current state of the store.

## Positioning

The one screen that shows kitchen, stock, delivery, and sales together, updating live. Neighboring tools each cover one station; none of them combines all four into a single manager-facing view.

## Operating Context

Single-store food operation during live service. The dashboard is used ambiently — glanced at between tasks — and consulted deliberately when something needs attention (a low-stock alert, an overdue kitchen order, a delayed rider). It runs alongside the backend on port 5000 and the frontend dev server on port 5173, with the Vite proxy joining them. Live updates arrive over Socket.io; when the backend is unreachable, the frontend falls back to built-in mock data rather than going blank.

## Capabilities and Constraints

Confirmed functionality (live backend): cashier counter ordering and cash payment (with automatic stock deduction and kitchen-buzzer trigger on payment); kitchen order queue with acknowledge / prepare / ready; inventory management with manual restock / adjustment plus automatic deduction on payment; menu management with variants and flavors, categories, and archive-not-delete; manager dashboard, sales report (date-range, CSV export, order drill-down) and operational oversight; real-time Socket.io updates; mock-data fallback when the backend is down.

Durable constraints future work must preserve:

- The manager dashboard is strictly read-only: it observes and reports; it never mutates orders, stock, or deliveries. (Cashier / kitchen / staff actions do mutate — those are separate, role-gated surfaces.)
- Works backend-down: the mock-data fallback is a requirement, not a placeholder.
- Hand-written CSS with the existing Chinese-heritage design tokens; no CSS framework.
- Socket.io live-update architecture with event-merge hooks (`useLiveData`).

## Brand Commitments

Bingnondo name and Chinese-heritage identity: warm paper background, heritage red/gold palette, Noto Sans TC body with Noto Serif TC headings. These tokens live in `frontend/src/index.css` and are binding for future work.

## Evidence on Hand

Real backend and frontend: `backend/` is a working Node/Express + PostgreSQL service (real orders, order items, payments, inventory, menu, staff auth, kitchen alerts, and ESP32 buzzer polling); `frontend/` is the React/Vite client. Real order and payment history exists in the database. Still mock-only (in-memory `MOCK_*` arrays in `frontend/src/services/api.js`, reset on reload): the four Admin pages, the staff Delivery queue, and the staff Support Chat inbox. The customer mobile app, chatbot, deliveries module, and customer restrictions are schema-only (tables exist, no backend). Future work must not fabricate testimonials, benchmarks, or deployment claims.

## Product Principles

1. Observe, never interfere: every surface reports state and offers paths to act elsewhere; nothing here changes operational data.
2. One glance is enough: the current state of the store must be scannable in seconds; detail lives one click deeper, never on the surface.
3. Live by default, honest when stale: real-time updates are the norm, and any fallback or degraded state says so plainly.
4. Respect the service rush: during peak hours the interface stays calm, legible, and fast; nothing flashes, blocks, or demands attention it hasn't earned.
5. Heritage is the frame, not the decoration: the Chinese-heritage identity carries trust and continuity; novelty must never dilute it.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established. Standard web legibility (readable type sizes, sufficient contrast, keyboard-reachable controls) is expected but no formal standard is mandated.
