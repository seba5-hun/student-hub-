# MYND Business: piano d'azione

Stato: **bozza da approvare**. Nessuna riga di codice dell'app è stata modificata.
Questo documento sostituisce il prompt "MYND — Business Space" e tiene conto delle decisioni prese in chat.

> **Aggiornamento (8 ottobre).** Queste decisioni prevalgono sul resto del documento:
> - **Tre prodotti separati, ognuno con il proprio login:**
>   - MYND Student è il sito attuale (`myndspace.world`);
>   - MYND Business è un'**app a parte** (cartella `business/`, progetto Vercel e database Supabase propri, indirizzo tipo `business.myndspace.world`);
>   - Performance per ora resta dov'è e verrà separata più avanti.
>
>   Niente selettore di spazio: il logo resta quello.
> - **Business e Performance sono accessibili solo all'account admin** `flowbase.service@gmail.com`, con il controllo fatto anche nel database, non solo nell'app.
> - **Nomi delle sezioni** confermati (modificabili in seguito).
> - **AI:** durante lo sviluppo si usano le stesse AI gratuite di Student (Gemini, OpenRouter, Groq), scelte con lo stesso selettore. Il codice resta indipendente dal fornitore, così prima di vendere si passa a un'AI con contratto che non usa i dati (vedi 9).
> - **Email in arrivo:** Cloudflare Email Routing (fase 6, con guida passo passo).
> - **Azienda di prova:** l'azienda di Seba, con un team in cui l'unico membro è lui.
> - **Sviluppo senza toccare il sito:** Business si sviluppa nella sua cartella e non entra nella build del sito attuale. Sarà pubblicato su un indirizzo proprio solo quando lo decidi.

---

## 0. Decisioni già prese

| Tema | Decisione |
|---|---|
| Lingua | Tutto in italiano. Restano in inglese solo i nomi che suonano meglio: **Team**, **Insights**, **Coach**. |
| Clienti | Nuova sezione **Clienti** con anagrafica, contratti, **obblighi e diritti contrattuali**. Da qui il Coach o il responsabile fissano gli appuntamenti. |
| Cose da confermare | Nessuna sezione a parte: un pannello **Da confermare** dentro **Oggi** più l'icona campanella in alto (con il numero). Stessa linea di Student. |
| Oggi | È la **Home panoramica** di tutta l'azienda, personalizzabile come la Home di Student. |
| Calendario | Nuova sezione **Agenda**, che assorbe anche "Next" (prossime 24 ore / 7 giorni / 30 giorni / più avanti). |
| Ordine di lavoro | Riordinato in fasi semplici. Sicurezza e versione mobile si fanno **in ogni fase**, non alla fine. |
| Visibilità | Il titolare vede tutto e può **togliere le sezioni** che non usa. Il **capo di ogni progetto** decide cosa vede ogni dipendente di quel progetto. |
| Email | Niente collegamento diretto a Gmail. Le fatture e i documenti si **caricano** oppure si **inoltrano a un indirizzo MYND** che l'app legge. |
| Server e database | Si creano quando servono, partendo dai piani gratuiti. |
| Abbonamenti | Si fanno quando MYND Business andrà sul mercato. |

Scelte predefinite che propongo (da confermare, sezione 13):
- **un solo account MYND** con un selettore di spazio (Student / Business / Performance);
- **Performance resta visibile solo al tuo account**, come oggi.

---

## 1. Cosa ho trovato (analisi dell'app attuale)

- **Tecnologia:** React 18 + TypeScript + Vite + Tailwind v4, pubblicata su Vercel (piano Hobby), PWA installabile su iPhone.
- **Navigazione:** non c'è un router. La sezione aperta è uno stato in `App.tsx` (`currentSection`) e il menu sta in `Layout.tsx`. `react-router-dom` è installato ma **non usato**. Le sezioni sono caricate a parte (lazy) e precaricate dopo il login.
- **Login:** Supabase Auth (email + password, conferma via email, recupero password). Tabella `profiles` con stato `pending/approved`: ogni nuovo account va approvato.
- **Ruoli:** esiste solo "sviluppatore", riconosciuto dall'email (`isDeveloper`, più la funzione SQL `is_developer()`). Performance e Admin sono visibili solo a quell'account.
- **Dati:**
  - tutti i dati di Student e Performance di un utente stanno in **un'unica riga JSON** (`user_data.data`), salvata intera a ogni modifica (con un ritardo di 800 ms) e sincronizzata ogni 30 secondi;
  - le chat della Guida AI sono in una tabella `chats` separata;
  - i file dell'Archivio sono nel bucket privato `archive`, con una cartella per utente;
  - la sicurezza (RLS) è per singolo utente: ognuno vede solo le proprie righe.
- **AI:** le chiamate partono **dal browser** con la chiave dell'utente salvata nel dispositivo (Gemini gratuito, OpenRouter, Groq). C'è già una ricerca nei documenti per parole chiave (`lib/retrieval.ts`) e un Coach che propone un piano, con "Applica" e "Annulla" (`MindsetCoach`).
- **Grafica:** token in `src/tokens.css` (Lime su Grafite, Liquid Glass) e classi riutilizzabili (`glass-card`, `glass-float`, `glass-panel`, `btn-primary`, `input-glass`). Componenti riutilizzabili: `Logo`, `Dialog`, `ModelPicker`, `ScoreRing`, `Pill`, `Section`, la Home personalizzabile e la barra flottante in basso di Performance.

**Conseguenza principale:** per una sola persona la riga JSON unica va benissimo, ma non funziona per un'azienda. Con più persone che modificano insieme, l'ultimo salvataggio cancellerebbe quello degli altri, e non si potrebbe mostrare a ciascuno solo ciò che gli spetta. Per questo **Business userà tabelle vere**. Student e Performance restano esattamente come sono.

---

## 2. Architettura: tre spazi, un'app

```
MYND (un account, un login)
├── Student      → come oggi (riga JSON personale)
├── Performance  → come oggi (dentro la riga JSON, solo il tuo account)
└── Business     → nuovo (tabelle per azienda, permessi per ruolo e per progetto)
```

- **Come si cambia spazio:** si tocca il logo MYND in alto e si apre un piccolo menu "Student · Business · Performance". Ogni spazio ha il suo menu e la sua Home, e l'app ricorda l'ultimo spazio usato. Uno spazio compare solo se l'utente ha accesso: Business solo se fa parte di almeno un'azienda.
- **Dati condivisi tra gli spazi:** account, nome, tema chiaro/scuro.
- **Dati separati:** tutto il resto. I dati di Business appartengono **all'azienda**, non alla persona, e non si mescolano mai con Student.
- **Più aziende:** un utente può far parte di più aziende (per esempio un consulente), con un selettore dell'azienda dentro Business.
- **Codice:** Business vive in una cartella sua (`src/business/`) caricata solo quando serve, così Student non diventa più lento. Riusa i componenti grafici esistenti.

---

## 3. Mappa: attuale → nuovo

| Oggi | Cosa succede |
|---|---|
| Sezioni Student (Home, Impegni, Voti, Timer, Archivio, Cosa studiare, Calendario, Guida AI) | **Restano identiche**, dentro lo spazio Student |
| Performance (Oggi, Piano, Focus, Andamento, Coach) | **Resta identica**, diventa lo spazio Performance |
| Admin (approvazione utenti) | Resta. Nella fase 1 diventa anche il posto dove abilitare le aziende |
| Menu laterale / `Layout.tsx` | Si **estende** con il selettore di spazio; ogni spazio passa la sua lista di sezioni |
| Home personalizzabile di Student | Il meccanismo dei pannelli (mostra/nascondi/riordina) viene **riusato** per Oggi di Business |
| Coach di Performance (proposta → Applica → Annulla) | Lo **schema** viene riusato per il Coach di Business, con una logica nuova lato server |
| Ricerca nei documenti (`retrieval.ts`) | Riusata come base, poi potenziata con la ricerca per significato (fase 4) |
| `isDeveloper` basato sull'email | Resta per Admin e Performance. Business usa i ruoli dell'azienda |
| Tutto ciò che riguarda Business | **Nuovo** |
| Cose da eliminare | **Nessuna** |

---

## 4. Navigazione di MYND Business

| # | Sezione | A cosa serve |
|---|---|---|
| 1 | **Oggi.** | Home panoramica: cosa richiede attenzione, cose da confermare, la giornata, cassa, progetti, team, clienti |
| 2 | **Agenda.** | Calendario + "prossimamente" (24 ore / 7 giorni / 30 giorni / più avanti) + scadenze scoperte dall'AI |
| 3 | **Clienti.** | Clienti e fornitori, referenti, contratti, obblighi e diritti, storico |
| 4 | **Progetti.** | Progetti con compiti, tappe, budget, salute del progetto |
| 5 | **Team.** | Persone, competenze, disponibilità, carico di lavoro, "i miei compiti di oggi" |
| 6 | **Finanza.** | Fatture, incassi e pagamenti, movimenti, previsione di cassa |
| 7 | **Documenti.** | Archivio aziendale con ricerca e domande all'AI |
| 8 | **Insights.** | Poche analisi utili, ognuna spiegata ("perché conta") |
| 9 | **Automazioni.** | Regole "quando succede X → fai Y", con storico |
| 10 | **Coach.** | Chat con l'AI che conosce tutta l'azienda (nei limiti dei permessi) e propone piani applicabili |

Cosa cambia rispetto al prompt originale:
- **Next** è stato accorpato in **Agenda**: due sezioni sulle scadenze future si sovrapponevano.
- Sono state aggiunte **Clienti** e **Agenda**.
- **Da confermare** sta in Oggi e nella campanella, senza una sezione a parte.

**Desktop:** menu laterale fisso con tutte le sezioni, layout a più colonne.

**iPhone:** barra flottante in basso, come in Performance, con **Oggi · Agenda · Progetti · Coach · Altro** (Altro apre le altre sezioni). La campanella "Da confermare" è sempre in alto. Le schermate mobili vengono progettate apposta, non sono la versione desktop rimpicciolita.

**Personalizzazione, come in Student:**
- il **titolare** può nascondere intere sezioni per tutta l'azienda (per esempio niente Automazioni);
- ogni utente può riordinare e nascondere i pannelli della propria Oggi;
- un dipendente vede solo le sezioni che il suo ruolo e i suoi progetti gli permettono.

---

## 5. Le sezioni nel dettaglio

### 5.1 Oggi. (Home panoramica)
Pannelli, tutti spostabili e nascondibili:
- **Attenzione:** al massimo 5 punti, ordinati dal motore delle priorità, ognuno con il motivo. Esempi: "Fattura 1034 scaduta da 4 giorni", "Progetto Alfa a rischio per venerdì", "Marco ha 11 ore di lavoro oggi".
- **Da confermare:** fatture, eventi, scadenze e modifiche trovati dall'AI. Si confermano, modificano o scartano con un tocco, anche più insieme.
- **La giornata:** riunioni, appuntamenti, consegne, pagamenti e scadenze di oggi in una linea del tempo.
- **Cassa:** saldo, da incassare, da pagare nei prossimi 30 giorni, fatture scadute.
- **Progetti:** punteggio di salute dei progetti attivi.
- **Team:** carico di oggi per persona.
- **Clienti:** rinnovi, obblighi e diritti in scadenza.
- **Prossimi giorni:** anteprima dell'Agenda.

### 5.2 Agenda.
- Calendario (giorno, settimana, mese) con riunioni, appuntamenti, consegne, scadenze fiscali e di contratto, pagamenti.
- Vista **Prossimamente**: prossime 24 ore, 7 giorni, 30 giorni, più avanti.
- **Scadenze scoperte:** impegni trovati nei documenti e nelle email inoltrate (rinnovi, consegne, pagamenti), sempre da confermare.
- Ogni evento può essere collegato a cliente, progetto, compito e persone.
- **Collegamento ai calendari** (vedi 10.4): link di iscrizione per Google, Apple o Outlook Calendar e file .ics.

### 5.3 Clienti.
Per ogni cliente o fornitore:
- **Anagrafica:** ragione sociale, P.IVA/CF, indirizzo, PEC, codice SDI, settore, importanza (A/B/C), termini di pagamento.
- **Referenti:** nome, ruolo, email, telefono.
- **Contratti:** documento, inizio/fine, rinnovo tacito, preavviso di disdetta, valore.
- **Obblighi e diritti:** estratti dall'AI dal contratto e confermati da una persona. Ognuno dice:
  - chi lo deve (**noi** o **il cliente**) e se è un **obbligo** o un **diritto**;
  - la descrizione;
  - la ricorrenza (es. "manutenzione ogni 3 mesi") o la scadenza;
  - il punto esatto del contratto da cui viene.
- **Dagli obblighi agli appuntamenti:**
  1. Quando un obbligo si avvicina ("visita trimestrale entro il 15/11"), MYND propone un appuntamento.
  2. Sceglie l'orario libero della persona competente e del referente.
  3. La proposta compare in "Da confermare".
  4. Il responsabile (o il Coach, su richiesta) la conferma e l'appuntamento entra in Agenda.
- **Contatori dei diritti:** per esempio "2 revisioni gratuite: 1 usata". Quando il limite è superato, MYND avvisa che il lavoro extra è da fatturare.
- **Storico:** progetti, fatture, pagamenti (puntuale o in ritardo), documenti, appuntamenti, note.

### 5.4 Progetti.
- **Contenuto:** obiettivo, cliente, responsabile (capo progetto), membri, scadenza, budget, tappe, compiti, documenti, riunioni, ricavi e costi, rischi, stato.
- **Compiti:** responsabile, scadenza, durata stimata, importanza, dipendenze, stato.
- **Salute del progetto (0-100):** calcolata con regole trasparenti (tempi, budget, compiti in ritardo, carico del team, tappe a rischio). L'AI scrive solo la spiegazione. Esempio: "72/100 · Budget ok · Team ok · Tempi: attenzione · Tappa 3 a rischio".
- **Visibilità:** il capo progetto decide, per ogni membro, cosa vede del progetto (compiti, documenti, dati economici, cliente).

### 5.5 Team.
- **Profilo:** ruolo, reparto, responsabilità, competenze con livello, punti di forza, preferenze, orari e disponibilità, progetti, compiti, obiettivi, note.
  - La persona vede e può correggere il proprio profilo.
  - Le note del capo sono visibili solo a chi ha il permesso.
- **I miei compiti di oggi:** ordinati in automatico (urgenza, importanza, scadenza, durata, dipendenze, importanza del progetto, carico).
- **Smistamento compiti:** quando si crea un compito, MYND suggerisce chi è più adatto, con percentuale, motivi e alternative. Esempio: "Luca 94%: competenze social, progetto simile a marzo, 3 ore libere oggi · Giulia 88%: domani ha 3 ore in più".
  - Si basa su **competenze dichiarate, disponibilità e carico**.
  - **Non** valuta il rendimento delle persone (vedi 10.5).
  - Decide sempre una persona.

### 5.6 Finanza.
- **Panoramica:** ricavi, costi, margine, saldo, da incassare, da pagare, spese ricorrenti, andamento mensile, budget.
- **Fatture** (emesse e ricevute):
  - **XML dello SDI** (anche firmati .p7m): letti **senza AI**, in modo esatto e gratuito;
  - **PDF o foto:** lette dall'AI;
  - in entrambi i casi compaiono come "Nuova fattura trovata" da confermare.
- **Movimenti bancari:** import del file Excel/CSV della banca, con abbinamento automatico alle fatture (vedi 10.2).
- **Previsione di cassa a 30/60/90 giorni.** Ogni numero è etichettato come **reale**, **importato**, **stimato** o **previsione AI**, e le previsioni non vengono mai mostrate come fatti. Esempio: "⚠️ Possibile tensione di cassa tra 24 giorni".

### 5.7 Documenti.
- Archivio dell'azienda: contratti, offerte, preventivi, procedure, documenti di clienti e fornitori.
- Ogni documento si collega a cliente, progetto o contratto e ha permessi propri.
- Testo estratto e indicizzato. Le domande all'AI ("Quali contratti scadono nei prossimi 90 giorni?") ricevono una risposta **con il documento e il punto citati**.

### 5.8 Insights.
- Pochi indicatori, scelti per la singola azienda.
- Ogni insight ha una frase, un numero e "perché conta". Esempio: "3 clienti fanno il 68% del fatturato: se ne perdi uno, il fatturato scende di almeno il 20%".
- Nessuna parete di grafici.

### 5.9 Automazioni.
- Regole "**Quando** succede X → **se** Y → **fai** Z".
- Ogni regola si può creare, modificare, attivare, disattivare ed eliminare, e ha il suo **storico**.
- Per impostazione predefinita le azioni importanti finiscono in "Da confermare". L'esecuzione automatica si attiva solo su scelta esplicita, regola per regola.
- Modelli pronti:
  - fattura arrivata;
  - appuntamento nell'email;
  - progetto oltre il budget;
  - scadenza vicina;
  - carico eccessivo;
  - contratto in scadenza;
  - obbligo contrattuale ricorrente.

### 5.10 Coach.
- Chat con chat salvate, come in Student e Performance.
- Vede solo ciò che **l'utente che chiede** può vedere.
- Risponde a domande come:
  - "Cosa devo fare oggi?"
  - "Perché il progetto X è in ritardo?"
  - "Quanto dobbiamo pagare questo mese?"
  - "Organizza la prossima settimana."
- Propone piani con **[Applica]** e **[Annulla]**: le modifiche diventano effettive solo dopo l'applicazione e restano nel registro.

### 5.11 Motore delle priorità (trasversale)
- Un punteggio calcolato con regole chiare: urgenza, importanza, scadenza, impatto economico, importanza di cliente e progetto, dipendenze, rischio, carico.
- Ogni elemento ha la frase "È la tua priorità più alta perché…".
- Le regole sono codice prevedibile e gratuito; l'AI serve solo a spiegare e a gestire i casi ambigui.

### 5.12 Il "cervello aziendale"
- Non è un'AI magica: è il **database collegato**. Ogni fattura punta al cliente, ogni compito al progetto e alla persona, ogni evento al cliente e al progetto.
- Una singola email inoltrata può proporre più cose insieme (evento + modifica della scadenza del progetto + compito), tutte collegate.
- L'AI naviga questi collegamenti tramite funzioni (vedi 9).

---

## 6. Ruoli e permessi

| Ruolo | Cosa può fare |
|---|---|
| **Titolare** | Tutto, compresa la scelta delle sezioni attive, la fatturazione dell'abbonamento e l'eliminazione dell'azienda |
| **Admin** | Gestione operativa: persone, inviti, clienti, progetti. Finanza solo se abilitato |
| **Capo progetto** | Gestisce i suoi progetti e decide cosa vede ciascun membro |
| **Dipendente** | I suoi compiti, i progetti a cui partecipa (nei limiti decisi dal capo), il suo profilo |
| **Finanza** | Sezione Finanza e fatture, anche senza essere nei progetti |
| **Collaboratore esterno** | Solo i progetti, compiti e documenti condivisi esplicitamente con lui |

Tre livelli di permesso, che si sommano:
1. **Azienda:** sezioni attive e ruolo.
2. **Progetto:** membro sì/no e "cosa vede" per sezione del progetto.
3. **Singolo elemento:** documenti riservati o note private.

---

## 7. Database (nuove tabelle, solo per Business)

Tutte le tabelle hanno `org_id`, data di creazione e modifica, autore. Le eliminazioni sono "morbide": cestino per 30 giorni.

| Area | Tabelle |
|---|---|
| Aziende | `organizations` (nome, P.IVA, impostazioni, sezioni attive), `memberships` (utente, ruolo, reparto, stato), `invitations` |
| Team | `member_profiles` (competenze e livelli, disponibilità, orari, preferenze, obiettivi), `member_notes` (riservate) |
| Clienti | `counterparties` (cliente/fornitore, dati fiscali, importanza, termini di pagamento), `contacts` (referenti) |
| Contratti | `contracts` (date, rinnovo, preavviso, valore, documento), `contract_terms` (obbligo/diritto, chi, ricorrenza, scadenza, contatore, fonte nel testo, confermato) |
| Progetti | `projects`, `project_members` (ruolo e sezioni visibili), `milestones`, `tasks`, `task_dependencies` |
| Agenda | `events` (tipo, inizio/fine, partecipanti, cliente, progetto, origine), `calendar_feeds` (link segreti per l'iscrizione) |
| Documenti | `documents` (file nel bucket `business/{org_id}/…`, tipo, collegamenti, riservatezza), `document_chunks` (pezzi di testo + vettori per la ricerca, `pgvector`) |
| Finanza | `invoices` (emessa/ricevuta, numero, data, controparte, imponibile, IVA, totale, stato, origine XML/PDF/manuale), `invoice_installments` (scadenze e rate), `bank_accounts`, `transactions` (movimenti importati, categoria, fattura abbinata), `recurring_items` |
| Email in arrivo | `inbound_messages` (mittente, oggetto, allegati, azienda di destinazione, stato) |
| Da confermare | `proposals` (tipo, dati proposti, fonte, punteggio di sicurezza, stato, chi ha deciso) |
| Automazioni | `automations` (quando/se/allora, attiva), `automation_runs` (storico) |
| AI | `ai_conversations`, `ai_messages`, `ai_plans` (piano proposto, applicato, annullato) |
| Notifiche | `notifications`, `push_subscriptions` |
| Registro | `audit_log` (chi, quando, cosa, prima → dopo, umano o AI, piano di origine). Solo aggiunte: non si modifica né si cancella |

Spazio: il piano gratuito di Supabase (500 MB di database, 1 GB di file) basta per la fase di prova con una o due aziende.

---

## 8. Sicurezza

- **RLS su ogni tabella**, con funzioni come `is_member(org)`, `has_role(org, ruoli)` e `can_see_project(progetto, sezione)`. Un utente non può leggere nulla di un'azienda di cui non fa parte, neanche sbagliando una richiesta.
- **Finanza:** visibile solo a titolare, admin abilitati e ruolo Finanza.
- **Collaboratori esterni:** vedono solo gli elementi condivisi esplicitamente.
- **File:** bucket privato con cartella per azienda e link temporanei.
- **Chiavi segrete:** la chiave AI di Business e la chiave di servizio di Supabase vivono **solo sul server** (Supabase Edge Functions, secret), mai nel browser.
- **AI:** il contesto per l'AI viene costruito sul server **dopo** il filtro dei permessi di chi chiede. L'AI non riceve mai l'intero database.
- **Email in arrivo:** indirizzo per azienda con codice segreto, accettato solo dai mittenti registrati in quell'azienda. Gli allegati vengono controllati per tipo e dimensione.
- **Accesso:** verifica in due passaggi (MFA, gratuita in Supabase) consigliata per titolare e Finanza.
- **Registro delle attività** per ogni modifica importante, con distinzione tra umano e AI.
- **Export ed eliminazione:** export completo dei dati dell'azienda (JSON + file) ed eliminazione definitiva dopo 30 giorni dalla richiesta del titolare.
- **Test automatici** dei permessi a ogni fase: un utente di un'azienda prova a leggere i dati di un'altra e deve fallire.

---

## 9. Architettura AI

**Quattro livelli d'azione, sempre distinti:**
1. **Legge** (analizza)
2. **Suggerisce** (consiglia)
3. **Prepara** (crea una bozza in "Da confermare")
4. **Esegue** (modifica i dati)

L'esecuzione richiede conferma, salvo automazioni attivate esplicitamente, e si può sempre annullare.

**Come l'AI accede ai dati:**
- Il Coach **non riceve il database**. Riceve un riassunto della situazione di oggi e delle **funzioni** che può chiamare, per esempio:
  - `cerca_fatture(stato, periodo)`
  - `progetto(id)`
  - `compiti_di(persona)`
  - `obblighi_in_scadenza(giorni)`
  - `cerca_documenti(domanda)`
- Ogni funzione gira sul server con i permessi di chi chiede e restituisce solo i dati utili, già collegati (cliente → progetti → fatture).
- **Prima i calcoli, poi l'AI:** punteggi di priorità, salute dei progetti, scadenze e cassa sono calcoli deterministici (precisi, spiegabili, gratuiti). L'AI li spiega e gestisce testi e documenti.
- **Lettura dei documenti:**
  - XML SDI → lettura diretta;
  - PDF o foto → l'AI estrae i campi in un formato fisso (JSON);
  - in ogni caso il risultato va in "Da confermare" con l'indicazione di quanto è sicura l'estrazione.
- **Ricerca nei documenti:** testo diviso in pezzi + ricerca per significato (`pgvector`, gratuito in Supabase) + ricerca per parole chiave (già esistente). Le risposte citano sempre il documento.

**Quale AI (soluzione economica e legale):**
- **Student** resta com'è: AI gratuite con la chiave personale dell'utente.
- **Business** usa **Gemini con fatturazione attiva** (piano a pagamento), chiamato dal server:
  - con la fatturazione attiva Google **non usa i dati per addestrare i modelli**, requisito indispensabile per dati aziendali;
  - costo bassissimo: Flash-Lite per le estrazioni, Flash per il Coach, frazioni di centesimo per documento;
  - un **nuovo account Google Cloud riceve 300 $ di crediti gratuiti per 90 giorni**, che bastano per tutto lo sviluppo e le prove;
  - si imposta un **limite di spesa** mensile, così non ci sono sorprese.
- Il costo dell'AI verrà poi incluso nell'abbonamento.

---

## 10. Integrazioni e soluzioni ai problemi

### 10.1 Fatture italiane (SDI)
- Le fatture tra aziende passano dallo SDI in formato **XML (FatturaPA)**. MYND le legge **direttamente, senza AI**: fornitore/cliente, numero, data, imponibile, IVA, totale, scadenze di pagamento. Sono esatte e gratuite.
- **Come entrano:**
  1. caricamento manuale (anche più file o uno zip);
  2. inoltro all'indirizzo MYND;
  3. export periodico dal portale "Fatture e Corrispettivi" dell'Agenzia delle Entrate o dal programma di fatturazione, che di solito esporta gli XML in blocco.
- I **PDF di cortesia** e le foto delle ricevute vengono letti dall'AI.
- **In seguito** (facoltativo, quando ci sono clienti paganti): collegamento ai programmi di fatturazione più diffusi tramite le loro API.

### 10.2 Banca e cassa
- **Subito, gratis:** import del file **Excel/CSV dei movimenti** che ogni banca permette di scaricare dall'home banking. MYND riconosce le colonne, categorizza e abbina i movimenti alle fatture.
- **Saldo:** inserito a mano o preso dall'ultimo import.
- **In seguito:** collegamento automatico alla banca tramite un aggregatore PSD2 autorizzato, da scegliere confrontando i prezzi quando servirà (alcuni hanno piani economici per pochi conti).

### 10.3 Email (inoltro)
- Ogni azienda ha un indirizzo, per esempio `fatture-ab12cd@myndspace.world`. L'utente **inoltra** fatture, conferme di appuntamento, comunicazioni di clienti e fornitori.
- **Soluzione gratuita:** **Cloudflare Email Routing + Email Workers**, gratis per i volumi di MYND. Riceve l'email e la passa a una funzione Supabase che la analizza e crea le proposte in "Da confermare".
  - Richiede di spostare la gestione DNS di `myndspace.world` su Cloudflare: è gratis, richiede circa 15 minuti e il sito resta su Vercel.
- **Alternativa senza toccare i DNS:** un servizio di email in arrivo con piano gratuito limitato (per esempio Postmark Inbound).
- Niente accesso alle caselle dei clienti, quindi **nessuna verifica di sicurezza Google a pagamento**.

### 10.4 Calendario
- **Agenda interna** in MYND: gratuita, controllata da noi.
- **Verso i calendari esterni:** un **link di iscrizione** (.ics) per persona, che Google, Apple e Outlook Calendar leggono. È gratis e non richiede verifiche (nota: Google aggiorna i calendari iscritti ogni qualche ora). Più l'export .ics che esiste già in Student.
- **In seguito:** sincronizzazione completa con Google Calendar. Il permesso necessario richiede la verifica di Google, che è gratuita ma necessita di privacy policy e di un video dimostrativo.
- **Inviti ai clienti:** email con file .ics allegato (gratis, tramite il servizio email usato per le notifiche).

### 10.5 Aspetti legali (soluzioni pratiche)
Il fatto che MYND "consigli e non obblighi" aiuta, ma da solo non basta: l'AI Act europeo considera ad alto rischio anche i sistemi che **suggeriscono** come assegnare i compiti in base alle caratteristiche delle persone o che **valutano** le prestazioni dei lavoratori. La soluzione è progettare in modo da restare fuori da quel caso, senza perdere la funzione:
- lo smistamento si basa su **competenze dichiarate, disponibilità e carico**: dati di lavoro, non giudizi sulla persona;
- **nessun punteggio di rendimento** calcolato dall'AI sui dipendenti. Gli "obiettivi" li scrive il capo;
- nessun monitoraggio del comportamento (tempi di schermo, attività al minuto);
- ogni dipendente **vede il proprio profilo** e i motivi di ogni suggerimento che lo riguarda;
- decide sempre una persona, e c'è scritto.

Documenti da preparare prima della vendita (modelli standard):
- privacy policy di MYND Business;
- **accordo sul trattamento dei dati (DPA)**, in cui l'azienda cliente è titolare e MYND è responsabile;
- informativa che l'azienda dà ai dipendenti (lo Statuto dei Lavoratori, art. 4, chiede di informarli sull'uso degli strumenti di lavoro).

Consiglio **una consulenza di un'ora** con un avvocato o un consulente privacy prima di vendere: costa poco e mette al sicuro il prodotto.

**Dove stanno i dati:** verificare la regione del progetto Supabase; per i dati aziendali è preferibile l'Unione Europea.

### 10.6 Costi
- **Sviluppo e prove:** 0 €. Vercel Hobby e Supabase Free vanno bene, così come i 300 $ di crediti Google Cloud per l'AI e Cloudflare gratuito.
- **Quando si vende:**
  - Vercel Pro (circa 20 $ al mese): il piano Hobby non permette l'uso commerciale;
  - Supabase Pro (circa 25 $ al mese): niente pause e backup giornalieri;
  - AI a consumo.

  Tutto da coprire con gli abbonamenti.

---

## 11. Fasi di lavoro (ordine semplice e logico)

Alla fine di **ogni** fase controllo che Student e Performance funzionino come prima (con i test automatici già esistenti) e che la versione iPhone della parte nuova sia curata.

| Fase | Contenuto | Cosa vedi alla fine |
|---|---|---|
| **1. Fondamenta** | Selettore di spazio, struttura di Business con menu e Oggi vuota, nello stile MYND | Puoi passare da Student a Business e vedere lo scheletro |
| **2. Aziende e sicurezza** | Tabelle aziende, membri, ruoli, inviti, regole RLS, registro attività, test dei permessi | Crei la tua azienda e inviti un dipendente; ognuno vede solo il suo |
| **3. Clienti, Progetti, Team** | Anagrafiche, compiti, visibilità per progetto decisa dal capo, "i miei compiti di oggi" | Si lavora davvero con clienti, progetti e compiti |
| **4. Oggi e Agenda** | Home panoramica personalizzabile, calendario, "prossimamente", campanella "Da confermare", motore delle priorità | La Home ti dice cosa conta oggi |
| **5. Documenti e Finanza** | Caricamento file, lettura XML SDI, lettura PDF con AI (server), fatture, import movimenti banca, contratti → obblighi e diritti → appuntamenti proposti | Carichi una fattura o un contratto e MYND propone tutto il resto |
| **6. Email in arrivo** | Indirizzo di inoltro per azienda ed elaborazione in background | Inoltri un'email e ritrovi le proposte in "Da confermare" |
| **7. Coach e smistamento** | Coach con funzioni e permessi, piani con Applica/Annulla, suggerimento della persona giusta | Chiedi "organizza domani" e applichi il piano |
| **8. Insights, cassa, automazioni** | Previsione di cassa etichettata, insight spiegati, regole quando/se/allora con storico | MYND lavora anche da solo, entro le regole che decidi tu |
| **9. Collaudo finale** | Test di sicurezza completi, velocità, controllo legale, preparazione alla vendita | Pronto per i primi clienti |

---

## 12. Rischi

**Tecnici:**
- **Dimensione del progetto:** è molto grande. Le fasi servono proprio a consegnare pezzi che funzionano davvero, uno alla volta.
- **Errori nei permessi:** un errore esporrebbe dati di un'azienda a un'altra. Si mitiga con regole nel database (non nell'app) e con test automatici a ogni fase.
- **Errori dell'AI nell'estrarre dati:** si mitigano con XML letto senza AI, conferma obbligatoria e indicazione di quanto l'estrazione è sicura.
- **Limiti dei piani gratuiti:** vanno bene per le prove; prima della vendita si passa ai piani Pro.
- **`App.tsx` è già molto grande:** Business va in un modulo separato e caricato solo quando serve, così Student non rallenta.
- **Notifiche push su iPhone:** funzionano solo con l'app aggiunta alla schermata Home (iOS 16.4 o successivo) e richiedono il server. Per questo arrivano dalla fase 4 in poi.

**Di esperienza d'uso:**
- **Troppe sezioni:** si risolve con le sezioni nascondibili, la barra in basso con 5 voci e i ruoli che mostrano solo il necessario.
- **Troppe cose da confermare:** conferma multipla, regole "conferma sempre questo tipo" e raggruppamento per fonte.
- **Confusione tra spazi:** il nome dello spazio è sempre visibile accanto al logo e c'è un piccolo segno di colore per spazio.
- **Oggi affollata:** al massimo 5 punti di attenzione; il resto nei pannelli, chiudibili.

---

## 13. Decisioni da approvare

1. **Un account, tre spazi**, con selettore toccando il logo (consigliato), oppure iscrizioni separate?
2. **Performance** resta solo per il tuo account (consigliato per ora)?
3. **Nomi delle sezioni:** Oggi · Agenda · Clienti · Progetti · Team · Finanza · Documenti · Insights · Automazioni · Coach. Vanno bene?
4. **AI di Business:** Gemini con fatturazione attiva e limite di spesa, partendo dai 300 $ di crediti gratuiti (consigliato)?
5. **Email:** Cloudflare (gratis, sposta i DNS su Cloudflare) oppure un servizio esterno senza toccare i DNS?
6. **Azienda di prova:** su quale azienda reale (o di esempio) proviamo Business durante lo sviluppo?
7. **Si parte dalla fase 1** dopo l'approvazione?
