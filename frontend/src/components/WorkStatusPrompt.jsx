/**
 * WorkStatusPrompt.jsx
 *
 * Fullscreen daily check-in overlay shown to riders after login.
 * Resets every day at 12:00 AM. Slide LEFT = off duty, Slide RIGHT = on duty.
 * Once answered, the choice persists until midnight (logout does not reset it).
 *
 * Props:
 *   onChoice(status: 'working' | 'off') — called after a confirmed slide
 *   riderName: string
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import './WorkStatusPrompt.css';

const SLIDE_THRESHOLD = 0.42; // fraction of track width required to confirm

export default function WorkStatusPrompt({ onChoice, riderName }) {
  /* ── drag state ───────────────────────────────────────────────────── */
  const [dragging,  setDragging]  = useState(false);
  const [offsetX,   setOffsetX]   = useState(0);       // px offset of thumb
  const [direction, setDirection] = useState(null);     // 'left' | 'right' | null
  const [loading,   setLoading]   = useState(false);

  const trackRef   = useRef(null);
  const startXRef  = useRef(0);
  const trackWRef  = useRef(0);

  /* ── helpers ──────────────────────────────────────────────────────── */
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  const reset = useCallback(() => {
    setDragging(false);
    setOffsetX(0);
    setDirection(null);
  }, []);

  /* ── pointer events ───────────────────────────────────────────────── */
  const onPointerDown = useCallback((e) => {
    if (loading) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    trackWRef.current = trackRef.current?.offsetWidth || 300;
    startXRef.current = e.clientX;
    setDragging(true);
    setDirection(null);
  }, [loading]);

  const onPointerMove = useCallback((e) => {
    if (!dragging || loading) return;
    const dx = e.clientX - startXRef.current;
    const max = trackWRef.current * 0.48;
    const clamped = clamp(dx, -max, max);
    setOffsetX(clamped);
    setDirection(clamped < -8 ? 'left' : clamped > 8 ? 'right' : null);
  }, [dragging, loading]);

  const onPointerUp = useCallback(async (e) => {
    if (!dragging || loading) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);

    const trackW = trackWRef.current || 300;
    const ratio  = Math.abs(offsetX) / (trackW * 0.48);

    if (ratio >= SLIDE_THRESHOLD) {
      const chosen = offsetX < 0 ? 'off' : 'working';
      setLoading(true);
      setOffsetX(0);
      setDirection(null);
      try {
        await onChoice(chosen);
      } catch {
        setLoading(false);
      }
    } else {
      reset();
    }
  }, [dragging, loading, offsetX, onChoice, reset]);

  /* ── keyboard for accessibility ───────────────────────────────────── */
  const onKeyDown = useCallback(async (e) => {
    if (loading) return;
    if (e.key === 'ArrowLeft') {
      setLoading(true);
      await onChoice('off');
    } else if (e.key === 'ArrowRight') {
      setLoading(true);
      await onChoice('working');
    }
  }, [loading, onChoice]);

  /* ── progress fill width (symmetric from center) ─────────────────── */
  const fillPct = dragging
    ? Math.abs(offsetX) / ((trackWRef.current || 300) * 0.48) * 50
    : 0;

  /* ── thumb color based on direction ──────────────────────────────── */
  const thumbStyle = {
    transform:  `translateX(${offsetX}px)`,
    transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
    cursor:     loading ? 'not-allowed' : 'grab',
  };

  const trackFillStyle = direction === 'left'
    ? { left: `${50 - fillPct}%`, width: `${fillPct}%`, background: 'var(--wsp-off)' }
    : direction === 'right'
    ? { left: '50%', width: `${fillPct}%`, background: 'var(--wsp-working)' }
    : { width: 0 };

  /* ── render ───────────────────────────────────────────────────────── */
  return (
    <div className="wsp-backdrop" role="dialog" aria-modal="true"
      aria-label="Work availability check-in">

      <div className="wsp-card">

        {/* Header */}
        <div className="wsp-header">
          <div className="wsp-avatar" aria-hidden="true">
            {(riderName || 'R').charAt(0).toUpperCase()}
          </div>
          <p className="wsp-greeting">
            Kumusta,&nbsp;<strong>{riderName || 'Rider'}</strong>!
          </p>
          <h1 className="wsp-question">
            Magtratrabaho ka ba ngayon?
          </h1>
          <p className="wsp-hint">
            I-slide para piliin. Hindi mo mababago ito hanggang bukas.
          </p>
        </div>

        {/* Labels */}
        <div className="wsp-labels" aria-hidden="true">
          <span className="wsp-label wsp-label--off">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Hindi
          </span>
          <span className="wsp-label wsp-label--working">
            Oo
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
        </div>

        {/* Slide track */}
        <div
          className={`wsp-track${loading ? ' wsp-track--loading' : ''}${direction === 'left' ? ' wsp-track--left' : direction === 'right' ? ' wsp-track--right' : ''}`}
          ref={trackRef}
          role="slider"
          aria-valuetext={direction === 'left' ? 'Hindi' : direction === 'right' ? 'Oo' : 'Walang napili'}
          aria-label="Slide para pumili ng trabaho o pahinga"
          tabIndex={loading ? -1 : 0}
          onKeyDown={onKeyDown}
        >
          {/* progress fill */}
          <div className="wsp-track__fill" style={trackFillStyle} aria-hidden="true" />

          {/* center divider */}
          <div className="wsp-track__divider" aria-hidden="true" />

          {/* draggable thumb */}
          <div
            className={`wsp-thumb${loading ? ' wsp-thumb--loading' : ''}${direction === 'left' ? ' wsp-thumb--off' : direction === 'right' ? ' wsp-thumb--working' : ''}`}
            style={thumbStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={reset}
            aria-hidden="true"
          >
            {loading ? (
              <svg className="wsp-spinner" width="22" height="22" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2a10 10 0 1 0 10 10"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true">
                <polyline points="15 18 9 12 15 6"/>
                <polyline points="9 18 3 12 9 6" style={{ opacity: 0.4 }} />
                <polyline points="15 18 21 12 15 6" style={{ transform: 'scaleX(-1)', transformOrigin: '18px 12px' }} />
              </svg>
            )}
          </div>
        </div>

        {/* Keyboard hint */}
        <p className="wsp-kbd-hint" aria-hidden="true">
          Pwede ring gamitin: ← para hindi · → para oo
        </p>

      </div>
    </div>
  );
}