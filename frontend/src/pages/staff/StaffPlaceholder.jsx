import '../../styles/StaffPlaceholder.css';

const CONFIG = {
  chat: {
    section: '§4.4',
    title: 'Support Chat Inbox',
    desc: 'Reply to customer messages tied to their active orders. Coming up next.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
};

export default function StaffPlaceholder({ type }) {
  const cfg = CONFIG[type] || CONFIG.chat;
  return (
    <div className="sph-root">
      <div className="sph-card">
        <div className="sph-icon" aria-hidden="true">{cfg.icon}</div>
        <span className="sph-section">{cfg.section}</span>
        <h1 className="sph-title">{cfg.title}</h1>
        <p className="sph-desc">{cfg.desc}</p>
      </div>
    </div>
  );
}