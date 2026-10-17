import React, { useState } from 'react';
import { X, Sparkles, Loader2, ChevronDown, ArrowRight, RotateCcw } from 'lucide-react';
import { StudyProfile, StudentKind, LabelKey } from '../lib/store';
import { PRESETS, KIND_ORDER, SECTION_KEYS, makeProfileApi, ADAPT_SYSTEM, parseAdaptAnswer, DEFAULT_PROFILE } from '../lib/profile';
import { askTutor, isReady } from '../lib/ai';

// "Adatta MYND a te": the kind of student, in a tap or described in words (the AI then picks names,
// grade scale and what the tutor should know). A preview shows what changes before it is applied.

interface Props {
  profile: StudyProfile | undefined;
  darkMode: boolean;
  onSave: (profile: StudyProfile) => void;
  onClose: () => void;
}

const THING_KEYS: LabelKey[] = ['subjects', 'test', 'oral', 'homework', 'grades'];
const THING_NAMES: Partial<Record<LabelKey, string>> = { subjects: 'Materie', test: 'Prova scritta', oral: 'Prova orale', homework: 'Compiti', grades: 'Voti' };
const SECTION_NAMES: Partial<Record<LabelKey, string>> = {
  impegni: 'Impegni', voti: 'Voti', archivio: 'Archivio', 'cosa-studiare': 'Cosa studiare', timer: 'Timer Studio', calendario: 'Calendario', 'guida-ai': 'Guida Studio AI',
};
const SCALE_TEXT = { 10: 'Voti da 1 a 10', 30: 'Voti in trentesimi (18–30 e lode), CFU e media ponderata', 100: 'Punteggi su 100 (simulazioni e test)' };

export default function ProfileEditor({ profile, darkMode, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<StudyProfile>(profile || DEFAULT_PROFILE);
  const [description, setDescription] = useState(profile?.description || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [showNames, setShowNames] = useState(false);

  const text = darkMode ? 'text-white' : 'text-gray-900';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const well = darkMode ? 'bg-white/5' : 'bg-black/[0.04]';
  const input = darkMode ? 'input-glass' : 'input-light';
  const api = makeProfileApi({ ...draft, description });
  const base = makeProfileApi(DEFAULT_PROFILE);

  const pickKind = (kind: StudentKind) => { setDraft({ kind, description }); setSummary(''); setError(''); };
  const setLabel = (key: LabelKey, value: string) => setDraft(d => ({ ...d, labels: { ...d.labels, [key]: value } }));

  const adaptWithAI = async () => {
    if (!description.trim()) return;
    setBusy(true); setError(''); setSummary('');
    try {
      const answer = await askTutor(ADAPT_SYSTEM, async () => '', [{ role: 'user', text: description.trim() }]);
      const result = parseAdaptAnswer(answer, description);
      setDraft(result.profile);
      setSummary(result.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const labels = Object.fromEntries(Object.entries(draft.labels || {})
      .map(([k, v]) => [k, (v || '').trim()])
      .filter(([k, v]) => v && v !== PRESETS[draft.kind].labels[k as LabelKey]));
    onSave({ ...draft, description: description.trim() || undefined, labels: Object.keys(labels).length ? labels : undefined });
  };

  const changes = [...SECTION_KEYS, ...THING_KEYS]
    .map(key => ({ key, from: base.L(key), to: api.L(key) }))
    .filter((c, i, all) => c.from !== c.to && all.findIndex(x => x.from === c.from && x.to === c.to) === i);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Adatta MYND a te" onClick={e => e.stopPropagation()}
        className={`w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto p-5 sm:p-7 rounded-t-3xl sm:rounded-3xl animate-scale-in ${darkMode ? 'glass-float' : 'glass-card-light'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={`text-2xl font-bold tracking-[-0.03em] ${text}`}>Adatta MYND a te.</h2>
            <p className={`text-sm mt-1 ${sub}`}>Nomi delle sezioni, voti e tutor AI cambiano in base a come studi.</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className={`p-2 rounded-full ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'} ${text}`}><X className="w-5 h-5" /></button>
        </div>

        <p className={`text-xs font-semibold uppercase tracking-wide mt-6 mb-2 ${sub}`}>Che studente sei?</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {KIND_ORDER.map(kind => {
            const p = PRESETS[kind];
            const on = draft.kind === kind;
            return (
              <button key={kind} type="button" onClick={() => pickKind(kind)} aria-pressed={on}
                className={`text-left p-3 rounded-2xl border transition-colors ${on ? 'border-[var(--brand-ring)] bg-[color-mix(in_srgb,var(--brand-fill)_12%,transparent)]' : darkMode ? 'border-white/10 hover:bg-white/5' : 'border-black/10 hover:bg-black/5'}`}>
                <span className="text-xl" aria-hidden>{p.emoji}</span>
                <p className={`text-sm font-semibold mt-1 ${text}`}>{p.title}</p>
                <p className={`text-xs mt-0.5 leading-snug ${sub}`}>{p.blurb}</p>
              </button>
            );
          })}
        </div>

        <p className={`text-xs font-semibold uppercase tracking-wide mt-6 mb-2 ${sub}`}>Oppure descrivi di cosa hai bisogno</p>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={600}
          placeholder="Es. Sono al 2° anno di Ingegneria, a gennaio ho Analisi 2 (scritto + orale) e Fisica 1. Lavoro part-time e studio la sera."
          className={`${input} w-full text-sm resize-none`} />
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <button type="button" onClick={adaptWithAI} disabled={busy || !description.trim() || !isReady()}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {busy ? 'Sto adattando MYND…' : 'Adatta con l\'AI'}
          </button>
          {!isReady() && <p className={`text-xs ${sub}`}>Per usare l'AI collega prima una chiave in Guida Studio AI. La descrizione viene comunque passata al tutor.</p>}
        </div>
        {error && <p className="text-sm text-red-400 mt-2 whitespace-pre-line">{error}</p>}

        <div className={`mt-6 rounded-2xl p-4 ${well}`}>
          <p className={`text-sm font-semibold ${text}`}>Come cambia MYND · {PRESETS[draft.kind].emoji} {PRESETS[draft.kind].title}</p>
          {summary && <p className="text-sm mt-1" style={{ color: 'var(--brand-ring)' }}>{summary}</p>}
          <ul className={`mt-3 space-y-1.5 text-sm ${sub}`}>
            {changes.length === 0 && <li>Nomi delle sezioni e delle cose: quelli di sempre.</li>}
            {changes.map(c => (
              <li key={c.key} className="flex items-center gap-2 flex-wrap">
                <span>{c.from}</span><ArrowRight className="w-3.5 h-3.5 opacity-60" /><b className={text}>{c.to}</b>
              </li>
            ))}
            <li>📊 {SCALE_TEXT[api.scale]}</li>
            <li>🤖 Tutor AI su misura: {PRESETS[draft.kind].title.toLowerCase()}{description.trim() ? ', con quello che hai scritto' : ''}{draft.focus ? `. ${draft.focus}` : ''}</li>
          </ul>
        </div>

        <button type="button" onClick={() => setShowNames(v => !v)} className={`mt-4 text-sm flex items-center gap-1.5 ${sub} hover:underline`}>
          <ChevronDown className={`w-4 h-4 transition-transform ${showNames ? 'rotate-180' : ''}`} /> Cambia i nomi a mano
        </button>
        {showNames && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {[...SECTION_KEYS, ...THING_KEYS].map(key => (
              <label key={key} className="block">
                <span className={`block text-xs mb-1 ${sub}`}>{SECTION_NAMES[key] ? `Sezione "${SECTION_NAMES[key]}"` : THING_NAMES[key]}</span>
                <input value={draft.labels?.[key] ?? api.L(key)} onChange={e => setLabel(key, e.target.value)} maxLength={28} className={`${input} w-full text-sm py-2`} />
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-6">
          <button type="button" onClick={() => { setDraft(DEFAULT_PROFILE); setDescription(''); setSummary(''); }} className={`text-sm flex items-center gap-1.5 px-3 py-2 ${sub} hover:underline`}>
            <RotateCcw className="w-4 h-4" /> Come all'inizio
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className={`px-4 py-2 rounded-xl text-sm ${darkMode ? 'bg-white/10 text-white/80' : 'bg-black/5 text-gray-700'}`}>Annulla</button>
          <button type="button" onClick={save} className="btn-primary text-sm">Applica a MYND</button>
        </div>
      </div>
    </div>
  );
}
