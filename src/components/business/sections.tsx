import type { ComponentType } from 'react';
import { AlertTriangle, Inbox, Clock, Wallet, FolderKanban, Users, Building2, CalendarRange, CalendarDays, Sparkles, FileSignature, ListChecks, Gauge, UserCheck, Receipt, Landmark, TrendingUp, Search, FileText, Lightbulb, Workflow, History, MessageCircle, Undo2, ArrowRight } from 'lucide-react';

export type BusinessTab = 'oggi' | 'agenda' | 'clienti' | 'progetti' | 'team' | 'finanza' | 'documenti' | 'insights' | 'automazioni' | 'coach';

interface Panel {
  id?: string;
  icon: typeof Inbox;
  title: string;
  text: string;      // what the panel will show
  empty: string;     // what it says while there is nothing yet
  wide?: boolean;
  link?: BusinessTab;
}
interface PageDef { title: string; lead: string; phase: number; panels: Panel[] }

// Phase 1: the structure of every section, with the panels it will contain. Each panel
// already says what it will show; the data arrives in the following phases.
const PAGES: Record<BusinessTab, PageDef> = {
  oggi: {
    title: 'Oggi.', phase: 4,
    lead: "Cosa succede nella tua azienda oggi, e cosa conta davvero.",
    panels: [
      { icon: AlertTriangle, title: 'Attenzione', wide: true, text: 'Al massimo cinque punti, in ordine di priorità, ognuno con il suo perché.', empty: 'Niente che richieda la tua attenzione.' },
      { id: 'da-confermare', icon: Inbox, title: 'Da confermare', text: "Fatture, appuntamenti e scadenze trovati dall'AI: confermi, modifichi o scarti con un tocco.", empty: 'Nessuna proposta in attesa.' },
      { icon: Clock, title: 'La giornata', text: 'Riunioni, appuntamenti, consegne e pagamenti di oggi su una linea del tempo.', empty: 'Nessun evento oggi.', link: 'agenda' },
      { icon: Wallet, title: 'Cassa', text: 'Saldo, da incassare, da pagare nei prossimi 30 giorni, fatture scadute.', empty: 'Nessun dato finanziario ancora.', link: 'finanza' },
      { icon: FolderKanban, title: 'Progetti', text: 'La salute di ogni progetto attivo, da 0 a 100.', empty: 'Nessun progetto attivo.', link: 'progetti' },
      { icon: Users, title: 'Team', text: 'Il carico di lavoro di oggi, persona per persona.', empty: 'Il team è vuoto.', link: 'team' },
      { icon: Building2, title: 'Clienti', text: 'Rinnovi, obblighi e diritti contrattuali in scadenza.', empty: 'Nessuna scadenza dei clienti.', link: 'clienti' },
      { icon: CalendarRange, title: 'Prossimi giorni', text: "Un'anteprima della settimana.", empty: 'Settimana libera.', link: 'agenda' },
    ],
  },
  agenda: {
    title: 'Agenda.', phase: 4,
    lead: "Il calendario dell'azienda e tutto quello che arriva: domani, questa settimana, questo mese.",
    panels: [
      { icon: CalendarDays, title: 'Calendario', wide: true, text: 'Giorno, settimana e mese: riunioni, appuntamenti, consegne, scadenze di contratti e pagamenti.', empty: 'Nessun evento in calendario.' },
      { icon: Clock, title: 'Prossimamente', text: 'Prossime 24 ore, 7 giorni, 30 giorni e più avanti.', empty: 'Niente in arrivo.' },
      { icon: Sparkles, title: 'Scadenze scoperte', text: "Impegni trovati dall'AI in contratti, fatture ed email inoltrate. Sempre da confermare.", empty: 'Nessuna scadenza scoperta.' },
      { icon: CalendarRange, title: 'Calendari esterni', text: 'Un link per vedere la tua Agenda su Google, Apple o Outlook Calendar.', empty: 'Disponibile con i primi eventi.' },
    ],
  },
  clienti: {
    title: 'Clienti.', phase: 3,
    lead: 'Clienti e fornitori, i loro contratti, quello che dobbiamo a loro e quello che spetta a loro.',
    panels: [
      { icon: Building2, title: 'Anagrafica', wide: true, text: 'Ragione sociale, P.IVA, PEC, codice SDI, referenti, importanza, termini di pagamento.', empty: 'Nessun cliente ancora.' },
      { icon: FileSignature, title: 'Contratti', text: 'Date, rinnovo tacito, preavviso di disdetta, valore e documento collegato.', empty: 'Nessun contratto.' },
      { icon: ListChecks, title: 'Obblighi e diritti', text: 'Letti dal contratto e confermati da te: chi deve cosa, quando e ogni quanto. Dagli obblighi nascono gli appuntamenti proposti.', empty: 'Nessun obbligo registrato.' },
      { icon: History, title: 'Storico', text: 'Progetti, fatture, pagamenti, documenti, appuntamenti e note di ogni cliente.', empty: 'Ancora nessuno storico.' },
    ],
  },
  progetti: {
    title: 'Progetti.', phase: 3,
    lead: 'Obiettivi, persone, scadenze e soldi di ogni progetto, con un punteggio di salute che spiega cosa non va.',
    panels: [
      { icon: FolderKanban, title: 'I tuoi progetti', wide: true, text: 'Cliente, capo progetto, team, scadenza, budget, tappe e stato.', empty: 'Nessun progetto ancora.' },
      { icon: ListChecks, title: 'Compiti', text: 'Responsabile, scadenza, durata stimata, importanza e dipendenze.', empty: 'Nessun compito.' },
      { icon: Gauge, title: 'Salute del progetto', text: 'Da 0 a 100: tempi, budget, team e tappe, con il motivo di ogni avviso.', empty: 'Disponibile con il primo progetto.' },
      { icon: UserCheck, title: 'Chi vede cosa', text: 'Il capo progetto decide cosa vede ogni membro del team.', empty: 'Disponibile con il primo progetto.' },
    ],
  },
  team: {
    title: 'Team.', phase: 3,
    lead: 'Le persone, cosa sanno fare, quanto sono libere e cosa devono fare oggi.',
    panels: [
      { icon: Users, title: 'Persone', wide: true, text: 'Ruolo, reparto, competenze con livello, orari, disponibilità, progetti e obiettivi.', empty: 'Ci sei solo tu, per ora.' },
      { icon: ListChecks, title: 'I compiti di oggi', text: 'Per ognuno, ordinati da soli per urgenza, importanza, scadenza e carico.', empty: 'Nessun compito per oggi.' },
      { icon: Sparkles, title: 'Chi è più adatto', text: 'Per ogni nuovo compito, la persona consigliata con i motivi e le alternative. Decidi tu.', empty: 'Disponibile con i primi compiti.' },
      { icon: Gauge, title: 'Carico di lavoro', text: 'Chi è libero e chi è sovraccarico, con i suggerimenti per riequilibrare.', empty: 'Nessun carico da mostrare.' },
    ],
  },
  finanza: {
    title: 'Finanza.', phase: 5,
    lead: "Entrate, uscite e cassa. Quello che è reale è distinto da quello che è stimato.",
    panels: [
      { icon: TrendingUp, title: 'Panoramica', wide: true, text: 'Ricavi, costi, margine, saldo, da incassare, da pagare e andamento mese per mese.', empty: 'Nessun dato ancora.' },
      { icon: Receipt, title: 'Fatture', text: "File XML dello SDI letti in modo esatto; PDF e foto letti dall'AI. Ogni fattura nuova va confermata.", empty: 'Nessuna fattura.' },
      { icon: Landmark, title: 'Movimenti bancari', text: "Importa il file Excel o CSV dell'home banking: MYND abbina i movimenti alle fatture.", empty: 'Nessun movimento importato.' },
      { icon: Wallet, title: 'Previsione di cassa', text: 'A 30, 60 e 90 giorni, con ogni numero etichettato: reale, importato, stimato o previsione.', empty: 'Servono fatture e movimenti.' },
    ],
  },
  documenti: {
    title: 'Documenti.', phase: 5,
    lead: "L'archivio dell'azienda: lo cerchi, lo interroghi, e ogni risposta dice da quale documento viene.",
    panels: [
      { icon: FileText, title: 'Archivio', wide: true, text: 'Contratti, offerte, preventivi, procedure e documenti di clienti e fornitori, collegati a clienti e progetti.', empty: 'Nessun documento.' },
      { icon: Search, title: "Chiedi all'archivio", text: '“Quali contratti scadono nei prossimi 90 giorni?” La risposta cita il documento e il punto.', empty: 'Disponibile con i primi documenti.' },
      { icon: UserCheck, title: 'Permessi', text: 'Ogni documento può essere riservato a certe persone o a certi progetti.', empty: 'Disponibile con i primi documenti.' },
    ],
  },
  insights: {
    title: 'Insights.', phase: 8,
    lead: 'Poche analisi, quelle che contano, ognuna con il suo perché.',
    panels: [
      { icon: Lightbulb, title: 'Cosa sta cambiando', wide: true, text: 'Esempio: “3 clienti fanno il 68% del fatturato: se ne perdi uno, il fatturato scende di almeno il 20%”.', empty: 'Servono qualche settimana di dati.' },
      { icon: TrendingUp, title: 'Indicatori', text: 'Margine, cassa, puntualità, carico del team: solo quelli utili alla tua azienda.', empty: 'Nessun indicatore ancora.' },
    ],
  },
  automazioni: {
    title: 'Automazioni.', phase: 8,
    lead: 'Quando succede qualcosa, MYND fa il passo successivo. Le azioni importanti chiedono sempre conferma.',
    panels: [
      { icon: Workflow, title: 'Le tue regole', wide: true, text: 'Quando → se → allora. Esempio: quando arriva una fattura → leggila → crea la scadenza → avvisa il responsabile.', empty: 'Nessuna regola attiva.' },
      { icon: Sparkles, title: 'Modelli pronti', text: 'Fattura arrivata, appuntamento nell’email, progetto oltre il budget, contratto in scadenza, carico eccessivo.', empty: 'Disponibili con le prime regole.' },
      { icon: History, title: 'Storico', text: 'Ogni volta che una regola è partita: cosa ha fatto e cosa ha cambiato.', empty: 'Nessuna esecuzione.' },
    ],
  },
  coach: {
    title: 'Coach.', phase: 7,
    lead: "L'AI che conosce la tua azienda. Risponde, propone un piano e lo applica solo se lo decidi tu.",
    panels: [
      { icon: MessageCircle, title: 'Chiedi', wide: true, text: '“Cosa devo fare oggi?” · “Perché il progetto X è in ritardo?” · “Quanto dobbiamo pagare questo mese?” · “Organizza la prossima settimana.”', empty: 'Il Coach arriva quando ci sono i primi dati.' },
      { icon: ListChecks, title: 'Piani applicabili', text: 'Ogni proposta ha i pulsanti Applica e Annulla. Niente cambia senza di te.', empty: 'Nessun piano ancora.' },
      { icon: Undo2, title: 'Registro', text: "Ogni modifica fatta dall'AI resta tracciata: cosa, quando, prima e dopo.", empty: 'Nessuna modifica.' },
    ],
  },
};

function SectionPage({ def, onOpen }: { def: PageDef; onOpen: (tab: BusinessTab) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[34px] leading-[1.1] font-bold tracking-[-0.035em]" style={{ color: 'var(--text)' }}>{def.title}</h2>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{def.lead}</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 md:grid-cols-2">
        {def.panels.map(p => (
          <section key={p.title} id={p.id} className={`glass-card p-5 flex flex-col gap-3 ${p.wide ? 'md:col-span-2' : ''}`}>
            <div className="flex items-center gap-2.5">
              <p.icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
              <h3 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>{p.title}</h3>
              {p.link && (
                <button onClick={() => onOpen(p.link!)} className="w-9 h-9 -mr-2 -my-2 flex items-center justify-center rounded-full hover:bg-white/5"
                  aria-label={`Apri ${p.title}`} style={{ color: 'var(--text-muted)' }}><ArrowRight className="w-4 h-4" /></button>
              )}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{p.text}</p>
            <div className="mt-auto rounded-2xl px-4 py-3.5 text-sm" style={{ background: 'var(--glass-well)', color: 'var(--text-subtle)' }}>{p.empty}</div>
          </section>
        ))}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Struttura pronta · i dati arrivano nella fase {def.phase}</p>
    </div>
  );
}

export const SECTION_PAGES = Object.fromEntries(
  (Object.keys(PAGES) as BusinessTab[]).map(id => [id, ({ onOpen }: { onOpen: (tab: BusinessTab) => void }) => <SectionPage def={PAGES[id]} onOpen={onOpen} />]),
) as Record<BusinessTab, ComponentType<{ onOpen: (tab: BusinessTab) => void }>>;
