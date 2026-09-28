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

// Tried in order: move to the next one when a model doesn't exist (404) or is overloaded
// (429/5xx); stop on errors that another model can't fix (e.g. a bad key).
const MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const RETRYABLE = [404, 429, 500, 502, 503, 504];

export async function generateContent(
  apiKey: string,
  contents: GeminiContent[],
  options: { temperature?: number; maxOutputTokens?: number; systemInstruction?: string } = {},
): Promise<string> {
  let lastError = '';
  for (const model of MODELS) {
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
      if (RETRYABLE.includes(response.status)) {
        lastError = errorMsg;
        continue;
      }
      if ((response.status === 400 && /api key/i.test(errorMsg)) || response.status === 401 || response.status === 403) {
        throw new Error('API key non valida o senza permessi. Usa "Cambia API key" nella Guida Studio AI per inserirne una nuova.');
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
    return text;
  }
  throw new Error(/quota|rate|429|resource.?exhausted/i.test(lastError)
    ? 'Hai raggiunto il limite della versione gratuita di Gemini. Aspetta qualche minuto e riprova.'
    : `Tutti i modelli sono occupati. Riprova tra poco.${lastError ? ` (${lastError})` : ''}`);
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
