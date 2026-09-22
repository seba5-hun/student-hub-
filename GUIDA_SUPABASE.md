# 🔐 Configurazione Supabase

Student Hub usa Supabase per gli account (registrazione, login, recupero password) e per salvare i dati online.
Questi passaggi vanno fatti **una volta sola**.

## 1. Crea la tabella dei dati

1. Apri il progetto su https://supabase.com/dashboard
2. Vai su **SQL Editor** → **New query**
3. Copia tutto il contenuto del file [`supabase/schema.sql`](supabase/schema.sql), incollalo e premi **Run**

Lo script crea la tabella `user_data` e attiva la **Row Level Security**: ogni utente può leggere e modificare solo i propri dati.
Puoi rilanciarlo senza problemi: non cancella i dati esistenti.

## 2. Imposta gli indirizzi dell'app

In **Authentication** → **URL Configuration**:

- **Site URL**: l'indirizzo dove è pubblicata l'app (es. `https://student-hub.netlify.app`).
  Se non l'hai ancora pubblicata, metti `http://localhost:3000`.
- **Redirect URLs**: aggiungi tutti gli indirizzi da cui usi l'app, ad esempio:
  - `http://localhost:3000`
  - `https://student-hub.netlify.app` (il tuo indirizzo reale)

I link delle email di conferma e di recupero password riportano a questi indirizzi.

## 3. Template delle email

In **Authentication** → **Email Templates** lascia i template **predefiniti** di Supabase
(usano `{{ .ConfirmationURL }}` e funzionano così come sono).

Se in passato hai modificato il template **Reset Password** con un link tipo
`/reset-password?token={{ .Token }}`, rimettilo com'era oppure usa questo link:

```html
<a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery">Reimposta password</a>
```

## 4. Conferma email (facoltativo)

In **Authentication** → **Sign In / Providers** → **Email**:

- **Confirm email** attivo (consigliato): dopo la registrazione bisogna cliccare il link nell'email prima di accedere.
- Disattivato: si entra subito dopo la registrazione.

L'app funziona in entrambi i casi.

## 5. File `.env`

Nella cartella del progetto serve il file `.env` (non va su GitHub, è escluso dal `.gitignore`):

```
VITE_SUPABASE_URL=https://<il-tuo-progetto>.supabase.co
VITE_SUPABASE_ANON_KEY=<la-tua-chiave-anon-o-publishable>
```

Li trovi in **Project Settings** → **API**. Usa la chiave **anon / publishable**, mai la `service_role`.

Se pubblichi l'app su Netlify o Vercel, aggiungi le stesse due variabili nelle impostazioni del sito
(**Environment variables**) e rifai il deploy.

## I dati che avevi già

La prima volta che accedi con Supabase, l'app carica online i dati che quel browser aveva salvato
con la vecchia versione, se l'email è la stessa. Negli altri casi puoi usare
**Esporta dati** dalla vecchia versione e poi **Importa dati** dal menu in alto a destra.
