/**
 * managerIcons.jsx — the manager navigation/overview icons.
 *
 * KitchenIcon, StocksIcon and DeliveryIcon were defined twice (once in
 * ManagerLayout for the sidebar, once in OversightPage for the module cards)
 * with identical paths. They live here now with the one difference that
 * actually mattered — call sites pick their own size and stroke weight.
 *
 * Every export here is used. The old OversightPage hub also wanted an EyeIcon;
 * that page is gone, so the icon went with it.
 */

const Svg = ({ size, strokeWidth, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export function DashboardIcon({ size = 16, strokeWidth = 2 }) {
  return (
    <Svg size={size} strokeWidth={strokeWidth}>
      <rect x="3" y="3" width="7" height="9" rx="1"/>
      <rect x="14" y="3" width="7" height="5" rx="1"/>
      <rect x="14" y="12" width="7" height="9" rx="1"/>
      <rect x="3" y="16" width="7" height="5" rx="1"/>
    </Svg>
  );
}

export function SalesIcon({ size = 16, strokeWidth = 2 }) {
  return (
    <Svg size={size} strokeWidth={strokeWidth}>
      <path d="M3 3v18h18"/>
      <path d="M7 14l4-4 3 3 5-6"/>
    </Svg>
  );
}

export function KitchenIcon({ size = 16, strokeWidth = 2 }) {
  return (
    <Svg size={size} strokeWidth={strokeWidth}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
      <path d="M7 2v20"/>
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
    </Svg>
  );
}

export function StocksIcon({ size = 16, strokeWidth = 2 }) {
  return (
    <Svg size={size} strokeWidth={strokeWidth}>
      <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </Svg>
  );
}

export function DeliveryIcon({ size = 16, strokeWidth = 2 }) {
  return (
    <Svg size={size} strokeWidth={strokeWidth}>
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
      <rect width="13" height="8" x="9" y="11" rx="1"/>
      <circle cx="11" cy="19" r="2"/>
      <circle cx="19" cy="19" r="2"/>
    </Svg>
  );
}

export function MenuIcon({ size = 16, strokeWidth = 2 }) {
  return (
    <Svg size={size} strokeWidth={strokeWidth}>
      <path d="M4 5h16"/>
      <path d="M4 12h16"/>
      <path d="M4 19h10"/>
    </Svg>
  );
}

/** Rider and clock glyphs used on the delivery cards. */
export function RiderIcon({ size = 14 }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <circle cx="9" cy="7" r="3"/>
      <path d="M2 21v-1a5 5 0 0 1 5-5 4 4 0 0 1 1.5.29M17 11l4 4v4h-4M17 11l-3 3M20 15l-4-4v3M17 18h.01"/>
    </Svg>
  );
}

export function ClockIcon({ size = 14 }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 7v5l3 2"/>
    </Svg>
  );
}

/** Circular arrows used on the "Refresh" buttons of every live page. */
export function RefreshIcon({ size = 13 }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </Svg>
  );
}
