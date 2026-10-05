// The AI behind the tutor and the reading of archive files. The student chooses the provider
// and pastes their own key (kept only in this browser):
//  - Google Gemini: free, with daily limits;
//  - Claude (Anthropic): the best quality, paid per use with prepaid credit;
//  - OpenRouter: one key for many models, including free and very cheap ones;
//  - OpenAI: the ChatGPT models (GPT), paid per use with prepaid credit;
//  - Groq: big open models (gpt-oss, Llama, Qwen…), free with daily limits;
//  - "Gratis automatico": Gemini → Groq → OpenRouter free models, each one answers when the
//    previous has used up its free quota.

import type Anthropic from '@anthropic-ai/sdk';
import { generateContent, getGeminiKey, setGeminiKey, GeminiContent, GeminiPart } from './gemini';

export type AIProvider = 'free' | 'gemini' | 'groq' | 'claude' | 'openrouter' | 'openai';
export type KeyProvider = Exclude<AIProvider, 'free'>;
export const FREE_CHAIN: KeyProvider[] = ['gemini', 'groq', 'openrouter'];

export interface ChatImage { mimeType: string; data: string } // base64, without the data: prefix
export interface ChatTurn { role: 'user' | 'assistant'; text: string; images?: ChatImage[] }

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Il più intelligente', price: '$4 / $20' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Ottimo e più economico', price: '$2 / $10' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'Il più economico e veloce', price: '$1 / $5' },
] as const;

export const OPENROUTER_AUTO = 'openrouter/auto';

const PROVIDER_KEY = 'studenthub_ai_provider';
const KEY_STORAGE: Record<KeyProvider, string> = {
  gemini: 'gemini_api_key',
  groq: 'studenthub_groq_key',
  claude: 'studenthub_claude_key',
  openrouter: 'studenthub_openrouter_key',
  openai: 'studenthub_openai_key',
};
type ModelProvider = 'claude' | 'openrouter' | 'openai';
const MODEL_STORAGE: Record<ModelProvider, string> = {
  claude: 'studenthub_claude_model',
  openrouter: 'studenthub_openrouter_model',
  openai: 'studenthub_openai_model',
};

function read(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function write(key: string, value: string) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* ignore */ }
}

export function getProvider(): AIProvider {
  const saved = read(PROVIDER_KEY) as AIProvider;
  if ((['free', 'gemini', 'groq', 'claude', 'openrouter', 'openai'] as AIProvider[]).includes(saved)) return saved;
  // Who already had a Gemini key keeps using it; everyone else starts from the free mode.
  return getGeminiKey() ? 'gemini' : 'free';
}
export function setProvider(p: AIProvider) { write(PROVIDER_KEY, p); }

export function getKey(p: AIProvider): string {
  if (p === 'free') return '';
  return p === 'gemini' ? getGeminiKey() : read(KEY_STORAGE[p]);
}
export function setKey(p: KeyProvider, key: string) {
  if (p === 'gemini') setGeminiKey(key);
  else write(KEY_STORAGE[p], key.trim());
}

export function getModel(p: ModelProvider): string {
  const saved = read(MODEL_STORAGE[p]);
  if (p === 'claude') return CLAUDE_MODELS.some(m => m.id === saved) ? saved : CLAUDE_MODELS[0].id;
  if (p === 'openai') return saved; // '' = the best model available to the key, chosen at the first question
  return saved || OPENROUTER_AUTO;
}
export function setModel(p: ModelProvider, model: string) { write(MODEL_STORAGE[p], model); }

export function isReady(): boolean {
  const p = getProvider();
  return p === 'free' ? FREE_CHAIN.some(x => getKey(x)) : !!getKey(p);
}

// Who answered the last question (shown in the chat in "Gratis automatico").
let lastAnsweredBy = '';
let lastOpenAIModel = '';
const PROVIDER_NAMES: Record<KeyProvider, string> = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter', claude: 'Claude', openai: 'ChatGPT' };

export function providerLabel(): string {
  const p = getProvider();
  if (p === 'claude') return CLAUDE_MODELS.find(m => m.id === getModel('claude'))?.label || 'Claude';
  if (p === 'openrouter') return `OpenRouter · ${getModel('openrouter').replace(/^[^/]+\//, '')}`;
  if (p === 'openai') return `ChatGPT · ${getModel('openai') || (lastOpenAIModel ? `Automatico (${lastOpenAIModel})` : 'Automatico')}`;
  if (p === 'groq') return 'Groq';
  if (p === 'free') return `Gratis automatico${lastAnsweredBy ? ` · ha risposto ${lastAnsweredBy}` : ''}`;
  return 'Google Gemini';
}

// A request that never answers becomes a clear error instead of an endless wait.
// Thrown when the student presses "Stop": not an error to show.
export class StoppedError extends Error {
  constructor() { super('Risposta interrotta'); }
}

// The "Stop" button of the chat: the request in progress is cancelled, so it isn't paid for.
let stopSignal: AbortSignal | undefined;

async function fetchWithTimeout(url: string, init: RequestInit, seconds: number, who: string): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), seconds * 1000);
  const external = stopSignal;
  const onStop = () => controller.abort();
  external?.addEventListener('abort', onStop);
  try {
    if (external?.aborted) throw new StoppedError();
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (external?.aborted || err instanceof StoppedError) throw new StoppedError();
    if (controller.signal.aborted) throw new Error(`${who} non ha risposto entro ${seconds} secondi. Riprova, magari scegliendo una materia o un argomento più piccolo.`);
    throw new Error(`Impossibile contattare ${who}: controlla la connessione. (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    window.clearTimeout(timer);
    external?.removeEventListener('abort', onStop);
  }
}

// ---------------------------------------------------------------- Claude

type AnthropicSDK = typeof import('@anthropic-ai/sdk').default;

// Loaded only when Claude is used, so the app opens fast for everyone else.
async function loadSDK(): Promise<AnthropicSDK> {
  return (await import('@anthropic-ai/sdk')).default;
}

function claudeClient(SDK: AnthropicSDK): Anthropic {
  // The key belongs to the student and stays in their browser: there is no server of ours in between.
  return new SDK({ apiKey: getKey('claude'), dangerouslyAllowBrowser: true, maxRetries: 2 });
}

function claudeError(Anthropic: AnthropicSDK, err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new Error('Chiave di Claude non valida o senza permessi. Controllala nelle impostazioni AI.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error('Troppe richieste a Claude in poco tempo. Aspetta un minuto e riprova.');
  }
  if (err instanceof Anthropic.BadRequestError && /credit|balance|billing/i.test(err.message)) {
    return new Error('Il credito di Claude è finito: ricaricalo su console.anthropic.com (Plans & Billing).');
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new Error('I server di Claude sono occupati in questo momento. Riprova tra poco.');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new Error('Errore di connessione con Claude. Controlla la rete e riprova.');
  }
  if (err instanceof Anthropic.APIError) return new Error(`Claude: ${err.message}`);
  return err instanceof Error ? err : new Error(String(err));
}

type ClaudeContent = Anthropic.Beta.BetaContentBlockParam;

async function askClaude(system: string, context: string, turns: ChatTurn[], maxTokens = 16000): Promise<string> {
  const model = getModel('claude');
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map(t => {
    const content: ClaudeContent[] = [];
    t.images?.forEach(img => content.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType as 'image/png', data: img.data } }));
    if (t.text) content.push({ type: 'text', text: t.text });
    return { role: t.role, content };
  });
  const usesFallback = model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5';
  const SDK = await loadSDK();
  try {
    const stream = claudeClient(SDK).beta.messages.stream({
      model,
      max_tokens: maxTokens,
      // The study material is the same for every question of a chat: cached, it costs ~10x less from the 2nd question.
      system: [
        { type: 'text', text: system },
        ...(context ? [{ type: 'text' as const, text: context, cache_control: { type: 'ephemeral' as const } }] : []),
      ],
      messages,
      ...(model === 'claude-haiku-4-5' ? {} : { output_config: { effort: 'medium' as const } }),
      // If a safety filter wrongly declines, the same request is answered by another Claude model.
      ...(usesFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    }, { signal: stopSignal });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new Error('Claude non può rispondere a questa richiesta. Prova a riformularla.');
    }
    return message.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
  } catch (err) {
    if (stopSignal?.aborted) throw new StoppedError();
    throw claudeError(SDK, err);
  }
}

// ---------------------------------------------------------------- OpenRouter

export interface OpenRouterModel { id: string; name: string; prompt: number; completion: number; context: number; vision: boolean }

let openRouterModels: OpenRouterModel[] | null = null;

// Public list of the models (with their price per token), sorted from the cheapest.
export async function listOpenRouterModels(): Promise<OpenRouterModel[]> {
  if (openRouterModels) return openRouterModels;
  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error('Impossibile caricare la lista dei modelli di OpenRouter.');
  const body = await res.json();
  openRouterModels = (body.data || [])
    .filter((m: { architecture?: { output_modalities?: string[] } }) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes('text'))
    .map((m: { id: string; name?: string; pricing?: { prompt?: string; completion?: string }; context_length?: number; architecture?: { input_modalities?: string[] } }) => ({
      id: m.id,
      name: m.name || m.id,
      prompt: Number(m.pricing?.prompt || 0) * 1e6,
      completion: Number(m.pricing?.completion || 0) * 1e6,
      context: m.context_length || 0,
      vision: !!m.architecture?.input_modalities?.includes('image'),
    }))
    .filter((m: OpenRouterModel) => m.prompt >= 0 && m.completion >= 0)
    .sort((a: OpenRouterModel, b: OpenRouterModel) => (a.prompt + a.completion) - (b.prompt + b.completion));
  return openRouterModels!;
}

// Best free model for studying (big, recent, good at Italian), read from the public list.
const FREE_PREFERENCE = [/deepseek.*(v3|r1|chat)/i, /qwen.?3.*(235|max|coder)/i, /gpt-oss-120b/i, /kimi/i, /llama-4-maverick/i, /gemini/i, /qwen/i, /llama-3\.3-70b/i, /mistral/i, /llama/i];
let freeOpenRouterModel: string | null = null;
async function bestFreeOpenRouterModel(): Promise<string> {
  const saved = getModel('openrouter');
  if (saved.endsWith(':free')) return saved;
  if (freeOpenRouterModel) return freeOpenRouterModel;
  const free = (await listOpenRouterModels()).filter(m => m.prompt === 0 && m.completion === 0 && m.id.endsWith(':free'));
  const ranked = [...free].sort((a, b) => {
    const ra = FREE_PREFERENCE.findIndex(r => r.test(a.id));
    const rb = FREE_PREFERENCE.findIndex(r => r.test(b.id));
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || b.context - a.context;
  });
  if (!ranked.length) throw new Error('OpenRouter non ha modelli gratuiti disponibili in questo momento.');
  freeOpenRouterModel = ranked[0].id;
  return freeOpenRouterModel;
}

async function askOpenRouter(system: string, context: string, turns: ChatTurn[], maxTokens = 8192, model = getModel('openrouter')): Promise<string> {
  const messages = compatMessages(system, context, turns);
  let res: Response;
  try {
    res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getKey('openrouter')}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Student Hub',
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    }, 180, 'OpenRouter');
  } catch (err) {
    throw err instanceof Error ? err : new Error('Errore di connessione con OpenRouter. Controlla la rete e riprova.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg: string = body.error?.message || `Errore ${res.status}`;
    if (res.status === 401) throw new Error('Chiave di OpenRouter non valida. Controllala nelle impostazioni AI.');
    if (res.status === 402) throw new Error('Credito di OpenRouter esaurito: ricaricalo su openrouter.ai o scegli un modello gratuito.');
    if (res.status === 429) throw new Error('Limite di richieste raggiunto per questo modello (i modelli gratuiti ne hanno pochi). Aspetta un po\' o scegli un altro modello.');
    throw new Error(`OpenRouter: ${msg}`);
  }
  return String(body.choices?.[0]?.message?.content || '').trim();
}

// ---------------------------------------------------------------- OpenAI (ChatGPT)

export interface OpenAIModel { id: string; rank: number; small: boolean }

const OPENAI_SKIP = /audio|realtime|image|tts|transcribe|search|embedding|instruct|dall|whisper|moderation|davinci|babbage|codex|computer|preview/i;

// The models change often: they are read from the key's own list and the newest full one is
// suggested first (mini / nano are cheaper but less smart).
function openAIRank(id: string): number {
  const version = parseFloat(/^gpt-(\d+(?:\.\d+)?)/.exec(id)?.[1] || (/^o(\d+)/.exec(id) ? '4.5' : '0'));
  let rank = version * 100;
  if (/mini/.test(id)) rank -= 30;
  if (/nano/.test(id)) rank -= 60;
  if (/\d{4}-\d{2}-\d{2}$/.test(id)) rank -= 5; // dated snapshot: prefer the alias
  if (/chat-latest/.test(id)) rank -= 2;
  return rank;
}

export async function listOpenAIModels(key: string): Promise<OpenAIModel[]> {
  const res = await fetchWithTimeout('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } }, 30, 'OpenAI');
  if (res.status === 401) throw new Error('Chiave di OpenAI non valida: controlla di averla copiata tutta.');
  if (!res.ok) throw new Error('Impossibile leggere i modelli di OpenAI. Riprova tra poco.');
  const body = await res.json();
  return (body.data || [])
    .map((m: { id: string }) => m.id)
    .filter((id: string) => (/^gpt-\d/.test(id) || /^o\d/.test(id)) && !OPENAI_SKIP.test(id))
    .map((id: string) => ({ id, rank: openAIRank(id), small: /mini|nano/.test(id) }))
    .sort((a: OpenAIModel, b: OpenAIModel) => b.rank - a.rank || a.id.localeCompare(b.id));
}

function compatMessages(system: string, context: string, turns: ChatTurn[]) {
  return [
    { role: 'system', content: context ? `${system}\n\n${context}` : system },
    ...turns.map(t => ({
      role: t.role,
      content: t.images?.length
        ? [...(t.text ? [{ type: 'text', text: t.text }] : []), ...t.images.map(img => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } }))]
        : t.text,
    })),
  ];
}

// Models the student hid from the menu, or that answered "no access" for this key.
const OPENAI_HIDDEN = 'studenthub_openai_hidden';
export function hiddenOpenAIModels(): string[] {
  try { return JSON.parse(read(OPENAI_HIDDEN) || '[]'); } catch { return []; }
}
export function hideOpenAIModel(id: string) {
  write(OPENAI_HIDDEN, JSON.stringify([...new Set([...hiddenOpenAIModels(), id])]));
  if (getModel('openai') === id) setModel('openai', '');
}
export function showAllOpenAIModels() { write(OPENAI_HIDDEN, ''); }

// "Automatico": the newest full model of the key that isn't hidden.
export async function bestOpenAIModel(key: string): Promise<string | undefined> {
  const hidden = hiddenOpenAIModels();
  const list = (await listOpenAIModels(key)).filter(m => !hidden.includes(m.id));
  return (list.find(m => !m.small) || list[0])?.id;
}

async function askOpenAI(system: string, context: string, turns: ChatTurn[]): Promise<string> {
  const key = getKey('openai');
  for (let attempt = 0; attempt < 4; attempt++) {
    const model = getModel('openai') || await bestOpenAIModel(key);
    if (!model) throw new Error('Questa chiave di OpenAI non ha accesso a nessun modello GPT utilizzabile. Puoi rimostrare i modelli nascosti dal menu dei modelli.');
    let res: Response;
    try {
      res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        // Reasoning models think inside this limit too: keep it generous.
        body: JSON.stringify({ model, messages: compatMessages(system, context, turns), max_completion_tokens: 32000 }),
      }, 240, 'ChatGPT');
    } catch (err) {
      throw err instanceof Error ? err : new Error('Errore di connessione con OpenAI. Controlla la rete e riprova.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg: string = body.error?.message || `Errore ${res.status}`;
      const code: string = body.error?.code || '';
      if (res.status === 401) throw new Error('Chiave di OpenAI non valida. Controllala nelle impostazioni AI.');
      if (code === 'insufficient_quota' || /quota|billing/i.test(msg)) throw new Error('Il credito di OpenAI è finito: ricaricalo su platform.openai.com (Billing).');
      if (res.status === 429) throw new Error('Troppe richieste a OpenAI in poco tempo. Aspetta un minuto e riprova.');
      // A model this key can't use (not available, needs verification, unsupported parameters…):
      // it is hidden and the next one answers.
      if (res.status === 404 || res.status === 403 || code === 'model_not_found' || /does not exist|do not have access|not have access|verif|not supported|unsupported/i.test(msg)) {
        hideOpenAIModel(model);
        continue;
      }
      throw new Error(`OpenAI: ${msg}`);
    }
    const text = String(body.choices?.[0]?.message?.content || '').trim();
    if (!text) {
      const reason = body.choices?.[0]?.finish_reason;
      throw new Error(reason === 'length'
        ? 'ChatGPT ha usato tutto lo spazio per ragionare senza scrivere la risposta: riprova con una domanda più precisa o un argomento più piccolo.'
        : 'ChatGPT ha restituito una risposta vuota. Riprova.');
    }
    lastOpenAIModel = model;
    return text;
  }
  throw new Error('Nessun modello di ChatGPT utilizzabile con questa chiave in questo momento.');
}

// ---------------------------------------------------------------- Groq (free)

const GROQ_API = 'https://api.groq.com/openai/v1';
const GROQ_SKIP = /whisper|guard|tts|playai|distil|compound|orpheus|safeguard/i;
const GROQ_PREFERENCE = [/gpt-oss-120b/i, /kimi/i, /qwen.?3.*(235|32b)/i, /llama-4-maverick/i, /deepseek/i, /llama-3\.3-70b/i, /qwen/i, /llama-4-scout/i, /gpt-oss/i, /llama/i];
let groqModel: string | null = null;

async function bestGroqModel(key: string): Promise<string> {
  if (groqModel) return groqModel;
  try {
    const res = await fetch(`${GROQ_API}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) throw new Error('Chiave di Groq non valida: controlla di averla copiata tutta.');
    const ids: string[] = ((await res.json()).data || []).map((m: { id: string }) => m.id).filter((id: string) => !GROQ_SKIP.test(id));
    const rank = (id: string) => { const i = GROQ_PREFERENCE.findIndex(r => r.test(id)); return i < 0 ? 99 : i; };
    groqModel = ids.sort((a, b) => rank(a) - rank(b))[0] || 'llama-3.3-70b-versatile';
  } catch (err) {
    if (err instanceof Error && /non valida/.test(err.message)) throw err;
    groqModel = 'llama-3.3-70b-versatile';
  }
  return groqModel;
}

async function askGroq(system: string, context: string, turns: ChatTurn[]): Promise<string> {
  const key = getKey('groq');
  const model = await bestGroqModel(key);
  let res: Response;
  try {
    res = await fetchWithTimeout(`${GROQ_API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      // Groq's free models read only text: photos are left to Gemini.
      body: JSON.stringify({ model, messages: compatMessages(system, context, turns.map(t => ({ role: t.role, text: t.text || '(foto)' }))), max_completion_tokens: 8192 }),
    }, 120, 'Groq');
  } catch (err) {
    throw err instanceof Error ? err : new Error('Errore di connessione con Groq. Controlla la rete e riprova.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg: string = body.error?.message || `Errore ${res.status}`;
    if (res.status === 401) throw new Error('Chiave di Groq non valida. Controllala nelle impostazioni AI.');
    if (res.status === 413 || /too large|context|tokens per minute|TPM/i.test(msg)) throw new Error('Per Groq il materiale è troppo lungo: scegli una materia o un argomento più piccolo.');
    if (res.status === 429) throw new Error('Hai finito le domande gratuite di Groq per ora. Riprova più tardi.');
    if (res.status === 404 || /model/i.test(msg) && res.status === 400) groqModel = null;
    throw new Error(`Groq: ${msg}`);
  }
  return String(body.choices?.[0]?.message?.content || '').trim();
}

// ---------------------------------------------------------------- Gemini

function askGemini(system: string, context: string, turns: ChatTurn[]): Promise<string> {
  const contents: GeminiContent[] = [];
  if (context) {
    contents.push({ role: 'user', parts: [{ text: context }] });
    contents.push({ role: 'model', parts: [{ text: 'Ho letto il materiale. Sono pronto ad aiutarti a studiare.' }] });
  }
  turns.forEach(t => {
    const parts: GeminiPart[] = [];
    if (t.text) parts.push({ text: t.text });
    t.images?.forEach(img => parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } }));
    if (parts.length) contents.push({ role: t.role === 'assistant' ? 'model' : 'user', parts });
  });
  return generateContent(getKey('gemini'), contents, { systemInstruction: system, maxOutputTokens: 32768, signal: stopSignal })
    .catch(err => { throw stopSignal?.aborted ? new StoppedError() : err; });
}

// ---------------------------------------------------------------- Public API

export class NoAIKeyError extends Error {
  constructor() {
    super('Per leggere foto e PDF scansionati serve una chiave AI: configurala nella Guida Studio AI.');
  }
}

// How much study material (in characters) each AI can take in one question. Free models have
// small limits: for them only the most relevant parts of the material are sent.
export function materialBudget(p: KeyProvider): number {
  if (p === 'groq') return 20_000;
  if (p === 'openrouter') return getModel('openrouter').endsWith(':free') || getProvider() === 'free' ? 60_000 : 150_000;
  if (p === 'openai') return 250_000;
  return 350_000;
}

async function askOne(p: KeyProvider, system: string, context: string, turns: ChatTurn[]): Promise<string> {
  if (p === 'claude') return askClaude(system, context, turns);
  if (p === 'openai') return askOpenAI(system, context, turns);
  if (p === 'groq') return askGroq(system, context, turns);
  if (p === 'openrouter') {
    return getProvider() === 'free'
      ? askOpenRouter(system, context, turns, 8192, await bestFreeOpenRouterModel())
      : askOpenRouter(system, context, turns);
  }
  return askGemini(system, context, turns);
}

// `buildContext` receives how many characters of material the chosen AI can take.
// Photos attached in the chat are turned into text by Gemini (free) before going to a paid AI:
// reading an image costs much more than reading its text. Kept in memory for the session.
const PHOTO_PROMPT = 'Trascrivi fedelmente tutto il testo di questa foto (esercizi, pagine di libro, appunti, anche scritti a mano), ' +
  'mantenendo la struttura e scrivendo le formule in modo leggibile. Descrivi brevemente tra [parentesi quadre] grafici, figure, tabelle e schemi ' +
  'con tutti i dati che contengono. Solo la trascrizione, senza commenti.';
const photoText = new Map<string, string>();

async function photosToText(turns: ChatTurn[]): Promise<ChatTurn[]> {
  return Promise.all(turns.map(async t => {
    if (!t.images?.length) return t;
    try {
      const texts = await Promise.all(t.images.map(async (img, i) => {
        const id = `${img.data.length}:${img.data.slice(0, 80)}:${img.data.slice(-80)}`;
        let text = photoText.get(id);
        if (text === undefined) {
          text = await generateContent(getKey('gemini'), [
            { role: 'user', parts: [{ inline_data: { mime_type: img.mimeType, data: img.data } }, { text: PHOTO_PROMPT }] },
          ], { temperature: 0.1, maxOutputTokens: 16384 });
          photoText.set(id, text);
        }
        return `[Foto ${i + 1} allegata dallo studente, trascritta]\n${text}`;
      }));
      return { role: t.role, text: [t.text, ...texts].filter(Boolean).join('\n\n') };
    } catch {
      return t; // Gemini not available right now: the photo goes as it is.
    }
  }));
}

export async function askTutor(system: string, buildContext: (budget: number) => Promise<string>, turns: ChatTurn[], signal?: AbortSignal): Promise<string> {
  stopSignal = signal;
  const p = getProvider();
  if (p !== 'free') {
    if (!getKey(p)) throw new Error('Configura prima la chiave AI nelle impostazioni della Guida Studio AI.');
    if (p !== 'gemini' && getKey('gemini') && turns.some(t => t.images?.length)) turns = await photosToText(turns);
    const answer = await askOne(p, system, await buildContext(materialBudget(p)), turns);
    lastAnsweredBy = PROVIDER_NAMES[p];
    return answer;
  }
  // Free mode: the first AI that answers wins; the others are tried only if it fails
  // (daily quota used up, servers busy, material too long…).
  const chain = FREE_CHAIN.filter(x => getKey(x));
  if (!chain.length) throw new Error('Inserisci almeno una chiave gratuita nelle impostazioni AI.');
  const hasImages = turns.some(t => t.images?.length);
  const errors: string[] = [];
  for (const x of chain) {
    if (hasImages && x === 'groq') continue;
    try {
      const answer = await askOne(x, system, await buildContext(materialBudget(x)), turns);
      if (!answer) throw new Error('risposta vuota');
      lastAnsweredBy = PROVIDER_NAMES[x];
      return answer;
    } catch (err) {
      if (err instanceof StoppedError || signal?.aborted) throw new StoppedError();
      errors.push(`${PROVIDER_NAMES[x]}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Nessuna AI gratuita ha risposto in questo momento. Riprova tra qualche minuto.\n${errors.join('\n')}`);
}

export function canTranscribe(): boolean {
  return !!(getKey('gemini') || getKey('claude') || getKey('openrouter') || getKey('openai'));

}

// Reads photos and scanned PDFs. Claude and Gemini read PDFs directly; with only OpenRouter the
// file must be an image and the chosen model must accept images.
export async function transcribeFile(data: string, mimeType: string, prompt: string): Promise<string> {
  stopSignal = undefined; // reading archive files is never stopped by the chat's Stop button
  const p = getProvider();
  // Gemini first: it reads photos and PDFs well and for free, so the paid AIs only ever get text.
  const order: AIProvider[] = ['gemini', p, 'claude', 'openai', 'openrouter'].filter(x => x !== 'free' && x !== 'groq') as AIProvider[];
  const usable = order.filter((x, i) => order.indexOf(x) === i && getKey(x));
  const claudeReads = mimeType === 'application/pdf' || ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType);
  const readers = usable.filter(x => (x === 'claude' ? claudeReads : x === 'openrouter' || x === 'openai' ? mimeType.startsWith('image/') : true));
  if (!readers.length) {
    if (usable.length) throw new Error('Con ChatGPT o OpenRouter l\'AI può leggere le foto ma non i PDF scansionati: aggiungi una chiave Gemini (gratis) o Claude.');
    throw new NoAIKeyError();
  }
  // If one AI fails (limit reached, busy servers…) the next one with a key tries.
  let lastError: unknown;
  for (const pick of readers) {
    try {
      const text = await transcribeWith(pick, data, mimeType, prompt);
      if (text.trim()) return text;
      lastError = new Error('Risposta vuota.');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function transcribeWith(pick: AIProvider, data: string, mimeType: string, prompt: string): Promise<string> {
  if (pick === 'gemini') {
    return generateContent(getKey('gemini'), [
      { role: 'user', parts: [{ inline_data: { mime_type: mimeType, data } }, { text: prompt }] },
    ], { temperature: 0.1, maxOutputTokens: 32768 });
  }
  if (pick === 'claude') {
    const block: ClaudeContent = mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/png', data } };
    const SDK = await loadSDK();
    try {
      const message = await claudeClient(SDK).beta.messages.stream({
        model: getModel('claude'),
        max_tokens: 32000,
        messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }],
        ...(getModel('claude') === 'claude-haiku-4-5' ? {} : { output_config: { effort: 'low' as const } }),
      }).finalMessage();
      return message.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
    } catch (err) {
      throw claudeError(SDK, err);
    }
  }
  const turn: ChatTurn = { role: 'user', text: prompt, images: [{ mimeType, data }] };
  if (pick === 'openai') return askOpenAI('Sei un trascrittore preciso.', '', [turn]);
  return askOpenRouter('Sei un trascrittore preciso.', '', [turn], 16000);
}
