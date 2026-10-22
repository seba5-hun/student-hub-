// Google Gemini API, called directly from the browser with the user's own API key.

import { savePref } from './cloudPrefs';

const KEY_STORAGE = 'gemini_api_key';

export function getGeminiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

// Kept in this browser and in the account, so every device of the student has it.
export function setGeminiKey(key: string): void {
  savePref(KEY_STORAGE, key);
}

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// Google renames and retires models often: ask the API which ones this key can use and pick
// the best ones ("pro" first, then "flash"; "lite" only as a last resort), instead of
// hard-coding names that stop working. When the free quota of a model is used up, the next one answers.
const FALLBACK_MODELS = ['gemini-3.5-pro', 'gemini-3.5-flash', 'gemini-pro-latest', 'gemini-flash-latest', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-flash-lite-latest'];
const RETRYABLE = [404, 429, 500, 502, 503, 504];
const API = 'https://generativelanguage.googleapis.com/v1beta';

let modelCache: { key: string; models: string[] } | null = null;
// Models whose free quota is used up are skipped for a while, then tried again (best first).
const QUOTA_PAUSE_MS = 10 * 60 * 1000;
const quotaPausedUntil = new Map<string, number>();

// Stable before preview, pro before flash, newer before older, lite last.
function modelRank(name: string): number {
  const version = parseFloat(/gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] || '0');
  let rank = version * 10;
  if (/-pro/.test(name)) rank += 8;
  if (/-lite/.test(name)) rank -= 40;
  if (/preview|exp/.test(name)) rank -= 100;
  if (/-latest$/.test(name)) rank -= 50;
  return rank;
}

async function availableModels(apiKey: string): Promise<string[]> {
  if (modelCache?.key === apiKey) return modelCache.models;
  try {
    const response = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } });
    if (!response.ok) return FALLBACK_MODELS;
    const data = await response.json();
    const models: string[] = (data.models || [])
      .filter((m: { name?: string; supportedGenerationMethods?: string[] }) =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        /gemini-.*(flash|pro)/.test(m.name || '') &&
        !/image|tts|audio|live|embedding|thinking|computer|robotics/.test(m.name || ''))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      .sort((a: string, b: string) => modelRank(b) - modelRank(a))
      .slice(0, 10);
    const list = models.length > 0 ? models : FALLBACK_MODELS;
    modelCache = { key: apiKey, models: list };
    return list;
  } catch {
    return FALLBACK_MODELS;
  }
}

// Google refuses to copy word for word long passages of published texts (a book page, song lyrics):
// the answer comes back empty with finishReason "RECITATION". The caller can ask again differently.
export class GeminiRecitationError extends Error {
  constructor() {
    super('Google non permette di copiare parola per parola questo testo perché è protetto da diritto d\'autore (per esempio la pagina di un libro pubblicato).');
  }
}

export async function generateContent(
  apiKey: string,
  contents: GeminiContent[],
  options: {
    temperature?: number; maxOutputTokens?: number; systemInstruction?: string; signal?: AbortSignal;
    // fast: flash models first (reading pages needs no "pro" reasoning, and flash is much quicker).
    fast?: boolean;
    // A model that doesn't answer in time is skipped for the next one.
    timeoutMs?: number;
    // Called when the free per-minute limit makes it wait (seconds), so the app can say so.
    onWait?: (seconds: number) => void;
    // Transcriptions: an answer cut by the copyright filter is an error, not a (partial) result.
    strictRecitation?: boolean;
    // Quick answers: no hidden "thinking" before answering (much faster on the newer models).
    noThinking?: boolean;
    // The answer must be a JSON object (Gemini then writes nothing else).
    json?: boolean;
    // The answer as it is being written (streamed), for a chat that shows it right away.
    onPartial?: (text: string) => void;
  } = {},
): Promise<string> {
  const models = await availableModels(apiKey);
  let candidates = models;
  if (options.fast) {
    // Reading pages: flash, then lite. "Pro" models think for minutes and have tiny free limits.
    const quick = models.filter(m => !/-pro/.test(m));
    if (quick.length) candidates = [...quick].sort((a, b) => Number(/-lite/.test(a)) - Number(/-lite/.test(b))).slice(0, 4);
  }
  const free = () => candidates.filter(m => (quotaPausedUntil.get(m) || 0) <= Date.now());
  let available = free();
  // All of them hit the per-minute limit: wait for the first one to be free again.
  if (!available.length && options.fast) {
    const waitMs = Math.min(...candidates.map(m => quotaPausedUntil.get(m) || 0)) - Date.now();
    if (waitMs > 0 && waitMs <= 2 * 60_000) {
      options.onWait?.(Math.ceil(waitMs / 1000));
      await new Promise(resolve => setTimeout(resolve, waitMs + 250));
      available = free();
    }
  }
  const ordered = available.length > 0 ? available : candidates;
  let lastError = '';
  const tried = new Set<string>();
  const retired = new Set<string>();
  const emptyAnswers: string[] = [];
  // Google's "high demand" errors usually pass in a few seconds: go through the models up to
  // three times, waiting a little longer each round.
  for (let round = 0; round < 3; round++) {
    if (round > 0) await new Promise(resolve => setTimeout(resolve, round * 3000));
    if (options.signal?.aborted) throw new DOMException('Interrotta', 'AbortError');
    let overloaded = false;
    for (let mi = 0; mi < ordered.length; mi++) {
      const model = ordered[mi];
      if (retired.has(model)) continue;
      tried.add(model);
      // Speed settings this model accepts (a model that refuses them is asked again without).
      const extras = plainModels.has(model) ? {} : speedSettings(model, options);
      const usedExtras = Object.keys(extras).length > 0;
      const stream = !!options.onPartial;
      let response: Response;
      const controller = new AbortController();
      const stop = () => controller.abort();
      options.signal?.addEventListener('abort', stop);
      let timedOut = false;
      const timer = options.timeoutMs ? window.setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs) : 0;
      const done = () => { window.clearTimeout(timer); options.signal?.removeEventListener('abort', stop); };
      try {
        response = await fetch(`${API}/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`, {
          signal: controller.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents,
            ...(options.systemInstruction ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } } : {}),
            // Newer models also "think" inside this limit: a low value gave short or cut answers.
            generationConfig: { ...(options.temperature !== undefined ? { temperature: options.temperature } : {}), maxOutputTokens: options.maxOutputTokens ?? 16384, ...extras },
          }),
        });
      } catch (err) {
        done();
        if (options.signal?.aborted) throw err;
        if (timedOut) {
          lastError = `Il modello ${model} non ha risposto entro ${Math.round(options.timeoutMs! / 1000)} secondi.`;
          continue;
        }
        throw new Error('Errore di connessione. Controlla la rete e riprova.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        done();
        const errorMsg: string = errorData.error?.message || `Errore ${response.status}`;
        if (response.status === 400 && usedExtras && /think|mime|json|Unknown name|not supported|Invalid JSON payload/i.test(errorMsg)) {
          plainModels.add(model);
          mi--;
          continue;
        }
        if ((response.status === 400 && /api key/i.test(errorMsg)) || response.status === 401 || response.status === 403) {
          throw new Error('API key non valida o senza permessi. Usa "Cambia API key" nella Guida Studio AI per inserirne una nuova.');
        }
        if (response.status === 429 || /quota|rate limit|resource.?exhausted/i.test(errorMsg)) {
          // Google says how long to wait ("retryDelay": "37s"); the daily limit needs a longer pause.
          const details = JSON.stringify(errorData.error?.details || []) + errorMsg;
          const retry = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(details) || /retry in (\d+(?:\.\d+)?)\s*s/i.exec(details);
          const perDay = /PerDay|per.?day/i.test(details);
          quotaPausedUntil.set(model, Date.now() + (perDay ? QUOTA_PAUSE_MS : retry ? parseFloat(retry[1]) * 1000 + 1000 : 65_000));
          lastError = 'Hai raggiunto il limite della versione gratuita di Gemini. Aspetta qualche minuto e riprova.';
          continue;
        }
        // Overloaded: worth retrying later. Retired or unknown model: just skip it.
        if (response.status >= 500 || /high demand|overloaded|unavailable/i.test(errorMsg)) {
          overloaded = true;
          lastError = errorMsg;
          continue;
        }
        if (RETRYABLE.includes(response.status) || /no longer available|not found|not supported/i.test(errorMsg)) {
          retired.add(model);
          lastError = lastError || errorMsg;
          continue;
        }
        throw new Error(errorMsg);
      }

      let data;
      try {
        data = stream ? await readStream(response, options.onPartial!) : await response.json();
      } catch (err) {
        if (options.signal?.aborted) throw err;
        if (timedOut) {
          lastError = `Il modello ${model} non ha risposto entro ${Math.round(options.timeoutMs! / 1000)} secondi.`;
          continue;
        }
        throw new Error('Errore di connessione. Controlla la rete e riprova.');
      } finally {
        done();
      }
      const candidate = data.candidates?.[0];
      const finish: string = candidate?.finishReason || '';
      const text: string = (candidate?.content?.parts || [])
        // Parts marked "thought" are the model's reasoning, not the answer.
        .filter((p: { thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text || '')
        .join('')
        .trim();
      quotaPausedUntil.delete(model);
      if (finish === 'RECITATION' && (!text || options.strictRecitation)) throw new GeminiRecitationError();
      if (!text) {
        if (data.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCKLIST|SPII/.test(finish)) {
          throw new Error('Google ha bloccato la richiesta per i suoi filtri di sicurezza. Prova a riformularla.');
        }
        // Empty for another reason (the reasoning used up the space, a hiccup on Google's side):
        // the next model tries.
        emptyAnswers.push(`${model}${finish ? ` (${finish})` : ''}`);
        continue;
      }
      return text;
    }
    if (!overloaded) break;
  }
  modelCache = null;
  if (emptyAnswers.length && !lastError) {
    throw new Error(`Gemini ha risposto senza testo (${emptyAnswers.join(', ')}). Di solito è un problema momentaneo di Google: riprova tra poco.`);
  }
  if (/limite della versione gratuita/.test(lastError)) throw new Error(lastError);
  if (/non ha risposto entro/.test(lastError)) throw new Error(`Gemini è troppo lento in questo momento. ${lastError}`);
  throw new Error(
    /high demand|overloaded|unavailable/i.test(lastError)
      ? `I server di Google sono sovraccarichi in questo momento (non è un problema della tua chiave). Riprova tra qualche minuto. Modelli provati: ${[...tried].join(', ')}.`
      : `Nessun modello Gemini disponibile in questo momento. Riprova tra poco.${lastError ? ` (${lastError})` : ''} Modelli provati: ${[...tried].join(', ')}.`,
  );
}

// Models that refused the speed settings (an older model, a change on Google's side).
const plainModels = new Set<string>();

// No hidden thinking for quick answers: off on Gemini 2.5 Flash, as low as possible on Gemini 3.
function speedSettings(model: string, o: { noThinking?: boolean; json?: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (o.json) out.responseMimeType = 'application/json';
  if (o.noThinking) {
    if (/gemini-2\.5-flash|flash(-lite)?-latest/.test(model)) out.thinkingConfig = { thinkingBudget: 0 };
    else if (/gemini-3/.test(model)) out.thinkingConfig = { thinkingLevel: 'low' };
  }
  return out;
}

// Reads a streamed answer (server-sent events), passing on the text written so far; returns the
// same shape as a normal answer.
async function readStream(response: Response, onPartial: (text: string) => void) {
  const reader = response.body?.getReader();
  if (!reader) return response.json();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason = '';
  let promptFeedback: unknown;
  let raw = '';
  let events = 0;
  const take = (line: string) => {
    const l = line.trim();
    if (!l.startsWith('data:')) return;
    events++;
    let chunk;
    try { chunk = JSON.parse(l.slice(5)); } catch { return; }
    const c = chunk.candidates?.[0];
    const piece = (c?.content?.parts || []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text || '').join('');
    if (piece) { text += piece; onPartial(text); }
    if (c?.finishReason) finishReason = c.finishReason;
    if (chunk.promptFeedback) promptFeedback = chunk.promptFeedback;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const piece = decoder.decode(value, { stream: true });
    raw += piece;
    buffer += piece;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) { take(buffer.slice(0, nl)); buffer = buffer.slice(nl + 1); }
  }
  take(buffer);
  // Not streamed after all (one JSON answer, or a JSON list of pieces): read it as such.
  if (!events) {
    const whole = JSON.parse(raw);
    const list = Array.isArray(whole) ? whole : [whole];
    for (const chunk of list) take(`data: ${JSON.stringify(chunk)}`);
  }
  return { candidates: [{ content: { parts: [{ text }] }, finishReason }], promptFeedback };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
