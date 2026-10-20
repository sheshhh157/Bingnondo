import logo from '../../assets/logo.png';
import bgCombined from '../../assets/portrait.svg';

export default function AuthBrandPanel() {
  return (
    <div className="login-brand" aria-hidden="true">
      <div className="login-brand__deco" aria-hidden="true">
        <img src={bgCombined} alt="" className="login-brand__scene" draggable="false" />
      </div>
      <div className="login-brand__ink-circle" aria-hidden="true" />
      <div className="login-brand__shadow-pool" aria-hidden="true" />
      <div className="login-brand__columns" aria-hidden="true">
        <div className="login-brand__col-line" />
        <div className="login-brand__col-line" />
        <div className="login-brand__col-line" />
      </div>

      <div className="login-brand__inner">
        <div className="login-brand__logo">
          <img src={logo} alt="Bingnondo Cafe" className="login-brand__lucky-cat" />
        </div>
        <div className="login-brand__text-group">
          <div className="login-brand__charm">
            <div className="login-brand__charm-bar" />
            <p className="login-brand__tagline">
              Every great dish<br />starts at the counter.
            </p>
          </div>
          <div className="login-brand__rule" />
          <div className="login-brand__tickets">
            <Ticket label="Counter Orders" />
            <Ticket label="Quick Checkout" />
            <Ticket label="Real-time Kitchen" />
          </div>
        </div>
      </div>

      <div className="login-brand__lattice" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="login-brand__dot" />
        ))}
      </div>
    </div>
  );
}

function Ticket({ label }) {
  return (
    <div className="login-ticket">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      {label}
    </div>
  );
}
