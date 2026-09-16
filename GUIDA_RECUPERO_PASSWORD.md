# 🔐 Configurazione Recupero Password

## ✅ Cosa è Stato Implementato

La schermata di recupero password è stata aggiunta all'app con:
- ✅ Link "Recupero password" nella schermata di login
- ✅ Form per inserire l'email
- ✅ Schermata per inserire la nuova password
- ✅ Validazione della password (minimo 6 caratteri)
- ✅ Messaggi di successo ed errore
- ✅ Design con testo nero su sfondo chiaro (leggibile)

## 🔧 Configurazione con Supabase

Per far funzionare il recupero password con Supabase, devi:

### 1. Configurare l'URL del Sito in Supabase

1. Vai su https://supabase.com/dashboard/project/czzlvcmnfvyrcjvyfyxi
2. Vai su **Authentication** → **URL Configuration**
4. Imposta **Site URL**: l'URL dove è ospitata la tua app
   - Esempio: `https://student-hub.vercel.app`
   - Oppure: `https://student-hub.netlify.app`
7. In **Redirect URLs** aggiungi:
   - `https://student-hub.vercel.app/reset-password`
   - Oppure: `https://student-hub.netlify.app/reset-password`

### 2. Configurare il Template Email

1. Vai su **Authentication** → **Email Templates**
2. Seleziona **Reset Password**
3. Modifica il template con questo codice:

```html
<h2>Reimposta la tua password</h2>
<p>Ciao!</p>
<p>Hai richiesto di reimpostare la password per il tuo account Student Hub.</p>
<p>Clicca sul link qui sotto per continuare:</p>
<p><a href="{{ .SiteURL }}/reset-password?token={{ .Token }}">Reimposta Password</a></p>
<p>Se non hai richiesto tu il recupero password, ignora questa email.</p>
<p>Il link scadrà tra 24 ore.</p>
<p>Buono studio!<br>Il team di Student Hub 🎓</p>
```

### 3. Implementare la Logica di Reset in ResetPassword.tsx

Nel file `src/components/ResetPassword.tsx`, devi sostituire la simulazione della chiamata API con la chiamata reale a Supabase:

```typescript
import { supabase } from '../lib/supabase';

// Nella funzione handleReset, sostituisci:
// await new Promise(resolve => setTimeout(resolve, 1000));

// Con:
const { error } = await supabase.auth.updateUser({
  password: password
});

if (error) throw error;
```

### 4. Gestire il Token nell'URL

Quando l'utente clicca sul link nell'email, Supabase reindirizza a:
```
https://tuo-sito.com/reset-password?token=xxx
```

Il componente ResetPassword.tsx estrae automaticamente il token dall'URL e lo usa per verificare la validità della richiesta.

## 📋 Flusso Completo

1. **Utente clicca "Recupero password"** nella schermata di login
2. **Inserisce l'email** e clicca "Invia Link"
3. **Supabase invia un'email** con un link contenente il token
6. **Utente clicca sul link** nell'email
7. **L'app mostra la schermata** per inserire la nuova password
9. **Utente inserisce la nuova password** due volte
10. **L'app chiama Supabase** per aggiornare la password
11. **Supabase conferma** il cambio password
12. **L'app reindirizza** alla schermata di login
13. **Utente fa il login** con la nuova password

## 🔍 Test del Flusso

Per testare il recupero password:

1. Vai alla schermata di login
2. Clicca "Recupero password"
3. Inserisci la tua email
4. Controlla la tua casella di posta
5. Clicca sul link nell'email
7. Inserisci una nuova password
8. Verifica di poter fare il login con la nuova password

## 🐛 Risoluzione Problemi

### "Link di reset non valido o scaduto"
- Il token è scaduto (scade dopo 24 ore)
- Richiedi un nuovo recupero password
- Verifica che l'URL del sito sia configurato correttamente in Supabase

### "L'email non arriva"
- Controlla la cartella spam
- Verifica che l'email provider sia configurato in Supabase
- Verifica che l'email sia registrata in Supabase

### "Errore durante il reset della password"
- Verifica che il token sia valido
- Controlla la console del browser per errori dettagliati
- Verifica che Supabase sia configurato correttamente

## 📞 Supporto

Se hai problemi con il recupero password:
- Verifica la configurazione di Supabase
- Controlla i log di Supabase
- Verifica che l'URL del sito sia configurato correttamente
- Controlla che il template email sia corretto

---

**Il recupero password è pronto per essere configurato con Supabase!** 🔐✨
