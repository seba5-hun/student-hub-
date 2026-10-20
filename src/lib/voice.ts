// Voice in the Guida Studio AI, with what the browser already has (free, nothing leaves the device
// except, in Chrome, the dictation sent to Google's speech service by the browser itself):
// dictation (speech → text) and reading the answers aloud (text → speech) in Italian.

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const dictationSupported = () => typeof window !== 'undefined' && !!recognitionClass();
export const readingSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

const DICTATION_ERRORS: Record<string, string> = {
  'not-allowed': 'Il browser non ha il permesso di usare il microfono: consentilo dal lucchetto vicino all\'indirizzo del sito.',
  'service-not-allowed': 'Il browser non ha il permesso di usare il microfono: consentilo dal lucchetto vicino all\'indirizzo del sito.',
  'audio-capture': 'Non trovo nessun microfono collegato.',
  network: 'La dettatura ha bisogno di internet: controlla la connessione.',
};

// Starts listening: `onText` gets what was said so far (final + still being recognised).
// Returns the function that stops it.
export function startDictation(opts: { onText: (text: string) => void; onEnd: () => void; onError: (message: string) => void }): () => void {
  const Rec = recognitionClass();
  if (!Rec) { opts.onError('Questo browser non sa trascrivere la voce: prova con Chrome o Safari.'); opts.onEnd(); return () => {}; }
  const rec = new Rec();
  rec.lang = 'it-IT';
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = '';
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    opts.onText((finalText + interim).replace(/\s+/g, ' ').trim());
  };
  rec.onerror = e => { if (e.error !== 'aborted' && e.error !== 'no-speech') opts.onError(DICTATION_ERRORS[e.error] || 'La dettatura si è interrotta: riprova.'); };
  rec.onend = () => opts.onEnd();
  try { rec.start(); } catch { opts.onEnd(); }
  return () => { try { rec.stop(); } catch { /* already stopped */ } };
}

// ---- Reading aloud ----

// What is written for the eyes (markdown, formulas, emoji) said in a way that sounds natural.
export function textForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')                        // code blocks
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')                   // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')                 // links → their text
    .replace(/\$\$?([^$]+)\$\$?/g, (_, f: string) => f
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 fratto $2')
      .replace(/\^2\b/g, ' al quadrato').replace(/\^3\b/g, ' al cubo').replace(/\^\{?([^} ]+)\}?/g, ' elevato a $1')
      .replace(/\\sqrt\{([^}]*)\}/g, 'radice di $1').replace(/\\cdot|\\times/g, ' per ').replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/[{}]/g, ''))
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')                      // headings
    .replace(/^\s*[-*•]\s+/gm, '')                           // bullets
    .replace(/^\s*\d+[.)]\s+/gm, m => m.replace(/[.)]/, ','))
    .replace(/[*_`~>|]/g, ' ')                               // emphasis, tables
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s*\n+\s*/g, '. ').replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

// The most natural Italian voice of the device (the "Natural"/"Google"/"Siri" ones sound best).
function italianVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter(v => /^it(-|_|$)/i.test(v.lang));
  const rank = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online|premium|enhanced|siri/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 3 : 0) +
    (/alice|federica|elsa|isabella|luca|paola/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
  return voices.sort((a, b) => rank(b) - rank(a))[0] || null;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();   // starts loading the voices
  window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices());
}

let current = 0;   // which reading is in progress (a new one, or Stop, ends the previous)

// Reads the text aloud, in pieces (long readings in one go get cut off by some browsers).
export function speak(text: string, onEnd?: () => void): void {
  if (!readingSupported()) { onEnd?.(); return; }
  const synth = window.speechSynthesis;
  synth.cancel();
  const id = ++current;
  const clean = textForSpeech(text);
  const parts = clean.match(/[^.!?;:]+[.!?;:]*\s*/g)?.reduce<string[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && (last + s).length < 220) acc[acc.length - 1] = last + s; else acc.push(s);
    return acc;
  }, []) || [clean];
  const voice = italianVoice();
  let i = 0;
  const next = () => {
    if (id !== current) return;
    if (i >= parts.length) { onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(parts[i++].trim());
    u.lang = voice?.lang || 'it-IT';
    if (voice) u.voice = voice;
    u.rate = 1.02;
    u.onend = next;
    u.onerror = () => { if (id === current) onEnd?.(); };
    synth.speak(u);
  };
  next();
}

export function stopSpeaking(): void {
  current++;
  if (readingSupported()) window.speechSynthesis.cancel();
}
