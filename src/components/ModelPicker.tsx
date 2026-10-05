import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Check, Gift, Sparkles, MessageCircle, Crown, Settings2, Loader2, X, Eye } from 'lucide-react';
import {
  AIProvider, CLAUDE_MODELS, FREE_CHAIN, OpenAIModel, getKey, getModel, getProvider, listOpenAIModels, setModel, setProvider,
  hiddenOpenAIModels, hideOpenAIModel, showAllOpenAIModels,
} from '../lib/ai';

interface Option {
  key: string;
  provider: AIProvider;
  model?: string;
  label: string;
  note: string;
  icon: ReactNode;
}

// The models of the OpenAI key, read once per session.
let openAICache: OpenAIModel[] | null = null;

// Quick switch of the AI from inside the chat. Free: "Automatico" and Gemini; top: only the
// paid AIs whose key is saved on this device (so every choice actually works).
export default function ModelPicker({ darkMode, onChange, onOpenSettings, compact = false }: {
  darkMode: boolean;
  onChange: () => void;
  onOpenSettings: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openAI, setOpenAI] = useState<OpenAIModel[] | null>(openAICache);
  const [loadingOpenAI, setLoadingOpenAI] = useState(false);
  const [, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  useEffect(() => {
    if (!open || openAI || !getKey('openai')) return;
    setLoadingOpenAI(true);
    listOpenAIModels(getKey('openai'))
      .then(list => { openAICache = list; setOpenAI(list); })
      .catch(() => setOpenAI([]))
      .finally(() => setLoadingOpenAI(false));
  }, [open, openAI]);

  const free: Option[] = [];
  if (FREE_CHAIN.some(p => getKey(p))) {
    free.push({ key: 'free', provider: 'free', label: 'Automatico', note: 'gratis · usa la prima AI gratuita disponibile', icon: <Gift className="w-4 h-4 text-emerald-400" /> });
  }
  if (getKey('gemini')) {
    free.push({ key: 'gemini', provider: 'gemini', label: 'Gemini', note: 'gratis · Google', icon: <Sparkles className="w-4 h-4 text-sky-400" /> });
  }

  const top: Option[] = [];
  const hidden = hiddenOpenAIModels();
  if (getKey('openai')) {
    const usable = openAI?.filter(m => !hidden.includes(m.id));
    const full = usable?.find(m => !m.small);
    const mini = usable?.find(m => /mini/.test(m.id));
    const saved = getModel('openai');
    // '' = "Automatico": the best model of the key, chosen at the first question.
    const ids = [...new Set([...(saved === '' ? [''] : []), full?.id, mini?.id, saved].filter((x): x is string => x !== undefined && (x !== '' || saved === '') && !hidden.includes(x)))];
    if (!ids.length) ids.push('');
    ids.forEach(id => top.push({
      key: `openai:${id}`, provider: 'openai', model: id,
      label: id ? `ChatGPT · ${id}` : 'ChatGPT · Automatico',
      note: id && id === full?.id ? 'il migliore di OpenAI' : id && /mini/.test(id) ? 'economico, ottimo per tutti i giorni' : 'OpenAI',
      icon: <MessageCircle className="w-4 h-4 text-emerald-400" />,
    }));
  }
  if (getKey('claude')) {
    CLAUDE_MODELS.forEach(m => top.push({
      key: `claude:${m.id}`, provider: 'claude', model: m.id, label: m.label, note: m.note.toLowerCase(),
      icon: <Crown className="w-4 h-4 text-amber-400" />,
    }));
  }

  const current = getProvider();
  const isActive = (o: Option) => o.provider === current && (o.model === undefined || o.model === getModel(o.provider as 'claude' | 'openai'));
  const all = [...free, ...top];
  const active = all.find(isActive);
  const label = active ? active.label : current === 'groq' ? 'Groq' : current === 'openrouter' ? 'OpenRouter' : 'Scegli AI';

  const choose = (o: Option) => {
    setProvider(o.provider);
    if (o.provider === 'claude' && o.model) setModel('claude', o.model);
    if (o.provider === 'openai' && o.model !== undefined) setModel('openai', o.model);
    setOpen(false);
    setTick(t => t + 1);
    onChange();
  };

  const panel = darkMode ? 'bg-[#1b1640] border-white/10 text-white' : 'bg-white border-black/10 text-gray-800';
  const muted = darkMode ? 'text-white/55' : 'text-gray-500';
  const row = (o: Option) => (
    <div key={o.key} className="group relative">
      <button role="menuitemradio" aria-checked={isActive(o)} onClick={() => choose(o)}
        className={`w-full flex items-center gap-3 px-3 py-2 pr-9 rounded-xl text-left transition-colors ${isActive(o) ? (darkMode ? 'bg-white/10' : 'bg-indigo-50') : (darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5')}`}>
        <span className="flex-shrink-0">{o.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">{o.label}</span>
          <span className={`block text-xs truncate ${muted}`}>{o.note}</span>
        </span>
        {isActive(o) && <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
      </button>
      {o.provider === 'openai' && o.model && (
        <button onClick={() => { hideOpenAIModel(o.model!); setTick(t => t + 1); onChange(); }} title="Nascondi questo modello" aria-label={`Nascondi ${o.model}`}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 ${muted} ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/10'}`}>
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open} title="Cambia modello AI"
        className={`flex items-center gap-1.5 rounded-full text-sm font-medium transition-colors ${compact ? 'px-2.5 py-1' : 'px-3 py-1.5'} ${darkMode ? 'bg-white/10 hover:bg-white/15 text-white ring-1 ring-white/10' : 'bg-black/5 hover:bg-black/10 text-gray-800 ring-1 ring-black/5'}`}>
        <span className="max-w-[10rem] sm:max-w-[14rem] truncate">{label}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className={`absolute right-0 mt-2 w-72 max-h-[70vh] overflow-y-auto rounded-2xl border shadow-2xl p-2 z-[80] animate-scale-in ${panel}`}>
          {free.length > 0 && <p className={`px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider ${muted}`}>Gratis</p>}
          {free.map(row)}
          {top.length > 0 && <p className={`px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider ${muted}`}>Top · a consumo</p>}
          {loadingOpenAI && <p className={`px-3 py-1 text-xs ${muted}`}><Loader2 className="w-3 h-3 inline animate-spin" /> Carico i modelli di ChatGPT…</p>}
          {top.map(row)}
          {all.length === 0 && <p className={`px-3 py-2 text-sm ${muted}`}>Nessuna AI configurata.</p>}
          <div className={`mt-2 pt-2 border-t ${darkMode ? 'border-white/10' : 'border-black/10'}`}>
            {hidden.length > 0 && getKey('openai') && (
              <button onClick={() => { showAllOpenAIModels(); setTick(t => t + 1); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${muted} ${darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
                <Eye className="w-4 h-4" /> Mostra i modelli nascosti ({hidden.length})
              </button>
            )}
            <button onClick={() => { setOpen(false); onOpenSettings(); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${muted} ${darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
              <Settings2 className="w-4 h-4" /> Aggiungi o gestisci le chiavi AI
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
