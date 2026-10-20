// Security check of a personalised function (mini-app) before the admin approves it. The mini-app
// already runs in a closed room (sandboxed iframe, no network by CSP, no access to MYND), so this
// looks for code that tries to get out of it, hide what it does or trick the student.

export type Severity = 'danger' | 'warning' | 'info';
export interface Finding { severity: Severity; text: string; line?: number }
export interface SecurityReport { level: 'ok' | 'warning' | 'danger'; findings: Finding[] }

const RULES: { re: RegExp; severity: Severity; text: string }[] = [
  // Getting out of the room or talking to the internet.
  { re: /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon|RTCPeerConnection/, severity: 'danger', text: 'Prova a collegarsi a internet' },
  { re: /<script[^>]+\bsrc\s*=|<link[^>]+href\s*=\s*["']?https?:|@import|url\(\s*["']?https?:/i, severity: 'danger', text: 'Carica file da internet' },
  { re: /\b(?:window\.)?(?:top|parent|opener)\s*(?:\.|\[)|\bpostMessage\s*\(/, severity: 'danger', text: 'Prova a parlare con la pagina di MYND fuori da window.mynd' },
  { re: /document\.cookie|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bcaches\b|serviceWorker|\bnew\s+(?:Shared)?Worker\b|importScripts/, severity: 'danger', text: 'Usa memoria o processi del browser non permessi' },
  { re: /\beval\s*\(|\bnew\s+Function\b|(?<![\w.])Function\s*\(|set(?:Timeout|Interval)\s*\(\s*["'`]/, severity: 'danger', text: 'Esegue testo come codice (eval / Function)' },
  { re: /(?:window\.|document\.)?location\s*(?:\.href\s*)?=|location\.(?:assign|replace)\s*\(|http-equiv\s*=\s*["']?refresh/i, severity: 'danger', text: 'Prova a cambiare pagina' },
  { re: /<iframe|<object|<embed|<base\b|<form[^>]+action\s*=/i, severity: 'danger', text: 'Inserisce pagine o moduli esterni' },
  { re: /\bpassword\b|carta di credito|\biban\b|\bcvv\b|codice fiscale|type\s*=\s*["']?password/i, severity: 'danger', text: 'Chiede dati sensibili (password, carte, documenti)' },
  // Hiding what it does.
  { re: /\batob\s*\(|\bbtoa\s*\(|String\.fromCharCode|\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){5,}|\\u[0-9a-f]{4}(?:\\u[0-9a-f]{4}){5,}/i, severity: 'warning', text: 'Testo nascosto o codificato' },
  { re: /https?:\/\/[^\s"'<>)]+/i, severity: 'warning', text: 'Contiene indirizzi di siti esterni' },
  { re: /while\s*\(\s*(?:true|1)\s*\)|for\s*\(\s*;\s*;\s*\)/, severity: 'warning', text: 'Ciclo infinito (può bloccare la pagina)' },
  { re: /\bnavigator\.(?:geolocation|mediaDevices|clipboard|credentials)|getUserMedia/, severity: 'warning', text: 'Chiede posizione, fotocamera o appunti (bloccati, ma sospetto)' },
  // What it does with the student's data (allowed, to know).
  { re: /mynd\.data\s*\(/, severity: 'info', text: 'Legge materie, impegni e voti' },
  { re: /mynd\.(?:addSession|addTask|setTaskDone|addGrade|addNote)\s*\(/, severity: 'info', text: 'Aggiunge dati (tempo di studio, impegni, voti o note)' },
];

export function checkAppCode(html: string): SecurityReport {
  const findings: Finding[] = [];
  if (!html.trim()) findings.push({ severity: 'warning', text: 'Non c\'è ancora il codice: va scritto prima di approvare' });
  if (html.length > 100_000) findings.push({ severity: 'warning', text: `Codice molto lungo (${Math.round(html.length / 1000)} mila caratteri)` });
  const lines = html.split('\n');
  for (const rule of RULES) {
    const i = lines.findIndex(l => rule.re.test(l));
    if (i >= 0) findings.push({ severity: rule.severity, text: rule.text, line: i + 1 });
  }
  const level = findings.some(f => f.severity === 'danger') ? 'danger' : findings.some(f => f.severity === 'warning') ? 'warning' : 'ok';
  const order: Record<Severity, number> = { danger: 0, warning: 1, info: 2 };
  return { level, findings: findings.sort((a, b) => order[a.severity] - order[b.severity]) };
}

// The AI's second opinion (Admin → Personalizzazioni → "Analisi AI").
export const SECURITY_REVIEW_SYSTEM = `Sei un esperto di sicurezza. Controlli il codice di una piccola pagina HTML ("mini-app") scritta da un'AI per uno studente, prima che venga attivata nell'app MYND.
La mini-app gira in un iframe sandbox senza stessa origine e con CSP che blocca la rete; comunica con MYND solo con window.mynd: load(), save(dati), data() (legge materie, impegni, voti), today(), open(sezione), addSession, addTask, setTaskDone, addGrade, addNote (aggiungono dati, mai cancellano).
Cerca: tentativi di uscire dalla sandbox o collegarsi a internet, di cambiare pagina, phishing (chiedere password, dati personali o di pagamento), contenuti inappropriati per studenti, codice nascosto o offuscato, scritture di dati eccessive o ingannevoli (es. aggiungere voti falsi o centinaia di impegni), cicli che bloccano la pagina, e se fa davvero ciò che dice la descrizione.
Rispondi SOLO con JSON: {"verdict":"sicura"|"dubbia"|"pericolosa","summary":"1-2 frasi in italiano semplice","issues":["problema 1","…"]}`;

export interface AiReview { verdict: 'sicura' | 'dubbia' | 'pericolosa'; summary: string; issues: string[]; at?: string }

export function parseReview(raw: string): AiReview {
  const m = raw.match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : raw);
    const verdict = ['sicura', 'dubbia', 'pericolosa'].includes(j.verdict) ? j.verdict : 'dubbia';
    return { verdict, summary: String(j.summary || '').slice(0, 500), issues: (Array.isArray(j.issues) ? j.issues : []).map(String).slice(0, 10) };
  } catch {
    return { verdict: 'dubbia', summary: raw.slice(0, 500), issues: [] };
  }
}
