# Verifica dell'app su Google

Testi pronti da incollare nella richiesta di verifica (Google Cloud → progetto **Default Gemini Project** →
Google Auth Platform). I testi per Google sono in inglese perché la revisione è in inglese.

## Branding

| Campo | Valore |
| --- | --- |
| Nome app | MYND |
| Email di assistenza | flowbase.service@gmail.com |
| Logo | icona MYND 120×120 (`public/icon-192.png` ridimensionata, facoltativa) |
| Home page | https://myndspace.world |
| Norme sulla privacy | https://myndspace.world/privacy.html |
| Termini di servizio | https://myndspace.world/termini.html |
| Domini autorizzati | myndspace.world |
| Email sviluppatore | flowbase.service@gmail.com |

## Ambiti (Accesso ai dati)

- `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`: non sensibili (login).
- `.../auth/drive.file`: non sensibile (Archivio su Drive).
- `https://www.googleapis.com/auth/cloud-platform`: **sensibile**, va giustificato.

### Giustificazione per cloud-platform (da incollare)

> MYND is a study and productivity web app with an AI tutor. The AI tutor runs on the Google Gemini API using the
> user's own free Gemini API key. Creating that key by hand (AI Studio, copy, paste) is the main reason users give up.
> The optional "Create Gemini key with Google" button, in the AI settings screen, uses the cloud-platform scope only
> when the user presses it, to do three things in the user's own Google Cloud account:
> 1. find or create a project named "MYND AI" (Cloud Resource Manager API), with no billing account;
> 2. enable the Generative Language API in that project (Service Usage API);
> 3. create, or reuse, one API key named "MYND" restricted to the Generative Language API, and read its key string
>    (API Keys API).
> No other project, resource or data is read, changed or deleted, and billing is never enabled. The access token is
> used only in the user's browser, is never sent to or stored on our servers, and expires within one hour. The API key
> is stored only in the user's browser and is used only to call the Gemini API for the user's own requests.
> There is no narrower scope: the API Keys API and the Service Usage API require cloud-platform
> (or service.management, which would not allow creating API keys). Users who prefer can still create the key by hand
> on AI Studio; the button is optional.

## Video dimostrativo (YouTube, "Non in elenco")

Registra lo schermo del Mac (Cmd+Shift+5), in inglese o con sottotitoli, 1–3 minuti:

1. Apri https://myndspace.world e mostra la home con i link Privacy e Termini.
2. Entra con "Continua con Google": si deve vedere la schermata di consenso con il nome **MYND**.
3. Apri la scelta dell'AI (Guida Studio AI → impostazioni AI) e premi **"Crea la chiave Gemini con Google"**.
4. Nella finestra di Google mostra la **barra dell'indirizzo** (deve vedersi `client_id=1048106841609-…`) e la
   schermata di consenso con il permesso Google Cloud; premi Continua.
5. Mostra i passaggi in MYND fino a "✓ Chiave creata", premi Salva e fai una domanda all'AI.
6. Apri console.cloud.google.com e mostra il progetto "MYND AI" con la sola chiave "MYND" limitata a Gemini.
