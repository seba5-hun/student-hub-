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
// the best "flash" models, instead of hard-coding names that stop working.
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash'];
const RETRYABLE = [404, 429, 500, 502, 503, 504];
const API = 'https://generativelanguage.googleapis.com/v1beta';

let modelCache: { key: string; models: string[] } | null = null;
let lastWorkingModel: string | null = null;

// Stable before preview, newer before older, full before lite.
function modelRank(name: string): number {
  const version = parseFloat(/gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] || '0');
  let rank = version * 10;
  if (/-lite/.test(name)) rank -= 3;
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
        /gemini-.*flash/.test(m.name || '') &&
        !/image|tts|audio|live|embedding|thinking|computer|robotics/.test(m.name || ''))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      .sort((a: string, b: string) => modelRank(b) - modelRank(a))
      .slice(0, 6);
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
  options: { temperature?: number; maxOutputTokens?: number; systemInstruction?: string } = {},
): Promise<string> {
  const models = await availableModels(apiKey);
  const ordered = lastWorkingModel && models.includes(lastWorkingModel)
    ? [lastWorkingModel, ...models.filter(m => m !== lastWorkingModel)]
    : models;
  let lastError = '';
  let quotaHit = false;
  for (const model of ordered) {
    let response: Response;
    try {
      response = await fetch(`${API}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents,
          ...(options.systemInstruction ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } } : {}),
          generationConfig: { temperature: options.temperature ?? 0.7, maxOutputTokens: options.maxOutputTokens ?? 4096 },
        }),
      });
    } catch {
      throw new Error('Errore di connessione. Controlla la rete e riprova.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg: string = errorData.error?.message || `Errore ${response.status}`;
      if ((response.status === 400 && /api key/i.test(errorMsg)) || response.status === 401 || response.status === 403) {
        throw new Error('API key non valida o senza permessi. Usa "Cambia API key" nella Guida Studio AI per inserirne una nuova.');
      }
      // "No longer available", "not found" and overloaded models: try the next one.
      if (RETRYABLE.includes(response.status) || /no longer available|not found|not supported/i.test(errorMsg)) {
        if (response.status === 429 || /quota|rate limit|resource.?exhausted/i.test(errorMsg)) quotaHit = true;
        lastError = errorMsg;
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
    lastWorkingModel = model;
    return text;
  }
  modelCache = null;
  throw new Error(quotaHit
    ? 'Hai raggiunto il limite della versione gratuita di Gemini. Aspetta qualche minuto e riprova.'
    : `Nessun modello Gemini disponibile in questo momento. Riprova tra poco.${lastError ? ` (${lastError})` : ''}`);
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
