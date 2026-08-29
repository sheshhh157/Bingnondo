export default function ConnectionStatus({ connected, reconnecting }) {
  if (connected) return null;
  return (
    <div
      className={`kp-connection kp-connection--${reconnecting ? 'reconnecting' : 'offline'}`}
      role="alert"
      aria-live="assertive"
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        {reconnecting ? (
          <path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        ) : (
          <><line x1="1" y1="1" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M2.5 5A6 6 0 0112 8.5M1 3a9 9 0 019.5 6M4.5 7.5A3 3 0 018 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
        )}
      </svg>
      {reconnecting ? 'Reconnecting…' : 'Connection lost — orders may be outdated'}
    </div>
  );
}