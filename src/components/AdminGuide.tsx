import React, { useState } from 'react';
import { Check, Copy, ExternalLink, ChevronDown, Rocket, Database, Scale, ShieldCheck, Link2, Info, ListChecks, Mail } from 'lucide-react';
import schemaSql from '../../supabase/schema.sql?raw';
import suggestionsSql from '../../supabase/suggerimenti.sql?raw';
import accountSql from '../../supabase/account.sql?raw';
import businessSql from '../../supabase/business.sql?raw';
import business2Sql from '../../supabase/business_2.sql?raw';
import newsletterSql from '../../supabase/newsletter.sql?raw';
import customSql from '../../supabase/personalizzazioni.sql?raw';
import projectsSql from '../../supabase/progetti.sql?raw';
import sharingSql from '../../supabase/progetti_condivisione.sql?raw';
import emailTemplate from '../../supabase/email_conferma.html?raw';
import { LEGAL_VERSION } from '../lib/legal';

// Admin → Guida: everything the owner needs at hand (what is left to do before selling, Supabase
// scripts to copy, how to publish, legal documents, privacy requests, useful links). The checklist
// is remembered in this browser.

const CHECK_KEY = 'mynd_admin_checklist';
const PROJECT = 'czzlvcmnfvyrcjvyfyxi';
const BRANCH = 'claude/github-private-repo-setup-84qt3z';

const EMAIL_SUBJECT = 'Il tuo codice MYND: {{ .Token }}';
const EMAIL_BODY = emailTemplate.replace(/^<!--[\s\S]*?-->\s*/, '');

const TODO: { id: string; title: string; detail: string; link?: [string, string] }[] = [
  { id: 'confirm-email', title: 'Attiva la verifica dell\'email', detail: 'Supabase → Authentication → Sign In / Providers → Email → "Confirm email" acceso. Senza, chi si registra entra subito senza codice.', link: [`https://supabase.com/dashboard/project/${PROJECT}/auth/providers`, 'Apri i provider'] },
  { id: 'email-template', title: 'Imposta l\'email con il codice', detail: 'Copia oggetto e testo dalla sezione "Email con il codice" qui sotto e incollali in Supabase → Emails → Confirm signup. Così arriva solo il numero, senza link.', link: [`https://supabase.com/dashboard/project/${PROJECT}/auth/templates`, 'Apri i template email'] },
  { id: 'smtp', title: 'Collega un servizio email (SMTP)', detail: 'Il servizio email incluso in Supabase manda pochissime email all\'ora (e nei progetti nuovi solo al tuo team): per i codici a tutti serve un SMTP, ad es. Brevo (300 email/giorno gratis) o Resend. Mittente consigliato: noreply@myndspace.world, poi aggiungi i record DNS (SPF/DKIM) che ti indicano. Supabase → Authentication → Emails → SMTP Settings.', link: [`https://supabase.com/dashboard/project/${PROJECT}/auth/smtp`, 'Apri SMTP Settings'] },
  { id: 'sql-newsletter', title: 'Esegui lo script "Newsletter" su Supabase', detail: 'Serve per vedere gli iscritti in Admin → Newsletter.' },
  { id: 'sql-progetti', title: 'Esegui lo script "Progetti" su Supabase', detail: 'Serve per la nuova sezione Performance (progetti, attività, note e link).' },
  { id: 'sql-condivisione', title: 'Esegui lo script "Condivisione progetti" su Supabase', detail: 'Dopo "Progetti": inviti per email, ruoli, progetti condivisi.' },
  { id: 'sql-custom', title: 'Esegui lo script "Personalizzazioni" su Supabase', detail: 'Senza, le richieste di funzioni su misura non arrivano e non puoi assegnare i pacchetti.' },
  { id: 'sql-suggestions', title: 'Esegui lo script "Suggerimenti" su Supabase', detail: 'Senza, i suggerimenti degli utenti non vengono salvati. Lo trovi qui sotto in "Script Supabase".' },
  { id: 'sql-account', title: 'Esegui lo script "Elimina account" su Supabase', detail: 'Senza, il pulsante "Elimina il mio account" in Privacy e dati non funziona.' },
  { id: 'google-client-ids', title: 'Google: autorizza il Client ID del pulsante', detail: 'Supabase → Authentication → Sign In / Providers → Google → campo "Client IDs": deve contenere 1048106841609-ipbbd7vkt38j9brvdlshubh5tuesgsb4.apps.googleusercontent.com (se c\'è già un altro ID, aggiungilo dopo una virgola), poi Save. Senza, il pulsante "Continua come…" dà "Unacceptable audience".', link: [`https://supabase.com/dashboard/project/${PROJECT}/auth/providers`, 'Apri i provider'] },
  { id: 'google-scope', title: 'Google: togli il permesso "cloud-platform"', detail: 'Google Auth Platform → Accesso ai dati: lascia solo openid, email, profile e drive.file.', link: ['https://console.cloud.google.com/auth/scopes', 'Apri Google Auth Platform'] },
  { id: 'piva', title: 'Apri la Partita IVA', detail: 'Serve per vendere. Con il commercialista: ditta individuale (forfettario se hai i requisiti) o società. Codice ATECO tipico 62.01 o 63.12. Se sei minorenne parlane prima con il commercialista.' },
  { id: 'pec', title: 'Attiva una PEC', detail: 'Obbligatoria per le imprese; va scritta nelle note legali.' },
  { id: 'fill', title: 'Compila i campi gialli delle pagine legali', detail: 'Indirizzo, Partita IVA, codice fiscale, PEC e nome del sistema di pagamento: mandali a Claude e li inserisce in Privacy, Termini, Note legali e Modulo di recesso.' },
  { id: 'payment', title: 'Scegli il sistema di pagamento', detail: 'Stripe (più controllo) oppure Paddle / Lemon Squeezy (gestiscono loro IVA europea e fatture: più semplice all\'inizio). Poi si collegano all\'app pagina prezzi, pagamento e disdetta.' },
  { id: 'prices', title: 'Decidi piani e prezzi', detail: 'Cosa resta gratis e cosa è a pagamento; mensile/annuale. I prezzi si mostrano IVA inclusa.' },
  { id: 'dpa-supabase', title: 'Accetta il DPA di Supabase', detail: 'Contratto sul trattamento dei dati (art. 28 GDPR): Supabase → Organization → Legal documents.', link: ['https://supabase.com/dashboard/org/_/documents', 'Apri Supabase'] },
  { id: 'dpa-vercel', title: 'Accetta il DPA di Vercel', detail: 'Pagina del Data Processing Addendum di Vercel.', link: ['https://vercel.com/legal/dpa', 'Apri Vercel DPA'] },
  { id: 'region', title: 'Controlla la regione del database', detail: 'Supabase → Project Settings → General: meglio una regione UE (es. Frankfurt). Se è negli USA va comunque bene, la privacy lo prevede.', link: [`https://supabase.com/dashboard/project/${PROJECT}/settings/general`, 'Apri impostazioni progetto'] },
  { id: 'lawyer', title: 'Fai rileggere Termini e Privacy', detail: 'Da un avvocato o dal commercialista prima del lancio (soprattutto parte fiscale e recesso).' },
  { id: 'iva', title: 'IVA sulle vendite online', detail: 'Clienti in altri Paesi UE: oltre 10.000 €/anno si applica l\'IVA del loro Paese (regime OSS). In Italia: fatture elettroniche o corrispettivi telematici. Paddle/Lemon Squeezy lo fanno per te.' },
];

const SCRIPTS: { id: string; title: string; when: string; sql: string }[] = [
  { id: 'schema', title: 'Base dati (schema.sql)', when: 'Già eseguito all\'inizio. Rieseguilo solo se Claude te lo chiede (aggiorna tabelle e permessi senza cancellare dati).', sql: schemaSql },
  { id: 'suggerimenti', title: 'Suggerimenti (suggerimenti.sql)', when: 'Da eseguire una volta: salva i messaggi di "Suggerisci una modifica".', sql: suggestionsSql },
  { id: 'account', title: 'Elimina account (account.sql)', when: 'Da eseguire una volta: permette agli utenti di cancellare il proprio account (GDPR).', sql: accountSql },
  { id: 'personalizzazioni', title: 'Personalizzazioni (personalizzazioni.sql)', when: 'Da eseguire una volta: richieste di funzioni su misura, approvazione e pacchetti.', sql: customSql },
  { id: 'progetti', title: 'Progetti di Performance (progetti.sql)', when: 'Da eseguire una volta: progetti, attività, note e link della sezione Performance. Si può rieseguire senza perdere dati.', sql: projectsSql },
  { id: 'condivisione', title: 'Condivisione progetti (progetti_condivisione.sql)', when: 'Da eseguire una volta, DOPO "Progetti di Performance": inviti per email, ruoli, uscire o togliere persone. Si può rieseguire.', sql: sharingSql },
  { id: 'newsletter', title: 'Newsletter (newsletter.sql)', when: 'Da eseguire una volta: mostra in Admin → Newsletter chi ha dato il consenso.', sql: newsletterSql },
  { id: 'business', title: 'MYND Business (business.sql + business_2.sql)', when: 'Solo per la sezione Business (account admin).', sql: `${businessSql}\n\n${business2Sql}` },
];

const DEPLOY = `cd ~/student-hub-
git pull origin ${BRANCH}
git push`;

const LINKS: [string, string, string][] = [
  ['Supabase · progetto', `https://supabase.com/dashboard/project/${PROJECT}`, 'Database, utenti, file'],
  ['Supabase · SQL Editor', `https://supabase.com/dashboard/project/${PROJECT}/sql/new`, 'Dove incollare gli script'],
  ['Supabase · utenti', `https://supabase.com/dashboard/project/${PROJECT}/auth/users`, 'Account registrati'],
  ['Vercel', 'https://vercel.com/dashboard', 'Pubblicazione del sito'],
  ['Google Auth Platform', 'https://console.cloud.google.com/auth/overview', 'Accesso con Google, verifica, permessi'],
  ['Google · credenziali', 'https://console.cloud.google.com/apis/credentials', 'Client OAuth e origini autorizzate'],
  ['Garante Privacy', 'https://www.garanteprivacy.it', 'Normativa e segnalazione data breach'],
  ['Stripe', 'https://stripe.com/it', 'Pagamenti'],
  ['Paddle', 'https://www.paddle.com', 'Pagamenti + IVA gestita'],
  ['Lemon Squeezy', 'https://www.lemonsqueezy.com', 'Pagamenti + IVA gestita'],
  ['myndspace.world', 'https://myndspace.world', 'Il sito'],
];

const LEGAL_PAGES: [string, string][] = [
  ['/privacy.html', 'Privacy'], ['/termini.html', 'Termini e condizioni'], ['/cookie.html', 'Cookie'],
  ['/note-legali.html', 'Note legali'], ['/recesso.html', 'Modulo di recesso'], ['/info.html', 'Cos\'è MYND'],
];

function readChecks(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CHECK_KEY) || '{}'); } catch { return {}; }
}

export default function AdminGuide({ darkMode }: { darkMode: boolean }) {
  const [checks, setChecks] = useState<Record<string, boolean>>(readChecks);
  const [openScript, setOpenScript] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const text = darkMode ? 'text-white' : 'text-gray-800';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const card = darkMode ? 'glass-card' : 'glass-card-light';
  const well = darkMode ? 'bg-white/5' : 'bg-black/[0.04]';

  const toggle = (id: string) => {
    const next = { ...checks, [id]: !checks[id] };
    setChecks(next);
    try { localStorage.setItem(CHECK_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const copy = async (id: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(id); setTimeout(() => setCopied(c => (c === id ? null : c)), 2000); } catch { /* not allowed */ }
  };
  const done = TODO.filter(t => checks[t.id]).length;

  const Section = ({ icon, title, children, note }: { icon: React.ReactNode; title: string; children: React.ReactNode; note?: string }) => (
    <section className={`${card} p-5 sm:p-6`}>
      <div className="flex items-center gap-2.5 mb-1">
        <span style={{ color: 'var(--brand-ring)' }}>{icon}</span>
        <h3 className={`text-lg font-semibold ${text}`}>{title}</h3>
      </div>
      {note && <p className={`text-sm mb-3 ${sub}`}>{note}</p>}
      <div className={note ? '' : 'mt-3'}>{children}</div>
    </section>
  );
  const CopyButton = ({ id, value, label = 'Copia' }: { id: string; value: string; label?: string }) => (
    <button onClick={() => copy(id, value)} className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 font-semibold flex-shrink-0"
      style={{ background: 'color-mix(in srgb, var(--brand-fill) 16%, transparent)', color: 'var(--brand-ring)' }}>
      {copied === id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied === id ? 'Copiato' : label}
    </button>
  );

  return (
    <div className="space-y-4">
      <Section icon={<ListChecks className="w-5 h-5" />} title={`Da fare per vendere · ${done}/${TODO.length}`}
        note="Spunta man mano: le spunte restano salvate in questo browser.">
        <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: 'var(--glass-well)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${(done / TODO.length) * 100}%`, background: 'var(--brand-fill)' }} />
        </div>
        <ul className="space-y-2">
          {TODO.map(t => (
            <li key={t.id} className={`flex gap-3 p-3 rounded-xl ${well}`}>
              <button onClick={() => toggle(t.id)} aria-pressed={!!checks[t.id]} aria-label={t.title}
                className="w-6 h-6 mt-0.5 rounded-md flex-shrink-0 flex items-center justify-center"
                style={checks[t.id] ? { background: 'var(--brand-fill)', color: 'var(--on-brand)' } : { boxShadow: 'inset 0 0 0 1.5px var(--border)' }}>
                {checks[t.id] && <Check className="w-4 h-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${text} ${checks[t.id] ? 'line-through opacity-60' : ''}`}>{t.title}</p>
                <p className={`text-sm mt-0.5 ${sub}`}>{t.detail}</p>
                {t.link && <a href={t.link[0]} target="_blank" rel="noopener" className="text-xs mt-1 inline-flex items-center gap-1" style={{ color: 'var(--brand-ring)' }}>{t.link[1]} <ExternalLink className="w-3 h-3" /></a>}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={<Rocket className="w-5 h-5" />} title="Mettere online le modifiche"
        note="Dopo ogni modifica fatta da Claude: apri il Terminale del Mac, incolla questi comandi e premi Invio.">
        <div className={`rounded-xl p-3 flex items-start justify-between gap-3 ${well}`}>
          <pre className={`text-sm font-mono whitespace-pre-wrap break-all ${text}`}>{DEPLOY}</pre>
          <CopyButton id="deploy" value={DEPLOY} />
        </div>
        <ul className={`text-sm mt-3 space-y-1 list-disc pl-5 ${sub}`}>
          <li>Se si apre una schermata strana (vim): scrivi <b className={text}>:wq</b> e premi Invio.</li>
          <li>Dopo un minuto ricarica il sito con <b className={text}>Cmd + Shift + R</b> per vedere la versione nuova.</li>
          <li>Non condividere mai password o chiavi segrete (es. la "service_role" di Supabase o il Client Secret di Google).</li>
        </ul>
      </Section>

      <Section icon={<Database className="w-5 h-5" />} title="Script Supabase"
        note="Supabase → SQL Editor → New query → incolla → Run. Se compare «Success. No rows returned» è fatto.">
        <a href={`https://supabase.com/dashboard/project/${PROJECT}/sql/new`} target="_blank" rel="noopener" className="text-sm inline-flex items-center gap-1 mb-3" style={{ color: 'var(--brand-ring)' }}>
          Apri l'SQL Editor <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <div className="space-y-2">
          {SCRIPTS.map(s => (
            <div key={s.id} className={`rounded-xl ${well}`}>
              <div className="flex items-center gap-3 p-3">
                <button onClick={() => setOpenScript(o => (o === s.id ? null : s.id))} className="flex-1 min-w-0 text-left">
                  <p className={`text-sm font-semibold flex items-center gap-1.5 ${text}`}>
                    <ChevronDown className={`w-4 h-4 transition-transform ${openScript === s.id ? 'rotate-180' : ''}`} /> {s.title}
                  </p>
                  <p className={`text-xs mt-0.5 ${sub}`}>{s.when}</p>
                </button>
                <CopyButton id={s.id} value={s.sql} label="Copia SQL" />
              </div>
              {openScript === s.id && (
                <pre className={`text-xs font-mono whitespace-pre-wrap max-h-72 overflow-auto mx-3 mb-3 p-3 rounded-lg ${darkMode ? 'bg-black/30 text-white/80' : 'bg-white text-gray-700'}`}>{s.sql}</pre>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<Mail className="w-5 h-5" />} title="Email con il codice (da fare una volta)"
        note="Chi si registra riceve un'email con solo un numero di 6 cifre: lo scrive in MYND ed è fatto. Nessun link da aprire.">
        <ol className={`text-sm space-y-2 list-decimal pl-5 mb-3 ${sub}`}>
          <li>Apri <a href={`https://supabase.com/dashboard/project/${PROJECT}/auth/templates`} target="_blank" rel="noopener" className="underline" style={{ color: 'var(--brand-ring)' }}>Supabase → Emails</a> e scegli <b className={text}>Confirm signup</b>.</li>
          <li>Copia l'<b className={text}>oggetto</b> qui sotto e incollalo in "Subject".</li>
          <li>Copia il <b className={text}>testo</b> qui sotto, cancella quello che c'è in "Message body" e incollalo. Premi <b className={text}>Save</b>.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <CopyButton id="email-subject" value={EMAIL_SUBJECT} label="Copia oggetto" />
          <CopyButton id="email-body" value={EMAIL_BODY} label="Copia testo" />
        </div>
        <p className={`text-sm mt-3 ${sub}`}>Per avere un codice corto: Supabase → Sign In / Providers → <b className={text}>Email</b> → <b className={text}>Email OTP Length = 6</b> (il minimo che Supabase consente) → Save.</p>
        <p className={`text-xs mt-2 ${sub}`}>Deve essere acceso anche "Confirm email" (Sign In / Providers → Email). Se le email non arrivano a tutti, serve il servizio email (SMTP): è nella lista qui sopra.</p>
      </Section>

      <Section icon={<Scale className="w-5 h-5" />} title="Documenti legali"
        note={`Versione attuale accettata dagli utenti: ${LEGAL_VERSION}. I campi in giallo nelle pagine vanno ancora completati.`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LEGAL_PAGES.map(([href, label]) => (
            <a key={href} href={href} target="_blank" rel="noopener" className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm ${well} ${text}`}>
              {label} <ExternalLink className="w-3.5 h-3.5 opacity-50" />
            </a>
          ))}
        </div>
        <ul className={`text-sm mt-3 space-y-1 list-disc pl-5 ${sub}`}>
          <li>Se cambi Termini o Privacy in modo importante, chiedi a Claude di <b className={text}>aumentare la versione</b>: tutti gli utenti dovranno riaccettarli al prossimo accesso.</li>
          <li>Recesso: 14 giorni dal primo acquisto con <b className={text}>rimborso completo</b> (punto 6 dei Termini).</li>
          <li>Abbonamenti: rinnovo automatico, disdetta quando vuoi, promemoria 7 giorni prima del rinnovo annuale (da attivare con i pagamenti).</li>
          <li>Età: account dai 14 anni (sotto con il genitore); acquisti solo maggiorenni o tramite genitore.</li>
        </ul>
      </Section>

      <Section icon={<ShieldCheck className="w-5 h-5" />} title="Privacy in pratica">
        <ul className={`text-sm space-y-2 list-disc pl-5 ${sub}`}>
          <li><b className={text}>Richieste degli utenti</b> (accesso, correzione, cancellazione…): rispondi entro <b className={text}>30 giorni</b>. Scaricare i dati ed eliminare l'account lo fanno da soli in "Privacy e dati".</li>
          <li><b className={text}>Se ti chiedono di cancellare un account</b> e lo script "Elimina account" non c'è ancora: Supabase → Authentication → Users → elimina l'utente (i suoi dati spariscono con lui).</li>
          <li><b className={text}>Data breach</b> (dati finiti in mano sbagliata, accesso non autorizzato): entro <b className={text}>72 ore</b> valuta la notifica al Garante e, se il rischio è alto, avvisa gli utenti. Annota tutto nel registro.</li>
          <li><b className={text}>Statistiche</b>: si registrano solo per chi ha premuto "Accetta" nel banner, quindi in "Statistiche" vedi solo una parte degli utenti.</li>
          <li><b className={text}>Registro dei trattamenti</b>: è nel progetto in docs/REGISTRO_TRATTAMENTI.md; aggiornalo (o chiedi a Claude) quando aggiungi funzioni che usano nuovi dati o nuovi fornitori.</li>
          <li><b className={text}>Fornitori</b> che trattano i dati: Supabase (database, file, email), Vercel (hosting), Google (accesso e Drive), il sistema di pagamento; i fornitori AI li sceglie l'utente con la sua chiave.</li>
        </ul>
      </Section>

      <Section icon={<Info className="w-5 h-5" />} title="Come funziona MYND (in breve)">
        <ul className={`text-sm space-y-2 list-disc pl-5 ${sub}`}>
          <li><b className={text}>Account admin</b>: flowbase.service@gmail.com. Solo questo account vede Admin, Performance e Business.</li>
          <li><b className={text}>Nuovi utenti</b>: se l'approvazione è attiva restano "In attesa" finché non li approvi in Admin → Utenti.</li>
          <li><b className={text}>Performance</b>: progetti personali o di lavoro, con attività, sottoattività, fasi, scadenze, note e link. "Crea con MYND AI" trasforma una descrizione in un piano da modificare; dentro il progetto MYND AI risponde sui dati reali e propone modifiche che applichi solo se vuoi. Per ora crea progetti solo l'account admin; chi viene invitato a un progetto vede Performance solo con i progetti condivisi con lui.</li>
          <li><b className={text}>Progetti condivisi</b>: nel progetto → Persone, scrivi l'email e scegli cosa può fare (Responsabile, Membro/Partecipante, Solo lettura). Se ha un account MYND l'invito gli compare nel menu del cerchio in alto a destra; se no vedi "Utente non trovato" con il link da mandargli, e l'invito lo aspetta finché si registra con quella email. Le modifiche degli altri arrivano da sole ogni 30 secondi.</li>
          <li><b className={text}>Suggerimenti</b>: arrivano in Admin → Suggerimenti; il pallino arancione sul menu ti avvisa dei nuovi.</li>
          <li><b className={text}>AI</b>: ogni utente collega la propria chiave (Gemini gratis consigliata) nella Guida Studio AI; i costi AI non sono tuoi.</li>
          <li><b className={text}>Assistente MYND</b> (Home → Personalizza → Assistente MYND): chat con il modello automatico che sistema l'app su richiesta (pannelli, menu, nomi, versioni, materie, impegni anche ripetuti, note) e crea funzioni nuove: prima con i <b className={text}>blocchi MYND</b> (liste, contatori, abitudini, conti alla rovescia, avanzamenti, note, link, impegni filtrati), e quando non bastano con le <b className={text}>mini-app</b>. Ogni modifica si può annullare.</li>
          <li><b className={text}>Personalizzazioni su misura (a pacchetti)</b>: per le funzioni nuove (flashcard, quiz, calcolatori, sezioni rifatte, perfino la Home intera) lo studente parla con l'Assistente MYND, che fa le domande giuste, riassume l'idea e chiede conferma. Quando conferma, la richiesta parte da sola (usa 1 personalizzazione del suo pacchetto) e lo studente legge "la modifica verrà fatta il prima possibile". La richiesta arriva in <b className={text}>Admin → Personalizzazioni</b> con un testo già pronto per Claude.</li>
          <li><b className={text}>Come la approvi</b>: apri <b className={text}>Admin → Personalizzazioni</b> e lascia la pagina aperta: l'AI (quella scelta nella Guida Studio AI, poi quelle gratuite) <b className={text}>prepara da sola</b> ogni funzione nuova, la controlla (controllo automatico + analisi AI) e apre l'<b className={text}>Anteprima</b> con i dati della demo. Tu guardi e tocchi <b className={text}>Approva</b>: compare da sola nella MYND di quello studente (solo lui) appena apre l'app. Se vuoi cambiare qualcosa scrivilo nel riquadro e tocca <b className={text}>"Correggi con l'AI"</b>; "Rifai da capo" la riscrive; "Copia per Claude" resta come alternativa. "Rifiuta" con il motivo ridà la personalizzazione allo studente.</li>
          <li><b className={text}>Pacchetti</b>: ogni account ha <b className={text}>2 personalizzazioni incluse</b>. Dopo il pagamento, in fondo ad Admin → Personalizzazioni scrivi l'email del cliente e quante personalizzazioni aggiungere (es. Base +2). Chi non ne ha più vede "Richiedi un pacchetto": la richiesta ti arriva in Suggerimenti.</li>
          <li><b className={text}>Tutto dove vuole</b>: nella sua versione lo studente può (sempre parlando con l'AI) spostare blocchi e mini-app, riordinare il menu, nascondere e rinominare sezioni. Su una sezione sostituita c'è il pulsante "Originale" per tornare a quella di MYND (la sua versione resta salvata).</li>
          <li><b className={text}>La MYND di base resta pulita</b>: la prima volta che lo studente crea qualcosa, l'AI crea e attiva la versione "La mia MYND" e mette lì le creazioni; può tornare alla MYND di base quando vuole da "Le tue MYND".</li>
          <li><b className={text}>Sicurezza delle mini-app</b>: girano in una "stanza chiusa" (iframe sandbox senza stessa origine): non vedono la sessione, i cookie, le chiavi né il database, non possono collegarsi a internet né aprire altre pagine. Salvano solo i propri dati (massimo ~200 KB, dentro i dati dello studente) e leggono materie, impegni e voti solo se lo studente lascia "Dati: sì". Con "Modifica: sì" possono anche <b className={text}>aggiungere</b> tempo di studio, impegni, voti e note e spuntare impegni (così il tempo di un timer creato dall'AI conta nelle statistiche): ogni dato è controllato da MYND, niente si può cancellare e ci sono al massimo 30 modifiche al minuto. Le ultime 5 versioni del codice si possono ripristinare dal pulsante cronologia; se una mini-app dà errore compare "Chiedi all'AI di correggerla".</li>
          <li><b className={text}>Richieste che servono davvero codice nuovo</b> (cose tra più persone, email, pagamenti, siti esterni, cambiare le sezioni base): l'assistente le manda da solo in Admin → Suggerimenti (iniziano con "[Assistente MYND]"): passale a Claude per farle davvero.</li>
          <li><b className={text}>Le tue MYND</b>: gli utenti possono creare versioni adattate (università, test…) da Home → Personalizza.</li>
          <li><b className={text}>Demo</b>: "Dai un'occhiata, senza account" mostra l'app con dati finti, niente viene salvato.</li>
          <li><b className={text}>Verifica email</b>: chi si registra con email e password entra solo dopo aver scritto il codice ricevuto; se prova ad accedere senza averlo fatto, riceve un nuovo codice.</li>
          <li><b className={text}>Newsletter</b>: casella facoltativa alla registrazione e interruttore in "Privacy e dati"; gli iscritti (solo email verificate) sono in Admin → Newsletter, con CSV da importare in Brevo o Mailchimp.</li>
        </ul>
      </Section>

      <Section icon={<Link2 className="w-5 h-5" />} title="Link utili">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {LINKS.map(([label, href, note]) => (
            <a key={href} href={href} target="_blank" rel="noopener" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${well}`}>
              <span className="flex-1 min-w-0">
                <span className={`block text-sm font-medium ${text}`}>{label}</span>
                <span className={`block text-xs ${sub}`}>{note}</span>
              </span>
              <ExternalLink className={`w-4 h-4 flex-shrink-0 ${sub}`} />
            </a>
          ))}
        </div>
        <div className={`mt-3 text-xs space-y-1 ${sub}`}>
          <p>Progetto Supabase: <b className={text}>{PROJECT}</b> · Dominio: <b className={text}>myndspace.world</b></p>
          <p>Google Client ID: <b className={`${text} break-all`}>1048106841609-ipbbd7vkt38j9brvdlshubh5tuesgsb4.apps.googleusercontent.com</b></p>
          <p>Ramo del codice: <b className={`${text} break-all`}>{BRANCH}</b> · Repository: seba5-hun/student-hub-</p>
        </div>
      </Section>
    </div>
  );
}
