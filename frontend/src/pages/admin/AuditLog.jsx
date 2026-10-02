import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import '../../styles/AdminPage.css';

// ── shared mini components ───────────────────────────────────────────
let _tid = 0;
function useToast(){const[toasts,setToasts]=useState([]);const push=useCallback((msg,type='info')=>{const id=++_tid;setToasts(p=>[...p,{id,msg,type}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4000);},[]);const dismiss=id=>setToasts(p=>p.filter(t=>t.id!==id));return{toasts,dismiss,toast:{success:m=>push(m,'success'),error:m=>push(m,'error'),info:m=>push(m,'info')}};}
function Toasts({toasts,dismiss}){const icons={success:'✓',error:'✕',info:'i'};return(<div className="ap-toast-stack" role="status" aria-live="polite">{toasts.map(t=>(<div key={t.id} className={`ap-toast ap-toast--${t.type}`}><span className="ap-toast__icon">{icons[t.type]}</span><span className="ap-toast__msg">{t.msg}</span><button className="ap-toast__dismiss" onClick={()=>dismiss(t.id)} aria-label="Dismiss">✕</button></div>))}</div>);}
function Spinner({size=16}){return(<svg className="ap-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#2E2B22" strokeWidth="2.5"/><path d="M12 3a9 9 0 0 1 9 9" stroke="#C9963C" strokeWidth="2.5" strokeLinecap="round"/></svg>);}
function Btn({variant='ghost',size='md',icon,children,disabled,loading,onClick,type='button'}){return(<button type={type} className={`ap-btn ap-btn--${variant} ap-btn--${size}`} disabled={disabled||loading} onClick={onClick}>{loading?<Spinner size={13}/>:icon&&<span style={{display:'flex',flexShrink:0}}>{icon}</span>}{children}</button>);}
function AppSelect({id,children,...props}){return(<select id={id} className="ap-select" {...props}>{children}</select>);}

function Pagination({page,total,onPage}){
  if(total<=1)return null;
  return(<div className="ap-pager">
    <Btn variant="ghost" size="sm" disabled={page<=1} onClick={()=>onPage(page-1)}>←</Btn>
    {Array.from({length:total},(_,i)=>i+1).map(p=>(<Btn key={p} variant={p===page?'gold':'ghost'} size="sm" onClick={()=>onPage(p)}>{p}</Btn>))}
    <Btn variant="ghost" size="sm" disabled={page>=total} onClick={()=>onPage(page+1)}>→</Btn>
  </div>);
}

// ── action badge ─────────────────────────────────────────────────────
const ACTION_TYPES = ['create','deactivate','reactivate','reset_password','update_settings','register_device','remove_device','update_api_key'];

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
    ['Timestamp',   new Date(entry.created_at).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'medium'}), false],
  ];
  return (
    <div className="ap-detail">
      <div className="ap-detail__heading">ENTRY DETAIL</div>
      <div className="ap-detail__grid">
        {rows.map(([k,v,mono])=>(
          <> 
            <span key={`k-${k}`} className="ap-detail__key">{k}</span>
            <span key={`v-${k}`} className={`ap-detail__val${mono?' ap-detail__val--mono':''}`}>{v}</span>
          </>
        ))}
        {Object.keys(details).length>0 && (
          <>
            <span className="ap-detail__key" style={{alignSelf:'flex-start',marginTop:4}}>Details</span>
            <pre className="ap-detail__pre">{JSON.stringify(details,null,2)}</pre>
          </>
        )}
      </div>
    </div>
  );
}

// ── log table row ─────────────────────────────────────────────────────
function LogRow({ entry, expanded, onToggle }) {
  const t = new Date(entry.created_at);
  return (
    <>
      <tr onClick={onToggle} style={{cursor:'pointer',background:expanded?'#1E1C15':'transparent'}}
        onMouseEnter={e=>{if(!expanded)e.currentTarget.style.background='#1E1C15';}}
        onMouseLeave={e=>{if(!expanded)e.currentTarget.style.background='transparent';}}>
        <td style={{whiteSpace:'nowrap'}}>
          <div style={{fontSize:'0.75rem',color:'rgba(232,224,212,0.65)'}}>
            {t.toLocaleDateString('en-PH',{month:'short',day:'numeric'})}
          </div>
          <div style={{fontSize:'0.6875rem',color:'rgba(232,224,212,0.3)'}}>
            {t.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
          </div>
        </td>
        <td>
          <div style={{fontSize:'0.8125rem',fontWeight:500,color:'#E8E0D4'}}>{entry.actor_name||`Staff #${entry.actor_id}`}</div>
          {entry.actor_role&&<div style={{fontSize:'0.6875rem',color:'rgba(232,224,212,0.3)',textTransform:'capitalize',marginTop:1}}>{entry.actor_role.replace('_',' ')}</div>}
        </td>
        <td><ActionBadge action={entry.action}/></td>
        <td style={{fontSize:'0.75rem',color:'rgba(232,224,212,0.4)'}}>
          {entry.target_type
            ?<span>{entry.target_type} <span style={{fontFamily:'monospace',color:'rgba(232,224,212,0.25)'}}>#{entry.target_id}</span></span>
            :<span style={{color:'rgba(232,224,212,0.2)'}}>—</span>
          }
        </td>
        <td style={{textAlign:'right'}}>
          <span style={{color:'rgba(232,224,212,0.3)',display:'inline-block',transition:'transform 120ms ease',transform:expanded?'rotate(180deg)':'rotate(0deg)'}}>▾</span>
        </td>
      </tr>
      {expanded&&(
        <tr style={{borderBottom:'1px solid #262218'}}>
          <td colSpan={5} style={{padding:'0 16px 12px'}}>
            <DetailPanel entry={entry}/>
          </td>
        </tr>
      )}
    </>
  );
}

// ── main page ─────────────────────────────────────────────────────────
export default function AuditLog() {
  const { toasts, dismiss, toast } = useToast();

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getAuditLog({ page, limit:20, actor_id:filterActor||undefined, action:filterAction||undefined, from:filterFrom||undefined, to:filterTo||undefined });
      setLogs(data.data||data); setTotalPages(data.totalPages||1);
    } catch { toast.error('Failed to load audit log.'); }
    finally { setLoading(false); }
  }, [page, filterActor, filterAction, filterFrom, filterTo]);

  useEffect(()=>{ load(); },[load]);

  useEffect(()=>{
    adminAPI.listStaffAccounts({limit:100})
      .then(({data})=>setActors(data.data||data))
      .catch(()=>{});
  },[]);

  function reset() { setFilterActor(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); setPage(1); }
  const hasFilters = filterActor||filterAction||filterFrom||filterTo;

  const LockIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );

  return (
    <>
      <Toasts toasts={toasts} dismiss={dismiss}/>
      <div className="ap-page ap-page--wide">

        {/* Filters */}
        <div className="ap-card">
          <div className="ap-card__body">
            <div className="ap-toolbar">
              <div className="ap-toolbar__filters">
                <div style={{minWidth:160,flex:1}}>
                  <AppSelect value={filterActor} onChange={e=>{setFilterActor(e.target.value);setPage(1);}}>
                    <option value="">All actors</option>
                    {actors.map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </AppSelect>
                </div>
                <div style={{minWidth:170,flex:1}}>
                  <AppSelect value={filterAction} onChange={e=>{setFilterAction(e.target.value);setPage(1);}}>
                    <option value="">All actions</option>
                    {ACTION_TYPES.map(a=><option key={a} value={a}>{a.replace(/_/g,' ')}</option>)}
                  </AppSelect>
                </div>
                <div style={{minWidth:140}}>
                  <input type="date" className="ap-input" value={filterFrom} onChange={e=>{setFilterFrom(e.target.value);setPage(1);}} aria-label="From date"/>
                </div>
                <div style={{minWidth:140}}>
                  <input type="date" className="ap-input" value={filterTo} onChange={e=>{setFilterTo(e.target.value);setPage(1);}} aria-label="To date"/>
                </div>
              </div>
              {hasFilters && <Btn variant="muted" size="sm" onClick={reset}>Clear filters</Btn>}
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
          {loading ? (
            <div className="ap-loading"><Spinner size={24}/></div>
          ) : logs.length===0 ? (
            <div className="ap-empty">
              <div className="ap-empty__title">No entries found</div>
              <div className="ap-empty__sub">Try a different filter, or wait for admin actions to be performed.</div>
            </div>
          ) : (
            <div className="ap-table-wrap">
              <table className="ap-table">
                <thead>
                  <tr>
                    {['Timestamp','Actor','Action','Target',''].map(h=>(
                      <th key={h} className={h===''?'ap-table__th--right':''}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(entry=>(
                    <LogRow key={entry.id} entry={entry}
                      expanded={expanded===entry.id}
                      onToggle={()=>setExpanded(e=>e===entry.id?null:entry.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading&&logs.length>0&&(
            <div className="ap-table-foot">
              <span className="ap-table-foot__info">Page {page} of {totalPages} · {logs.length} entries</span>
              <Pagination page={page} total={totalPages} onPage={setPage}/>
            </div>
          )}
        </div>
      </div>
    </>
  );
}