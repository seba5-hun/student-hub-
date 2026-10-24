import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Undo2, X } from 'lucide-react';
import {
  FIELD_TYPES, FieldType, ICONS, Tool, ToolConfig, ToolField, ToolSummary, cleanConfig, suggestSummaries, summaryRefs, summaryText,
} from '../../lib/tools';
import { ToolIcon } from './ToolTab';
import { Label } from './ui';

type Spec = { name: string; icon: string; description: string; config: ToolConfig };
type ViewChoice = 'lista' | 'checklist' | 'giorni' | 'gruppo';
const QUICK_TYPES: FieldType[] = ['testo', 'soldi', 'numero', 'data', 'scelta', 'si_no', 'persona', 'persone', 'valutazione', 'link', 'email', 'telefono', 'testo_lungo', 'ora'];
const SHORT: Partial<Record<FieldType, string>> = { scelta: 'Scelta', valutazione: 'Voto', persona: 'Persona', persone: 'Più persone', testo_lungo: 'Testo lungo', si_no: 'Sì / no' };
const typeLabel = (t: FieldType) => SHORT[t] || FIELD_TYPES.find(x => x.type === t)?.label || t;
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'campo';

// Changes a tool right where it is: name, icon, how it is shown, its columns and its totals.
// Every change shows at once, is saved by itself and can be undone.
export function ToolEditor({ tool, onPreview, onSave, onDone }: {
  tool: Tool;
  onPreview: (spec: Spec) => void;
  onSave: (spec: Spec) => Promise<unknown>;
  onDone: () => void;
}) {
  const [spec, setSpec] = useState<Spec>({ name: tool.name, icon: tool.icon || 'list', description: tool.description || '', config: tool.config });
  const [history, setHistory] = useState<Spec[]>([]);
  const [status, setStatus] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [iconsOpen, setIconsOpen] = useState(false);
  const [moreTotals, setMoreTotals] = useState(false);
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const timer = useRef(0);
  const latest = useRef(spec);
  latest.current = spec;
  const cfg = spec.config;

  const persist = (s: Spec) => {
    window.clearTimeout(timer.current);
    setStatus('saving');
    timer.current = window.setTimeout(() => {
      onSave({ ...s, name: s.name.trim() || tool.name, config: cleanConfig(s.config) })
        .then(() => setStatus('saved')).catch(() => setStatus('error'));
    }, 700);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // key: changes of the same thing in a row (typing a name) are undone together.
  const change = (key: string, fn: (s: Spec) => Spec) => {
    const now = Date.now();
    const sameRun = lastKey.current && lastKey.current.key === key && now - lastKey.current.at < 1500;
    if (!sameRun) setHistory(h => [...h.slice(-30), latest.current]);
    lastKey.current = { key, at: now };
    const next = fn(latest.current);
    setSpec(next);
    onPreview(next);
    persist(next);
  };
  const setConfig = (key: string, fn: (c: ToolConfig) => ToolConfig) => change(key, s => ({ ...s, config: fn(s.config) }));
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(h => h.slice(0, -1));
    lastKey.current = null;
    setSpec(prev); onPreview(prev); persist(prev);
  };
  const done = () => {
    window.clearTimeout(timer.current);
    onSave({ ...latest.current, name: latest.current.name.trim() || tool.name, config: cleanConfig(latest.current.config) }).catch(() => {});
    onDone();
  };

  const newId = (label: string) => { let id = slug(label); while (cfg.fields.some(f => f.id === id)) id = `${id}_${Math.random().toString(36).slice(2, 5)}`; return id; };
  const ensure = (c: ToolConfig, type: FieldType, label: string, extra: Partial<ToolField> = {}): { c: ToolConfig; id: string } => {
    const found = c.fields.find(f => f.type === type);
    if (found) return { c, id: found.id };
    const id = newId(label);
    return { c: { ...c, fields: [...c.fields, { id, label, type, ...extra }] }, id };
  };

  // ── How it is shown ──
  const viewChoice: ViewChoice = cfg.view === 'lista' && cfg.groupBy ? 'gruppo' : cfg.view;
  const groupable = cfg.fields.filter(f => f.type === 'scelta' || f.type === 'persona' || f.type === 'si_no');
  const setView = (v: ViewChoice) => setConfig('view', c => {
    if (v === 'checklist') { const r = ensure(c, 'si_no', 'Fatto'); return { ...r.c, view: 'checklist', groupBy: undefined }; }
    if (v === 'giorni') { const r = ensure(c, 'data', 'Giorno'); return { ...r.c, view: 'giorni', groupBy: undefined }; }
    if (v === 'gruppo') {
      const g = c.fields.find(f => f.type === 'scelta' || f.type === 'persona');
      if (g) return { ...c, view: 'lista', groupBy: g.id };
      const id = newId('Stato');
      return { ...c, view: 'lista', groupBy: id, fields: [...c.fields, { id, label: 'Stato', type: 'scelta', options: ['Da fare', 'In corso', 'Fatto'] }] };
    }
    return { ...c, view: 'lista', groupBy: undefined };
  });

  // ── Columns ──
  const setField = (i: number, patch: Partial<ToolField>, key = `field-${i}`) => setConfig(key, c => ({ ...c, fields: c.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const moveField = (i: number, d: number) => setConfig(`move-${i}-${d}`, c => {
    const f = [...c.fields]; const [x] = f.splice(i, 1); f.splice(i + d, 0, x); return { ...c, fields: f };
  });
  const removeField = (i: number) => setConfig(`remove-${i}`, c => {
    const id = c.fields[i].id;
    return { ...c, fields: c.fields.filter((_, j) => j !== i), summaries: c.summaries.filter(s => !summaryRefs(s).includes(id)),
      groupBy: c.groupBy === id ? undefined : c.groupBy, sortBy: c.sortBy === id ? undefined : c.sortBy, view: c.view !== 'lista' && !c.fields.some((f, j) => j !== i && f.type === (c.view === 'checklist' ? 'si_no' : 'data')) ? 'lista' : c.view };
  });
  const addField = (type: FieldType) => setConfig(`add-${Date.now()}`, c => {
    const label = type === 'si_no' ? 'Fatto' : type === 'scelta' ? 'Categoria' : type === 'persona' ? 'Chi' : type === 'persone' ? 'Persone' : type === 'valutazione' ? 'Voto' : typeLabel(type);
    const id = newId(label);
    return { ...c, fields: [...c.fields, { id, label, type, ...(type === 'scelta' ? { options: [] } : {}) }] };
  });

  // ── Totals ──
  const suggestions = useMemo(() => suggestSummaries(cfg), [cfg]);
  const addTotal = (s: ToolSummary) => setConfig(`total-${Date.now()}`, c => ({ ...c, summaries: [...c.summaries, s].slice(0, 8) }));
  const removeTotal = (i: number) => setConfig(`total-x-${i}`, c => ({ ...c, summaries: c.summaries.filter((_, j) => j !== i) }));
  const setTotal = (i: number, patch: Partial<ToolSummary>) => setConfig(`total-${i}`, c => ({ ...c, summaries: c.summaries.map((s, j) => (j === i ? { ...s, ...patch } as ToolSummary : s)) }));

  return (
    <div className="glass-card rounded-[24px] p-4 sm:p-5 space-y-6 animate-scale-in" aria-label="Modifica lo strumento">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>Modifica lo strumento</p>
        <span className="text-xs inline-flex items-center gap-1" style={{ color: status === 'error' ? 'var(--danger)' : 'var(--text-subtle)' }} aria-live="polite">
          {status === 'saving' && <><Loader2 className="w-3 h-3 animate-spin" /> salvo…</>}
          {status === 'saved' && <><Check className="w-3 h-3" /> salvato</>}
          {status === 'error' && 'non salvato: riprova'}
        </span>
        <button onClick={undo} disabled={!history.length} className="h-9 px-3 rounded-full text-sm inline-flex items-center gap-1.5 disabled:opacity-30 hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
          <Undo2 className="w-4 h-4" /> Annulla
        </button>
        <button onClick={done} className="btn-primary h-9 px-4 text-sm">Fine</button>
      </div>

      <div className="flex gap-2 items-center">
        <button onClick={() => setIconsOpen(o => !o)} aria-label="Cambia icona" aria-expanded={iconsOpen} className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 glass-lens" style={{ color: 'var(--brand-ring)' }}>
          <ToolIcon name={spec.icon} className="w-5 h-5" />
        </button>
        <input value={spec.name} onChange={e => change('name', s => ({ ...s, name: e.target.value.slice(0, 60) }))} aria-label="Nome dello strumento" className="input-glass flex-1 min-w-0 h-11 text-[15px] font-medium" />
      </div>
      {iconsOpen && (
        <div className="flex flex-wrap gap-1 -mt-3">
          {ICONS.map(i => (
            <button key={i} aria-label={i} aria-pressed={spec.icon === i} onClick={() => { change('icon', s => ({ ...s, icon: i })); setIconsOpen(false); }}
              className={`w-9 h-9 rounded-full flex items-center justify-center ${spec.icon === i ? 'glass-lens' : 'hover:bg-white/5'}`} style={{ color: spec.icon === i ? 'var(--brand-ring)' : 'var(--text-subtle)' }}>
              <ToolIcon name={i} />
            </button>
          ))}
        </div>
      )}

      <section>
        <Label>Come vederlo</Label>
        <div className="flex gap-1 p-1 rounded-full" style={{ background: 'var(--glass-well)' }} role="radiogroup" aria-label="Come vederlo">
          {([['lista', 'Lista'], ['checklist', 'Da spuntare'], ['giorni', 'Per giorno'], ['gruppo', 'Per gruppo']] as const).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={viewChoice === v} onClick={() => viewChoice !== v && setView(v)}
              className={`flex-1 h-9 rounded-full text-[13px] sm:text-sm font-medium transition-colors ${viewChoice === v ? 'glass-lens' : ''}`}
              style={{ color: viewChoice === v ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{l}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {viewChoice === 'gruppo' && (
            <select value={cfg.groupBy || ''} onChange={e => setConfig('group', c => ({ ...c, groupBy: e.target.value || undefined }))} aria-label="Raggruppa per" className="input-glass h-10 text-sm col-span-2 sm:col-span-1">
              {groupable.map(f => <option key={f.id} value={f.id}>Raggruppa per {f.label.toLowerCase()}</option>)}
            </select>
          )}
          <select value={cfg.sortBy || ''} onChange={e => setConfig('sort', c => ({ ...c, sortBy: e.target.value || undefined }))} aria-label="Ordina per" className="input-glass h-10 text-sm">
            <option value="">In ordine di inserimento</option>
            {cfg.fields.map(f => <option key={f.id} value={f.id}>Ordina per {f.label.toLowerCase()}</option>)}
          </select>
          {cfg.sortBy && (
            <button onClick={() => setConfig('sortdir', c => ({ ...c, sortDesc: !c.sortDesc }))} className="input-glass h-10 text-sm text-left">
              {cfg.sortDesc ? 'Dal più grande / recente' : 'Dal più piccolo / vecchio'}
            </button>
          )}
        </div>
      </section>

      <section>
        <Label>Colonne</Label>
        <ul className="space-y-2">
          {cfg.fields.map((f, i) => (
            <li key={f.id} className="rounded-2xl p-2 space-y-2" style={{ background: 'var(--glass-well)' }}>
              <div className="flex gap-1.5 items-center">
                {i > 0 ? (
                  <span className="flex flex-col -my-1">
                    <button onClick={() => moveField(i, -1)} disabled={i === 1} aria-label={`Sposta su ${f.label}`} className="w-7 h-5 flex items-center justify-center disabled:opacity-20" style={{ color: 'var(--text-subtle)' }}><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => moveField(i, 1)} disabled={i === cfg.fields.length - 1} aria-label={`Sposta giù ${f.label}`} className="w-7 h-5 flex items-center justify-center disabled:opacity-20" style={{ color: 'var(--text-subtle)' }}><ArrowDown className="w-3.5 h-3.5" /></button>
                  </span>
                ) : <span className="w-7" />}
                <input value={f.label} onChange={e => setField(i, { label: e.target.value.slice(0, 40) }, `label-${f.id}`)} aria-label={`Nome della colonna ${i + 1}`} className="input-glass flex-1 min-w-0 h-10 text-sm" />
                <select value={f.type} onChange={e => setField(i, { type: e.target.value as FieldType, ...(e.target.value === 'scelta' && !f.options ? { options: [] } : {}) })} aria-label={`Tipo di ${f.label}`}
                  className="input-glass h-10 text-sm w-[36%] sm:w-40">
                  {(i === 0 ? (['testo', 'testo_lungo'] as FieldType[]) : QUICK_TYPES).map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
                </select>
                {i > 0
                  ? <button onClick={() => removeField(i)} aria-label={`Togli la colonna ${f.label}`} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-white/5" style={{ color: 'var(--text-subtle)' }}><X className="w-4 h-4" /></button>
                  : <span className="w-9 text-[10px] text-center leading-tight" style={{ color: 'var(--text-subtle)' }}>titolo</span>}
              </div>
              {(f.type === 'scelta' || f.type === 'numero' || i > 0) && (
                <div className="flex gap-2 items-center flex-wrap pl-8">
                  {f.type === 'scelta' && (
                    <input defaultValue={(f.options || []).join(', ')} key={`${f.id}-${(f.options || []).join('|')}`}
                      onBlur={e => setField(i, { options: [...new Set(e.target.value.split(',').map(o => o.trim()).filter(Boolean))].slice(0, 15) }, `opts-${f.id}`)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      placeholder="Opzioni separate da virgola (vuoto = le scrivi ogni volta)" aria-label={`Opzioni di ${f.label}`} className="input-glass flex-1 min-w-[180px] h-9 text-sm" />
                  )}
                  {f.type === 'numero' && (
                    <input value={f.unit || ''} onChange={e => setField(i, { unit: e.target.value.slice(0, 15) || undefined }, `unit-${f.id}`)} placeholder="Unità (h, km, kg…)" aria-label={`Unità di ${f.label}`} className="input-glass w-36 h-9 text-sm" />
                  )}
                  {i > 0 && (
                    <label className="inline-flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                      <input type="checkbox" checked={!!f.required} onChange={e => setField(i, { required: e.target.checked || undefined }, `req-${f.id}`)} className="w-4 h-4 accent-[var(--brand-fill)]" /> Obbligatoria
                    </label>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {cfg.fields.length < 12 && (
          <div className="mt-3">
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-subtle)' }}>Aggiungi una colonna:</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TYPES.map(t => (
                <button key={t} onClick={() => addField(t)} className="h-8 px-3 rounded-full text-sm inline-flex items-center gap-1 glass-card !rounded-full hover:opacity-90" style={{ color: 'var(--text)' }}>
                  <Plus className="w-3.5 h-3.5" style={{ color: 'var(--brand-ring)' }} /> {typeLabel(t)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <Label>Totali e conti in alto</Label>
        {cfg.summaries.length > 0 ? (
          <ul className="space-y-1.5 mb-3">
            {cfg.summaries.map((s, i) => (
              <li key={i} className="rounded-2xl pl-3.5 pr-1.5 py-1.5 flex items-center gap-2 flex-wrap" style={{ background: 'var(--glass-well)' }}>
                <input value={'label' in s && s.label !== undefined ? s.label : summaryText(cfg, s)} onChange={e => setTotal(i, { label: e.target.value.slice(0, 40) } as Partial<ToolSummary>)}
                  disabled={s.kind === 'saldi' || s.kind === 'budget'} aria-label={`Nome del totale ${i + 1}`} className="flex-1 min-w-[140px] bg-transparent text-sm h-8 outline-none disabled:opacity-100" style={{ color: 'var(--text)' }} />
                {s.kind === 'budget' && (
                  <label className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>massimo
                    <input type="text" inputMode="decimal" value={String(s.limit)} onChange={e => { const n = Number(e.target.value.replace(',', '.')); if (n > 0) setTotal(i, { limit: n } as Partial<ToolSummary>); }} aria-label="Budget massimo" className="input-glass w-24 h-8 text-sm" />
                  </label>
                )}
                {s.kind === 'prodotto' && !s.byField && (
                  <label className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>×
                    <input type="text" inputMode="decimal" value={String(s.factor)} onChange={e => { const n = Number(e.target.value.replace(',', '.')); if (n) setTotal(i, { factor: n } as Partial<ToolSummary>); }} aria-label="Moltiplica per" className="input-glass w-20 h-8 text-sm" />
                  </label>
                )}
                <button onClick={() => removeTotal(i)} aria-label={`Togli il totale ${summaryText(cfg, s)}`} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-subtle)' }}><X className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm mb-3" style={{ color: 'var(--text-subtle)' }}>Nessun totale. Aggiungine uno con un tocco:</p>}
        {suggestions.length > 0 && cfg.summaries.length < 8 && (
          <div className="flex flex-wrap gap-1.5">
            {(moreTotals ? suggestions : suggestions.slice(0, 8)).map(x => (
              <button key={x.text} onClick={() => addTotal(x.summary)} className="h-8 px-3 rounded-full text-sm inline-flex items-center gap-1 glass-card !rounded-full hover:opacity-90" style={{ color: 'var(--text)' }}>
                <Plus className="w-3.5 h-3.5" style={{ color: 'var(--brand-ring)' }} /> {x.text}
              </button>
            ))}
            {suggestions.length > 8 && <button onClick={() => setMoreTotals(m => !m)} className="h-8 px-3 text-sm" style={{ color: 'var(--brand-ring)' }}>{moreTotals ? 'Meno' : `Altri ${suggestions.length - 8}`}</button>}
          </div>
        )}
        {!cfg.fields.some(f => f.type === 'soldi' || f.type === 'numero' || f.type === 'si_no') && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-subtle)' }}>Per totali e conti aggiungi una colonna Soldi, Numero o Sì / no.</p>
        )}
      </section>
    </div>
  );
}
