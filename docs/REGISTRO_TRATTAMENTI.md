# Registro delle attività di trattamento — MYND (art. 30 GDPR)

Bozza da tenere aggiornata (anche se sotto i 250 dipendenti è consigliato: i trattamenti di MYND non
sono occasionali). Ultimo aggiornamento: 19 ottobre 2026.

**Titolare**: Sebastiano Zorzi — [indirizzo] — P.IVA [ ] — flowbase.service@gmail.com — PEC [ ]
**DPO**: non nominato (non obbligatorio).

| # | Trattamento | Interessati | Dati | Finalità | Base giuridica | Destinatari / responsabili | Extra UE | Conservazione | Misure di sicurezza |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Account e autenticazione | Utenti (anche minori ≥14 anni) | Nome, email, password cifrata, dati Google (nome, email, foto), accettazione termini ed età | Creare e gestire l'account | Contratto (6.1.b) | Supabase (responsabile), Google (login, titolare autonomo) | USA: DPF / SCC | Fino alla cancellazione dell'account (+ backup ≤ 90 gg) | HTTPS, hash delle password, RLS |
| 2 | Contenuti di studio | Utenti | Impegni, voti, sessioni, note, impostazioni, versioni MYND | Fornire il servizio | Contratto (6.1.b) | Supabase, Vercel | USA: DPF / SCC | Come sopra | RLS per utente, accesso solo dell'utente |
| 3 | Archivio file e trascrizioni | Utenti | File caricati, testo trascritto (possibili dati di terzi presenti nei materiali) | Archivio e tutor AI | Contratto (6.1.b) | Supabase Storage; Google Drive se scelto dall'utente | USA: DPF / SCC | Come sopra | Bucket privato per utente |
| 4 | Chat con la Guida Studio AI | Utenti | Domande, risposte, foto inviate | Tutor AI | Contratto (6.1.b) | Supabase; fornitori AI scelti dall'utente con la propria chiave (titolari autonomi rispetto all'utente) | USA | Come sopra | Invio diretto dal browser, chiavi solo nel browser |
| 5 | Vendite e fatturazione | Clienti (maggiorenni) | Piano, importi, dati di fatturazione, stato pagamenti (no dati carta) | Vendita, incasso, fatture, rimborsi | Contratto + obbligo legale (6.1.b, 6.1.c) | Fornitore pagamenti [Stripe], commercialista | Possibile: SCC | 10 anni | Dati carta solo presso il fornitore (PCI DSS) |
| 6 | Statistiche d'uso | Visitatori e utenti che acconsentono | Sezioni aperte, tempi, eventi, tipo di dispositivo, id casuale del browser | Migliorare l'app | Consenso (6.1.a) | Supabase | USA: DPF / SCC | 24 mesi; anonimizzate alla cancellazione dell'account | Nessun contenuto registrato, lettura solo admin |
| 7 | Suggerimenti e assistenza | Utenti | Messaggio, tipo, sezione, email | Gestire richieste e migliorare | Legittimo interesse / contratto | Supabase | USA: DPF / SCC | Fino a gestione / chiusura account | Lettura solo admin (funzioni riservate) |
| 8 | Approvazione e sicurezza account | Utenti | Stato account, date, ultimo accesso | Prevenire abusi | Legittimo interesse (6.1.f) | Supabase | USA: DPF / SCC | Fino alla cancellazione | Funzioni admin riservate all'account admin |

## Procedure

- **Richieste degli interessati**: risposta entro 30 giorni. Export e cancellazione sono self-service in
  "Privacy e dati"; le altre richieste via email.
- **Data breach**: valutare entro 72 ore se notificare al Garante (art. 33) e, se il rischio è alto,
  avvisare gli utenti (art. 34). Tenere traccia di ogni incidente qui sotto.
- **Nuove funzioni**: aggiornare questo registro, la privacy e, se cambia qualcosa di importante,
  `LEGAL_VERSION`.

## Registro incidenti

| Data | Cosa è successo | Dati coinvolti | Azioni | Notificato al Garante? |
|---|---|---|---|---|
| — | — | — | — | — |
