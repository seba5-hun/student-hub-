import { useState } from 'react';
import { CalendarDays, Sunrise, Smartphone, ListChecks, Trash2, Plus, ChevronDown, ChevronRight, Copy, Check, Workflow, RotateCcw, Pencil } from 'lucide-react';
import {
  MindsetData, DayType, Block, Habit, wakeStep, toMin, fromMin, formatDuration, defaultMindset,
} from '../../lib/mindset';
import { createId, toDateKey } from '../../lib/store';
import { Theme, Section, AreaDot, Pill } from './ui';
import { BlockEditor } from './MindsetToday';
import { useDialog } from '../Dialog';

const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const APP_URL = 'https://student-hub-sandy-two.vercel.app';

interface Props {
  m: MindsetData;
  update: (fn: (m: MindsetData) => MindsetData) => void;
  t: Theme;
}

export default function MindsetPlan({ m, update, t }: Props) {
  const dialog = useDialog();
  const today = toDateKey(new Date());
  const p = m.profile;
  const step = wakeStep(m, today);
  const setProfile = (patch: Partial<typeof p>) => update(x => ({ ...x, profile: { ...x.profile, ...patch } }));
  const progress = toMin(p.startWake) - toMin(p.targetWake) > 0
    ? Math.min(1, Math.max(0, (toMin(p.startWake) - toMin(p.stage.wake)) / (toMin(p.startWake) - toMin(p.targetWake)))) : 1;

  return (
    <div className="space-y-4">
      <Section title="La tua settimana" icon={<CalendarDays className="w-4 h-4" />} t={t}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ORDER.map(d => (
            <label key={d} className={`flex items-center gap-3 p-2.5 rounded-xl ${t.soft}`}>
              <span className={`w-24 text-sm ${t.text}`}>{WEEKDAYS[d]}</span>
              <select value={m.week[d]} onChange={e => update(x => ({ ...x, week: x.week.map((w, i) => (i === d ? e.target.value : w)) }))}
                className={`${t.input} flex-1 py-1.5 text-sm`}>
                {m.dayTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.emoji} {dt.name}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className={`text-xs mt-2 ${t.sub}`}>Un giorno va diversamente (niente vento, gara…)? Lo cambi dalla scheda Oggi, solo per quel giorno.</p>
      </Section>

      <Section title="Sveglia progressiva" icon={<Sunrise className="w-4 h-4" />} t={t}>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className={`text-sm ${t.sub}`}>Gradino attuale</p>
            <p className={`text-4xl font-bold tabular-nums ${t.text}`}>{p.stage.wake}</p>
          </div>
          <div className="text-right">
            <p className={`text-sm ${t.sub}`}>Obiettivo</p>
            <p className={`text-2xl font-semibold tabular-nums ${t.text}`}>{p.targetWake}</p>
          </div>
        </div>
        <div className={`h-2 rounded-full mt-3 overflow-hidden ${t.soft}`}>
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-indigo-500 transition-all duration-700" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className={`text-sm mt-3 ${step.state === 'protect' ? 'text-amber-400' : t.text}`}>{step.message}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {step.next && step.state !== 'done' && (
            <button onClick={() => setProfile({ stage: { wake: step.next!, since: today } })}
              className={step.state === 'ready' ? 'btn-primary text-sm' : `px-3 py-2 rounded-xl text-sm ${t.soft} ${t.text} ${t.hover}`}>
              Passa alle {step.next}{step.state !== 'ready' ? ' comunque' : ''}
            </button>
          )}
          {toMin(p.stage.wake) < toMin(p.startWake) && (
            <button onClick={() => setProfile({ stage: { wake: fromMin(Math.min(toMin(p.startWake), toMin(p.stage.wake) + p.stepMinutes)), since: today } })}
              className={`px-3 py-2 rounded-xl text-sm ${t.soft} ${t.sub} ${t.hover}`}>
              Torna al gradino precedente
            </button>
          )}
        </div>
        <p className={`text-xs mt-3 ${t.sub}`}>
          Con {formatDuration(p.sleepNeed)} di sonno, per la sveglia delle {p.stage.wake} a letto alle <b>{fromMin(toMin(p.stage.wake) - p.sleepNeed - 15)}</b> nei giorni di scuola.
          Si sveglia prima chi va a letto prima, non chi dorme meno.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          <Field label="Obiettivo sveglia" t={t}><input type="time" value={p.targetWake} onChange={e => setProfile({ targetWake: e.target.value })} className={`${t.input} w-full py-1.5`} /></Field>
          <Field label="Ore di sonno" t={t}>
            <select value={p.sleepNeed} onChange={e => setProfile({ sleepNeed: Number(e.target.value) })} className={`${t.input} w-full py-1.5`}>
              {Array.from({ length: 11 }, (_, i) => 450 + i * 15).map(v => <option key={v} value={v}>{formatDuration(v)}</option>)}
            </select>
          </Field>
          <Field label="Ogni gradino" t={t}>
            <select value={p.stepMinutes} onChange={e => setProfile({ stepMinutes: Number(e.target.value) })} className={`${t.input} w-full py-1.5`}>
              {[15, 20, 30].map(v => <option key={v} value={v}>-{v} min</option>)}
            </select>
          </Field>
          <Field label="Giorni per gradino" t={t}>
            <select value={p.stepDays} onChange={e => setProfile({ stepDays: Number(e.target.value) })} className={`${t.input} w-full py-1.5`}>
              {[3, 4, 5, 6, 7, 10, 14].map(v => <option key={v} value={v}>{v} giorni</option>)}
            </select>
          </Field>
          <Field label="Weekend" t={t}>
            <select value={p.weekendLater} onChange={e => setProfile({ weekendLater: Number(e.target.value) })} className={`${t.input} w-full py-1.5`}>
              {[0, 30, 60, 90].map(v => <option key={v} value={v}>{v ? `+${v} min` : 'stessa ora'}</option>)}
            </select>
          </Field>
          <Field label="Sveglia più tardi possibile (scuola)" t={t}><input type="time" value={p.latestWake} onChange={e => setProfile({ latestWake: e.target.value })} className={`${t.input} w-full py-1.5`} /></Field>
        </div>
      </Section>

      <Section title="Tipi di giornata" icon={<ListChecks className="w-4 h-4" />} t={t}
        action={<button onClick={() => update(x => ({ ...x, dayTypes: [...x.dayTypes, { id: createId(), name: 'Nuova giornata', emoji: '⭐', morningEnd: '07:00', morningArea: 'project', blocks: [] }] }))}
          className={`p-1.5 rounded-lg ${t.sub} ${t.hover}`} aria-label="Nuovo tipo di giornata"><Plus className="w-4 h-4" /></button>}>
        <p className={`text-xs mb-3 ${t.sub}`}>Sveglia, deep work del mattino e routine serale si aggiungono da sole in base alla sveglia progressiva.</p>
        <div className="space-y-2">
          {m.dayTypes.map(dt => <DayTypeEditor key={dt.id} dt={dt} t={t} used={m.week.includes(dt.id)}
            onChange={nd => update(x => ({ ...x, dayTypes: x.dayTypes.map(d => (d.id === dt.id ? nd : d)) }))}
            onDelete={() => update(x => ({ ...x, dayTypes: x.dayTypes.filter(d => d.id !== dt.id) }))} />)}
        </div>
      </Section>

      <Section title="Obiettivi giornalieri" icon={<Smartphone className="w-4 h-4" />} t={t}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefono, obiettivo finale" t={t}>
            <select value={p.phoneGoal} onChange={e => setProfile({ phoneGoal: Number(e.target.value) })} className={`${t.input} w-full py-1.5`}>
              {Array.from({ length: 17 }, (_, i) => 60 + i * 15).map(v => <option key={v} value={v}>{formatDuration(v)}</option>)}
            </select>
          </Field>
          <Field label="Focus e studio al giorno" t={t}>
            <select value={p.focusTarget} onChange={e => setProfile({ focusTarget: Number(e.target.value) })} className={`${t.input} w-full py-1.5`}>
              {[30, 45, 60, 90, 120, 150, 180, 240].map(v => <option key={v} value={v}>{formatDuration(v)}</option>)}
            </select>
          </Field>
        </div>
        <p className={`text-xs mt-2 ${t.sub}`}>Il telefono scende per gradi: ogni settimana l'obiettivo è circa 45 minuti meno della media della settimana prima, fino a quello finale.</p>
      </Section>

      <HabitsEditor habits={m.habits} t={t} onChange={habits => update(x => ({ ...x, habits }))} />

      <ShortcutsGuide t={t} />

      <Section title="Profilo" t={t}>
        <Field label="Il tuo nome" t={t}><input value={p.name} onChange={e => setProfile({ name: e.target.value })} className={`${t.input} w-full py-1.5`} /></Field>
        <button onClick={async () => {
          const ok = await dialog.confirm({ title: 'Azzerare Performance?', message: 'Cancelli diario, sonno, focus e impostazioni di Performance. Le altre sezioni non cambiano.', confirmLabel: 'Azzera', danger: true });
          if (ok) update(() => defaultMindset());
        }} className="mt-4 text-sm text-red-400 flex items-center gap-1.5"><RotateCcw className="w-4 h-4" /> Azzera Performance</button>
      </Section>
    </div>
  );
}

function Field({ label, children, t }: { label: string; children: React.ReactNode; t: Theme }) {
  return <label className="block"><span className={`block text-xs mb-1 ${t.sub}`}>{label}</span>{children}</label>;
}

function DayTypeEditor({ dt, onChange, onDelete, t, used }: { dt: DayType; onChange: (d: DayType) => void; onDelete: () => void; t: Theme; used: boolean }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Block | null>(null);
  const blocks = [...dt.blocks].sort((a, b) => toMin(a.start) - toMin(b.start));
  return (
    <div className={`rounded-2xl ${t.soft}`}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 p-3 text-left">
        {open ? <ChevronDown className={`w-4 h-4 ${t.sub}`} /> : <ChevronRight className={`w-4 h-4 ${t.sub}`} />}
        <span className="text-lg">{dt.emoji}</span>
        <span className={`font-medium flex-1 ${t.text}`}>{dt.name}</span>
        <span className="flex gap-1">{blocks.slice(0, 8).map(b => <AreaDot key={b.id} area={b.area} />)}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 animate-scale-in">
          <div className="grid grid-cols-[3.5rem_1fr] gap-2">
            <input value={dt.emoji} onChange={e => onChange({ ...dt, emoji: e.target.value.slice(0, 4) })} className={`${t.input} text-center py-1.5`} aria-label="Emoji" />
            <input value={dt.name} onChange={e => onChange({ ...dt, name: e.target.value })} className={`${t.input} py-1.5`} aria-label="Nome" />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={t.sub}>Deep work del mattino:</span>
            <Pill t={t} active={dt.morningArea === 'project'} onClick={() => onChange({ ...dt, morningArea: 'project' })}>Progetto</Pill>
            <Pill t={t} active={dt.morningArea === 'study'} onClick={() => onChange({ ...dt, morningArea: 'study' })}>Studio</Pill>
            <span className={t.sub}>fino alle</span>
            <input type="time" value={dt.morningEnd} onChange={e => onChange({ ...dt, morningEnd: e.target.value })} className={`${t.input} py-1 px-2 w-28`} />
          </div>
          <label className={`flex items-center gap-2 text-sm ${t.text}`}>
            <input type="checkbox" checked={!!dt.relaxed} onChange={e => onChange({ ...dt, relaxed: e.target.checked })} className="accent-indigo-500" />
            Giornata senza scuola (sveglia un po' più tardi)
          </label>
          <ul className="space-y-1">
            {blocks.map(b => (
              <li key={b.id}>
                <button onClick={() => setEdit(b)} className={`w-full flex items-center gap-3 p-2 rounded-lg text-left text-sm ${t.hover}`}>
                  <span className={`tabular-nums text-xs w-24 ${t.sub}`}>{b.start} – {b.end}</span>
                  <AreaDot area={b.area} />
                  <span className={`flex-1 truncate ${t.text}`}>{b.title}</span>
                  <Pencil className={`w-3.5 h-3.5 ${t.sub}`} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button onClick={() => {
              const last = blocks[blocks.length - 1];
              const start = last ? last.end : '15:00';
              setEdit({ id: createId(), start, end: fromMin(toMin(start) + 60), title: '', area: 'study' });
            }} className={`px-3 py-1.5 rounded-xl text-sm flex items-center gap-1.5 ${t.soft} ${t.text} ${t.hover}`}>
              <Plus className="w-4 h-4" /> Attività
            </button>
            <div className="flex-1" />
            {!used && <button onClick={onDelete} className="p-2 rounded-xl text-red-400 hover:bg-red-500/10" aria-label="Elimina tipo"><Trash2 className="w-4 h-4" /></button>}
          </div>
        </div>
      )}
      {edit && (
        <BlockEditor block={edit} t={t} isNew={!dt.blocks.some(b => b.id === edit.id)} onClose={() => setEdit(null)}
          onDelete={() => { onChange({ ...dt, blocks: dt.blocks.filter(b => b.id !== edit.id) }); setEdit(null); }}
          onSave={nb => { onChange({ ...dt, blocks: dt.blocks.some(b => b.id === nb.id) ? dt.blocks.map(b => (b.id === nb.id ? nb : b)) : [...dt.blocks, nb] }); setEdit(null); }} />
      )}
    </div>
  );
}

function HabitsEditor({ habits, onChange, t }: { habits: Habit[]; onChange: (h: Habit[]) => void; t: Theme }) {
  const set = (id: string, patch: Partial<Habit>) => onChange(habits.map(h => (h.id === id ? { ...h, ...patch } : h)));
  return (
    <Section title="Abitudini" t={t}
      action={<button onClick={() => onChange([...habits, { id: createId(), name: 'Nuova abitudine', full: 'completa', min: 'minimo' }])}
        className={`p-1.5 rounded-lg ${t.sub} ${t.hover}`} aria-label="Nuova abitudine"><Plus className="w-4 h-4" /></button>}>
      <p className={`text-xs mb-3 ${t.sub}`}>Never zero: ogni abitudine ha una versione completa e un minimo che salva la continuità (vale un po' meno).</p>
      <div className="space-y-2">
        {habits.map(h => (
          <div key={h.id} className={`grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr_auto] gap-2 p-2 rounded-xl ${t.soft}`}>
            <input value={h.name} onChange={e => set(h.id, { name: e.target.value })} className={`${t.input} py-1.5 text-sm`} aria-label="Abitudine" />
            <input value={h.full} onChange={e => set(h.id, { full: e.target.value })} className={`${t.input} py-1.5 text-sm`} aria-label="Completa" placeholder="Completa" />
            <input value={h.min} onChange={e => set(h.id, { min: e.target.value })} className={`${t.input} py-1.5 text-sm`} aria-label="Minimo" placeholder="Minimo" />
            <button onClick={() => onChange(habits.filter(x => x.id !== h.id))} className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 justify-self-end" aria-label="Elimina abitudine"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function CopyLine({ text, t }: { text: string; t: Theme }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
      className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-xs font-mono break-all ${t.soft} ${t.text}`}>
      <span className="flex-1">{text}</span>
      {copied ? <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <Copy className={`w-4 h-4 flex-shrink-0 ${t.sub}`} />}
    </button>
  );
}

function ShortcutsGuide({ t }: { t: Theme }) {
  const [open, setOpen] = useState(false);
  return (
    <Section title="Comandi Rapidi (iPhone)" icon={<Workflow className="w-4 h-4" />} t={t}
      action={<button onClick={() => setOpen(v => !v)} className={`text-xs ${t.sub} hover:text-indigo-400`}>{open ? 'Chiudi' : 'Configura'}</button>}>
      <p className={`text-sm ${t.sub}`}>Due aggiunte facoltative: la sveglia impostata con un tocco e il reset serale che si apre da solo.</p>
      {open && (
        <div className={`mt-4 space-y-5 text-sm ${t.text}`}>
          <div>
            <p className="font-semibold mb-1">0. Aggiungi MYND alla schermata Home</p>
            <p className={t.sub}>In Safari apri il sito › tasto Condividi › "Aggiungi alla schermata Home". Così si apre come un'app.</p>
          </div>
          <div>
            <p className="font-semibold mb-1">1. Sveglia con un tocco</p>
            <ol className={`list-decimal pl-5 space-y-1 ${t.sub}`}>
              <li>Apri l'app <b>Comandi Rapidi</b> › scheda <b>Comandi</b> › tasto <b>+</b>.</li>
              <li>Chiamalo esattamente <b>Sveglia Mindset</b> (tocca il nome in alto).</li>
              <li>Aggiungi l'azione <b>Crea sveglia</b> (app Orologio).</li>
              <li>Tocca l'orario dell'azione › scegli la variabile <b>Input comando rapido</b>.</li>
              <li>Fine. Nel reset serale il tasto "Imposta sveglia" lo avvia con l'orario giusto.</li>
            </ol>
            <p className={`text-xs mt-1 ${t.sub}`}>La prima volta iPhone ti chiede il permesso: tocca "Consenti sempre".</p>
          </div>
          <div>
            <p className="font-semibold mb-1">2. Reset serale automatico</p>
            <ol className={`list-decimal pl-5 space-y-1 ${t.sub}`}>
              <li>Comandi Rapidi › scheda <b>Automazione</b> › <b>+</b> › <b>Ora del giorno</b>.</li>
              <li>Scegli l'orario (es. 1 ora prima di andare a letto), <b>Ogni giorno</b>, e <b>Esegui immediatamente</b>.</li>
              <li>Azione <b>Apri URL</b> con questo indirizzo:</li>
            </ol>
            <div className="mt-2"><CopyLine text={`${APP_URL}/?mindset=sera`} t={t} /></div>
          </div>
        </div>
      )}
    </Section>
  );
}
