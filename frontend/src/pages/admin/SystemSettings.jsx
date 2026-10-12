import { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI } from '../../services/api';
import '../../styles/AdminPage.css';

// ── Shared mini-components (same as StaffAccounts) ──────────────────
let _tid = 0;
function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type='info') => {
    const id = ++_tid;
    setToasts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4000);
  },[]);
  const dismiss = id => setToasts(p=>p.filter(t=>t.id!==id));
  return { toasts, dismiss, toast:{success:m=>push(m,'success'),error:m=>push(m,'error'),info:m=>push(m,'info')} };
}
function Toasts({toasts,dismiss}){
  const icons={success:'✓',error:'✕',info:'i'};
  return(<div className="ap-toast-stack" role="status" aria-live="polite">{toasts.map(t=>(
    <div key={t.id} className={`ap-toast ap-toast--${t.type}`}>
      <span className="ap-toast__icon">{icons[t.type]}</span>
      <span className="ap-toast__msg">{t.msg}</span>
      <button className="ap-toast__dismiss" onClick={()=>dismiss(t.id)} aria-label="Dismiss">✕</button>
    </div>
  ))}</div>);
}
function Spinner({size=16}){return(<svg className="ap-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#2E2B22" strokeWidth="2.5"/><path d="M12 3a9 9 0 0 1 9 9" stroke="#C9963C" strokeWidth="2.5" strokeLinecap="round"/></svg>);}
function Badge({type,label}){return(<span className={`ap-badge ap-badge--${type}`}><span className="ap-badge__dot" aria-hidden="true"/>{label}</span>);}
function Btn({variant='ghost',size='md',icon,children,disabled,loading,onClick,type='button'}){return(<button type={type} className={`ap-btn ap-btn--${variant} ap-btn--${size}`} disabled={disabled||loading} onClick={onClick}>{loading?<Spinner size={13}/>:icon&&<span style={{display:'flex',flexShrink:0}}>{icon}</span>}{children}</button>);}
function Field({label,id,error,children}){return(<div className="ap-input-wrap">{label&&<label className="ap-label" htmlFor={id}>{label}</label>}{children}{error&&<span className="ap-field-error">{error}</span>}</div>);}
function TextInput({id,error,...props}){return(<div className="ap-input-row"><input id={id} className={`ap-input${error?' ap-input--error':''}`} {...props}/></div>);}

function Modal({open,onClose,title,width=480,children}){
  const ref=useRef();
  useEffect(()=>{if(!open)return;const h=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);},[open,onClose]);
  if(!open)return null;
  return(<div className="ap-overlay" ref={ref} onClick={e=>e.target===ref.current&&onClose()} role="presentation"><div className="ap-modal" style={{maxWidth:width}} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="ap-modal__head"><span className="ap-modal__title" id="modal-title">{title}</span><button className="ap-modal__close" onClick={onClose} aria-label="Close">✕</button></div><div className="ap-modal__body">{children}</div></div></div>);
}
function ConfirmModal({open,onClose,onConfirm,loading,title,message,confirmLabel='Confirm',variant='danger'}){
  return(<Modal open={open} onClose={onClose} title={title} width={380}><p style={{fontSize:'0.8125rem',color:'var(--color-muted-foreground)',lineHeight:1.6}}>{message}</p><div className="ap-modal__footer"><Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn><Btn variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Btn></div></Modal>);
}

// ── Section wrapper ──────────────────────────────────────────────────
function Section({ title, subtitle, action, children }) {
  return (
    <div className="ap-card">
      <div className="ap-card__head">
        <div>
          <div className="ap-card__title">{title}</div>
          {subtitle && <div className="ap-card__sub">{subtitle}</div>}
        </div>
        {action}
      </div>
      <div className="ap-card__body">{children}</div>
    </div>
  );
}

// ── Business Hours ────────────────────────────────────────────────────
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function BusinessHours({ hours, onChange }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {DAYS.map(day => {
        const slot = hours[day] || { open:'08:00', close:'22:00', closed:false };
        return (
          <div key={day} className="ap-hours-row">
            <div className="ap-hours-day">{day.slice(0,3)}</div>
            <input type="time" disabled={slot.closed} value={slot.open}
              onChange={e=>onChange(day,{...slot,open:e.target.value})}
              aria-label={`${day} open`}
              className="ap-input" style={{opacity:slot.closed?0.38:1}}/>
            <input type="time" disabled={slot.closed} value={slot.close}
              onChange={e=>onChange(day,{...slot,close:e.target.value})}
              aria-label={`${day} close`}
              className="ap-input" style={{opacity:slot.closed?0.38:1}}/>
            <label className="ap-hours-check">
              <input type="checkbox" checked={slot.closed}
                onChange={e=>onChange(day,{...slot,closed:e.target.checked})}/>
              Closed
            </label>
          </div>
        );
      })}
    </div>
  );
}

// ── Category manager ──────────────────────────────────────────────────
// categories: [{ id, name }]
// onAdd(name: string), onRemove({ id, name })
function CategoryManager({ categories, onAdd, onRemove }) {
  const [val, setVal] = useState('');
  function add() {
    const t = val.trim();
    if (!t) return;
    const duplicate = categories.some(c => c.name.toLowerCase() === t.toLowerCase());
    if (duplicate) return;
    onAdd(t); setVal('');
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div className="ap-tags">
        {categories.length === 0
          ? <span style={{fontSize:'0.75rem',color:'var(--color-muted-foreground)'}}>No categories yet.</span>
          : categories.map(c=>(
              <div key={c.id} className="ap-tag">
                {c.name}
                <button className="ap-tag__remove" onClick={()=>onRemove(c)} aria-label={`Remove ${c.name}`}>✕</button>
              </div>
            ))
        }
      </div>
      <div style={{display:'flex',gap:8}}>
        <div className="ap-input-row" style={{flex:1}}>
          <input className="ap-input" value={val}
            onChange={e=>setVal(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&add()}
            placeholder="Add category…"/>
        </div>
        <Btn variant="ghost" size="md" onClick={add} disabled={!val.trim()}>Add</Btn>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function SystemSettings() {
  const { toasts, dismiss, toast } = useToast();
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [hours, setHours]           = useState({});
  const [categories, setCategories] = useState([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [hoursRes, catsRes] = await Promise.all([
        adminAPI.getBusinessHours(),
        adminAPI.listCategories(),
      ]);
      const hoursData = hoursRes.data?.data ?? hoursRes.data ?? [];
      const catsData  = catsRes.data?.data  ?? catsRes.data  ?? [];
      // Convert array from backend [ {day_of_week, day_label, open_time, close_time, is_closed} ]
      // to the shape BusinessHours component expects: { Monday: { open, close, closed } }
      const hoursMap = {};
      hoursData.forEach(row => {
        hoursMap[row.day_label] = {
          open:   row.open_time  ? row.open_time.slice(0,5)  : '08:00',
          close:  row.close_time ? row.close_time.slice(0,5) : '22:00',
          closed: row.is_closed,
        };
      });
      setHours(hoursMap);
      setCategories(catsData.map(c => ({ id: c.id, name: c.name })));
    } catch { toast.error('Failed to load settings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ loadAll(); },[loadAll]);

  async function saveHours() {
    setSaving(true);
    try {
      // Convert local { Monday: { open, close, closed } } back to backend format
      const DAY_TO_DOW = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };
      const payload = Object.entries(hours).map(([day, slot]) => ({
        day_of_week: DAY_TO_DOW[day],
        open_time:   slot.closed ? null : slot.open,
        close_time:  slot.closed ? null : slot.close,
        is_closed:   slot.closed,
      }));
      await adminAPI.saveBusinessHours(payload);
      toast.success('Business hours saved.');
    } catch(err) { toast.error(err?.response?.data?.message || err.message || 'Save failed.'); }
    finally { setSaving(false); }
  }

  async function handleAddCategory(name) {
    try {
      const res = await adminAPI.createCategory(name);
      const cat = res.data?.data ?? res.data;
      setCategories(prev => [...prev, { id: cat.id, name: cat.name }]);
      toast.success(`Category "${cat.name}" added.`);
    } catch(err) { toast.error(err?.response?.data?.message || err.message || 'Failed to add category.'); }
  }

  async function handleRemoveCategory(cat) {
    try {
      await adminAPI.deleteCategory(cat.id);
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      toast.success(`Category "${cat.name}" removed.`);
    } catch(err) { toast.error(err?.response?.data?.message || err.message || 'Failed to remove category.'); }
  }
  const PlusIcon = ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;

  if (loading) return <div className="ap-page"><div className="ap-loading"><Spinner size={24}/></div></div>;

  return (
    <>
      <Toasts toasts={toasts} dismiss={dismiss}/>
      <div className="ap-page">

        {/* Business Hours */}
        <Section title="Business hours" subtitle="Controls when online ordering is available"
          action={<Btn variant="gold" size="sm" onClick={saveHours} loading={saving}>Save hours</Btn>}>
          <BusinessHours hours={hours} onChange={(day,slot)=>setHours(h=>({...h,[day]:slot}))}/>
        </Section>

        {/* Menu Categories */}
        <Section title="Menu categories" subtitle="Master list used across the ordering system">
          <CategoryManager
            categories={categories}
            onAdd={handleAddCategory}
            onRemove={handleRemoveCategory}
          />
        </Section>
      </div>

    </>
  );
}