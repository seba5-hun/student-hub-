import React, { useState } from 'react';
import { Plus, Minus, X, Trash2, ExternalLink, Check, CalendarClock, Sparkles, History, Database } from 'lucide-react';
import MiniApp from './MiniApp';
import { openAssistant } from '../lib/assistantBus';
import { UserData, CustomBlock, todayKey, parseDate, toDateKey, compareTasks, formatDateWithDay } from '../lib/store';
import { nextOfEachSeries } from '../lib/recurrence';
import { useDialog } from './Dialog';

// One of MYND's building blocks, drawn like the other Home panels and usable right away.

interface Props {
  block: CustomBlock;
  data: UserData;
  darkMode: boolean;
  onChange: (block: CustomBlock) => void;
  onRemove: () => void;
  onNavigate?: (section: string) => void;
}

type Item = { id: string; text: string; done: boolean };
type Link = { label: string; url: string };
const WEEK = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

export default function CustomBlockView({ block, data, darkMode, onChange, onRemove, onNavigate }: Props) {
  const dialog = useDialog();
  const c = block.config as Record<string, unknown>;
  const set = (patch: Record<string, unknown>) => onChange({ ...block, config: { ...c, ...patch } });
  const [draft, setDraft] = useState('');
  const [draft2, setDraft2] = useState('');

  const text = darkMode ? 'text-white' : 'text-gray-800';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const card = darkMode ? 'glass-card' : 'glass-card-light';
  const well = darkMode ? 'bg-white/5' : 'bg-black/5';
  const input = `${darkMode ? 'input-glass' : 'input-light'} text-sm py-1.5 flex-1 min-w-0`;
  const round = `w-9 h-9 rounded-full flex items-center justify-center ${darkMode ? 'bg-white/10 hover:bg-white/15' : 'bg-black/5 hover:bg-black/10'} ${text}`;
  const today = todayKey();

  const remove = async () => {
    if (await dialog.confirm({ title: `Togliere "${block.title}"?`, message: 'Il blocco e il suo contenuto spariscono.', confirmLabel: 'Togli', danger: true })) onRemove();
  };

  let body: React.ReactNode = null;
  let corner: React.ReactNode = null;

  switch (block.kind) {
    case 'checklist': {
      const items = (c.items as Item[]) || [];
      const done = items.filter(i => i.done).length;
      corner = items.length ? <span className={`text-xs ${sub}`}>{done}/{items.length}</span> : null;
      body = (
        <div className="space-y-1.5">
          {items.map(it => (
            <div key={it.id} className="group flex items-center gap-2.5">
              <button onClick={() => set({ items: items.map(x => (x.id === it.id ? { ...x, done: !x.done } : x)) })} aria-label={it.done ? 'Da fare' : 'Fatto'}
                className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center"
                style={it.done ? { background: 'var(--brand-fill)', color: 'var(--on-brand)' } : { boxShadow: 'inset 0 0 0 1.5px var(--border)' }}>
                {it.done && <Check className="w-3.5 h-3.5" />}
              </button>
              <span className={`flex-1 text-sm ${it.done ? 'line-through opacity-50' : ''} ${text}`}>{it.text}</span>
              <button onClick={() => set({ items: items.filter(x => x.id !== it.id) })} aria-label="Togli" className={`opacity-0 group-hover:opacity-100 p-1 ${sub}`}><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <form onSubmit={e => { e.preventDefault(); if (draft.trim()) { set({ items: [...items, { id: `${Date.now()}`, text: draft.trim().slice(0, 160), done: false }] }); setDraft(''); } }} className="flex gap-2 pt-1">
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Aggiungi…" className={input} />
          </form>
        </div>
      );
      break;
    }
    case 'counter': {
      const daily = c.daily !== false;
      const count = daily && c.day !== today ? 0 : Number(c.count) || 0;
      const target = Number(c.target) || 0;
      const change = (d: number) => set({ count: Math.max(0, count + d), day: today });
      body = (
        <div className="flex items-center justify-between gap-4">
          <button onClick={() => change(-1)} className={round} aria-label="Meno"><Minus className="w-4 h-4" /></button>
          <div className="text-center">
            <p className={`text-4xl font-bold tracking-tight tabular ${text}`}>{count}{target ? <span className={`text-xl ${sub}`}>/{target}</span> : null}</p>
            <p className={`text-xs ${sub}`}>{String(c.unit || '')}{daily ? ' · oggi' : ''}</p>
          </div>
          <button onClick={() => change(1)} className={round} aria-label="Più" style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}><Plus className="w-4 h-4" /></button>
        </div>
      );
      if (target) corner = count >= target ? <span className="text-xs font-semibold" style={{ color: 'var(--brand-ring)' }}>Obiettivo raggiunto ✓</span> : null;
      break;
    }
    case 'habits': {
      const habits = (c.habits as string[]) || [];
      const doneMap = (c.done as Record<string, number[]>) || {};
      const monday = parseDate(today); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return toDateKey(d); });
      const toggle = (day: string, h: number) => {
        const list = doneMap[day] || [];
        const next = { ...doneMap, [day]: list.includes(h) ? list.filter(x => x !== h) : [...list, h] };
        // Only the last 5 weeks are kept.
        Object.keys(next).forEach(k => { if (parseDate(k).getTime() < Date.now() - 35 * 86_400_000) delete next[k]; });
        set({ done: next });
      };
      body = habits.length === 0 ? <p className={`text-sm ${sub}`}>Nessuna abitudine.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th />{WEEK.map((w, i) => <th key={i} className={`text-xs font-medium pb-2 ${days[i] === today ? '' : sub}`} style={days[i] === today ? { color: 'var(--brand-ring)' } : undefined}>{w}</th>)}</tr></thead>
            <tbody>
              {habits.map((h, hi) => (
                <tr key={hi}>
                  <td className={`pr-3 py-1 ${text}`}>{h}</td>
                  {days.map(d => {
                    const on = (doneMap[d] || []).includes(hi);
                    return (
                      <td key={d} className="text-center py-1">
                        <button onClick={() => toggle(d, hi)} disabled={d > today} aria-label={`${h} ${d}`}
                          className="w-7 h-7 rounded-lg inline-flex items-center justify-center disabled:opacity-30"
                          style={on ? { background: 'var(--brand-fill)', color: 'var(--on-brand)' } : { boxShadow: 'inset 0 0 0 1.5px var(--border)' }}>
                          {on && <Check className="w-4 h-4" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    }
    case 'countdown': {
      const date = String(c.date || '');
      const days = date ? Math.round((parseDate(date).getTime() - parseDate(today).getTime()) / 86_400_000) : null;
      body = !date ? (
        <input type="date" onChange={e => set({ date: e.target.value })} className={input} aria-label="Data" />
      ) : (
        <div>
          <p className={`text-5xl font-bold tracking-tight tabular ${text}`}>{days! > 0 ? days : days === 0 ? 'Oggi!' : '✓'}</p>
          <p className={`text-sm mt-1 ${sub}`}>{days! > 0 ? `${days === 1 ? 'giorno' : 'giorni'} ${String(c.label || '')}` : days === 0 ? String(c.label || '') : `${String(c.label || 'Fatto')} · è passato`}</p>
          <p className={`text-xs mt-2 ${sub}`}>{formatDateWithDay(date)}</p>
        </div>
      );
      break;
    }
    case 'progress': {
      const cur = Number(c.current) || 0, target = Math.max(1, Number(c.target) || 1);
      const pct = Math.min(100, Math.round((cur / target) * 100));
      body = (
        <div>
          <div className="flex items-end justify-between">
            <p className={`text-3xl font-bold tracking-tight tabular ${text}`}>{cur}<span className={`text-base ${sub}`}> / {target} {String(c.unit || '')}</span></p>
            <span className={`text-sm font-semibold`} style={{ color: 'var(--brand-ring)' }}>{pct}%</span>
          </div>
          <div className="h-2.5 rounded-full mt-3 overflow-hidden" style={{ background: 'var(--glass-well)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--brand-fill)' }} />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => set({ current: Math.max(0, cur - 1) })} className={round} aria-label="Meno"><Minus className="w-4 h-4" /></button>
            <button onClick={() => set({ current: cur + 1 })} className={round} aria-label="Più"><Plus className="w-4 h-4" /></button>
            <input type="number" value={cur} min={0} onChange={e => set({ current: Math.max(0, Number(e.target.value) || 0) })} className={`${input} max-w-[6rem]`} aria-label="Valore" />
          </div>
        </div>
      );
      break;
    }
    case 'note':
      body = (
        <textarea defaultValue={String(c.text || '')} onBlur={e => { if (e.target.value !== c.text) set({ text: e.target.value.slice(0, 2000) }); }}
          rows={4} placeholder="Scrivi qui…" className={`${darkMode ? 'input-glass' : 'input-light'} w-full text-sm resize-none`} />
      );
      break;
    case 'links': {
      const links = (c.links as Link[]) || [];
      body = (
        <div className="space-y-1.5">
          {links.map((l, i) => (
            <div key={i} className="group flex items-center gap-2">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${well} ${text}`}>
                <ExternalLink className="w-3.5 h-3.5 opacity-60" /> <span className="truncate">{l.label}</span>
              </a>
              <button onClick={() => set({ links: links.filter((_, j) => j !== i) })} aria-label="Togli" className={`opacity-0 group-hover:opacity-100 p-1 ${sub}`}><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <form onSubmit={e => {
            e.preventDefault();
            const url = /^https?:\/\//i.test(draft2.trim()) ? draft2.trim() : draft2.trim() ? `https://${draft2.trim()}` : '';
            if (url) { set({ links: [...links, { label: draft.trim() || url.replace(/^https?:\/\//, ''), url }] }); setDraft(''); setDraft2(''); }
          }} className="flex gap-2 pt-1">
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Nome" className={input} />
            <input value={draft2} onChange={e => setDraft2(e.target.value)} placeholder="Indirizzo" className={input} />
            <button type="submit" className={round} aria-label="Aggiungi link"><Plus className="w-4 h-4" /></button>
          </form>
        </div>
      );
      break;
    }
    case 'app': {
      const history = (c.history as { html: string; at: string }[]) || [];
      const [appError, setAppError] = [String(c.lastError || ''), (msg: string) => { if (msg !== c.lastError) set({ lastError: msg }); }];
      corner = (
        <>
          <button onClick={() => set({ data: !c.data })} title={c.data ? 'Può leggere materie, impegni e voti: tocca per toglierlo' : 'Non legge i tuoi dati: tocca per permetterlo'}
            className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={c.data ? { color: 'var(--brand-ring)', background: 'color-mix(in srgb, var(--brand-fill) 14%, transparent)' } : { color: 'var(--text-subtle)' }}>
            <Database className="w-3.5 h-3.5" /> {c.data ? 'Dati: sì' : 'Dati: no'}
          </button>
          {history.length > 0 && (
            <button onClick={async () => {
              if (!(await dialog.confirm({ title: 'Tornare alla versione precedente?', message: `"${block.title}" torna com'era prima dell'ultima modifica. I dati salvati restano.`, confirmLabel: 'Torna indietro' }))) return;
              const prev = history[history.length - 1];
              set({ html: prev.html, history: history.slice(0, -1), lastError: '' });
            }} title="Versione precedente" aria-label="Versione precedente" className={`p-1.5 rounded-lg opacity-60 hover:opacity-100 ${sub}`}><History className="w-3.5 h-3.5" /></button>
          )}
          <button onClick={() => openAssistant(`Modifica la mini-app «${block.title}»: `, block.id)} title="Modifica con l'AI" aria-label="Modifica con l'AI"
            className="p-1.5 rounded-lg" style={{ color: 'var(--brand-ring)' }}><Sparkles className="w-3.5 h-3.5" /></button>
        </>
      );
      body = (
        <div>
          {String(c.html || '') ? (
            <MiniApp html={String(c.html)} store={c.store} allowData={c.data === true} data={data}
              onSave={store => set({ store })} onError={setAppError} />
          ) : <p className={`text-sm ${sub}`}>Questa mini-app è vuota.</p>}
          {appError && (
            <p className="text-xs mt-2 text-amber-400">
              Qualcosa non funziona ({appError}). <button className="underline" onClick={() => openAssistant(`La mini-app «${block.title}» dà questo errore: ${appError}. Correggila.`, block.id)}>Chiedi all'AI di correggerla</button>
            </p>
          )}
        </div>
      );
      break;
    }
    case 'tasks': {
      const filter = String(c.filter || 'upcoming'), subject = String(c.subject || '').toLowerCase();
      const list = nextOfEachSeries(data.tasks.filter(t => !t.done && t.date >= today
        && (filter !== 'school' || t.type === 'scolastico') && (filter !== 'personal' || t.type === 'personale')
        && (!subject || (t.subject || '').toLowerCase() === subject)).sort(compareTasks)).slice(0, Number(c.limit) || 5);
      body = list.length === 0 ? <p className={`text-sm ${sub}`}>Niente in programma.</p> : (
        <div className="space-y-1.5">
          {list.map(t => (
            <button key={t.id} onClick={() => onNavigate?.('impegni')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left ${well}`}>
              <CalendarClock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--brand-ring)' }} />
              <span className={`flex-1 text-sm truncate ${text}`}>{t.title}</span>
              <span className={`text-xs flex-shrink-0 ${sub}`}>{formatDateWithDay(t.date)}{t.time ? ` · ${t.time}` : ''}</span>
            </button>
          ))}
        </div>
      );
      break;
    }
  }

  return (
    <div className={`${card} p-6 h-full flex flex-col`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className={`font-semibold ${text}`}>{block.title}</h3>
        <div className="flex items-center gap-2">
          {corner}
          <button onClick={remove} aria-label={`Togli ${block.title}`} title="Togli il blocco" className={`p-1.5 rounded-lg opacity-50 hover:opacity-100 ${sub}`}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="flex-1">{body}</div>
    </div>
  );
}
