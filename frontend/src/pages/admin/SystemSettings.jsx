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
  return(<Modal open={open} onClose={onClose} title={title} width={380}><p style={{fontSize:'0.8125rem',color:'rgba(232,224,212,0.6)',lineHeight:1.6}}>{message}</p><div className="ap-modal__footer"><Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn><Btn variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Btn></div></Modal>);
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

// ── ESP32 Device card ────────────────────────────────────────────────
function DeviceCard({ device, onDelete }) {
  return (
    <div className="ap-device">
      <div className={`ap-device__icon ap-device__icon--${device.is_online?'online':'offline'}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
          <line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>
      </div>
      <div className="ap-device__info">
        <div className="ap-device__label">{device.location_label}</div>
        <div className="ap-device__code">{device.device_code}</div>
      </div>
      <Badge type={device.is_online?'online':'offline'} label={device.is_online?'Online':'Offline'}/>
      <Btn variant="ghost" size="icon" onClick={()=>onDelete(device)} aria-label={`Remove ${device.location_label}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </Btn>
    </div>
  );
}

// ── Add Device modal ─────────────────────────────────────────────────
function AddDeviceModal({ open, onClose, onAdded, toast }) {
  const [form, setForm] = useState({ device_code:'', location_label:'' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const set = (k,v) => { setForm(f=>({...f,[k]:v})); setErrors(e=>({...e,[k]:''})); };

  async function submit() {
    const e={};
    if(!form.device_code.trim())    e.device_code    = 'Device code is required.';
    if(!form.location_label.trim()) e.location_label = 'Location label is required.';
    if(Object.keys(e).length){setErrors(e);return;}
    setLoading(true);
    try {
      await adminAPI.registerDevice(form);
      toast.success(`Device "${form.location_label}" registered.`);
      onAdded(); onClose();
      setForm({device_code:'',location_label:''});
    } catch(err) { toast.error(err.message||'Failed to register device.'); }
    finally { setLoading(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Register ESP32 device" width={420}>
      <Field label="Device code" id="dev-code" error={errors.device_code}>
        <TextInput id="dev-code" value={form.device_code} onChange={e=>set('device_code',e.target.value)} placeholder="e.g. ESP32-KITCHEN-01" error={errors.device_code}/>
      </Field>
      <Field label="Location label" id="dev-loc" error={errors.location_label}>
        <TextInput id="dev-loc" value={form.location_label} onChange={e=>set('location_label',e.target.value)} placeholder="e.g. Main Kitchen" error={errors.location_label}/>
      </Field>
      <p style={{fontSize:'0.6875rem',color:'rgba(232,224,212,0.3)',lineHeight:1.6}}>
        Device code must match the one flashed onto the ESP32 unit. Connect the device to the same network as the server.
      </p>
      <div className="ap-modal__footer">
        <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
        <Btn variant="primary" onClick={submit} loading={loading}>Register</Btn>
      </div>
    </Modal>
  );
}

// ── API Key field (masked) ───────────────────────────────────────────
function ApiKeyField({ label, id, value, onSave }) {
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [visible, setVisible]   = useState(false);
  const masked = value ? '•'.repeat(22) + value.slice(-4) : 'Not configured';
  async function save() {
    if (!draft.trim()) return;
    setLoading(true);
    try { await onSave(draft); setEditing(false); setDraft(''); }
    finally { setLoading(false); }
  }
  const EyeIcon = ({show}) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {show?<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
    </svg>
  );
  return (
    <div className="ap-input-wrap">
      <label className="ap-label" htmlFor={id}>{label}</label>
      {editing ? (
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div className="ap-input-row" style={{flex:1}}>
            <input id={id} type={visible?'text':'password'} className="ap-input ap-input--suffix"
              value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Paste new key…"/>
            <button className="ap-input-suffix ap-input-suffix--btn" onClick={()=>setVisible(v=>!v)} aria-label={visible?'Hide':'Show'}>
              <EyeIcon show={visible}/>
            </button>
          </div>
          <Btn variant="primary" size="sm" onClick={save} loading={loading}>Save</Btn>
          <Btn variant="ghost" size="sm" onClick={()=>{setEditing(false);setDraft('');}}>Cancel</Btn>
        </div>
      ) : (
        <div className="ap-apikey">
          <div className="ap-apikey__masked">{masked}</div>
          <Btn variant="ghost" size="sm" onClick={()=>setEditing(true)}>{value?'Replace':'Configure'}</Btn>
        </div>
      )}
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
function CategoryManager({ categories, onAdd, onRemove }) {
  const [val, setVal] = useState('');
  function add() {
    const t = val.trim();
    if (!t || categories.includes(t)) return;
    onAdd(t); setVal('');
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div className="ap-tags">
        {categories.length === 0
          ? <span style={{fontSize:'0.75rem',color:'rgba(232,224,212,0.3)'}}>No categories yet.</span>
          : categories.map(c=>(
              <div key={c} className="ap-tag">
                {c}
                <button className="ap-tag__remove" onClick={()=>onRemove(c)} aria-label={`Remove ${c}`}>✕</button>
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
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [devices, setDevices]   = useState([]);
  const [settings, setSettings] = useState(null);
  const [hours, setHours]       = useState({});
  const [categories, setCategories] = useState([]);
  const [addDevOpen, setAddDevOpen] = useState(false);
  const [delDevice, setDelDevice]   = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: d }] = await Promise.all([adminAPI.getSettings(), adminAPI.listDevices()]);
      setSettings(s); setHours(s.business_hours||{}); setCategories(s.menu_categories||[]); setDevices(d);
    } catch { toast.error('Failed to load settings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ loadAll(); },[loadAll]);

  async function saveApiKey(field, value) {
    try { await adminAPI.updateSettings({[field]:value}); setSettings(s=>({...s,[field]:value})); toast.success('API key updated.'); }
    catch(err) { toast.error(err.message||'Save failed.'); }
  }
  async function saveHours() {
    setSaving(true);
    try { await adminAPI.updateSettings({business_hours:hours}); toast.success('Business hours saved.'); }
    catch(err) { toast.error(err.message||'Save failed.'); }
    finally { setSaving(false); }
  }
  async function saveCategories(updated) {
    try { await adminAPI.updateSettings({menu_categories:updated}); setCategories(updated); }
    catch(err) { toast.error(err.message||'Failed to update categories.'); }
  }
  async function handleDelDevice() {
    setDelLoading(true);
    try { await adminAPI.removeDevice(delDevice.id); toast.success(`Device "${delDevice.location_label}" removed.`); setDelDevice(null); loadAll(); }
    catch(err) { toast.error(err.message||'Failed to remove.'); }
    finally { setDelLoading(false); }
  }

  const PlusIcon = ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;

  if (loading) return <div className="ap-page"><div className="ap-loading"><Spinner size={24}/></div></div>;

  return (
    <>
      <Toasts toasts={toasts} dismiss={dismiss}/>
      <div className="ap-page">

        {/* ESP32 Devices */}
        <Section title="ESP32 Devices" subtitle="Kitchen alert hardware registered to this system"
          action={<Btn variant="ghost" size="sm" onClick={()=>setAddDevOpen(true)} icon={<PlusIcon/>}>Register device</Btn>}>
          {devices.length===0
            ? <p style={{fontSize:'0.75rem',color:'rgba(232,224,212,0.3)'}}>No devices registered. Add your first ESP32 unit.</p>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>{devices.map(d=><DeviceCard key={d.id} device={d} onDelete={setDelDevice}/>)}</div>
          }
        </Section>

        {/* API Keys */}
        <Section title="API Keys" subtitle="Keys are encrypted at rest and masked in this view">
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <ApiKeyField label="PayMongo secret key" id="pm-key" value={settings?.paymongo_key} onSave={v=>saveApiKey('paymongo_key',v)}/>
            <div className="ap-divider"/>
            <ApiKeyField label="OpenAI API key" id="oai-key" value={settings?.openai_key} onSave={v=>saveApiKey('openai_key',v)}/>
            <ApiKeyField label="Gemini API key (fallback)" id="gem-key" value={settings?.gemini_key} onSave={v=>saveApiKey('gemini_key',v)}/>
          </div>
        </Section>

        {/* Business Hours */}
        <Section title="Business hours" subtitle="Controls when online ordering is available"
          action={<Btn variant="gold" size="sm" onClick={saveHours} loading={saving}>Save hours</Btn>}>
          <BusinessHours hours={hours} onChange={(day,slot)=>setHours(h=>({...h,[day]:slot}))}/>
        </Section>

        {/* Menu Categories */}
        <Section title="Menu categories" subtitle="Master list used across the ordering system">
          <CategoryManager
            categories={categories}
            onAdd={c=>saveCategories([...categories,c])}
            onRemove={c=>saveCategories(categories.filter(x=>x!==c))}
          />
        </Section>
      </div>

      <AddDeviceModal open={addDevOpen} onClose={()=>setAddDevOpen(false)} onAdded={loadAll} toast={toast}/>
      <ConfirmModal open={!!delDevice} onClose={()=>setDelDevice(null)} onConfirm={handleDelDevice} loading={delLoading}
        title="Remove device"
        message={`Remove "${delDevice?.location_label}" (${delDevice?.device_code})? The device will stop receiving alerts.`}
        confirmLabel="Remove" variant="danger"/>
    </>
  );
}