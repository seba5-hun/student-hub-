import { CustomRequest } from './customRequests';

// The text the admin copies from Admin → Personalizzazioni and pastes to Claude: the student's
// request (rewritten by the Assistente MYND) plus everything needed to write the function as a
// MYND mini-app. Claude answers with one HTML page; the admin pastes it in "Codice", tries it in
// the preview and approves it: it then appears only in that student's MYND.

export const PLACES: Record<string, string> = {
  home: 'Home', impegni: 'Impegni', voti: 'Voti', timer: 'Timer Studio', archivio: 'Archivio',
  'cosa-studiare': 'Cosa studiare', calendario: 'Calendario', 'guida-ai': 'Guida Studio AI',
};

export function placeLabel(r: Pick<CustomRequest, 'kind' | 'placement'>): string {
  const p = r.placement || {};
  if (r.kind === 'update') return 'Modifica di una sua funzione già attiva (resta dov\'è)';
  if (p.place === 'home' && p.position !== 'replace') return 'Pannello nella Home';
  const base = p.place ? PLACES[p.place] : undefined;
  if (base) return p.position === 'replace' ? `Al posto di tutta la sezione ${base} (la rifà da capo)` : `${p.position === 'below' ? 'In fondo alla' : 'In cima alla'} sezione ${base}`;
  return 'Nuova sezione nel menu';
}

// How a MYND mini-app works (the rules of the closed room it runs in).
export const MINI_APP_GUIDE = `COME FUNZIONA UNA FUNZIONE SU MISURA DI MYND (mini-app)
- È UNA SOLA pagina HTML completa (<style> e <script> dentro), mostrata in un iframe sandbox (allow-scripts, senza stessa origine) con CSP: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:. Quindi: niente internet (fetch, librerie, font o immagini esterne non funzionano), niente localStorage/cookie, niente alert/prompt/popup, niente moduli inviati, niente navigazione.
- Grafica di MYND già caricata nella pagina: classi card, well, btn, btn-secondary, btn-danger, input, chip, row, col, grid, bar (con <i style="width:40%">), big, muted, subtle, lime, ok, bad, table; variabili CSS var(--text), var(--text-muted), var(--text-subtle), var(--brand-ring) (verde lime), var(--brand-fill), var(--on-brand), var(--border), var(--glass), var(--glass-well), var(--success), var(--warning), var(--danger), var(--area-scuola), var(--area-studio), var(--area-sport)… Funzionano sia col tema scuro sia con quello chiaro. Sfondo trasparente, non cambiare font o colori di base. Deve stare bene da 320px (telefono) a computer. Testi in italiano.
- Dati propri: const saved = await mynd.load() (null la prima volta); await mynd.save(stato) a ogni modifica (oggetto JSON, massimo ~200 KB). Restano salvati nell'account dello studente.
- Leggere i dati dello studente (solo se ha il permesso "legge i dati"): const d = await mynd.data() → { today, subjects:[{name,color}], tasks:[{id,title,date,time,subject,done,type,importance}], grades:[{subject,value,scale,date,description}], studyMinutes:[{subject,minutes,date}] }, oppure null se lo studente non lo permette (gestiscilo).
- Aggiungere dati (solo se ha il permesso "aggiunge dati"; Promise che lancia un errore se i dati non vanno bene, usa try/catch): mynd.addSession({subject, minutes}) (tempo di studio: conta nella Home e nelle statistiche come il Timer), mynd.addTask({title, date:"AAAA-MM-GG", time:"HH:MM", subject, personal, importance:1-5, minutes}), mynd.setTaskDone({id, done}), mynd.addGrade({subject, value, scale:10|30|100, date, description}), mynd.addNote({text}). Non si può cancellare nulla; massimo 30 scritture al minuto.
- Altro: mynd.today() → "AAAA-MM-GG"; mynd.open("calendario") apre una sezione di MYND (home, impegni, voti, timer, archivio, cosa-studiare, calendario, guida-ai).
- L'altezza si adatta da sola al contenuto.
- DOVE VA: se è "in cima" o "in fondo" a una sezione di MYND, la sezione originale RESTA sotto/sopra con tutte le sue funzioni: scrivi SOLO la parte nuova (es. per "Pomodoro nel Timer Studio": i cicli studio/pausa con scelta della materia, che salvano il tempo con mynd.addSession; NON rifare il cronometro, il grafico o le statistiche che ci sono già), compatta e ben integrata. Solo se è "al posto di" una sezione, rifai la sezione intera con tutto ciò che serve oltre alla novità.`;

export function buildClaudeBrief(r: CustomRequest): string {
  const p = r.placement || {};
  const lines = [
    `Ciao Claude, devi scrivere una funzione su misura per MYND (myndspace.world), richiesta da uno studente.`,
    ``,
    `PER CHI: ${r.email || 'studente'} (solo questo account la riceverà)`,
    `NOME: ${r.title}`,
    `DOVE VA: ${placeLabel(r)}`,
    `PERMESSI: ${p.uses_data ? 'legge materie, impegni, voti e tempo di studio' : 'non legge i dati dello studente'}${p.writes_data ? '; aggiunge dati (studio, impegni, voti, note)' : ''}`,
    ``,
    `COSA HA CHIESTO LO STUDENTE (riassunto dell'Assistente MYND):`,
    r.idea,
    ``,
    `RICHIESTA DETTAGLIATA:`,
    p.spec || '(nessun dettaglio in più)',
  ];
  if (p.context) lines.push('', 'COSA HA GIÀ LA SUA MYND:', p.context);
  if (r.kind === 'update' && p.current_html) lines.push('', 'CODICE ATTUALE DELLA FUNZIONE DA MODIFICARE (mantieni compatibili i dati già salvati con mynd.save):', '```html', p.current_html, '```');
  lines.push(
    '', MINI_APP_GUIDE, '',
    'COSA VOGLIO DA TE: rispondi con UN SOLO blocco ```html con la pagina completa e funzionante (nessuna parte da completare), poi in 2-3 righe cosa fa e come provarla. Non modificare il codice del sito e non fare commit: la incollo io in Admin → Personalizzazioni → Codice.',
  );
  return lines.join('\n');
}
