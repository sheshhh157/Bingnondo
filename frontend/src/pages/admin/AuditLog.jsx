import { useState, useEffect, useCallback, Fragment } from 'react';
import { adminAPI } from '../../services/api';
import {
  TableSkeleton, Btn, AppSelect, PageHeader, Pagination, TextInput,
} from './adminShared';
import { useAdminToast } from './useAdminToast';
import { formatDateTime } from './format';
import FilterModal, { FilterTrigger, FilterInline } from '../../components/MobileFilter';
import '../../styles/AdminPage.css';

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// ── action badge ─────────────────────────────────────────────────────
const ACTION_TYPES = ['create','deactivate','reactivate','reset_password','update_settings','register_device','remove_device','update_api_key','customer_restriction_override','customer_account_status_change','self_reset_password'];

function ActionBadge({ action }) {
  const type = ACTION_TYPES.includes(action) ? action : 'default';
  return (
    <span className={`ap-badge ap-badge--${type}`}>
      <span className="ap-badge__dot" aria-hidden="true"/>
      {action.replace(/_/g,' ')}
    </span>
  );
}

// ── detail panel (expandable row) ────────────────────────────────────
function DetailPanel({ entry }) {
  const details = entry.details || {};
  const rows = [
    ['Log ID',      `#${entry.id}`,                          true ],
    ['Actor',       entry.actor_name||`Staff #${entry.actor_id}`, false],
    ['Action',      entry.action,                            false],
    ['Target type', entry.target_type||'—',                  false],
    ['Target ID',   entry.target_id   ||'—',                  true ],
    ['Timestamp',   formatDateTime(entry.created_at),        false],
  ];
  return (
    <div className="ap-detail">
      <div className="ap-detail__heading">ENTRY DETAIL</div>
      <div className="ap-detail__grid">
        {rows.map(([k,v,mono])=>(
          <Fragment key={`${k}-${v}`}>
            <span className="ap-detail__key">{k}</span>
            <span className={`ap-detail__val${mono?' ap-detail__val--mono':''}`}>{v}</span>
          </Fragment>
        ))}
        {Object.keys(details).length>0 && (
          <>
            <span className="ap-detail__key" key="dk" style={{alignSelf:'flex-start',marginTop:4}}>Details</span>
            <pre className="ap-detail__pre" key="dv">{JSON.stringify(details,null,2)}</pre>
          </>
        )}
      </div>
    </div>
  );
}

// ── log table row ─────────────────────────────────────────────────────
const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

function LogRow({ entry, expanded, onToggle }) {
  const t = new Date(entry.created_at);
  return (
    <>
      <tr onClick={onToggle} style={{cursor:'pointer',background:expanded?'var(--color-muted)':'transparent'}}
        onMouseEnter={e=>{if(!expanded)e.currentTarget.style.background='var(--color-muted)';}}
        onMouseLeave={e=>{if(!expanded)e.currentTarget.style.background='transparent';}}>
        <td style={{whiteSpace:'nowrap'}}>
          <div style={{fontSize:'0.75rem',color:'var(--color-foreground)'}}>
            {t.toLocaleDateString('en-PH',{month:'short',day:'numeric'})}
          </div>
          <div style={{fontSize:'0.6875rem',color:'var(--color-muted-foreground)'}}>
            {t.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
          </div>
        </td>
        <td>
          <div title={entry.actor_name||`Staff #${entry.actor_id}`} style={{fontSize:'0.8125rem',fontWeight:500,color:'var(--color-foreground)',maxWidth:'240px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{entry.actor_name||`Staff #${entry.actor_id}`}</div>
          {entry.actor_role&&<div style={{fontSize:'0.6875rem',color:'var(--color-muted-foreground)',textTransform:'capitalize',marginTop:1}}>{entry.actor_role.replace('_',' ')}</div>}
        </td>
        <td><ActionBadge action={entry.action}/></td>
        <td style={{fontSize:'0.75rem',color:'var(--color-muted-foreground)'}}>
          {entry.target_type
            ?<span>{entry.target_type} <span style={{fontFamily:'monospace',color:'var(--color-muted-foreground)'}}>#{entry.target_id}</span></span>
            :<span style={{color:'var(--color-muted-foreground)'}}>—</span>
          }
        </td>
        <td style={{textAlign:'right'}}>
          <span style={{color:'var(--color-muted-foreground)',display:'inline-block',transition:'transform 120ms ease',transform:expanded?'rotate(180deg)':'rotate(0deg)',fontSize:'0.75rem'}}>▾</span>
        </td>
      </tr>
      {expanded&&(
        <tr>
          <td colSpan={5} style={{padding:0, borderBottom:'1px solid var(--color-border)'}}>
            <DetailPanel entry={entry}/>
          </td>
        </tr>
      )}
    </>
  );
}

// ── main page ─────────────────────────────────────────────────────────
export default function AuditLog() {
  const { toast } = useAdminToast();

  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expanded, setExpanded]   = useState(null);
  const [actors, setActors]       = useState([]);

  const [filterActor, setFilterActor]   = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom]     = useState('');
  const [filterTo, setFilterTo]         = useState('');
  const [filterOpen, setFilterOpen]     = useState(false);

  // Client-side only: filters the rows already loaded on this page. Kept out of
  // `load` entirely, so it never changes the request or triggers extra fetches.
  const [search, setSearch]             = useState('');
  const term = search.trim().toLowerCase();
  const visible = term
    ? logs.filter((e) =>
        (e.actor_name || '').toLowerCase().includes(term) ||
        (e.action || '').toLowerCase().includes(term) ||
        (e.target_type || '').toLowerCase().includes(term) ||
        String(e.target_id ?? '').includes(term))
    : logs;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getAuditLog({ page, limit:10, actor_id:filterActor||undefined, action:filterAction||undefined, from:filterFrom||undefined, to:filterTo||undefined });
      const rows = data.data||data;
      const total = data.total ?? (Array.isArray(rows)?rows.length:0);
      setLogs(rows); setTotalPages(data.totalPages||Math.max(1,Math.ceil(total/10)));
    } catch { toast.error('Failed to load audit log.'); }
    finally { setLoading(false); }
  }, [page, filterActor, filterAction, filterFrom, filterTo, toast]);

  // Fetch-on-mount: the sync setLoading inside `load` is intentional; there is
  // no user event to move it to. See admin-notes on the set-state-in-effect rule.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(()=>{ load(); },[load]);

  useEffect(()=>{
    adminAPI.listStaffAccounts({limit:100})
      .then(({data})=>setActors(data.data||data))
      .catch(()=>{});
  },[]);

  function reset() { setFilterActor(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); setSearch(''); setPage(1); }
  const hasFilters = filterActor||filterAction||filterFrom||filterTo;

  // Only the first load shows the skeleton; paging or changing a filter keeps
  // the rows on screen and dims them while the next page arrives.
  const firstLoad = loading && logs.length === 0;
  const busy = loading && logs.length > 0;

  const filterFields = (
    <>
      <AppSelect value={filterActor} onChange={e=>{setFilterActor(e.target.value);setPage(1);}} aria-label="Filter by actor">
        <option value="">All actors</option>
        {actors.map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}
      </AppSelect>
      <AppSelect value={filterAction} onChange={e=>{setFilterAction(e.target.value);setPage(1);}} aria-label="Filter by action">
        <option value="">All actions</option>
        {ACTION_TYPES.map(a=><option key={a} value={a}>{a.replace(/_/g,' ')}</option>)}
      </AppSelect>
      <input type="date" className="ap-input" value={filterFrom} onChange={e=>{setFilterFrom(e.target.value);setPage(1);}} aria-label="From date"/>
      <input type="date" className="ap-input" value={filterTo} onChange={e=>{setFilterTo(e.target.value);setPage(1);}} aria-label="To date"/>
      {hasFilters && <Btn variant="muted" size="sm" onClick={reset}>Clear filters</Btn>}
    </>
  );

  return (
    <>
      <div className="ap-page ap-page--wide">

        <PageHeader
          title="Audit Log"
          sub="A permanent, chronological record of every administrative action on Bingnondo."
        />

        {/* Filters */}
        <div className="ap-card">
          <div className="ap-card__body">
            <div className="ap-toolbar ap-toolbar--single-row">
              <div className="ap-toolbar__filters">
                <div className="ap-toolbar__search">
                  <TextInput
                    placeholder="Search actor, action, or target"
                    value={search}
                    onChange={e=>setSearch(e.target.value)}
                    prefix={<SearchIcon />}
                    aria-label="Search audit log"
                  />
                </div>
                <FilterTrigger open={filterOpen} onClick={()=>setFilterOpen(true)} active={hasFilters} label="Filter audit log" />
                <FilterInline>{filterFields}</FilterInline>
              </div>
            </div>
          </div>
        </div>

        {/* Read-only notice */}
        <div className="ap-notice">
          <LockIcon/>
          Audit log is read-only and immutable. Entries cannot be edited or deleted.
        </div>

        {/* Log table */}
        <div className="ap-card">
          {firstLoad ? (
            <TableSkeleton rows={6} cols={5}/>
          ) : visible.length===0 ? (
            <div className="ap-empty">
              <div className="ap-empty__title">{term && logs.length>0 ? 'No entries match your search' : 'No entries found'}</div>
              <div className="ap-empty__sub">{term
                ? 'Try a different search term.'
                : 'Try a different filter, or wait for admin actions to be performed.'}</div>
            </div>
          ) : (
            <div className={`ap-table-wrap${busy ? ' is-busy' : ''}`} aria-busy={busy}>
              <table className="ap-table">
                <thead>
                  <tr>
                    {['Timestamp','Actor','Action','Target',''].map(h=>(
                      <th key={h} scope="col" className={h===''?'ap-table__th--right':''}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(entry=>(
                    <LogRow key={entry.id} entry={entry}
                      expanded={expanded===entry.id}
                      onToggle={()=>setExpanded(e=>e===entry.id?null:entry.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!firstLoad&&logs.length>0&&(
            <div className="ap-table-foot">
              <span className="ap-table-foot__info">
                Page {page} of {totalPages} · {term ? `${visible.length} of ${logs.length}` : logs.length} entries
              </span>
              <Pagination page={page} total={totalPages} onPage={setPage}/>
            </div>
          )}
        </div>
      </div>

      <FilterModal open={filterOpen} onClose={()=>setFilterOpen(false)} title="Filter audit log">
        {filterFields}
      </FilterModal>
    </>
  );
}