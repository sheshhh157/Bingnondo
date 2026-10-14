import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import { useAdminToast, Spinner, Btn, PageHeader } from './adminShared';
import '../../styles/AdminPage.css';

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

// ── Category manager ─────────────────────────────────────────────────
// categories: [{ id, name }]
function CategoryManager({ categories, onAdd, onRemove, onRename }) {
  const [val, setVal] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [busyId, setBusyId] = useState(null);

  function add() {
    const t = val.trim();
    if (!t) return;
    const duplicate = categories.some(c => c.name.toLowerCase() === t.toLowerCase());
    if (duplicate) return;
    onAdd(t);
    setVal('');
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditVal(c.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditVal('');
  }

  async function commitEdit(c) {
    const t = editVal.trim();
    if (!t || t === c.name) { cancelEdit(); return; }
    const duplicate = categories.some(x => x.id !== c.id && x.name.toLowerCase() === t.toLowerCase());
    if (duplicate) return;
    setBusyId(c.id);
    const ok = await onRename(c, t);
    setBusyId(null);
    if (ok !== false) cancelEdit();
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div className="ap-tags">
        {categories.length === 0
          ? <span style={{fontSize:'0.75rem',color:'var(--color-muted-foreground)'}}>No categories yet.</span>
          : categories.map(c=>(
              editingId === c.id
                ? (
                  <form key={c.id} className="ap-tag ap-tag--editing"
                    onSubmit={e=>{e.preventDefault(); commitEdit(c);}}>
                    <input className="ap-tag__input" value={editVal}
                      onChange={e=>setEditVal(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Escape'){ e.preventDefault(); cancelEdit(); } }}
                      autoFocus disabled={busyId===c.id}
                      aria-label={`Rename ${c.name}`}/>
                    <button type="submit" className="ap-tag__save"
                      disabled={busyId===c.id || !editVal.trim()}
                      aria-label={`Save ${c.name}`}>✓</button>
                    <button type="button" className="ap-tag__remove"
                      onClick={cancelEdit} aria-label="Cancel rename">✕</button>
                  </form>
                )
                : (
                  <div key={c.id} className="ap-tag">
                    {c.name}
                    <button className="ap-tag__edit" onClick={()=>startEdit(c)}
                      aria-label={`Edit ${c.name}`} title="Rename">✎</button>
                    <button className="ap-tag__remove" onClick={()=>onRemove(c)} aria-label={`Remove ${c.name}`}>✕</button>
                  </div>
                )
            ))
        }
      </div>
      <form style={{display:'flex',gap:8}} onSubmit={e=>{e.preventDefault(); add();}}>
        <div className="ap-input-row" style={{flex:1}}>
          <input className="ap-input" value={val}
            onChange={e=>setVal(e.target.value)}
            placeholder="Add category…"
            aria-label="New category name"/>
        </div>
        <Btn variant="ghost" size="md" type="submit" disabled={!val.trim()}>Add</Btn>
      </form>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function SystemSettings() {
  const { toast } = useAdminToast();
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

  async function handleUpdateCategory(cat, name) {
    try {
      const res = await adminAPI.updateCategory(cat.id, name);
      const updated = res.data?.data ?? res.data ?? { id: cat.id, name };
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name: updated.name } : c));
      toast.success(`Category renamed to "${updated.name}".`);
      return true;
    } catch(err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to update category.');
      return false;
    }
  }

  async function handleRemoveCategory(cat) {
    try {
      await adminAPI.deleteCategory(cat.id);
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      toast.success(`Category "${cat.name}" removed.`);
    } catch(err) { toast.error(err?.response?.data?.message || err.message || 'Failed to remove category.'); }
  }

  if (loading) return <div className="ap-page"><div className="ap-loading"><Spinner size={24}/></div></div>;

  return (
    <>
      <div className="ap-page">

        <PageHeader
          title="System Settings"
          sub="Store-level configuration: operating hours and the master category list."
        />

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
            onRename={handleUpdateCategory}
            onRemove={handleRemoveCategory}
          />
        </Section>
      </div>

    </>
  );
}
