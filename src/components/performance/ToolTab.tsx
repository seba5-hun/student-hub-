import { useMemo, useState } from 'react';
import {
  List, Wallet, CalendarDays, Map, Clock, Users, Star, BookOpen, Dumbbell, Utensils, Plane, Home, Briefcase, Target, Heart, ShoppingCart, Car, Music,
  Camera, Gift, GraduationCap, Lightbulb, BarChart3, CheckSquare, Phone, Bike, Leaf, PawPrint, Plus, Loader2, X, ArrowRight, ExternalLink,
} from 'lucide-react';
import { Member } from '../../lib/projects';
import {
  Tool, ToolField, ToolItem, Transfer, cleanItemData, computeSummary, formatValue, itemTitle, money, num, personLabel, peopleOf,
} from '../../lib/tools';
import { useDialog } from '../Dialog';
import { CheckButton, Empty, ErrorNote, Label, MoreMenu, Sheet } from './ui';

const ICON_MAP = { list: List, wallet: Wallet, calendar: CalendarDays, map: Map, clock: Clock, users: Users, star: Star, book: BookOpen, dumbbell: Dumbbell, utensils: Utensils, plane: Plane, home: Home, briefcase: Briefcase, target: Target, heart: Heart, cart: ShoppingCart, car: Car, music: Music, camera: Camera, gift: Gift, school: GraduationCap, idea: Lightbulb, chart: BarChart3, check: CheckSquare, phone: Phone, bike: Bike, leaf: Leaf, paw: PawPrint };
export function ToolIcon({ name, className = 'w-4 h-4' }: { name: string | null | undefined; className?: string }) {
  const I = ICON_MAP[(name || 'list') as keyof typeof ICON_MAP] || List;
  return <I className={className} strokeWidth={1.75} />;
}

// One tool of a project: its sums on top, then its items as a list, a checklist or day by day.
export function ToolTab({ tool, items, members, me, canEdit, canEditProject, onSave, onRemove, onEditTool, onDeleteTool, notify }: {
  tool: Tool; items: ToolItem[]; members: Member[]; me: string; canEdit: boolean; canEditProject: boolean;
  onSave: (data: Record<string, unknown>, id?: string) => Promise<unknown>; onRemove: (id: string) => Promise<void>;
  onEditTool: () => void; onDeleteTool: () => void; notify: (text: string, error?: boolean) => void;
}) {
  const cfg = tool.config;
  const [editing, setEditing] = useState<ToolItem | 'new' | null>(null);
  const [prefill, setPrefill] = useState<Record<string, unknown> | null>(null);
  const people = useMemo(() => peopleOf(tool, items, members), [tool, items, members]);
  const doneField = cfg.fields.find(f => f.type === 'si_no');
  const dateField = cfg.fields.find(f => f.type === 'data');
  const itemName = cfg.itemName || 'voce';

  const sorted = useMemo(() => {
    const list = [...items];
    const by = cfg.view === 'giorni' && dateField ? dateField.id : cfg.sortBy;
    if (by) {
      const f = cfg.fields.find(x => x.id === by);
      const timeField = cfg.fields.find(x => x.type === 'ora');
      list.sort((a, b) => {
        const va = a.data[by], vb = b.data[by];
        let c = f && (f.type === 'numero' || f.type === 'soldi' || f.type === 'valutazione') ? num(va) - num(vb) : String(va ?? '￿').localeCompare(String(vb ?? '￿'));
        if (!c && timeField) c = String(a.data[timeField.id] ?? '').localeCompare(String(b.data[timeField.id] ?? ''));
        return (cfg.sortDesc && cfg.view !== 'giorni' ? -c : c) || a.position - b.position;
      });
    }
    if (cfg.view === 'checklist' && doneField) list.sort((a, b) => Number(a.data[doneField.id] === true) - Number(b.data[doneField.id] === true));
    return list;
  }, [items, cfg, dateField, doneField]);

  const groups = useMemo(() => {
    const key = cfg.view === 'giorni' && dateField ? dateField.id : cfg.groupBy;
    if (!key) return [{ label: '', items: sorted }];
    const f = cfg.fields.find(x => x.id === key)!;
    const map: [string, ToolItem[]][] = [];
    for (const it of sorted) {
      const label = formatGroup(f, it.data[key], members, me);
      const g = map.find(([l]) => l === label);
      if (g) g[1].push(it); else map.push([label, [it]]);
    }
    return map.map(([label, list]) => ({ label, items: list }));
  }, [sorted, cfg, dateField, members, me]);

  const toggle = (it: ToolItem) => {
    if (!doneField) return;
    onSave({ ...it.data, [doneField.id]: it.data[doneField.id] !== true }, it.id).catch(err => notify(err instanceof Error ? err.message : String(err), true));
  };
  const settle = (t: Transfer) => {
    const s = cfg.summaries.find(x => x.kind === 'saldi');
    if (!s || s.kind !== 'saldi') return;
    setPrefill({ [cfg.fields[0].id]: 'Rimborso', [s.amount]: t.amount, [s.payer]: t.from, [s.between]: [t.to], ...(dateField ? { [dateField.id]: new Date().toISOString().slice(0, 10) } : {}) });
    setEditing('new');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-[15px]" style={{ color: 'var(--text-muted)' }}>{tool.description || ' '}</p>
        {canEditProject && <MoreMenu label={`Impostazioni di ${tool.name}`} items={[
          { label: 'Modifica strumento', onClick: onEditTool },
          { label: 'Elimina strumento', onClick: onDeleteTool, danger: true },
        ]} />}
      </div>

      {cfg.summaries.length > 0 && items.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {cfg.summaries.map((s, i) => {
            const r = computeSummary(tool, items, s, members, me);
            return (
              <div key={i} className={`glass-card rounded-[20px] p-4 ${r.transfers ? 'sm:col-span-2' : ''}`}>
                <p className="text-xs font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>{r.label}</p>
                <p className="text-2xl font-semibold tabular mt-1 tracking-[-0.02em]" style={{ color: 'var(--text)' }}>{r.value}</p>
                {r.progress !== undefined && (
                  <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: 'var(--glass-well)' }}>
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(r.progress * 100)}%`, background: r.progress >= 1 && s.kind === 'budget' ? 'var(--danger)' : 'var(--brand-fill)' }} />
                  </div>
                )}
                {r.detail?.map(d => <p key={d} className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{d}</p>)}
                {r.transfers && r.transfers.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {r.transfers.map((t, j) => (
                      <li key={j} className="flex items-center gap-2 text-[15px] flex-wrap">
                        <span style={{ color: 'var(--text)' }}>{personLabel(t.from, members, me)}</span>
                        <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--text-subtle)' }} />
                        <span style={{ color: 'var(--text)' }}>{personLabel(t.to, members, me)}</span>
                        <span className="font-semibold tabular ml-auto" style={{ color: 'var(--brand-ring)' }}>{money(t.amount, cfg.currency)}</span>
                        {canEdit && <button onClick={() => settle(t)} className="text-xs px-2.5 h-7 rounded-full glass-card !rounded-full" style={{ color: 'var(--text-muted)' }}>Saldato</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <button onClick={() => { setPrefill(null); setEditing('new'); }} className="btn-primary h-11 px-4 inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Aggiungi {itemName}
        </button>
      )}

      {items.length === 0 ? (
        <Empty>Ancora niente qui. {canEdit ? `Aggiungi la prima ${itemName}, oppure dillo a MYND AI con parole tue.` : ''}</Empty>
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <section key={g.label || '_'}>
              {g.label && <h4 className="text-xs font-medium uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--text-muted)' }}>{g.label}</h4>}
              <ul className="space-y-1.5">
                {g.items.map(it => {
                  const done = !!doneField && it.data[doneField.id] === true;
                  const amount = cfg.fields.find(f => f.type === 'soldi');
                  const meta = cfg.fields.slice(1)
                    .filter(f => f.type !== 'si_no' && f.type !== 'testo_lungo' && f.type !== 'link' && f.id !== amount?.id && f.id !== (cfg.view === 'giorni' ? dateField?.id : cfg.groupBy))
                    .map(f => { const v = formatValue(f, it.data[f.id], cfg, members, me); return v && (f.type === 'persona' || f.type === 'persone') ? `${f.label.toLowerCase()} ${v}` : v; }).filter(Boolean);
                  const link = cfg.fields.find(f => f.type === 'link' && it.data[f.id]);
                  return (
                    <li key={it.id} className="rounded-2xl pr-3 flex items-center gap-1" style={{ background: 'var(--glass-well)' }}>
                      {cfg.view === 'checklist' && doneField
                        ? <CheckButton done={done} label={done ? `Riapri ${itemTitle(tool, it)}` : `Spunta ${itemTitle(tool, it)}`} onClick={() => toggle(it)} disabled={!canEdit} />
                        : <span className="w-4" />}
                      <button onClick={() => canEdit && setEditing(it)} disabled={!canEdit} className="flex-1 min-w-0 py-2.5 text-left disabled:cursor-default">
                        <p className={`text-[15px] break-words ${done ? 'line-through' : ''}`} style={{ color: done ? 'var(--text-subtle)' : 'var(--text)' }}>{itemTitle(tool, it)}</p>
                        {meta.length > 0 && <p className="text-xs truncate" style={{ color: 'var(--text-subtle)' }}>{meta.join(' · ')}</p>}
                      </button>
                      {link && <a href={String(it.data[link.id])} target="_blank" rel="noopener noreferrer" aria-label="Apri il link" className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/5" style={{ color: 'var(--text-subtle)' }}><ExternalLink className="w-4 h-4" /></a>}
                      {amount && it.data[amount.id] !== undefined && <span className="text-[15px] font-semibold tabular flex-shrink-0" style={{ color: 'var(--text)' }}>{money(num(it.data[amount.id]), cfg.currency)}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <ItemSheet tool={tool} items={items} item={editing === 'new' ? null : editing} prefill={editing === 'new' ? prefill : null} people={people} members={members} me={me}
          onClose={() => setEditing(null)}
          onSave={async data => { await onSave(data, editing === 'new' ? undefined : editing.id); setEditing(null); }}
          onDelete={editing === 'new' ? undefined : async () => { await onRemove(editing.id); setEditing(null); notify('Eliminato'); }} />
      )}
    </div>
  );
}

function formatGroup(f: ToolField, v: unknown, members: Member[], me: string): string {
  if (v === undefined || v === null || v === '') return f.type === 'data' ? 'Senza data' : `Senza ${f.label.toLowerCase()}`;
  if (f.type === 'data' && typeof v === 'string') return new Date(v + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  if (f.type === 'persona' && typeof v === 'string') return personLabel(v, members, me);
  if (f.type === 'si_no') return v === true ? f.label : `Non ${f.label.toLowerCase()}`;
  return String(v);
}

// A form built from the tool's fields.
function ItemSheet({ tool, items, item, prefill, people, members, me, onClose, onSave, onDelete }: {
  tool: Tool; items: ToolItem[]; item: ToolItem | null; prefill: Record<string, unknown> | null; people: string[]; members: Member[]; me: string;
  onClose: () => void; onSave: (data: Record<string, unknown>) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const cfg = tool.config;
  const dialog = useDialog();
  const [values, setValues] = useState<Record<string, unknown>>(() => item?.data || prefill || defaults(tool, me));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (id: string, v: unknown) => setValues(x => ({ ...x, [id]: v }));
  const [extraPeople, setExtraPeople] = useState<string[]>([]);
  const allPeople = [...people, ...extraPeople.filter(p => !people.includes(p))];

  const save = async () => {
    if (busy) return;
    const data = cleanItemData(cfg, values, allPeople);
    const missing = cfg.fields.filter((f, i) => (f.required || i === 0) && (data[f.id] === undefined || (Array.isArray(data[f.id]) && !(data[f.id] as unknown[]).length)));
    if (missing.length) { setError(`Manca: ${missing.map(f => f.label.toLowerCase()).join(', ')}.`); return; }
    setBusy(true); setError('');
    try { await onSave(data); } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };
  const remove = async () => {
    if (!onDelete) return;
    if (!(await dialog.confirm({ title: 'Eliminare questa voce?', confirmLabel: 'Elimina', danger: true }))) return;
    setBusy(true);
    try { await onDelete(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };

  return (
    <Sheet title={`${item ? 'Modifica' : 'Nuova'} ${cfg.itemName || 'voce'}`} onClose={onClose}
      footer={<>
        {onDelete && <button onClick={remove} className="h-11 px-3 mr-auto rounded-full text-sm font-medium" style={{ color: 'var(--danger)' }}>Elimina</button>}
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva</button>
      </>}>
      {cfg.fields.map((f, i) => (
        <FieldInput key={f.id} field={f} value={values[f.id]} onChange={v => set(f.id, v)} autoFocus={i === 0 && !item && !prefill} currency={cfg.currency}
          people={allPeople} members={members} me={me} onNewPerson={p => setExtraPeople(x => [...x, p])}
          suggestions={f.type === 'scelta' ? [...new Set(items.map(it => it.data[f.id]).filter((v): v is string => typeof v === 'string' && !!v))] : []} />
      ))}
      <ErrorNote text={error} />
    </Sheet>
  );
}

function defaults(tool: Tool, me: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of tool.config.fields) {
    if (f.type === 'data' && f.required) out[f.id] = new Date().toISOString().slice(0, 10);
    if (f.type === 'persona' && f.required) out[f.id] = `u:${me}`;
  }
  return out;
}

function FieldInput({ field: f, value, onChange, autoFocus, currency, people, members, me, onNewPerson, suggestions }: {
  field: ToolField; value: unknown; onChange: (v: unknown) => void; autoFocus?: boolean; currency?: string;
  people: string[]; members: Member[]; me: string; onNewPerson: (p: string) => void; suggestions: string[];
}) {
  const id = `tf-${f.id}`;
  const label = f.label;
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  switch (f.type) {
    case 'testo_lungo':
      return <div><Label htmlFor={id}>{label}</Label><textarea id={id} value={text} onChange={e => onChange(e.target.value)} rows={3} className="input-glass w-full text-[15px] leading-relaxed resize-y" /></div>;
    case 'si_no':
      return (
        <label className="flex items-center gap-3 py-1 cursor-pointer">
          <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} className="w-5 h-5 accent-[var(--brand-fill)]" />
          <span className="text-[15px]" style={{ color: 'var(--text)' }}>{f.label}</span>
        </label>
      );
    case 'valutazione':
      return (
        <div><Label>{label}</Label>
          <div className="flex gap-1" role="radiogroup" aria-label={f.label}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" role="radio" aria-checked={num(value) === n} aria-label={`${n} su 5`} onClick={() => onChange(num(value) === n ? '' : n)}
                className="w-10 h-10 rounded-full text-xl" style={{ color: num(value) >= n ? 'var(--brand-ring)' : 'var(--text-subtle)' }}>★</button>
            ))}
          </div>
        </div>
      );
    case 'scelta':
      return (
        <div><Label htmlFor={id}>{label}</Label>
          {f.options?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {f.options.map(o => (
                <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(value === o ? '' : o)}
                  className={`h-9 px-3.5 rounded-full text-sm ${value === o ? 'glass-lens' : 'glass-card !rounded-full'}`} style={{ color: value === o ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{o}</button>
              ))}
            </div>
          ) : (
            <>
              <input id={id} list={`${id}-list`} value={text} onChange={e => onChange(e.target.value)} className="input-glass w-full h-12 text-[15px]" />
              <datalist id={`${id}-list`}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
            </>
          )}
        </div>
      );
    case 'persona': case 'persone': {
      const multi = f.type === 'persone';
      const chosen = multi ? (Array.isArray(value) ? value as string[] : []) : (typeof value === 'string' ? [value] : []);
      const toggle = (p: string) => onChange(multi ? (chosen.includes(p) ? chosen.filter(x => x !== p) : [...chosen, p]) : (chosen[0] === p ? '' : p));
      return (
        <div><Label>{label}{multi && <span className="normal-case tracking-normal" style={{ color: 'var(--text-subtle)' }}> · se non scegli nessuno vale per tutti</span>}</Label>
          <div className="flex flex-wrap gap-1.5">
            {people.map(p => (
              <button key={p} type="button" aria-pressed={chosen.includes(p)} onClick={() => toggle(p)}
                className={`h-9 px-3.5 rounded-full text-sm ${chosen.includes(p) ? 'glass-lens' : 'glass-card !rounded-full'}`} style={{ color: chosen.includes(p) ? 'var(--brand-ring)' : 'var(--text-muted)' }}>
                {personLabel(p, members, me)}
              </button>
            ))}
            <AddName onAdd={name => { const k = `n:${name}`; onNewPerson(k); toggle(k); }} />
          </div>
        </div>
      );
    }
    default: {
      // Numbers as text with the decimal keypad: "42,5" (Italian comma) and "42.5" both work.
      const numeric = f.type === 'soldi' || f.type === 'numero';
      const type = f.type === 'data' ? 'date' : f.type === 'ora' ? 'time' : f.type === 'email' ? 'email' : f.type === 'telefono' ? 'tel' : f.type === 'link' ? 'url' : 'text';
      return (
        <div><Label htmlFor={id}>{label}{f.type === 'soldi' ? ` (${currency || 'EUR'})` : f.unit ? ` (${f.unit})` : ''}</Label>
          <input id={id} type={type} inputMode={numeric ? 'decimal' : undefined} value={text} onChange={e => onChange(numeric ? e.target.value.replace(/[^\d.,-]/g, '') : e.target.value)} autoFocus={autoFocus}
            className="input-glass w-full h-12 text-[15px]" />
        </div>
      );
    }
  }
}

function AddName({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="h-9 px-3.5 rounded-full text-sm inline-flex items-center gap-1" style={{ color: 'var(--brand-ring)' }}><Plus className="w-3.5 h-3.5" /> Nome</button>;
  const add = () => { const v = name.trim(); if (v) { onAdd(v.slice(0, 40)); setName(''); setOpen(false); } };
  return (
    <span className="inline-flex items-center gap-1">
      <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} autoFocus placeholder="Es. Marco" aria-label="Nome della persona"
        className="input-glass h-9 w-32 text-sm" />
      <button type="button" onClick={add} aria-label="Aggiungi" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: 'var(--brand-ring)' }}><Plus className="w-4 h-4" /></button>
      <button type="button" onClick={() => setOpen(false)} aria-label="Annulla" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: 'var(--text-subtle)' }}><X className="w-4 h-4" /></button>
    </span>
  );
}
