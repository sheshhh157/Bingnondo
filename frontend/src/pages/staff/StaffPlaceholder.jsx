// All staff sections (§4.1–§4.4) are now implemented.
// This file is kept as a safety fallback for unknown route types.
import '../../styles/StaffPlaceholder.css';

export default function StaffPlaceholder({ type }) {
  return (
    <div className="sph-root">
      <div className="sph-card">
        <div className="sph-icon" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <span className="sph-section">Coming soon</span>
        <h1 className="sph-title">Page not found</h1>
        <p className="sph-desc">This section ({type}) is not yet available.</p>
      </div>
    </div>
  );
}