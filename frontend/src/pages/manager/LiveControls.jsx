import { useToast } from '../../context/ToastContext';
import { timeStamp } from '../../utils/format';
import { RefreshIcon } from './managerIcons';

// LiveControls — "Last updated" stamp + quiet refresh button shared by every
// live manager page. The button spins (via .ui-live__refresh--busy) while a
// manual refresh is in flight, and a toast confirms the outcome.
export default function LiveControls({ lastUpdated, onRefresh, refreshing, label = 'Refresh' }) {
  const { toast } = useToast();

  const handleRefresh = async () => {
    let ok = false;
    try {
      ok = await onRefresh();
    } catch {
      ok = false;
    }
    toast(
      ok
        ? { title: 'Refreshed', desc: 'Live view is up to date.', variant: 'success' }
        : { title: 'Refresh failed', desc: 'Check the error banner above.', variant: 'danger' },
    );
  };

  return (
    <div className="ui-live">
      <span className="ui-live__stamp">
        Last updated {lastUpdated ? timeStamp(lastUpdated) : '—'}
      </span>
      <button
        type="button"
        className={`ui-live__refresh${refreshing ? ' ui-live__refresh--busy' : ''}`}
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label={label}
      >
        <RefreshIcon />
        Refresh
      </button>
    </div>
  );
}