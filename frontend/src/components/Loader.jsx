export default function Loader({ text = 'Loading…', className = '' }) {
  return (
    <div className={`ui-loading ${className}`.trim()} role="status" aria-live="polite">
      <div className="ui-loader"><div /><div /><div /></div>
      <span>{text}</span>
    </div>
  );
}
