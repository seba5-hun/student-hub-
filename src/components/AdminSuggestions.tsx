import React, { useCallback, useEffect, useState } from 'react';
import { Lightbulb, Bug, MessageCircle, Loader2, RefreshCw, Trash2, Check, Eye, RotateCcw, Copy } from 'lucide-react';
import { Suggestion, SuggestionStatus, loadSuggestions, setSuggestionStatus, deleteSuggestion } from '../lib/suggestions';
import { SECTIONS } from './Layout';
import { useDialog } from './Dialog';

// Admin → Suggerimenti: what the students would change in MYND ("Suggerisci una modifica").

const KIND_INFO = {
  idea: { label: 'Idea', icon: Lightbulb, badge: 'bg-[color-mix(in_srgb,var(--brand-fill)_18%,transparent)] text-[var(--brand-ring)]' },
  problema: { label: 'Problema', icon: Bug, badge: 'bg-red-500/15 text-red-400' },
  altro: { label: 'Altro', icon: MessageCircle, badge: 'bg-indigo-500/15 text-indigo-300' },
};
const FILTERS: { id: SuggestionStatus | 'all'; label: string }[] = [
  { id: 'new', label: 'Nuovi' }, { id: 'read', label: 'Letti' }, { id: 'done', label: 'Fatti' }, { id: 'all', label: 'Tutti' },
];
const sectionName = (id: string | null) => (id ? SECTIONS.find(s => s.id === id)?.label || id : '—');
const when = (v: string) => { const d = new Date(v); return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`; };

export default function AdminSuggestions({ darkMode, onNewCount }: { darkMode: boolean; onNewCount?: (n: number) => void }) {
  const dialog = useDialog();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [filter, setFilter] = useState<SuggestionStatus | 'all'>('new');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const text = darkMode ? 'text-white' : 'text-gray-800';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const card = darkMode ? 'glass-card' : 'glass-card-light';

  const publish = useCallback((list: Suggestion[]) => { setItems(list); onNewCount?.(list.filter(x => x.status === 'new').length); }, [onNewCount]);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { publish(await loadSuggestions()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, [publish]);
  useEffect(() => { refresh(); }, [refresh]);

  const mark = async (s: Suggestion, status: SuggestionStatus) => {
    setBusy(s.id);
    try { await setSuggestionStatus(s.id, status); publish(items.map(x => (x.id === s.id ? { ...x, status } : x))); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const remove = async (s: Suggestion) => {
    const ok = await dialog.confirm({ title: 'Eliminare il suggerimento?', message: s.message.slice(0, 160), confirmLabel: 'Elimina', danger: true });
    if (!ok) return;
    setBusy(s.id);
    try { await deleteSuggestion(s.id); publish(items.filter(x => x.id !== s.id)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const copy = async (s: Suggestion) => {
    try { await navigator.clipboard.writeText(s.message); dialog.alert({ title: 'Copiato' }); } catch { /* not allowed */ }
  };

  const counts = Object.fromEntries(FILTERS.map(f => [f.id, f.id === 'all' ? items.length : items.filter(x => x.status === f.id).length]));
  const shown = items.filter(x => filter === 'all' || x.status === filter);
  const chip = (on: boolean) => `text-sm px-3 py-1.5 rounded-full ${on ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-[var(--on-brand)]' : darkMode ? 'bg-white/5 text-white/70 hover:bg-white/10' : 'bg-black/5 text-gray-600 hover:bg-black/10'}`;
  const action = `text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 ${darkMode ? 'text-white/70 hover:bg-white/10' : 'text-gray-600 hover:bg-black/5'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={chip(filter === f.id)}>{f.label} ({counts[f.id]})</button>
        ))}
        <button onClick={refresh} disabled={loading} className={`ml-auto ${action}`} aria-label="Aggiorna">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Aggiorna
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">⚠️ {error}</div>}

      {!loading && !error && shown.length === 0 && (
        <div className={`${card} p-8 text-center`}>
          <Lightbulb className={`w-8 h-8 mx-auto mb-2 ${sub}`} />
          <p className={text}>{filter === 'new' ? 'Nessun suggerimento nuovo.' : 'Niente qui.'}</p>
          <p className={`text-sm mt-1 ${sub}`}>Gli utenti scrivono da "Suggerisci una modifica", nel menu.</p>
        </div>
      )}

      <div className="space-y-3">
        {shown.map(s => {
          const k = KIND_INFO[s.kind] || KIND_INFO.altro;
          return (
            <div key={s.id} className={`${card} p-5 ${s.status === 'new' ? '' : 'opacity-80'}`}
              style={s.status === 'new' ? { boxShadow: 'inset 3px 0 0 var(--brand-ring)' } : undefined}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${k.badge}`}><k.icon className="w-3.5 h-3.5" />{k.label}</span>
                {s.status === 'new' && <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold">Nuovo</span>}
                {s.status === 'done' && <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">Fatto</span>}
                <span className={sub}>da {s.email || 'account eliminato'} · in {sectionName(s.section)} · {when(s.created_at)}</span>
              </div>
              <p className={`mt-3 text-[15px] whitespace-pre-line ${text}`}>{s.message}</p>
              <div className="flex flex-wrap items-center gap-1 mt-3 -ml-2">
                {s.status === 'new' && <button disabled={busy === s.id} onClick={() => mark(s, 'read')} className={action}><Eye className="w-3.5 h-3.5" /> Segna come letto</button>}
                {s.status !== 'done' && <button disabled={busy === s.id} onClick={() => mark(s, 'done')} className={action}><Check className="w-3.5 h-3.5" /> Fatto</button>}
                {s.status !== 'new' && <button disabled={busy === s.id} onClick={() => mark(s, 'new')} className={action}><RotateCcw className="w-3.5 h-3.5" /> Rimetti tra i nuovi</button>}
                <button onClick={() => copy(s)} className={action}><Copy className="w-3.5 h-3.5" /> Copia</button>
                <button disabled={busy === s.id} onClick={() => remove(s)} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /> Elimina</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
