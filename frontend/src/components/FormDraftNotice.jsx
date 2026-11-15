import '../styles/FormDraftNotice.css';

export default function FormDraftNotice({ restored, error, onDiscard, detailNote }) {
  if (!restored && !error) return null;

  return (
    <div className={`form-draft-notice${error ? ' form-draft-notice--error' : ''}`} role={error ? 'alert' : 'status'}>
      <div>
        <p>{error || 'Your saved draft has been restored.'}</p>
        {detailNote && restored && <p className="form-draft-notice__detail">{detailNote}</p>}
      </div>
      {restored && onDiscard && (
        <button type="button" onClick={onDiscard} className="form-draft-notice__discard">
          Discard draft
        </button>
      )}
    </div>
  );
}
