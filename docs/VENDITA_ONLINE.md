# MYND — pronto per la vendita online

Cosa è già pronto nell'app e cosa resta da fare prima di incassare il primo euro.
(Documento operativo, non è una consulenza legale: prima del lancio fai rileggere privacy e
termini a un avvocato o al commercialista, soprattutto per la parte fiscale.)

## ✅ Già fatto (nel codice)

| Cosa | Dove |
|---|---|
| Informativa privacy completa (GDPR artt. 13-14, minori, AI, trasferimenti extra UE, conservazione, diritti, sezioni Google per la verifica) | `public/privacy.html` |
| Termini e condizioni di servizio **e di vendita** (prezzi IVA inclusa, conferma via email, rinnovo e disdetta, recesso 14 giorni con rimborso, garanzia di conformità, AI, foro del consumatore) | `public/termini.html` |
| Cookie policy (solo archiviazione tecnica + statistiche con consenso) | `public/cookie.html` |
| Note legali del fornitore (D.Lgs. 70/2003, P.IVA sul sito) | `public/note-legali.html` |
| Modulo tipo di recesso stampabile | `public/recesso.html` |
| Registrazione: casella con età minima 14 anni + accettazione Termini + presa visione Privacy, salvate nell'account come prova (versione e data) | `src/components/Auth.tsx` |
| Accesso con Google: avviso di accettazione sotto il pulsante | `src/components/Auth.tsx` |
| Accettazione una tantum per chi ha già l'account o entra con Google, e di nuovo quando cambi i documenti (alza `LEGAL_VERSION`) | `src/components/LegalGate.tsx`, `src/lib/legal.ts` |
| Banner privacy: le statistiche d'uso partono **solo dopo "Accetta"** (Rifiuta e Accetta con lo stesso peso, la X vale come rifiuto) | `src/components/ConsentBanner.tsx`, `src/lib/analytics.ts` |
| "Privacy e dati" nel menu account: documenti, consenso statistiche, scarica i dati (portabilità), **elimina account** (diritto alla cancellazione) | `src/components/PrivacyCenter.tsx` |
| Funzione database per cancellare l'account e tutti i suoi dati | `supabase/account.sql` |
| Registro dei trattamenti (bozza) | `docs/REGISTRO_TRATTAMENTI.md` |

## ⚠️ Da fare tu (in ordine)

1. **Supabase → SQL Editor**: esegui `supabase/account.sql` (senza, "Elimina account" non funziona).
2. **Forma giuridica e Partita IVA.** Per vendere in modo continuativo serve la P.IVA (ditta individuale,
   regime forfettario se hai i requisiti, oppure una società). Codice ATECO tipico: 62.01 / 63.12.
   Se sei minorenne, parlane prima con il commercialista: l'attività va intestata a un maggiorenne o
   serve l'autorizzazione del giudice.
3. **Compila i campi gialli** nelle pagine `privacy.html`, `termini.html`, `note-legali.html`,
   `recesso.html`: indirizzo, Partita IVA, codice fiscale, PEC (la PEC è obbligatoria per le imprese),
   e il nome del fornitore di pagamento (es. "Stripe Payments Europe, Ltd."). Cerca `class="todo"`.
4. **Pagamenti** (non ancora collegati all'app): scegli il fornitore. Consigliato **Stripe** (Checkout +
   Customer Portal per la disdetta) oppure un "Merchant of Record" come **Paddle / Lemon Squeezy**, che
   gestiscono loro IVA europea e fatture (più semplice se non hai ancora un commercialista).
   Quando lo scegli, si collega l'app: pagina prezzi, checkout, sblocco del piano, disdetta dall'app,
   email di conferma (art. 51 Codice del Consumo) e promemoria di rinnovo annuale (promesso nei Termini).
5. **IVA**: vendendo a consumatori di altri Paesi UE si applica l'IVA del Paese del cliente (regime OSS)
   oltre 10.000 €/anno di vendite UE; in Italia serve la fattura elettronica / corrispettivi telematici.
   Un Merchant of Record risolve gran parte di questo.
6. **Contratti con i fornitori (DPA, art. 28 GDPR)**: accetta il Data Processing Addendum di
   Supabase (dashboard → Organization → Legal) e di Vercel (vercel.com/legal/dpa); quello di Stripe è
   incluso nei suoi termini.
7. **Regione dei dati**: controlla in Supabase (Project Settings → General) che il progetto sia in una
   regione UE (es. Frankfurt). Se è negli USA va bene comunque, ma la privacy già lo prevede.
8. **Prezzi e piani**: decidi cosa resta gratis e cosa è "Pro"; i prezzi vanno mostrati IVA inclusa.
9. **App Store / Google Play** (se pubblichi l'app nei negozi): lì i pagamenti digitali passano dal loro
   sistema (commissione 15–30%) e serve un link per cancellare l'account dall'app (c'è già).
10. **Prima del lancio**: fai rileggere i documenti, poi se cambi i Termini aumenta `LEGAL_VERSION` in
    `src/lib/legal.ts`: tutti gli utenti vedranno di nuovo la richiesta di accettazione.

## Note

- I Termini prevedono il **rimborso completo entro 14 giorni** dal primo acquisto (più semplice da
  gestire e più forte per la fiducia). Se preferisci il rimborso proporzionale previsto dalla legge
  (art. 57 c.3 Codice del Consumo), va cambiato il punto 6.
- Statistiche: senza consenso non vengono più registrate, quindi nel pannello Admin vedrai solo chi ha
  accettato.
