/**
 * geo.controller.js
 * ─────────────────
 * Address lookup for the customer app's delivery pin.
 *
 * The app talks to:
 *   GET /api/geo/reverse?lat=&lng=   → { address, latitude, longitude,
 *                                        display_name }
 *   GET /api/geo/search?q=&lat=&lng=&viewbox=&bounded=
 *                                     → { results: [{ display_name, address,
 *                                        latitude, longitude }] }
 *
 * Both proxy OpenStreetMap Nominatim, so the device needs no API key and the
 * usage-policy throttling stays server-side.
 */

const NOMINATIM_BASE = process.env.NOMINATIM_BASE || 'https://nominatim.openstreetmap.org';
const REQUEST_TIMEOUT_MS = 8000;
// A descriptive User-Agent is required by the Nominatim usage policy.
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'BingnondoCafe/1.0 (delivery address lookup)';

/**
 * Fetch JSON from Nominatim with a timeout.
 * Throws an Error with a readable message when the upstream fails.
 */
async function nominatim(path, params) {
  const url = new URL(path, NOMINATIM_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Nominatim responded with ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** The full street address of a place, in a single line. */
function formatAddress(place) {
  if (!place) return '';
  const parts = [
    place.house_number,
    place.road,
    place.suburb,
    place.city || place.town || place.village,
    place.state,
    place.postcode,
    place.country,
  ].filter(Boolean);

  // De-duplicate adjacent repeats (a suburb that equals the city, etc.).
  return parts.filter((part, index) => index === 0 || part !== parts[index - 1]).join(', ');
}

// ─── GET /api/geo/reverse ────────────────────────────────────────────────────
async function reverseGeocode(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'A valid latitude and longitude are required.' });
    }

    const places = await nominatim('/reverse', {
      lat,
      lng,
      format: 'jsonv2',
      addressdetails: 1,
    });

    if (!Array.isArray(places) || places.length === 0) {
      return res.status(404).json({ message: 'No address found for that location.' });
    }

    const place = places[0];
    const address = formatAddress(place.address) || place.display_name || '';

    return res.status(200).json({
      address,
      latitude: parseFloat(place.lat),
      longitude: parseFloat(place.lon),
      display_name: place.display_name || address,
    });
  } catch (err) {
    console.error('[geo] reverse failed:', err.message);
    return res.status(502).json({ message: 'Could not look up that address. Please try again.' });
  }
}

// ─── GET /api/geo/search ─────────────────────────────────────────────────────
async function searchPlaces(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ message: 'Enter something to search for.' });
    }

    const params = {
      q,
      format: 'jsonv2',
      addressdetails: 1,
      limit: 10,
    };
    if (req.query.lat) params.lat = req.query.lat;
    if (req.query.lng) params.lon = req.query.lng;
    if (req.query.viewbox) params.viewbox = req.query.viewbox;
    if (req.query.bounded === '1' || req.query.bounded === 'true') params.bounded = 1;

    const places = await nominatim('/search', params);
    const list = Array.isArray(places) ? places : [];

    return res.status(200).json({
      results: list.map((place) => {
        const address = formatAddress(place.address) || place.display_name || '';
        return {
          display_name: place.display_name || address,
          address,
          latitude: parseFloat(place.lat),
          longitude: parseFloat(place.lon),
        };
      }),
    });
  } catch (err) {
    console.error('[geo] search failed:', err.message);
    return res.status(502).json({ message: 'Search failed. Please try again.' });
  }
}

module.exports = { reverseGeocode, searchPlaces };
