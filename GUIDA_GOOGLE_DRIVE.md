# Attivare Google Drive nell'Archivio

Con Google Drive ogni studente salva i file dell'Archivio **nel proprio Drive** (15 GB gratis),
nella cartella `Student Hub/<materia>/<argomento>`. L'app vede **solo i file che carica lei**
(permesso `drive.file`), non il resto del Drive.

Per attivarlo serve un **Client ID** di Google, da creare una volta sola (circa 10 minuti).
Il Client ID è pubblico, come la chiave "publishable" di Supabase.

## 1. Crea il progetto

1. Vai su <https://console.cloud.google.com> ed entra con il tuo account Google
   (va bene `flowbase.service@gmail.com`).
2. In alto, accanto al logo, clicca il selettore dei progetti → **Nuovo progetto**.
3. Nome: `Student Hub` → **Crea**. Aspetta qualche secondo e assicurati che in alto sia
   selezionato il progetto `Student Hub`.

## 2. Attiva l'API di Google Drive

1. Nella barra di ricerca in alto scrivi **Google Drive API** e aprila.
2. Premi **Abilita**.

## 3. Schermata di consenso (quella che vedono gli studenti)

1. Menu ☰ → **API e servizi** → **Schermata consenso OAuth**
   (a volte si chiama **Google Auth Platform**) → **Inizia**.
2. Informazioni sull'app:
   - Nome app: `Student Hub`
   - Email di assistenza utente: la tua email
3. Pubblico: **Esterno**.
4. Dati di contatto: la tua email → accetta le norme → **Crea**.
5. Vai su **Accesso ai dati** (Data access) → **Aggiungi o rimuovi ambiti** → cerca
   `drive.file` → seleziona `.../auth/drive.file` → **Aggiorna** → **Salva**.
6. Vai su **Pubblico** (Audience) → **Pubblica app** → conferma.
   `drive.file` è un permesso "non sensibile": non serve la verifica di Google.
   Se preferisci tenerla in prova, lascia "Test" e aggiungi in **Utenti di test** le email
   degli studenti (massimo 100).

## 4. Crea il Client ID

1. Vai su **Client** (o **Credenziali** → **Crea credenziali** → **ID client OAuth**).
2. Tipo di applicazione: **Applicazione web**. Nome: `Student Hub web`.
3. In **Origini JavaScript autorizzate** premi **Aggiungi URI** e scrivi:
   - `https://myndspace.world`
   - `https://www.myndspace.world`
   - (facoltativo, per le prove sul computer) `http://localhost:3000`
4. **URI di reindirizzamento autorizzati**: lascia vuoto.
5. **Crea**. Copia l'**ID client**: è una stringa tipo
   `123456789-abc123.apps.googleusercontent.com`.

## 5. Mettilo nell'app

Scegli **uno** dei due modi:

- **Mandalo a Claude** in chat: lo inserisce nel codice (`src/lib/googleDrive.ts`).
- **Oppure su Vercel**: Project → **Settings** → **Environment Variables** → aggiungi
  `VITE_GOOGLE_CLIENT_ID` con l'ID client → **Save** → **Deployments** → sull'ultimo
  deploy **⋯** → **Redeploy**.

Poi apri il sito, ricarica con **Cmd+Shift+R**, vai in **Archivio**: comparirà il riquadro
**"Dove salvare i file"** con la scelta **Google Drive**.

## Come funziona per lo studente

- In Archivio sceglie **Google Drive** → **Collega Google Drive** → sceglie l'account e
  conferma. Vede il suo spazio usato (es. "Usati 3,2 GB di 15 GB").
- I nuovi file vanno nel suo Drive (fino a 2 GB l'uno). L'AI li legge come prima: la
  trascrizione di testo (piccola) resta in Student Hub.
- Aprire un file apre Google Drive; eliminarlo lo sposta nel cestino di Drive
  (recuperabile per 30 giorni).
- Il collegamento con Google dura circa un'ora: dopo basta un clic su **Ricollega**.
- I file caricati prima in Student Hub restano dove sono e funzionano come sempre.
