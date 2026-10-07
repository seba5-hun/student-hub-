import React, { useEffect, useMemo, useState } from 'react';
import { Check, Sparkles, Crown, Layers, Loader2, Search, ExternalLink, MessageCircle, Zap, Gift } from 'lucide-react';
import {
  AIProvider, KeyProvider, FREE_CHAIN, CLAUDE_MODELS, OPENROUTER_AUTO, OpenRouterModel, OpenAIModel, getKey, getModel, getProvider, listOpenRouterModels, listOpenAIModels,
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
    id: 'free', name: 'Gratis automatico', badge: 'Consigliato · Gratis', badgeClass: 'bg-emerald-500/20 text-emerald-400',
    text: 'Usa insieme più AI gratuite (Gemini, Groq, OpenRouter): quando una finisce le domande gratuite risponde la successiva.',
    icon: <Gift className="w-5 h-5" />, gradient: 'from-emerald-500 to-lime-500',
  },
  {
    id: 'gemini', name: 'Google Gemini', badge: 'Gratis', badgeClass: 'bg-emerald-500/20 text-emerald-400',
    text: 'Gratuito con limiti giornalieri. Ora usa i modelli migliori disponibili (Pro, poi Flash).',
    icon: <Sparkles className="w-5 h-5" />, gradient: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'groq', name: 'Groq', badge: 'Gratis · Velocissimo', badgeClass: 'bg-emerald-500/20 text-emerald-400',
    text: 'Grandi modelli "open" (gpt-oss, Llama, Qwen) gratis con limiti giornalieri. Risposte quasi istantanee.',
    icon: <Zap className="w-5 h-5" />, gradient: 'from-orange-500 to-red-500',
  },
  {
    id: 'openai', name: 'ChatGPT (OpenAI)', badge: 'Top', badgeClass: 'bg-fuchsia-500/20 text-fuchsia-400',
    text: 'I modelli GPT di ChatGPT, i più recenti disponibili per la tua chiave. A consumo con credito prepagato: pochi centesimi a domanda.',
    icon: <MessageCircle className="w-5 h-5" />, gradient: 'from-emerald-500 to-teal-600',
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

const KEY_HINT: Record<KeyProvider, { prefix: string; placeholder: string }> = {
  gemini: { prefix: 'AIza', placeholder: 'AIza...' },
  groq: { prefix: 'gsk_', placeholder: 'gsk_...' },
  claude: { prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
  openrouter: { prefix: 'sk-or-', placeholder: 'sk-or-...' },
  openai: { prefix: 'sk-', placeholder: 'sk-proj-...' },
};

function price(perMillion: number): string {
  if (perMillion === 0) return '0';
  return perMillion < 0.1 ? perMillion.toFixed(3) : perMillion < 10 ? perMillion.toFixed(2) : perMillion.toFixed(0);
}

export default function AISettings({ darkMode, onDone, onCancel, geminiGuide }: AISettingsProps) {
  const [provider, setProviderState] = useState<AIProvider>(getProvider);
  const [keys, setKeys] = useState<Record<KeyProvider, string>>(() => ({ gemini: getKey('gemini'), groq: getKey('groq'), claude: getKey('claude'), openrouter: getKey('openrouter'), openai: getKey('openai') }));
  const [claudeModel, setClaudeModel] = useState(() => getModel('claude'));
  const [orModel, setOrModel] = useState(() => getModel('openrouter'));
  const [oaModel, setOaModel] = useState(() => getModel('openai'));
  const [oaModels, setOaModels] = useState<OpenAIModel[] | null>(null);
  const [oaState, setOaState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [oaError, setOaError] = useState('');
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

  // The models of OpenAI depend on the key: they are read as soon as a key is there.
  const oaKey = keys.openai.trim();
  useEffect(() => {
    if (provider !== 'openai' || oaKey.length < 20) { setOaModels(null); setOaState('idle'); return; }
    setOaState('loading');
    const id = window.setTimeout(() => {
      listOpenAIModels(oaKey)
        .then(list => { setOaModels(list); setOaState('idle'); setOaError(''); })
        .catch(err => { setOaModels(null); setOaState('error'); setOaError(err instanceof Error ? err.message : String(err)); });
    }, 500);
    return () => window.clearTimeout(id);
  }, [provider, oaKey]);

  const freeKeys = FREE_CHAIN.filter(x => keys[x].trim());
  const key = provider === 'free' ? freeKeys.join(',') : keys[provider].trim();
  const save = () => {
    if (!key) return;
    if (provider === 'free') FREE_CHAIN.forEach(x => setKey(x, keys[x].trim()));
    else setKey(provider, key);
    setProvider(provider);
    if (provider === 'claude') setModel('claude', claudeModel);
    if (provider === 'openrouter') setModel('openrouter', orModel);
    if (provider === 'openai') setModel('openai', oaModel);
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" role="radiogroup" aria-label="Fornitore AI">
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
              {p.id === 'free'
                ? FREE_CHAIN.some(x => getKey(x)) && <p className="text-[11px] text-emerald-400 mt-2">✓ {FREE_CHAIN.filter(x => getKey(x)).length} chiavi gratuite su 3</p>
                : getKey(p.id) && <p className="text-[11px] text-emerald-400 mt-2">✓ chiave salvata</p>}
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

        {provider === 'openai' && (
          <div className="space-y-2">
            <p className={`text-sm font-medium ${textColor}`}>Modello</p>
            {!oaKey && <p className={`text-xs ${subTextColor}`}>Incolla qui sotto la chiave: comparirà la lista dei modelli GPT che puoi usare.</p>}
            {oaState === 'loading' && <p className={`text-xs ${subTextColor}`}><Loader2 className="w-3 h-3 inline animate-spin" /> Leggo i modelli disponibili…</p>}
            {oaState === 'error' && <p className="text-xs text-red-400">{oaError}</p>}
            {oaModels && (
              <div className={`max-h-64 overflow-y-auto rounded-xl ${boxClass} p-1`}>
                <button onClick={() => setOaModel('')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${oaModel === '' ? 'bg-indigo-500/20 text-indigo-300' : textColor}`}>
                  ⚡ Automatico: il migliore disponibile{oaModels.find(m => !m.small) ? ` (${oaModels.find(m => !m.small)!.id})` : ''}
                </button>
                {oaModels.map((m, i) => (
                  <button key={m.id} onClick={() => setOaModel(m.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between gap-3 ${oaModel === m.id ? 'bg-indigo-500/20 text-indigo-300' : `${textColor} ${darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}`}>
                    <span className="truncate font-mono text-[13px]">{m.id}</span>
                    <span className={`text-xs whitespace-nowrap ${subTextColor}`}>{i === oaModels.findIndex(x => !x.small) ? '⭐ consigliato' : m.small ? 'più economico' : ''}</span>
                  </button>
                ))}
              </div>
            )}
            <p className={`text-xs ${subTextColor}`}>I modelli "mini" e "nano" costano molto meno ma ragionano meno bene.</p>
          </div>
        )}

        {provider === 'free' ? (
          <div className="space-y-4">
            <div>
              <p className={`text-sm font-medium ${textColor}`}>Le tue chiavi gratuite</p>
              <p className={`text-xs ${subTextColor}`}>Ne basta una, ma più ne metti più domande gratuite hai ogni giorno. Consigliate: Gemini + OpenRouter. Nessuna richiede la carta di credito.</p>
            </div>
            {([
              { id: 'gemini' as const, name: '1. Google Gemini', url: 'https://aistudio.google.com/app/apikey', site: 'aistudio.google.com', note: 'il più intelligente dei tre, legge anche foto e PDF' },
              { id: 'groq' as const, name: '2. Groq (facoltativo)', url: 'https://console.groq.com/keys', site: 'console.groq.com/keys', note: 'facoltativo: se non riesci a creare l\'account lascia vuoto, bastano Gemini e OpenRouter' },
              { id: 'openrouter' as const, name: '3. OpenRouter', url: 'https://openrouter.ai/keys', site: 'openrouter.ai/keys', note: 'modelli gratuiti come DeepSeek e Qwen, ultima riserva' },
            ]).map(f => (
              <div key={f.id} className={`rounded-xl p-3 ${boxClass}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className={`text-sm font-semibold ${textColor}`}>{f.name} {keys[f.id].trim() && <span className="text-emerald-400 font-normal">✓</span>}</p>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 underline inline-flex items-center gap-1">Crea la chiave su {f.site} <ExternalLink className="w-3 h-3" /></a>
                </div>
                <input type="password" value={keys[f.id]} onChange={e => setKeys(k => ({ ...k, [f.id]: e.target.value }))}
                  className={`${inputClass} w-full`} placeholder={KEY_HINT[f.id].placeholder} autoComplete="off" />
                <p className={`text-xs mt-1 ${keys[f.id].trim() && !keys[f.id].trim().startsWith(KEY_HINT[f.id].prefix) ? 'text-amber-400' : subTextColor}`}>
                  {keys[f.id].trim() && !keys[f.id].trim().startsWith(KEY_HINT[f.id].prefix) ? `Di solito questa chiave inizia con "${KEY_HINT[f.id].prefix}": controlla di averla copiata tutta.` : f.note}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <label className={`text-sm font-medium ${textColor}`}>Chiave API</label>
            <input type="password" value={keys[provider]} onChange={e => setKeys(k => ({ ...k, [provider]: e.target.value }))}
              className={`${inputClass} w-full mt-1`} placeholder={KEY_HINT[provider].placeholder} autoComplete="off" />
            {key && !key.startsWith(KEY_HINT[provider].prefix) && (
              <p className="text-xs text-amber-400 mt-1">Di solito questa chiave inizia con "{KEY_HINT[provider].prefix}". Controlla di averla copiata tutta.</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={!key} className="btn-primary disabled:opacity-50">Salva e usa {PROVIDERS.find(p => p.id === provider)!.name}</button>
          {onCancel && <button onClick={onCancel} className={`text-sm ${subTextColor}`}>Annulla</button>}
        </div>
      </div>

      {(provider === 'gemini' || provider === 'free') && geminiGuide}

      {(provider === 'groq' || provider === 'free') && (
        <div className={`${cardClass} p-6 space-y-3`}>
          <h3 className={`text-lg font-semibold ${textColor}`}>📖 Come ottenere la chiave gratuita di Groq</h3>
          <ol className={`text-sm ${subTextColor} list-decimal pl-5 space-y-1.5`}>
            <li>Vai su <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline inline-flex items-center gap-0.5">console.groq.com/keys <ExternalLink className="w-3 h-3" /></a> e accedi (anche con Google). Non serve la carta di credito.</li>
            <li>Premi <b>Create API Key</b>, scrivi un nome (es. "MYND") e premi <b>Submit</b>.</li>
            <li>Copia la chiave che compare: inizia con <b>gsk_</b>. Si vede una volta sola, quindi copiala subito.</li>
            <li>Incollala qui sopra e premi <b>Salva</b>.</li>
          </ol>
          <p className={`text-xs ${subTextColor}`}>Groq legge solo testo (non le foto) e accetta materiali più corti: l'app gli manda solo le parti più utili per ogni domanda.</p>
        </div>
      )}

      {provider === 'free' && (
        <div className={`${cardClass} p-6 space-y-3`}>
          <h3 className={`text-lg font-semibold ${textColor}`}>📖 Come ottenere la chiave gratuita di OpenRouter</h3>
          <ol className={`text-sm ${subTextColor} list-decimal pl-5 space-y-1.5`}>
            <li>Vai su <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline inline-flex items-center gap-0.5">openrouter.ai/keys <ExternalLink className="w-3 h-3" /></a> e accedi (anche con Google).</li>
            <li>Premi <b>Create API Key</b>, dai un nome e copia la chiave: inizia con <b>sk-or-</b>. Non serve aggiungere credito: l'app usa solo i modelli gratuiti.</li>
            <li>Incollala qui sopra e premi <b>Salva</b>.</li>
          </ol>
          <p className={`text-xs ${subTextColor}`}>Con i modelli gratuiti le domande possono essere usate dai fornitori per migliorare i loro modelli: evita di scrivere dati personali.</p>
        </div>
      )}

      {provider === 'claude' && (
        <div className={`${cardClass} p-6 space-y-3`}>
          <h3 className={`text-lg font-semibold ${textColor}`}>📖 Come ottenere la chiave di Claude</h3>
          <ol className={`text-sm ${subTextColor} list-decimal pl-5 space-y-1.5`}>
            <li>Vai su <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline inline-flex items-center gap-0.5">console.anthropic.com <ExternalLink className="w-3 h-3" /></a> e crea un account (serve avere almeno 18 anni).</li>
            <li>In <b>Plans &amp; Billing</b> aggiungi un piccolo credito (bastano pochi euro, durano settimane). Puoi disattivare la ricarica automatica.</li>
            <li>In <b>API Keys</b> premi <b>Create Key</b>, dai un nome (es. "MYND") e copia la chiave: inizia con <b>sk-ant-</b>.</li>
            <li>Incollala qui sopra e premi <b>Salva</b>.</li>
          </ol>
          <p className={`text-xs ${subTextColor}`}>
            Costo indicativo: con 20 pagine di materiale una domanda costa circa 1–5 centesimi con Opus, meno di 1 centesimo con Haiku.
            Le domande e il materiale scelto vengono inviati ad Anthropic per generare la risposta.
          </p>
        </div>
      )}

      {provider === 'openai' && (
        <div className={`${cardClass} p-6 space-y-3`}>
          <h3 className={`text-lg font-semibold ${textColor}`}>📖 Come ottenere la chiave di ChatGPT (OpenAI)</h3>
          <ol className={`text-sm ${subTextColor} list-decimal pl-5 space-y-1.5`}>
            <li>Vai su <a href="https://platform.openai.com/signup" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline inline-flex items-center gap-0.5">platform.openai.com <ExternalLink className="w-3 h-3" /></a> e accedi (puoi usare lo stesso account di ChatGPT; serve avere almeno 18 anni).</li>
            <li>Vai in <b>Settings → Billing</b> e aggiungi un piccolo credito (da 5 $). L'abbonamento ChatGPT Plus <b>non</b> vale per le API: è un credito separato.</li>
            <li>Vai in <b>API keys</b>, premi <b>Create new secret key</b>, dai un nome (es. "MYND") e copia la chiave: inizia con <b>sk-</b>.</li>
            <li>Incollala qui sopra: comparirà la lista dei modelli, lascia <b>Automatico</b> o scegline uno, poi premi <b>Salva</b>.</li>
          </ol>
          <p className={`text-xs ${subTextColor}`}>
            Paghi solo quello che usi: in genere pochi centesimi a domanda con i modelli migliori, meno con i "mini".
            Le domande e il materiale scelto vengono inviati a OpenAI per generare la risposta.
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
