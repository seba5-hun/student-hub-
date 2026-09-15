# 🎓 Student Hub - Dashboard Studentesco Autonomo

Dashboard studentesco completo e **completamente autonomo** - funziona senza dipendenze esterne!

## ✨ Caratteristiche

- ✅ **Autenticazione locale** - Login e registrazione funzionano subito
- ✅ **Dati salvati nel browser** - Tutto in localStorage
- ✅ **Nessun server richiesto** - Funziona offline
- ✅ **Assistente AI** - Integrato con Gemini (API key gratuita)
- ✅ **Pubblicabile online** - Sito web statico pronto per Netlify/Vercel

## 📋 Funzionalità

### 📊 Dashboard Home
- Statistiche in tempo reale
- Obiettivo settimanale con progresso
- Citazioni motivazionali
- Prossimi impegni
- Grafici di studio

### 📋 Gestione Impegni
- Aggiungi impegni con priorità e importanza
- Supporto multi-giorno
- Filtri e ordinamento
- Completamento con confetti 🎉

### 📊 Voti
- Registrazione voti per materia
- Grafici medie e andamento
- Radar delle competenze

### ⏱️ Timer Studio
- Timer con cronometro
- Modalità Pomodoro
- Statistiche per materia
- Grafico distribuzione tempo

### 📁 Archivio
- Organizzazione gerarchica (Materia → Argomento → Documenti)
- Ricerca globale
- Link esterni

### 🧠 Cosa Studiare
- Raccomandazioni intelligenti
- Focus del giorno
- Analisi basata su voti, scadenze e tempo

### 📅 Calendario
- Vista mensile
- Aggiunta rapida impegni
- Esportazione .ics per iPhone
- Indicatori colorati per importanza

### 🤖 Guida Studio AI
- Assistente AI con Gemini 3.6 Flash
- Supporto foto illimitate
- Conosce il tuo archivio, voti e impegni
- Sistema fallback automatico

## 🚀 Come Pubblicare Online

### Opzione 1: Netlify Drop (Più Semplice)

1. **Scarica il progetto** da Qwen Coder
2. **Estrai il file ZIP**
3. Vai su **https://app.netlify.com/drop**
4. **Trascina la cartella** nell'area
5. Netlify ti dà un URL pubblico tipo: `https://nome-a-caso.netlify.app`
6. **Fatto!** L'app è online

### Opzione 2: GitHub Pages

1. Crea un repository su GitHub
2. Carica i file del progetto
3. Vai su Settings → Pages
4. Seleziona il branch `main` e cartella `/dist`
5. L'app sarà disponibile su: `https://tuousername.github.io/nome-repo`

### Opzione 3: Vercel

1. Vai su **https://vercel.com**
2. Collega il tuo account GitHub
3. Importa il repository
4. Vercel deploya automaticamente
5. Ottieni un URL tipo: `https://nome-progetto.vercel.app`

## 🔧 Configurazione Assistente AI

Per usare l'assistente AI con Gemini:

1. Vai su **https://aistudio.google.com/app/apikey**
2. Accedi con il tuo account Google
3. Clicca **"Create API Key"**
4. Copia la key (inizia con `AIza...`)
5. Nell'app, vai su **Guida Studio AI**
6. Incolla la API key
7. Clicca **"Salva e inizia"**

## 💾 Backup e Ripristino

### Esportare i Dati
1. Clicca sull'avatar in alto a destra
2. Clicca **"Esporta dati"**
3. Si scarica un file JSON con tutti i tuoi dati

### Importare i Dati
1. Clicca sull'avatar in alto a destra
2. Clicca **"Importa dati"**
3. Seleziona il file JSON di backup
4. I dati vengono ripristinati

## 🔒 Privacy

- ✅ Tutti i dati sono salvati **solo nel tuo browser**
- ✅ Nessuna comunicazione con server esterni (tranne Gemini AI)
- ✅ Nessun tracciamento
- ✅ Nessun account richiesto
- ✅ Funziona offline

## 🛠️ Sviluppo Locale

```bash
# Installa le dipendenze
npm install

# Avvia il server di sviluppo
npm run dev

# Build per produzione
npm run build

# Preview della build
npm run preview
```

## 📱 PWA (Progressive Web App)

L'app può essere installata come app sul telefono:

### iPhone
1. Apri l'app in Safari
2. Tocca il pulsante Condividi
3. "Aggiungi alla schermata Home"

### Android
1. Apri l'app in Chrome
2. Menu → "Aggiungi alla schermata Home"

## 🎨 Personalizzazione

- **Tema chiaro/scuro** - Toggle in alto a destra
- **Colori personalizzati** - Seleziona dal menu utente
- **Note rapide** - Nella home page
- **Obiettivo settimanale** - Configurabile

## 📊 Tecnologie

- React + TypeScript
- Vite
- Tailwind CSS
- Recharts (grafici)
- Canvas Confetti
- Lucide React (icone)

## 🎯 Prossimi Passi

1. **Pubblica online** usando Netlify Drop
2. **Configura l'assistente AI** con la API key di Gemini
3. **Installa come PWA** sul telefono
4. **Esplora tutte le funzionalità**
5. **Fai backup regolari** dei tuoi dati

## 🆘 Supporto

Se hai problemi:
- I dati sono salvati nel browser - se cancelli la cache, perdi i dati
- Fai backup regolari con la funzione "Esporta dati"
- L'assistente AI richiede una API key gratuita di Gemini

## 📄 Licenza

MIT - Usa liberamente!

---

**Buono studio! 🎓✨**
