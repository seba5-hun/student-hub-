import React, { useEffect, useMemo, useState } from 'react';
import { Check, Sparkles, Crown, Layers, Loader2, Search, ExternalLink } from 'lucide-react';
import {
  AIProvider, CLAUDE_MODELS, OPENROUTER_AUTO, OpenRouterModel, getKey, getModel, getProvider, listOpenRouterModels,
  setKey, setModel, setProvider,
} from '../lib/ai';

interface AISettingsProps {
  darkMode: boolean;
  onDone: () => void;
  onCancel?: () => void;
  geminiGuide: React.ReactNode;
}

const PROVIDERS: { id: AIProvider; name: string; badge: string; badgeClass: string; text: string; icon: React.ReactNode; gradient: string }[] = [
  {
    id: 'gemini', name: 'Google Gemini', badge: 'Gratis', badgeClass: 'bg-emerald-500/20 text-emerald-400',
    text: 'Gratuito con limiti giornalieri. Ora usa i modelli migliori disponibili (Pro, poi Flash).',
    icon: <Sparkles className="w-5 h-5" />, gradient: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'claude', name: 'Claude (Anthropic)', badge: 'Qualità migliore', badgeClass: 'bg-amber-500/20 text-amber-400',
    text: 'Il tutor più preciso nelle spiegazioni. Si paga a consumo con credito prepagato: pochi centesimi a domanda.',
    icon: <Crown className="w-5 h-5" />, gradient: 'from-orange-500 to-amber-600',
  },
  {
    id: 'openrouter', name: 'OpenRouter', badge: 'Economico', badgeClass: 'bg-sky-500/20 text-sky-400',
    text: 'Una sola chiave per centinaia di modelli (DeepSeek, Llama, Qwen, GPT, Claude…), anche gratuiti o molto economici.',
    icon: <Layers className="w-5 h-5" />, gradient: 'from-indigo-500 to-violet-600',
  },
];

const KEY_HINT: Record<AIProvider, { prefix: string; placeholder: string }> = {
  gemini: { prefix: 'AIza', placeholder: 'AIza...' },
  claude: { prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
  openrouter: { prefix: 'sk-or-', placeholder: 'sk-or-...' },
};

function price(perMillion: number): string {
  if (perMillion === 0) return '0';
  return perMillion < 0.1 ? perMillion.toFixed(3) : perMillion < 10 ? perMillion.toFixed(2) : perMillion.toFixed(0);
}

export default function AISettings({ darkMode, onDone, onCancel, geminiGuide }: AISettingsProps) {
  const [provider, setProviderState] = useState<AIProvider>(getProvider);
  const [keys, setKeys] = useState<Record<AIProvider, string>>(() => ({ gemini: getKey('gemini'), claude: getKey('claude'), openrouter: getKey('openrouter') }));
  const [claudeModel, setClaudeModel] = useState(() => getModel('claude'));
  const [orModel, setOrModel] = useState(() => getModel('openrouter'));
  const [orModels, setOrModels] = useState<OpenRouterModel[] | null>(null);
  const [orError, setOrError] = useState('');
  const [orQuery, setOrQuery] = useState('');
  const [onlyFree, setOnlyFree] = useState(false);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';
  const inputClass = darkMode ? 'input-glass' : 'input-light';
  const boxClass = darkMode ? 'bg-white/5' : 'bg-black/5';

  useEffect(() => {
    if (provider !== 'openrouter' || orModels) return;
    listOpenRouterModels().then(setOrModels).catch(err => setOrError(err instanceof Error ? err.message : String(err)));
  }, [provider, orModels]);

  const shownModels = useMemo(() => {
    if (!orModels) return [];
    const q = orQuery.trim().toLowerCase();
    return orModels
      .filter(m => !onlyFree || (m.prompt === 0 && m.completion === 0))
      .filter(m => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 80);
  }, [orModels, orQuery, onlyFree]);

  const key = keys[provider].trim();
  const save = () => {
    if (!key) return;
    setKey(provider, key);
    setProvider(provider);
    if (provider === 'claude') setModel('claude', claudeModel);
    if (provider === 'openrouter') setModel('openrouter', orModel);
    onDone();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className={`text-2xl font-bold ${textColor}`}>Scegli l'intelligenza artificiale</h2>
          <p className={`text-sm ${subTextColor}`}>Usi la tua chiave personale: resta salvata solo in questo browser.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" role="radiogroup" aria-label="Fornitore AI">
        {PROVIDERS.map(p => {
          const active = provider === p.id;
          return (
            <button key={p.id} role="radio" aria-checked={active} onClick={() => setProviderState(p.id)}
              className={`${cardClass} p-4 text-left transition-all duration-300 relative ${active ? 'ring-2 ring-indigo-400 -translate-y-0.5' : 'opacity-80 hover:opacity-100'}`}>
              {active && <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center"><Check className="w-3 h-3 text-white" /></span>}
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${p.gradient} text-white flex items-center justify-center`}>{p.icon}</span>
                <div>
                  <p className={`font-semibold text-sm ${textColor}`}>{p.name}</p>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${p.badgeClass}`}>{p.badge}</span>
                </div>
              </div>
              <p className={`text-xs ${subTextColor}`}>{p.text}</p>
              {getKey(p.id) && <p className="text-[11px] text-emerald-400 mt-2">✓ chiave salvata</p>}
            </button>
          );
        })}
      </div>

      <div className={`${cardClass} p-6 space-y-4 animate-scale-in`} key={provider}>
        {provider === 'claude' && (
          <div>
            <p className={`text-sm font-medium mb-2 ${textColor}`}>Modello</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CLAUDE_MODELS.map(m => (
                <button key={m.id} onClick={() => setClaudeModel(m.id)}
                  className={`rounded-xl p-3 text-left border transition-colors ${claudeModel === m.id ? 'border-indigo-400 bg-indigo-500/15' : darkMode ? 'border-white/10 hover:bg-white/5' : 'border-black/10 hover:bg-black/5'}`}>
                  <p className={`text-sm font-semibold ${textColor}`}>{m.label}</p>
                  <p className={`text-xs ${subTextColor}`}>{m.note}</p>
                  <p className={`text-[11px] mt-1 ${subTextColor}`}>{m.price} per milione di token (lettura / scrittura)</p>
                </button>
              ))}
            </div>
            <p className={`text-xs mt-2 ${subTextColor}`}>
              Il materiale di studio viene "memorizzato" da Claude per qualche minuto: dalla seconda domanda sullo stesso materiale costa circa 10 volte meno.
            </p>
          </div>
        )}

        {provider === 'openrouter' && (
          <div className="space-y-2">
            <p className={`text-sm font-medium ${textColor}`}>Modello</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[12rem]">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subTextColor}`} />
                <input value={orQuery} onChange={e => setOrQuery(e.target.value)} placeholder="Cerca (es. deepseek, llama, gemini)…" className={`${inputClass} w-full pl-9 py-1.5 text-sm`} />
              </div>
              <label className={`text-xs flex items-center gap-1.5 ${subTextColor}`}>
                <input type="checkbox" checked={onlyFree} onChange={e => setOnlyFree(e.target.checked)} /> Solo gratuiti
              </label>
            </div>
            {orError && <p className="text-xs text-red-400">{orError}</p>}
            {!orModels && !orError && <p className={`text-xs ${subTextColor}`}><Loader2 className="w-3 h-3 inline animate-spin" /> Carico i modelli…</p>}
            {orModels && (
              <div className={`max-h-64 overflow-y-auto rounded-xl ${boxClass} p-1`}>
                <button onClick={() => setOrModel(OPENROUTER_AUTO)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between gap-2 ${orModel === OPENROUTER_AUTO ? 'bg-indigo-500/20 text-indigo-300' : textColor}`}>
                  <span>⚡ Automatico (OpenRouter sceglie il modello adatto)</span>
                </button>
                {shownModels.map(m => (
                  <button key={m.id} onClick={() => setOrModel(m.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between gap-3 ${orModel === m.id ? 'bg-indigo-500/20 text-indigo-300' : `${textColor} ${darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}`}>
                    <span className="truncate">{m.name}{m.vision ? ' 📷' : ''}</span>
                    <span className={`text-xs whitespace-nowrap ${m.prompt === 0 && m.completion === 0 ? 'text-emerald-400' : subTextColor}`}>
                      {m.prompt === 0 && m.completion === 0 ? 'gratis' : `$${price(m.prompt)} / $${price(m.completion)}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className={`text-xs ${subTextColor}`}>
              Prezzi per milione di token (lettura / scrittura), dal più economico. 📷 = legge anche le foto. I modelli gratuiti hanno pochi messaggi al giorno.
            </p>
          </div>
        )}

        <div>
          <label className={`text-sm font-medium ${textColor}`}>Chiave API</label>
          <input type="password" value={keys[provider]} onChange={e => setKeys(k => ({ ...k, [provider]: e.target.value }))}
            className={`${inputClass} w-full mt-1`} placeholder={KEY_HINT[provider].placeholder} autoComplete="off" />
          {key && !key.startsWith(KEY_HINT[provider].prefix) && (
            <p className="text-xs text-amber-400 mt-1">Di solito questa chiave inizia con "{KEY_HINT[provider].prefix}". Controlla di averla copiata tutta.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={!key} className="btn-primary disabled:opacity-50">Salva e usa {PROVIDERS.find(p => p.id === provider)!.name}</button>
          {onCancel && <button onClick={onCancel} className={`text-sm ${subTextColor}`}>Annulla</button>}
        </div>
      </div>

      {provider === 'gemini' && geminiGuide}

      {provider === 'claude' && (
        <div className={`${cardClass} p-6 space-y-3`}>
          <h3 className={`text-lg font-semibold ${textColor}`}>📖 Come ottenere la chiave di Claude</h3>
          <ol className={`text-sm ${subTextColor} list-decimal pl-5 space-y-1.5`}>
            <li>Vai su <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline inline-flex items-center gap-0.5">console.anthropic.com <ExternalLink className="w-3 h-3" /></a> e crea un account (serve avere almeno 18 anni).</li>
            <li>In <b>Plans &amp; Billing</b> aggiungi un piccolo credito (bastano pochi euro, durano settimane). Puoi disattivare la ricarica automatica.</li>
            <li>In <b>API Keys</b> premi <b>Create Key</b>, dai un nome (es. "Student Hub") e copia la chiave: inizia con <b>sk-ant-</b>.</li>
            <li>Incollala qui sopra e premi <b>Salva</b>.</li>
          </ol>
          <p className={`text-xs ${subTextColor}`}>
            Costo indicativo: con 20 pagine di materiale una domanda costa circa 1–5 centesimi con Opus, meno di 1 centesimo con Haiku.
            Le domande e il materiale scelto vengono inviati ad Anthropic per generare la risposta.
          </p>
        </div>
      )}

      {provider === 'openrouter' && (
        <div className={`${cardClass} p-6 space-y-3`}>
          <h3 className={`text-lg font-semibold ${textColor}`}>📖 Come ottenere la chiave di OpenRouter</h3>
          <ol className={`text-sm ${subTextColor} list-decimal pl-5 space-y-1.5`}>
            <li>Vai su <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline inline-flex items-center gap-0.5">openrouter.ai/keys <ExternalLink className="w-3 h-3" /></a> e accedi (anche con Google).</li>
            <li>Premi <b>Create API Key</b>, dai un nome e copia la chiave: inizia con <b>sk-or-</b>.</li>
            <li>Per i modelli a pagamento aggiungi un credito in <b>Credits</b> (da pochi dollari). I modelli "gratis" funzionano anche senza.</li>
            <li>Incollala qui sopra, scegli il modello e premi <b>Salva</b>.</li>
          </ol>
          <p className={`text-xs ${subTextColor}`}>
            Le domande e il materiale scelto vengono inviati a OpenRouter e al fornitore del modello scelto. Con i modelli gratuiti i dati possono essere usati per l'addestramento: evita dati personali.
          </p>
        </div>
      )}
    </div>
  );
}
