// The AI behind the tutor and the reading of archive files. The student chooses the provider
// and pastes their own key (kept only in this browser):
//  - Google Gemini: free, with daily limits;
//  - Claude (Anthropic): the best quality, paid per use with prepaid credit;
//  - OpenRouter: one key for many models, including free and very cheap ones.

import type Anthropic from '@anthropic-ai/sdk';
import { generateContent, getGeminiKey, setGeminiKey, GeminiContent, GeminiPart } from './gemini';

export type AIProvider = 'gemini' | 'claude' | 'openrouter';

export interface ChatImage { mimeType: string; data: string } // base64, without the data: prefix
export interface ChatTurn { role: 'user' | 'assistant'; text: string; images?: ChatImage[] }

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Il più intelligente', price: '$4 / $20' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Ottimo e più economico', price: '$2 / $10' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'Il più economico e veloce', price: '$1 / $5' },
] as const;

export const OPENROUTER_AUTO = 'openrouter/auto';

const PROVIDER_KEY = 'studenthub_ai_provider';
const KEY_STORAGE: Record<AIProvider, string> = {
  gemini: 'gemini_api_key',
  claude: 'studenthub_claude_key',
  openrouter: 'studenthub_openrouter_key',
};
const MODEL_STORAGE: Record<'claude' | 'openrouter', string> = {
  claude: 'studenthub_claude_model',
  openrouter: 'studenthub_openrouter_model',
};

function read(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function write(key: string, value: string) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* ignore */ }
}

export function getProvider(): AIProvider {
  const saved = read(PROVIDER_KEY) as AIProvider;
  return saved === 'claude' || saved === 'openrouter' ? saved : 'gemini';
}
export function setProvider(p: AIProvider) { write(PROVIDER_KEY, p); }

export function getKey(p: AIProvider): string {
  return p === 'gemini' ? getGeminiKey() : read(KEY_STORAGE[p]);
}
export function setKey(p: AIProvider, key: string) {
  if (p === 'gemini') setGeminiKey(key);
  else write(KEY_STORAGE[p], key.trim());
}

export function getModel(p: 'claude' | 'openrouter'): string {
  const saved = read(MODEL_STORAGE[p]);
  if (p === 'claude') return CLAUDE_MODELS.some(m => m.id === saved) ? saved : CLAUDE_MODELS[0].id;
  return saved || OPENROUTER_AUTO;
}
export function setModel(p: 'claude' | 'openrouter', model: string) { write(MODEL_STORAGE[p], model); }

export function isReady(): boolean {
  return !!getKey(getProvider());
}

export function providerLabel(): string {
  const p = getProvider();
  if (p === 'claude') return CLAUDE_MODELS.find(m => m.id === getModel('claude'))?.label || 'Claude';
  if (p === 'openrouter') return `OpenRouter · ${getModel('openrouter').replace(/^[^/]+\//, '')}`;
  return 'Google Gemini';
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
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new Error('Claude non può rispondere a questa richiesta. Prova a riformularla.');
    }
    return message.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
  } catch (err) {
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

async function askOpenRouter(system: string, context: string, turns: ChatTurn[], maxTokens = 8192): Promise<string> {
  const messages = [
    { role: 'system', content: context ? `${system}\n\n${context}` : system },
    ...turns.map(t => ({
      role: t.role,
      content: t.images?.length
        ? [...(t.text ? [{ type: 'text', text: t.text }] : []), ...t.images.map(img => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } }))]
        : t.text,
    })),
  ];
  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getKey('openrouter')}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Student Hub',
      },
      body: JSON.stringify({ model: getModel('openrouter'), messages, max_tokens: maxTokens }),
    });
  } catch {
    throw new Error('Errore di connessione con OpenRouter. Controlla la rete e riprova.');
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
  return generateContent(getKey('gemini'), contents, { systemInstruction: system, maxOutputTokens: 32768 });
}

// ---------------------------------------------------------------- Public API

export class NoAIKeyError extends Error {
  constructor() {
    super('Per leggere foto e PDF scansionati serve una chiave AI: configurala nella Guida Studio AI.');
  }
}

export async function askTutor(system: string, context: string, turns: ChatTurn[]): Promise<string> {
  const p = getProvider();
  if (!getKey(p)) throw new Error('Configura prima la chiave AI nelle impostazioni della Guida Studio AI.');
  if (p === 'claude') return askClaude(system, context, turns);
  if (p === 'openrouter') return askOpenRouter(system, context, turns);
  return askGemini(system, context, turns);
}

export function canTranscribe(): boolean {
  return !!(getKey('gemini') || getKey('claude') || getKey('openrouter'));
}

// Reads photos and scanned PDFs. Claude and Gemini read PDFs directly; with only OpenRouter the
// file must be an image and the chosen model must accept images.
export async function transcribeFile(data: string, mimeType: string, prompt: string): Promise<string> {
  const p = getProvider();
  const order: AIProvider[] = [p, 'claude', 'gemini', 'openrouter'];
  const usable = order.filter((x, i) => order.indexOf(x) === i && getKey(x));
  const claudeReads = mimeType === 'application/pdf' || ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType);
  const pick = usable.find(x => (x === 'claude' ? claudeReads : x === 'openrouter' ? mimeType.startsWith('image/') : true));
  if (!pick) {
    if (usable.length) throw new Error('Con OpenRouter l\'AI può leggere le foto ma non i PDF scansionati: aggiungi una chiave Gemini (gratis) o Claude.');
    throw new NoAIKeyError();
  }
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
  return askOpenRouter('Sei un trascrittore preciso.', '', [{ role: 'user', text: prompt, images: [{ mimeType, data }] }], 16000);
}
