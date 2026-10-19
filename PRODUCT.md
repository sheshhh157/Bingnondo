# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the manager of a single physical Bingnondo store. During service hours, on a desktop in the shop, they watch live operations across kitchen, stock, delivery, and sales from one screen. No multi-store or area-management role is in scope.

## Product Purpose

Give the store manager a single live, read-only view of everything happening in the operation right now — kitchen orders, inventory levels, deliveries, and sales — so they can spot problems (low stock, overdue orders, stalled deliveries) and intervene early. Success means the manager never needs to open the POS, the kitchen display, or a spreadsheet to know the current state of the store.

## Positioning

The one screen that shows kitchen, stock, delivery, and sales together, updating live. Neighboring tools each cover one station; none of them combines all four into a single manager-facing view.

## Operating Context

Single-store food operation during live service. The dashboard is used ambiently — glanced at between tasks — and consulted deliberately when something needs attention (a low-stock alert, an overdue kitchen order, a delayed rider). It runs alongside the existing backend on port 5000 and frontend dev server on port 5174, with the Vite proxy joining them. Live updates arrive over Socket.io every few seconds; when the backend is unreachable, the frontend shows an explicit stale/error state rather than fabricated data or a blank screen.

## Capabilities and Constraints

Confirmed functionality: dashboard overview with low-stock quick list; sales report with date-range picker, CSV export, and order drill-down; oversight hub with kitchen, stocks, and delivery views; real-time badges, toasts, and StatCard summaries.

Durable constraints future work must preserve:

- Strictly read-only: the dashboard observes and reports; it never mutates orders, stock, or deliveries.
- Works backend-down: a clear degraded state (error and stale indicators) is a requirement; the UI never fabricates data to fill a gap.
- Hand-written CSS with the existing Chinese-heritage design tokens; no CSS framework.
- Socket.io live-update architecture with event-merge hooks (`useLiveData`).

## Brand Commitments

Bingnondo name and Chinese-heritage identity: warm paper background, heritage red/gold palette, Noto Sans TC body with Noto Serif TC headings. These tokens live in `frontend/src/index.css` and are binding for future work.

## Evidence on Hand

Real structure, real backend: routes, components, and design tokens in `frontend/src`; an Express + PostgreSQL + Socket.io API in `backend/` with no mock-data layer. The local database holds only baseline menu, inventory, and staff rows — there is no production deployment and no real business data yet, so future work must not fabricate testimonials, benchmarks, or deployment claims.

## Product Principles

1. Observe, never interfere: every surface reports state and offers paths to act elsewhere; nothing here changes operational data.
2. One glance is enough: the current state of the store must be scannable in seconds; detail lives one click deeper, never on the surface.
3. Live by default, honest when stale: real-time updates are the norm, and any fallback or degraded state says so plainly.
4. Respect the service rush: during peak hours the interface stays calm, legible, and fast; nothing flashes, blocks, or demands attention it hasn't earned.
5. Heritage is the frame, not the decoration: the Chinese-heritage identity carries trust and continuity; novelty must never dilute it.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established. Standard web legibility (readable type sizes, sufficient contrast, keyboard-reachable controls) is expected but no formal standard is mandated.
