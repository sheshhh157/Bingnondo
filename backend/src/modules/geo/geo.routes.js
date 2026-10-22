/**
 * geo.routes.js
 * ──────────────
 * Mounted at /api/geo by server.js.
 *
 *   GET /api/geo/reverse?lat=&lng=
 *   GET /api/geo/search?q=&lat=&lng=&viewbox=&bounded=
 *
 * Both work signed-in or signed-out: the app shows the address picker before
 * the customer has an account in some flows, and the data is public.
 */

const express = require('express');
const ctrl = require('./geo.controller');

const router = express.Router();

/** GET /api/geo/reverse */
router.get('/reverse', ctrl.reverseGeocode);

/** GET /api/geo/search */
router.get('/search', ctrl.searchPlaces);

module.exports = router;
