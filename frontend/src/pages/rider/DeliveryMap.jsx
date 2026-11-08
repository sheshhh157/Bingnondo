/**
 * DeliveryMap.jsx
 * ───────────────
 * OpenStreetMap navigation panel for the Active Delivery page.
 *
 * Features:
 *  - Live GPS tracking via navigator.geolocation.watchPosition()
 *  - Custom rider + destination markers on a Leaflet map
 *  - Road routing via OSRM (public demo, configurable via VITE_OSRM_URL)
 *  - Distance + ETA display
 *  - Turn-by-turn instruction list (parsed from OSRM step maneuvers)
 *  - Recenter button
 *  - Graceful error handling (permissions, no coords, routing failures)
 *  - Location updates sent to backend REST + Socket.io for real-time broadcast
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { updateRiderLocation } from '../../services/riderApi';
import 'leaflet/dist/leaflet.css';

// ── Fix Leaflet's default icon paths broken by bundlers ──────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Custom icons ─────────────────────────────────────────────────────────────
const riderIcon = L.divIcon({
  className: '',
  html: `<div class="dm-rider-pin" aria-label="Your location">
           <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
             xmlns="http://www.w3.org/2000/svg">
             <circle cx="12" cy="12" r="10" fill="#EA580C" stroke="#fff" stroke-width="2.5"/>
             <path d="M12 7v5l3 3" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
           </svg>
         </div>`,
  iconSize:   [28, 28],
  iconAnchor: [14, 14],
});

const destIcon = L.divIcon({
  className: '',
  html: `<div class="dm-dest-pin" aria-label="Customer destination">
           <svg width="28" height="36" viewBox="0 0 28 36" fill="none"
             xmlns="http://www.w3.org/2000/svg">
             <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.268 21.732 0 14 0z"
               fill="#1D4ED8"/>
             <circle cx="14" cy="14" r="5" fill="#fff"/>
           </svg>
         </div>`,
  iconSize:   [28, 36],
  iconAnchor: [14, 36],
});

// ── Routing config ────────────────────────────────────────────────────────────
// Uses OpenRouteService for accurate Philippine road routing.
// Set VITE_ORS_API_KEY in .env (free key at openrouteservice.org).
// Falls back to OSRM public demo when key is not set.
const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY || '';
const ORS_BASE    = 'https://api.openrouteservice.org';
const OSRM_BASE   = import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org';

// Minimum distance (m) the rider must deviate before a route re-fetch is forced
const REROUTE_THRESHOLD_M = 150;
// Minimum movement (m) between GPS fixes before sending an update to the backend
const MIN_UPDATE_DISTANCE_M = 20;
// Minimum interval between backend location writes (ms)
const MIN_UPDATE_INTERVAL_MS = 8000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return haversine(py, px, ay, ax);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return haversine(py, px, ay + t * dy, ax + t * dx);
}

/** Closest distance from point to any segment of a polyline [[lat,lng],...] */
function distanceToPolyline(lat, lng, polyline) {
  if (!polyline || polyline.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = pointToSegmentDistance(lng, lat, polyline[i][1], polyline[i][0], polyline[i+1][1], polyline[i+1][0]);
    if (d < min) min = d;
  }
  return min;
}

/** Format seconds → "X min" or "X h Y min" */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** Format meters → "X.X km" */
function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Parse ORS instruction text → modifier string compatible with maneuverText()
 * ORS returns plain English instructions like "Turn right onto Rizal St"
 */
function orsModifier(instruction = '') {
  const t = instruction.toLowerCase();
  if (t.includes('turn left'))         return 'left';
  if (t.includes('turn right'))        return 'right';
  if (t.includes('slight left'))       return 'slight left';
  if (t.includes('slight right'))      return 'slight right';
  if (t.includes('sharp left'))        return 'sharp left';
  if (t.includes('sharp right'))       return 'sharp right';
  if (t.includes('straight'))          return 'straight';
  if (t.includes('roundabout'))        return 'roundabout';
  if (t.includes('u-turn'))            return 'uturn';
  if (t.includes('arrive'))            return 'arrive';
  if (t.includes('depart') || t.includes('head')) return 'depart';
  return 'straight';
}

/** Map OSRM maneuver type+modifier → readable instruction */
function maneuverText(step) {
  const type     = step?.maneuver?.type     ?? '';
  const modifier = step?.maneuver?.modifier ?? '';
  const name     = step?.name ? `onto ${step.name}` : '';

  const map = {
    'depart':      `Start ${name}`,
    'arrive':      'Arrive at destination',
    'turn left':   `Turn left ${name}`,
    'turn right':  `Turn right ${name}`,
    'turn slight left':  `Turn slight left ${name}`,
    'turn slight right': `Turn slight right ${name}`,
    'turn sharp left':   `Turn sharp left ${name}`,
    'turn sharp right':  `Turn sharp right ${name}`,
    'straight':    `Continue straight ${name}`,
    'roundabout':  `Enter roundabout ${name}`,
    'exit roundabout': `Exit roundabout ${name}`,
    'merge':       `Merge ${modifier} ${name}`,
    'fork left':   `Keep left at the fork ${name}`,
    'fork right':  `Keep right at the fork ${name}`,
    'end of road left':  `Turn left at the end of road ${name}`,
    'end of road right': `Turn right at the end of road ${name}`,
    'continue':    `Continue ${modifier} ${name}`,
    'new name':    `Continue ${name}`,
  };

  const key = `${type} ${modifier}`.trim();
  return map[key] || map[type] || `${type} ${modifier}`.trim() || 'Continue';
}

// ── Sub-components ────────────────────────────────────────────────────────────

const FOLLOW_ZOOM   = 17;   // zoom level when auto-following the rider
const RESUME_DELAY  = 3000; // ms before auto-follow resumes after manual interaction

/**
 * AutoFollow
 * ──────────
 * Handles three behaviours inside the MapContainer context:
 *
 *  1. Initial fit  — on first route load, fit bounds to show rider + destination.
 *  2. Auto-follow  — when followMode is true, pan + zoom to rider on every GPS update.
 *  3. Manual pause — listens for user drag/zoom events; pauses follow mode and
 *                    schedules a resume after RESUME_DELAY ms.
 *  4. Recenter     — when the recenter trigger fires, snap back immediately and
 *                    re-enable follow mode.
 */
function AutoFollow({ riderPos, destPos, shouldFit, onFitDone,
                      followMode, onFollowPause, onFollowResume,
                      recenterTrigger, firstFix }) {
  const map             = useMap();
  const resumeTimer     = useRef(null);
  // Always keep a ref to the latest riderPos so the resume timer
  // can pan to the *current* position, not a stale closure value.
  const riderPosRef     = useRef(riderPos);
  const followModeRef   = useRef(followMode);

  useEffect(() => { riderPosRef.current   = riderPos;   }, [riderPos]);
  useEffect(() => { followModeRef.current = followMode; }, [followMode]);

  // ── 1. Initial bounds fit (once, when route first loads) ──────────────────
  useEffect(() => {
    if (!shouldFit || !riderPos || !destPos) return;
    try {
      const bounds = L.latLngBounds([riderPos, destPos]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: FOLLOW_ZOOM });
      onFitDone();
    } catch (_) { /* ignore */ }
  }, [shouldFit, riderPos, destPos, map, onFitDone]);

  // ── 2. Auto-zoom in on very first GPS fix ─────────────────────────────────
  useEffect(() => {
    if (!firstFix || !riderPos) return;
    map.setView(riderPos, FOLLOW_ZOOM, { animate: true, duration: 1.2 });
  }, [firstFix, riderPos, map]);

  // ── 3. Auto-follow: pan to rider on every GPS update ─────────────────────
  // Runs whenever riderPos changes (new GPS fix) AND followMode is active.
  // Also runs when followMode flips back to true (resume), using the ref
  // to get the latest position even if riderPos prop hasn't changed.
  useEffect(() => {
    if (!followMode || !riderPos) return;
    map.setView(riderPos, Math.max(map.getZoom(), FOLLOW_ZOOM), { animate: true, duration: 0.5 });
  }, [riderPos, map]); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ intentionally omit followMode — we handle the resume case below

  // ── 4. Listen for manual interaction → pause follow for 3 s ──────────────
  useEffect(() => {
    const pause = () => {
      onFollowPause();
      clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => {
        // Force-pan to current rider position on resume,
        // regardless of whether riderPos prop changed while paused.
        const pos = riderPosRef.current;
        if (pos) {
          map.setView(pos, Math.max(map.getZoom(), FOLLOW_ZOOM), { animate: true, duration: 0.5 });
        }
        onFollowResume();
      }, RESUME_DELAY);
    };

    map.on('dragstart', pause);
    map.on('zoomstart', pause);

    return () => {
      map.off('dragstart', pause);
      map.off('zoomstart', pause);
      clearTimeout(resumeTimer.current);
    };
  }, [map, onFollowPause, onFollowResume]);

  // ── 5. Recenter button → snap back immediately + resume follow ────────────
  useEffect(() => {
    if (!recenterTrigger) return;
    clearTimeout(resumeTimer.current);
    const pos = riderPosRef.current;
    if (pos) map.setView(pos, FOLLOW_ZOOM, { animate: true, duration: 0.6 });
    onFollowResume();
  }, [recenterTrigger, map, onFollowResume]);

  return null;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DeliveryMap({ delivery, isActive }) {
  const destLat = delivery?.destination_latitude  ?? null;
  const destLng = delivery?.destination_longitude ?? null;
  const hasDestination = destLat !== null && destLng !== null;

  // ── State ──────────────────────────────────────────────────────────────────
  const [gpsStatus,  setGpsStatus]  = useState('idle'); // idle | requesting | tracking | denied | unavailable | error
  const [riderPos,   setRiderPos]   = useState(null);   // [lat, lng]
  const [accuracy,   setAccuracy]   = useState(null);
  const [route,      setRoute]      = useState(null);   // { polyline, distance, duration, steps }
  const [routeErr,   setRouteErr]   = useState('');
  const [fitMap,     setFitMap]     = useState(false);
  const [recenter,   setRecenter]   = useState(0);
  const [showSteps,  setShowSteps]  = useState(false);
  const [followMode, setFollowMode] = useState(true);   // auto-follow rider on map
  const [firstFix,   setFirstFix]   = useState(false);  // triggers initial zoom-in once


  // ── Refs (stable across renders) ──────────────────────────────────────────
  const watchIdRef       = useRef(null);
  const lastSentRef      = useRef(null);   // { lat, lng, ts }
  const lastRouteRef     = useRef(null);   // last polyline used to measure deviation
  const routeFetchingRef = useRef(false);
  const hasHadFirstFix   = useRef(false);  // ensure firstFix fires only once


  // ── Route fetching — ORS first, OSRM fallback ─────────────────────────────
  const fetchRoute = useCallback(async (fromLat, fromLng, toLat, toLng) => {
    if (routeFetchingRef.current) return;
    routeFetchingRef.current = true;
    setRouteErr('');

    try {
      let routeData = null;

      // ── Try OpenRouteService first ──────────────────────────────────────
      if (ORS_API_KEY) {
        try {
          const orsRes = await fetch(
            `${ORS_BASE}/v2/directions/driving-car?` +
            `start=${fromLng},${fromLat}&end=${toLng},${toLat}`,
            {
              headers: {
                'Authorization': ORS_API_KEY,
                'Accept':        'application/json, application/geo+json',
              },
              signal: AbortSignal.timeout(8000),
            }
          );

          if (!orsRes.ok) throw new Error(`ORS HTTP ${orsRes.status}`);
          const orsData = await orsRes.json();
          const feature = orsData.features?.[0];
          if (!feature) throw new Error('ORS returned no route');

          const props    = feature.properties.summary;
          const coords   = feature.geometry.coordinates; // [lng, lat]
          const polyline = coords.map(([lng, lat]) => [lat, lng]);

          // ORS steps are inside segments
          const steps = feature.properties.segments?.[0]?.steps ?? [];
          const orsSteps = steps.map((s) => ({
            maneuver: { type: s.type === 0 ? 'depart' : s.type === 10 ? 'arrive' : 'turn',
                        modifier: orsModifier(s.instruction) },
            name:     s.name || '',
            distance: s.distance,
            duration: s.duration,
          }));

          routeData = {
            polyline,
            distance: props.distance,
            duration: props.duration,
            steps:    orsSteps,
          };
        } catch (orsErr) {
          console.warn('[DeliveryMap] ORS failed, trying OSRM:', orsErr.message);
        }
      }

      // ── Fallback: OSRM ─────────────────────────────────────────────────
      if (!routeData) {
        const url  = `${OSRM_BASE}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
        const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');

        const r        = data.routes[0];
        const polyline = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        routeData = {
          polyline,
          distance: r.distance,
          duration: r.duration,
          steps:    r.legs?.[0]?.steps ?? [],
        };
      }

      setRoute(routeData);
      lastRouteRef.current = routeData.polyline;
      setFitMap(true);

    } catch (err) {
      console.warn('[DeliveryMap] Routing error:', err.message);
      setRouteErr('Could not calculate route. Showing straight line.');
      if (hasDestination) {
        const polyline = [[fromLat, fromLng], [toLat, toLng]];
        setRoute({ polyline, distance: null, duration: null, steps: [] });
        lastRouteRef.current = polyline;
      }
    } finally {
      routeFetchingRef.current = false;
    }
  }, [hasDestination]);

  // ── GPS position handler ──────────────────────────────────────────────────
  const handlePosition = useCallback((pos) => {
    const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
    const newPos = [lat, lng];

    setGpsStatus('tracking');
    setRiderPos(newPos);
    setAccuracy(acc);

    // Trigger auto-zoom in on the very first fix only
    if (!hasHadFirstFix.current) {
      hasHadFirstFix.current = true;
      setFirstFix(true);
      // Reset flag after one render cycle so the effect doesn't re-fire
      setTimeout(() => setFirstFix(false), 100);
    }

    // Throttle backend writes: only if moved enough AND interval elapsed
    const now   = Date.now();
    const last  = lastSentRef.current;
    const moved = last ? haversine(last.lat, last.lng, lat, lng) : Infinity;
    const elapsed = last ? now - last.ts : Infinity;

    if (moved >= MIN_UPDATE_DISTANCE_M && elapsed >= MIN_UPDATE_INTERVAL_MS) {
      lastSentRef.current = { lat, lng, ts: now };
      // Fire-and-forget; errors don't disrupt the UI
      updateRiderLocation({ latitude: lat, longitude: lng, accuracy: acc }).catch(() => {});
    }

    // Initial route fetch or reroute when significantly off-route
    if (hasDestination) {
      const offRoute = lastRouteRef.current
        ? distanceToPolyline(lat, lng, lastRouteRef.current) > REROUTE_THRESHOLD_M
        : true;
      if (offRoute) {
        fetchRoute(lat, lng, destLat, destLng);
      }
    }
  }, [hasDestination, destLat, destLng, fetchRoute]);

  const handleGpsError = useCallback((err) => {
    if (err.code === err.PERMISSION_DENIED) {
      setGpsStatus('denied');
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      setGpsStatus('unavailable');
    } else {
      setGpsStatus('error');
    }
  }, []);

  // ── Start / stop GPS tracking ─────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      return;
    }

    setGpsStatus('requesting');
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleGpsError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isActive, handlePosition, handleGpsError]);

  // ── Map center: rider position if known, else destination, else Philippines ─
  const defaultCenter = riderPos
    ?? (hasDestination ? [destLat, destLng] : [12.8797, 121.774]);

  // ── GPS status banners ────────────────────────────────────────────────────
  const statusMessages = {
    idle:        null,
    requesting:  { type: 'info',    text: 'Requesting GPS permission…' },
    tracking:    accuracy && accuracy > 50
                   ? { type: 'warn', text: `GPS signal weak (±${Math.round(accuracy)} m)` }
                   : null,
    denied:      { type: 'error',   text: 'Location permission denied. Enable GPS in your browser settings.' },
    unavailable: { type: 'error',   text: 'GPS unavailable on this device.' },
    error:       { type: 'warn',    text: 'GPS signal lost. Showing last known location.' },
  };
  const statusMsg = statusMessages[gpsStatus];

  return (
    <div className="dm-root">
      <div className="dm-section-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        Navigation
      </div>

      {/* ── Status bar ── */}
      {statusMsg && (
        <div className={`dm-status dm-status--${statusMsg.type}`} role="status" aria-live="polite">
          <span className="dm-status__dot" />
          {statusMsg.text}
        </div>
      )}

      {/* ── No destination warning ── */}
      {!hasDestination && (
        <div className="dm-status dm-status--warn" role="alert">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          No delivery coordinates for this order. Use the address below to navigate manually.
        </div>
      )}

      {/* ── Route info strip ── */}
      {route && (
        <div className="dm-route-info">
          <div className="dm-route-stat">
            <span className="dm-route-stat__label">Distance</span>
            <span className="dm-route-stat__value">{formatDistance(route.distance)}</span>
          </div>
          <div className="dm-route-divider" />
          <div className="dm-route-stat">
            <span className="dm-route-stat__label">ETA</span>
            <span className="dm-route-stat__value">{formatDuration(route.duration)}</span>
          </div>
          {route.steps.length > 0 && (
            <>
              <div className="dm-route-divider" />
              <div className="dm-route-stat dm-route-stat--instruction">
                <span className="dm-route-stat__label">Next</span>
                <span className="dm-route-stat__value dm-route-stat__value--small">
                  {maneuverText(route.steps[0])}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {routeErr && (
        <div className="dm-status dm-status--warn" role="alert">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          </svg>
          {routeErr}
        </div>
      )}

      {/* ── Map container ── */}
      <div className="dm-map-wrap">
        <MapContainer
          center={defaultCenter}
          zoom={riderPos ? 15 : 12}
          className="dm-map"
          zoomControl={true}
          attributionControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          {riderPos && (
            <Marker position={riderPos} icon={riderIcon} />
          )}

          {hasDestination && (
            <Marker position={[destLat, destLng]} icon={destIcon} />
          )}

          {route && (
            <Polyline
              positions={route.polyline}
              pathOptions={{
                color:     '#1D4ED8',
                weight:    4,
                opacity:   0.88,
                dashArray: null,
              }}
            />
          )}

          <AutoFollow
            riderPos={riderPos}
            destPos={hasDestination ? [destLat, destLng] : null}
            shouldFit={fitMap}
            onFitDone={() => setFitMap(false)}
            followMode={followMode}
            onFollowPause={() => setFollowMode(false)}
            onFollowResume={() => setFollowMode(true)}
            recenterTrigger={recenter}
            firstFix={firstFix}
          />
        </MapContainer>

        {/* Recenter / follow mode button */}
        <button
          className={`dm-recenter-btn${followMode ? ' dm-recenter-btn--active' : ''}`}
          onClick={() => setRecenter(n => n + 1)}
          aria-label={followMode ? 'Following your location' : 'Tap to re-follow your location'}
          disabled={!riderPos}
          title={followMode ? 'Following your location' : 'Resume following'}
        >
          {/* Navigation arrow icon — filled when following */}
          <svg width="18" height="18" viewBox="0 0 24 24"
            fill={followMode ? 'currentColor' : 'none'}
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11"/>
          </svg>
        </button>

        {/* GPS tracking status indicator */}
        <div className={`dm-gps-badge dm-gps-badge--${gpsStatus}`} aria-label={`GPS: ${gpsStatus}`}>
          <span className="dm-gps-badge__dot" />
          {gpsStatus === 'tracking' ? 'GPS Live' : gpsStatus === 'requesting' ? 'GPS…' : 'GPS Off'}
        </div>
      </div>

      {/* ── Turn-by-turn steps (collapsible) ── */}
      {route && route.steps.length > 1 && (
        <div className="dm-steps-panel">
          <button
            className="dm-steps-toggle"
            onClick={() => setShowSteps(v => !v)}
            aria-expanded={showSteps}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            {showSteps ? 'Hide' : 'Show'} turn-by-turn directions ({route.steps.length} steps)
          </button>

          {showSteps && (
            <ol className="dm-steps-list">
              {route.steps.map((step, i) => (
                <li key={i} className="dm-step">
                  <span className="dm-step__num">{i + 1}</span>
                  <span className="dm-step__text">{maneuverText(step)}</span>
                  {step.distance > 0 && (
                    <span className="dm-step__dist">{formatDistance(step.distance)}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* OSM attribution note */}
      <p className="dm-osm-note">
        Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors.
        Routing by <a href="https://project-osrm.org/" target="_blank" rel="noopener noreferrer">OSRM</a>.
      </p>
    </div>
  );
}