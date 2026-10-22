import { useEffect, useState } from 'react';
import { Loader2, Sparkles, Plus, X, ArrowLeft } from 'lucide-react';
import { askAuto, autoReady } from '../../lib/ai';
import { Project } from '../../lib/projects';
import { parseTool, toolSystem } from '../../lib/projectsAI';
import { FIELD_TYPES, FieldType, ICONS, TEMPLATES, Tool, ToolField, ToolSpec, ToolSummary, cleanConfig } from '../../lib/tools';
import { ErrorNote, Label, Sheet, TextField } from './ui';
import { ToolIcon } from './ToolTab';
import { AINote } from './AIPanel';
import type { DockProps } from './AIDock';

const SUMMARY_TEXT = (s: ToolSummary, fields: ToolField[]): string => {
  const l = (id: string) => fields.find(f => f.id === id)?.label.toLowerCase() || id;
  switch (s.kind) {
    case 'somma': return s.label || `Totale di ${l(s.field)}`;
    case 'conteggio': return s.label || (s.field ? `Quante con "${l(s.field)}"` : 'Quante voci');
    case 'per_persona': return s.label || `${l(s.field)} per persona`;
    case 'saldi': return 'Chi deve quanto a chi';
    case 'budget': return `Budget di ${s.limit}`;
    case 'prodotto': return s.label;
  }
};

// A new tool (described to MYND AI or from an example), or changes to one: name, icon, fields, sums.
export function ToolSheet({ project, tools, tool, onClose, onSave, dock }: {
  project: Project; tools: Tool[]; tool: Tool | null; onClose: () => void; onSave: (spec: ToolSpec) => Promise<void>; dock?: DockProps;
}) {
  const [spec, setSpec] = useState<ToolSpec | null>(tool ? { name: tool.name, icon: tool.icon || 'list', description: tool.description || '', config: tool.config } : null);
  const [need, setNeed] = useState('');
  const [fix, setFix] = useState('');
  const [busy, setBusy] = useState<'' | 'ai' | 'save'>('');
  const [error, setError] = useState('');
  const ready = autoReady();
  useEffect(() => { dock?.onBusy(busy === 'ai'); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = async (request: string, base?: ToolSpec) => {
    if (!request.trim() || busy) return;
    setBusy('ai'); setError('');
    try {
      const text = base ? `Strumento attuale (JSON):\n${JSON.stringify(base)}\n\nModifica richiesta: ${request}\nRispondi con lo strumento completo aggiornato, mantenendo gli id dei campi che restano.` : request;
      const reply = await askAuto(toolSystem(project, tools.filter(t => t.id !== tool?.id)), [{ role: 'user', text }], { json: true });
      const out = parseTool(reply);
      if (!out) throw new Error('MYND AI non ha preparato uno strumento leggibile. Riprova descrivendolo in un altro modo.');
      setSpec(out); setFix('');
    } catch (err) { setError(err instanceof Error ? err.message.split('\n')[0] : String(err)); }
    setBusy('');
  };

  const save = async () => {
    if (!spec || busy) return;
    if (!spec.name.trim()) { setError('Dai un nome allo strumento.'); return; }
    setBusy('save'); setError('');
    try { await onSave({ ...spec, name: spec.name.trim(), config: cleanConfig(spec.config) }); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(''); }
  };

  const setFields = (fields: ToolField[]) => setSpec(s => s && { ...s, config: { ...s.config, fields, summaries: s.config.summaries.filter(x => usesOnly(x, fields)) } });

  if (!spec) {
    return (
      <Sheet title="Nuovo strumento" onClose={onClose} minimized={dock?.minimized} onMinimize={dock?.onMinimize}>
        <div className="space-y-3">
          <Label htmlFor="ts-need">Cosa ti serve? Descrivilo con parole tue</Label>
          <textarea id="ts-need" value={need} onChange={e => setNeed(e.target.value)} rows={3} autoFocus
            placeholder="Es. tenere i conti di chi ha pagato cosa · segnare i km di ogni uscita in bici · i clienti con lo stato del preventivo · le ricette da provare con voto"
            className="input-glass w-full text-[15px] leading-relaxed resize-none" />
          {ready ? (
            <button onClick={() => ask(need)} disabled={!need.trim() || !!busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
              {busy === 'ai' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {busy === 'ai' ? 'MYND AI lo sta preparando…' : 'Crea con MYND AI'}
            </button>
          ) : <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>Per farlo creare all'AI collega una chiave nella Guida Studio AI; intanto puoi partire da un esempio.</p>}
          {ready && <AINote />}
        </div>
        <ErrorNote text={error} />
        <div>
          <Label>Oppure parti da un esempio</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map(t => (
              <button key={t.name} onClick={() => setSpec({ name: t.name, icon: t.icon, description: t.description, config: t.config })}
                className="glass-card rounded-2xl p-3.5 text-left flex gap-3 hover:opacity-90">
                <span className="mt-0.5" style={{ color: 'var(--brand-ring)' }}><ToolIcon name={t.icon} /></span>
                <span><span className="block text-[15px] font-medium" style={{ color: 'var(--text)' }}>{t.name}</span><span className="block text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>{t.hint}</span></span>
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    );
  }

  const cfg = spec.config;
  return (
    <Sheet title={tool ? 'Modifica strumento' : 'Il tuo strumento'} onClose={onClose} minimized={dock?.minimized} onMinimize={dock?.onMinimize}
      footer={<>
        {!tool && <button onClick={() => setSpec(null)} className="btn-secondary h-11 px-4 mr-auto inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Indietro</button>}
        {tool && <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>}
        <button onClick={save} disabled={!!busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} {tool ? 'Salva' : 'Aggiungi al progetto'}</button>
      </>}>
      <TextField id="ts-name" label="Nome" value={spec.name} onChange={v => setSpec({ ...spec, name: v })} />
      <div>
        <Label>Icona</Label>
        <div className="flex flex-wrap gap-1">
          {ICONS.map(i => (
            <button key={i} type="button" aria-pressed={spec.icon === i} aria-label={i} onClick={() => setSpec({ ...spec, icon: i })}
              className={`w-9 h-9 rounded-full flex items-center justify-center ${spec.icon === i ? 'glass-lens' : ''}`} style={{ color: spec.icon === i ? 'var(--brand-ring)' : 'var(--text-subtle)' }}>
              <ToolIcon name={i} />
            </button>
          ))}
        </div>
      </div>
      <TextField id="ts-desc" label="A cosa serve (facoltativo)" value={spec.description || ''} onChange={v => setSpec({ ...spec, description: v })} />
      <div>
        <Label>Campi</Label>
        <ul className="space-y-2">
          {cfg.fields.map((f, i) => (
            <li key={f.id} className="rounded-2xl p-2.5 space-y-2" style={{ background: 'var(--glass-well)' }}>
              <div className="flex gap-2 items-center">
                <input value={f.label} onChange={e => setFields(cfg.fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`Nome del campo ${i + 1}`} maxLength={40}
                  className="input-glass flex-1 min-w-0 h-10 text-sm" />
                <select value={f.type} disabled={i === 0} aria-label={`Tipo del campo ${f.label}`} onChange={e => setFields(cfg.fields.map((x, j) => (j === i ? { ...x, type: e.target.value as FieldType, ...(e.target.value === 'scelta' ? { options: x.options || [] } : {}) } : x)))}
                  className="input-glass h-10 text-sm w-[42%] disabled:opacity-60">
                  {FIELD_TYPES.filter(t => i > 0 || t.type === 'testo' || t.type === 'testo_lungo').map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
                {i > 0 && <button type="button" onClick={() => setFields(cfg.fields.filter((_, j) => j !== i))} aria-label={`Togli ${f.label}`} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-white/5" style={{ color: 'var(--text-subtle)' }}><X className="w-4 h-4" /></button>}
              </div>
              {f.type === 'scelta' && (
                <input defaultValue={(f.options || []).join(', ')} onBlur={e => setFields(cfg.fields.map((x, j) => (j === i ? { ...x, options: e.target.value.split(',').map(o => o.trim()).filter(Boolean).slice(0, 15) } : x)))}
                  placeholder="Opzioni separate da virgola (vuoto = le scrivi tu ogni volta)" aria-label={`Opzioni di ${f.label}`} className="input-glass w-full h-10 text-sm" />
              )}
            </li>
          ))}
        </ul>
        {cfg.fields.length < 12 && (
          <button type="button" onClick={() => setFields([...cfg.fields, { id: `campo_${Date.now().toString(36)}`, label: 'Nuovo campo', type: 'testo' }])}
            className="mt-2 h-10 px-3 rounded-full text-sm font-medium inline-flex items-center gap-1.5 hover:bg-white/5" style={{ color: 'var(--brand-ring)' }}>
            <Plus className="w-4 h-4" /> Aggiungi campo
          </button>
        )}
      </div>
      {cfg.summaries.length > 0 && (
        <div>
          <Label>Calcoli in alto</Label>
          <ul className="flex flex-wrap gap-1.5">
            {cfg.summaries.map((s, i) => (
              <li key={i} className="h-9 pl-3.5 pr-1 rounded-full inline-flex items-center gap-1 text-sm glass-card !rounded-full" style={{ color: 'var(--text)' }}>
                {SUMMARY_TEXT(s, cfg.fields)}
                <button type="button" onClick={() => setSpec({ ...spec, config: { ...cfg, summaries: cfg.summaries.filter((_, j) => j !== i) } })} aria-label="Togli calcolo" className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: 'var(--text-subtle)' }}><X className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ready && (
        <div className="rounded-2xl p-3 space-y-2" style={{ background: 'var(--glass-well)' }}>
          <Label htmlFor="ts-fix">Vuoi cambiarlo? Dillo a MYND AI</Label>
          <div className="flex gap-2">
            <input id="ts-fix" value={fix} onChange={e => setFix(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ask(fix, spec); } }}
              placeholder="Es. aggiungi un budget di 1500 € · dividi per categoria" className="input-glass flex-1 min-w-0 h-11 text-sm" />
            <button onClick={() => ask(fix, spec)} disabled={!fix.trim() || !!busy} aria-label="Modifica con MYND AI" className="btn-primary !p-0 w-11 h-11 flex items-center justify-center flex-shrink-0 disabled:opacity-40">
              {busy === 'ai' ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" /> : <Sparkles className="w-4 h-4 flex-shrink-0" />}
            </button>
          </div>
        </div>
      )}
      <ErrorNote text={error} />
    </Sheet>
  );
}

function usesOnly(s: ToolSummary, fields: ToolField[]): boolean {
  const ids = new Set(fields.map(f => f.id));
  const refs = s.kind === 'saldi' ? [s.amount, s.payer, s.between] : s.kind === 'per_persona' ? [s.field, s.person] : s.kind === 'conteggio' ? (s.field ? [s.field] : []) : [s.field];
  return refs.every(r => ids.has(r));
}
