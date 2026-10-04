// Google Gemini API, called directly from the browser with the user's own API key.

const KEY_STORAGE = 'gemini_api_key';

export function getGeminiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setGeminiKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch { /* ignore */ }
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

export async function generateContent(
  apiKey: string,
  contents: GeminiContent[],
  options: { temperature?: number; maxOutputTokens?: number; systemInstruction?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const models = await availableModels(apiKey);
  const now = Date.now();
  const available = models.filter(m => (quotaPausedUntil.get(m) || 0) <= now);
  const ordered = available.length > 0 ? available : models;
  let lastError = '';
  const tried = new Set<string>();
  const retired = new Set<string>();
  // Google's "high demand" errors usually pass in a few seconds: go through the models up to
  // three times, waiting a little longer each round.
  for (let round = 0; round < 3; round++) {
    if (round > 0) await new Promise(resolve => setTimeout(resolve, round * 3000));
    if (options.signal?.aborted) throw new DOMException('Interrotta', 'AbortError');
    let overloaded = false;
    for (const model of ordered) {
      if (retired.has(model)) continue;
      tried.add(model);
      let response: Response;
      try {
        response = await fetch(`${API}/models/${model}:generateContent`, {
          signal: options.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents,
            ...(options.systemInstruction ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } } : {}),
            // Newer models also "think" inside this limit: a low value gave short or cut answers.
            generationConfig: { ...(options.temperature !== undefined ? { temperature: options.temperature } : {}), maxOutputTokens: options.maxOutputTokens ?? 16384 },
          }),
        });
      } catch (err) {
        if (options.signal?.aborted) throw err;
        throw new Error('Errore di connessione. Controlla la rete e riprova.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg: string = errorData.error?.message || `Errore ${response.status}`;
        if ((response.status === 400 && /api key/i.test(errorMsg)) || response.status === 401 || response.status === 403) {
          throw new Error('API key non valida o senza permessi. Usa "Cambia API key" nella Guida Studio AI per inserirne una nuova.');
        }
        if (response.status === 429 || /quota|rate limit|resource.?exhausted/i.test(errorMsg)) {
          quotaPausedUntil.set(model, Date.now() + QUOTA_PAUSE_MS);
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

      const data = await response.json();
      const text: string = (data.candidates?.[0]?.content?.parts || [])
        .map((p: { text?: string }) => p.text || '')
        .join('')
        .trim();
      if (!text && data.promptFeedback?.blockReason) {
        throw new Error('Google ha bloccato la richiesta per i suoi filtri di sicurezza. Prova a riformularla.');
      }
      quotaPausedUntil.delete(model);
      return text;
    }
    if (!overloaded) break;
  }
  modelCache = null;
  if (/limite della versione gratuita/.test(lastError)) throw new Error(lastError);
  throw new Error(
    /high demand|overloaded|unavailable/i.test(lastError)
      ? `I server di Google sono sovraccarichi in questo momento (non è un problema della tua chiave). Riprova tra qualche minuto. Modelli provati: ${[...tried].join(', ')}.`
      : `Nessun modello Gemini disponibile in questo momento. Riprova tra poco.${lastError ? ` (${lastError})` : ''} Modelli provati: ${[...tried].join(', ')}.`,
  );
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
