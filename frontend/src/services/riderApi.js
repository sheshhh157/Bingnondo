/**
 * riderApi.js — Rider-scoped API calls.
 *
 * All endpoints require a JWT with type='rider'.
 * The shared apiClient (apiClient.js) handles token attachment,
 * silent refresh, and auth:expired dispatch automatically.
 *
 * Endpoint map (matches backend route group /api/rider/*):
 *   GET    /api/rider/delivery/current       → active assignment
 *   PATCH  /api/rider/delivery/:id/status    → update delivery status
 *   GET    /api/rider/deliveries             → delivery history
 *   GET    /api/rider/profile                → rider profile
 *   PATCH  /api/rider/profile                → update profile
 *   POST   /api/auth/login                   → shared login (staff + rider)
 */

import { get, patch, post } from './apiClient';

// ── Active Delivery ────────────────────────────────────────────────────────────

/**
 * GET /api/rider/delivery/current
 * Returns the currently assigned delivery, or null if none.
 *
 * Response shape:
 * {
 *   delivery: {
 *     id: number,
 *     order_id: number,
 *     order_number: string,
 *     status: 'assigned' | 'out_for_delivery' | 'delivered' | 'cancelled',
 *     assigned_at: string (ISO),
 *     customer_name: string,
 *     customer_contact: string,
 *     delivery_address: string,
 *     items: [{ name, quantity, unit_price }],
 *     total_amount: number,
 *     special_request: string | null,
 *   } | null
 * }
 */
export const getCurrentDelivery = () => get('/api/rider/delivery/current');

/**
 * PATCH /api/rider/delivery/:id/status
 * Moves the delivery to the next status.
 *
 * payload: { status: 'out_for_delivery' | 'delivered' }
 *
 * Side effects (handled by backend):
 *   out_for_delivery → orders.status = 'out_for_delivery' (+ history row)
 *   delivered        → orders.status = 'completed', riders.status = 'available',
 *                      next waiting delivery auto-assigned to this rider,
 *                      delivery/order events broadcast over socket.io
 */
export const updateDeliveryStatus = (id, status) =>
  patch(`/api/rider/delivery/${id}/status`, { status });

// ── Delivery History ───────────────────────────────────────────────────────────

/**
 * GET /api/rider/deliveries?status=delivered&page=1&limit=20
 * Returns paginated list of past deliveries for this rider.
 *
 * Response shape:
 * {
 *   deliveries: [{
 *     id, order_id, order_number, status,
 *     customer_name, delivery_address,
 *     total_amount, assigned_at, delivered_at,
 *     items: [{ name, quantity }]
 *   }],
 *   pagination: { page, limit, total, total_pages }
 * }
 */
export const getDeliveryHistory = (params = {}) => {
  const qs = new URLSearchParams({
    status: 'delivered',
    page: params.page || 1,
    limit: params.limit || 20,
    ...params,
  }).toString();
  return get(`/api/rider/deliveries?${qs}`);
};

// ── Rider Profile ──────────────────────────────────────────────────────────────

/**
 * GET /api/rider/profile
 * Returns the authenticated rider's profile.
 *
 * Response shape:
 * {
 *   rider: {
 *     id, first_name, middle_name, last_name, full_name, email, mobile_number,
 *     plate_number, vehicle_type, status, last_login, profile_image_url
 *   }
 * }
 */
export const getRiderProfile = () => get('/api/rider/profile');

/**
 * PATCH /api/rider/profile
 * Update editable profile fields.
 * payload: { first_name?, middle_name?, last_name?, plate_number?, vehicle_type?, mobile_number? }
 */
export const updateRiderProfile = (payload) => patch('/api/rider/profile', payload);

// ── Batch ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/rider/batch/current
 * Returns the rider's active batch (waiting or in_progress) with all stops,
 * timer remaining, and per-stop delivery info including destination coordinates.
 */
export const getCurrentBatch = () => get('/api/rider/batch/current');
export const dispatchCurrentBatch = () => post('/api/rider/batch/dispatch');

// ── Live Location ──────────────────────────────────────────────────────────────

/**
 * POST /api/rider/location
 * Sends the rider's current GPS coordinates to the backend.
 * The backend upserts to rider_locations and broadcasts via Socket.io.
 *
 * payload: { latitude, longitude, accuracy? }
 */
export const updateRiderLocation = (payload) => post('/api/rider/location', payload);

/**
 * GET /api/rider/location/:riderId
 * Returns the last known location for a specific rider.
 */
export const getRiderLocation = (riderId) => get(`/api/rider/location/${riderId}`);

// ── Daily Work Status ──────────────────────────────────────────────────────────

/**
 * GET /api/rider/work-status
 * Returns the rider's work status for today.
 *
 * Response shape:
 * {
 *   needs_prompt:        boolean,          // true → show the slide prompt
 *   work_status:         'working' | 'off' | null,
 *   overridden_by_admin: boolean,
 * }
 */
export const getWorkStatus = () => get('/api/rider/work-status');

/**
 * POST /api/rider/work-status
 * Rider answers the daily prompt. One-shot per day (resets at 12:00 AM).
 *
 * payload: { status: 'working' | 'off' }
 */
export const setWorkStatus = (status) => post('/api/rider/work-status', { status });

export default {
  getCurrentDelivery,
  updateDeliveryStatus,
  getDeliveryHistory,
  getRiderProfile,
  updateRiderProfile,
  updateRiderLocation,
  getRiderLocation,
  getCurrentBatch,
  dispatchCurrentBatch,
  getWorkStatus,
  setWorkStatus,
};