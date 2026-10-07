# Handoff: rebranding di MYND (ex "Student Hub")

> **Come usarlo con Claude Code:** copia questa cartella nella root del repository della web app, poi scrivi a Claude Code:
> *"Leggi `design_handoff_mynd_rebrand/README.md` e applica il rebranding MYND all'app seguendo il piano di lavoro della sezione 10, un passo alla volta. Non togliere nessuna funzionalità."*

---

## 1. Panoramica
Rebranding completo della web app per studenti delle superiori, oggi "Student Hub". Cambiano nome, logo, palette, tipografia, materiale dell'interfaccia (Liquid Glass), nome della sezione premium e flusso di accesso.
**Regola d'oro: cambia l'aspetto, non cosa fa l'app.** Nessuna funzionalità va rimossa.

Lo stack è **React + TypeScript + Tailwind CSS**. Tutto è già espresso come variabili CSS (`tokens.css`) e come estensione del tema Tailwind (`tailwind.config.ts`), entrambi in questa cartella.

## 2. I file di design
I file `.dc.html` sono **riferimenti di design creati in HTML**: prototipi che mostrano l'aspetto e il comportamento voluti. **Non sono codice di produzione da copiare.** Vanno ricreati nel codice esistente (React + Tailwind), usando i suoi componenti e le sue convenzioni. Per vederli, aprili nel browser tenendo `support.js` nella stessa cartella.

| File | Contenuto |
|---|---|
| `Passo 8 - Brand book.dc.html` | Riepilogo completo: identità, logo, colori, tipografia, token, componenti, tono di voce, codice |
| `Passo 2b - Logo varianti.dc.html` | Sistema del logo: verticale, orizzontale, icona iOS, solo Y, monocromatico, regole d'uso |
| `Passo 5b - Liquid Glass.dc.html` | Linguaggio dell'interfaccia su iPhone (tema scuro e chiaro), con tutti i componenti |
| `Passo 7.1b - Accesso completo.dc.html` | 6 schermate di accesso: benvenuto, accedi, crea account, recupero, attesa approvazione, privacy |

## 3. Fedeltà
**Alta fedeltà (hi-fi):** colori, tipografia, raggi, ombre e testi sono definitivi e vanno rispettati con precisione.
Le schermate interne (Home, Performance, Timer, Guida AI, Archivio, Impegni, Voti, Calendario, Cosa studiare, Admin) **non sono state ridisegnate una per una**. Vanno aggiornate applicando questo sistema (i token e i componenti della sezione 7), mantenendo il layout e le funzioni attuali.

---

## 4. Decisioni prese
| Elemento | Scelta |
|---|---|
| Nome | **MYND**: sempre maiuscolo, si pronuncia "mind". Acronimo di **M**ake **Y**our **N**ext **D**ecision |
| Slogan | **Make Your Next Decision.** In inglese, con il punto finale; l'app resta in italiano |
| Logo | **"Y d'acciaio"**: la scritta MYND, con la sola Y in acciaio |
| Icona app iOS | **Metallo**: fondo grafite spazzolato, M N D chiare, Y nera |
| Simbolo | Nessun simbolo separato. Come favicon si usa la sola Y |
| Palette | **Lime su Grafite** |
| Tipografia | **SF Pro di sistema**, con numeri a larghezza fissa (tabular) |
| Interfaccia | **Liquid Glass**, evoluzione dello stile "Luce" |
| Sezione premium | **Performance**, al posto di "Mindset" |
| Schede di Performance | **Oggi · Focus · Piano · Andamento · Coach** |
| Accesso | **"Il manifesto"** |
| Temi | Scuro (principale) e chiaro, entrambi completi |
| Lingua | Italiano |

### Nomi da cambiare in tutto il codice e nei testi
- "Student Hub" → **MYND**: `<title>`, manifest PWA, `apple-mobile-web-app-title`, intestazioni, email, file esportati.
- "Mindset" → **Performance**: menu laterale, route (tenendo un redirect da quella vecchia), titoli, testi del coach.
- Scheda "Progressi" → **Andamento**. Le altre schede restano Oggi, Focus, Piano e Coach.

---

## 5. Logo
- **Come è fatto:** la parola "MYND" in SF Pro, peso 500–600, letter-spacing −0.04/−0.045em.
  - **Verticale (principale):** "MY" sopra e "ND" sotto, line-height 0.84.
  - **Orizzontale:** "MYND" su una riga. Accanto si può mettere un separatore verticale di 1px e lo slogan in maiuscolo (12px, letter-spacing 0.26em).
- **La Y:** `background: var(--steel-gradient); -webkit-background-clip: text; background-clip: text; color: transparent`.
  - Sfumatura scura: `#F4F3F0 → #9A9CA1 → #E2E2E0 → #6E7075` (170°).
  - Sfumatura chiara: `#8E9095 → #3E4044 → #7A7C80 → #2A2B2E`.
  - **Sotto i 40px** niente sfumatura: la Y diventa piena, `--steel` (#B6B9BE in tema scuro, #4A4D52 in tema chiaro).
- **Barra in alto dell'app:** logo orizzontale a 17px, peso 600, Y in `--steel`.
- **Icona iOS:** apple-touch-icon 180×180, più 192 e 512 per il manifest.
  - Sfondo `var(--icon-metal)` con riflesso `inset 0 1px 0 rgba(255,255,255,.22)`.
  - Logo verticale centrato, alto circa il 45% dell'icona: lettere #ECEAE5, Y #0A0A0B.
  - Esportarla come PNG quadrato: iOS arrotonda gli angoli da solo.
- **Favicon:** la sola Y in acciaio pieno (#C9CBCE) su fondo #000, angoli arrotondati, a 32 e 16 px.
- **Regole d'uso:**
  - lasciare intorno al logo uno spazio pari almeno all'altezza della N;
  - misure minime: verticale 24px, orizzontale 64px; sotto si usa la sola Y;
  - l'acciaio va solo sulla Y;
  - **mai il logo in lime**: il lime appartiene all'interfaccia, non al marchio;
  - mai deformarlo, ruotarlo, ombreggiarlo o metterlo su foto molto contrastate.

---

## 6. Token di design (tutti in `tokens.css`)

### 6.1 Colori
| Token | Scuro | Chiaro | Uso |
|---|---|---|---|
| `--brand` | `#C8F25A` | `#4A6B00` | Lime firma. Nel tema chiaro la variante scura serve per testi e icone |
| `--brand-ring` | `#C8F25A` | `#5C8500` | Anelli di progresso, barra del giorno attuale nei grafici |
| `--on-brand` | `#0A0B0C` | `#0A0B0C` | Testo sopra il lime |
| `--steel` | `#B6B9BE` | `#4A4D52` | Y del logo nella versione piena |
| `--accent` | `#C9CDD2` | `#3F454C` | Accento titanio, dettagli secondari |
| `--bg` | `#0A0B0C` | `#F1F2F3` | Sfondo dell'app |
| `--surface` | `#15171A` | `#FFFFFF` | Superficie piena (anche al posto del vetro) |
| `--border` | `#2A2D31` | `#DDE0E3` | Bordi e separatori |
| `--text` | `#ECEEF0` | `#0D0F11` | Testo principale |
| `--text-muted` | `#969BA1` | `#62676D` | Testo secondario |
| `--text-subtle` | `#62676D` | `#8A9097` | Testo terziario (solo da 13px in su, mai per informazioni importanti) |
| `--success` | `#6FD3C4` | `#0E6E63` | Successo |
| `--warning` | `#E0B055` | `#8F5F00` | Attenzione |
| `--danger` | `#E8685B` | `#B83A2E` | Errori e azioni distruttive, mai per i risultati personali |
| `--area-scuola` | `#83AFDF` | `#3D6692` | Area / materia |
| `--area-studio` | `#ABA1DD` | `#645A90` | Area / materia |
| `--area-sport` | `#6BBDAB` | `#187363` | Area / materia |
| `--area-progetto` | `#C9A46C` | `#7E5D24` | Area / materia |
| `--area-recupero` | `#8CB987` | `#466F41` | Area / materia |
| `--area-vita` | `#D595B0` | `#884E68` | Area / materia |
| `--area-viaggio` | `#6AB7D1` | `#186E86` | Area / materia |
| `--area-pasto` | `#D89B7C` | `#8A5336` | Area / materia |
| `--area-sonno` | `#98A8E1` | `#526094` | Area / materia |
| `--area-extra` | `#DC9693` | `#8D4F4D` | Decimo colore per le materie |

- Il pulsante principale ha sempre lo sfondo lime pieno (#C8F25A con la sfumatura `--btn-primary`), **in entrambi i temi**, con testo #0A0B0C.
- I colori delle **materie** si assegnano scorrendo le 10 aree in ordine. I colori personalizzati che l'utente ha già scelto vanno mantenuti.

### 6.2 Tipografia: SF Pro di sistema
`font-family: var(--font-sans)`. Non c'è nessun font da scaricare; su Windows e Android viene usato il font di sistema.
**Tutti i numeri** (timer, punteggi, orari, ore di studio, voti) usano `font-variant-numeric: tabular-nums`, classe `.tabular`.

| Ruolo | Dimensione / interlinea | Peso | Letter-spacing | Uso |
|---|---|---|---|---|
| Display | 52 / 1.0 | 700 | −0.05em | Titoli in stile manifesto |
| H1 | 44 / 1.0 | 700 | −0.045em | Titoli delle schermate di accesso ("Accedi.") |
| H2 | 34 / 1.1 | 700 | −0.035em | Titolo della pagina ("Buongiorno, Luca.") |
| H3 | 22 / 1.25 | 600 | −0.02em | Titoli di card e sezioni |
| Body | 17 / 1.5 | 400 | 0 | Testo |
| Small | 15 / 1.45 | 400 | 0 | Righe di lista, testi secondari |
| Caption | 13 / 1.4 | 400 | 0 | Date e informazioni di contorno |
| Label | 12 / 1.3 | 500 | +0.08em, maiuscolo | "ADESSO · 16:30", etichette dei campi |
| Numero | 76 / 0.9 | 300 | −0.04em | Timer di Focus. Il punteggio dentro l'anello è 34px / 300 |

Regola di stile: **i titoli finiscono con il punto** ("Bentornato.", "Quasi pronto.", "Privacy.").

### 6.3 Spazi (multipli di 4)
- Valori: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 px.
- Margine laterale su iPhone: 18–20px (28px nelle schermate di accesso).
- Spazio tra le card: 14px.

### 6.4 Raggi
| Token | Valore | Uso |
|---|---|---|
| `sm` | 8px | Spunte e piccoli elementi |
| `md` | 16px | Campi |
| `lg` | 18px | Righe della timeline, voci di menu |
| `xl` | 28px | Card (la card "Adesso" ha 30px) |
| `2xl` | 40px | Fogli dal basso e finestre |
| `full` | 999px | Pulsanti, chip, barra in basso, scala 1–5 |

### 6.5 Materiale: Liquid Glass
Due livelli, mai di più:
1. **Vetro contenuto**, per card, campi, chip e righe:
   - `background: var(--glass)`, `border: 1px solid var(--glass-edge)`, `box-shadow: var(--shadow-spec)`;
   - **nessuna sfocatura**.
2. **Vetro fluttuante**, per barra in basso, menu a tendina, fogli, finestre e toast:
   - `background: var(--glass-float)`, `backdrop-filter: var(--blur-float)`, `box-shadow: var(--shadow-float)`;
   - la sfocatura si usa **solo qui**, per le prestazioni.

Altri dettagli:
- **Bordo speculare:** un filo di luce di 1px in alto a sinistra e uno più debole in basso a destra. È ciò che fa sembrare vetro le superfici.
- **Lente:** l'elemento attivo (scheda della barra, opzione della scala, voce del menu) è una "bolla" di vetro (`--glass-lens` + `--shadow-lens`). Scivola nella nuova posizione in 250ms con `--ease-spring`.
- **Spia lime:** l'alone `--glow-brand` va solo sull'elemento attivo o sul pulsante principale, mai sulle decorazioni.
- **Sfondo:** `--ambient`, due macchie radiali molto tenui sotto il vetro, ferme.
- **Accessibilità:**
  - con "riduci trasparenza" il vetro diventa `--surface` pieno (già previsto in `tokens.css`);
  - il testo è sempre pieno, mai trasparente.

### 6.6 Movimento
| Token | Valore | Uso |
|---|---|---|
| `fast` | 150ms, ease-out | Tocchi, dissolvenze, cambi di colore |
| `base` | 250ms, ease-out / spring | Lente, fogli, menu |
| `slow` | 600ms, ease-out | Riflesso sulla Y nel benvenuto, riempimento dell'anello (900ms alla prima apertura) |

- Curve: `--ease-out: cubic-bezier(.2,.8,.2,1)`, `--ease-spring: cubic-bezier(.3,1.3,.5,1)`.
- Si animano solo `transform` e `opacity`.
- Con "riduci movimento" restano solo le dissolvenze.

### 6.7 Accessibilità
- Aree toccabili di almeno 44×44px.
- Contrasto: almeno 4.5:1 per i testi, 3:1 per grafici e icone.
- Focus sempre visibile: bordo lime da 1.5px + `--focus-ring`.

---

## 7. Componenti
- **Pulsante principale**
  - Pillola alta 54–56px (48 dentro le liste). Sfondo `--btn-primary`, ombra `--btn-primary-shadow`, bordo `1px rgba(255,255,255,.5)`.
  - Testo #0A0B0C, 17px peso 600. Alla pressione `scale(.98)` per 150ms.
  - **Al massimo uno per schermata.**
  - Variante con freccia: un cerchio nero da 40px a destra con "→" lime.
- **Pulsante secondario:** pillola in vetro contenuto, testo 16–17px peso 500.
- **Pulsante testo:** nessuno sfondo, 15–16px.
- **Campo nelle schermate di accesso (stile manifesto)**
  - Etichetta 12px maiuscola (+0.08em) in `--text-muted`; valore 22px peso 500; sotto una riga di 1px in `--border`.
  - Quando il campo è attivo, etichetta e riga diventano lime (riga da 1.5px).
- **Campo dentro l'app**
  - Vetro contenuto alto 52px, raggio 16, padding 0 16px, testo 17px.
  - Quando è attivo: bordo lime da 1.5px + `--focus-ring`.
- **Password:** "Mostra" a destra, 14px in `--text-muted`.
- **Card**
  - Vetro contenuto, raggio 28, padding 20.
  - La card **"Adesso"** usa `--glass-hero` (riflesso lime in alto a sinistra). Contiene l'anello del punteggio, l'etichetta "ADESSO · hh:mm", il titolo dell'attività (19px peso 600) e la riga "Dopo: …" (13px, `--text-muted`).
- **Anello del punteggio (0–100)**
  - SVG da 96–100px, raggio 43, tratto 7 con estremità arrotondate.
  - Base `rgba(255,255,255,.09)`, arco in `--brand-ring`, alone `--glow-ring`.
  - Al centro il numero (34px peso 300, tabular) e sotto "media 71" (10px, `--text-muted`).
  - Si riempie in 900ms alla prima apertura.
- **Chip**
  - Pillola alta 36px, padding 0 14px, con un pallino di 8px nel colore dell'area.
  - Da selezionato: sfondo lime, testo nero peso 600.
- **Scala 1–5**
  - Cinque pillole alte 40–44px dentro un incavo `--glass-well` (forma a pillola, padding 4).
  - Il valore scelto è la lente, con il numero in `--brand-ring`.
- **Timeline della giornata**
  - Righe in vetro contenuto alte 52px, raggio 18.
  - A sinistra l'orario (13px, `--text-muted`, tabular, colonna da 42px).
  - Pallino di 10px nel colore dell'area, con alone `0 0 10px <colore>`.
  - Nome dell'attività 15px; durata a destra, 13px `--text-muted`.
  - Attività passate: spuntate, opacità .55.
  - Tempo libero: bordo tratteggiato; con un tocco apre il menu "Trasforma in…".
- **Menu a tendina e menu contestuale**
  - Vetro fluttuante, raggio 24, padding 6, voci alte 44px.
  - La voce attiva è la lente, con "✓" lime; le azioni distruttive sono in `--danger`.
- **Fogli dal basso e finestre:** vetro fluttuante, raggio 40, maniglia in alto di 40×5px in `rgba(255,255,255,.2)`.
- **Barra in basso (Performance, su telefono)**
  - Capsula fluttuante alta 68px, a 14px dai lati e 24px dal fondo (più lo spazio sicuro di iPhone).
  - 5 voci: icona Lucide da 22px (tratto 1.75) ed etichetta 10px peso 600.
  - Voce attiva: lente, in colore `--brand-ring`; le altre in `--text-muted`.
  - Icone: `Sun` (Oggi), `Timer` (Focus), `CalendarDays` (Piano), `TrendingUp` (Andamento), `MessageCircle` (Coach).
- **Barra in alto**
  - A sinistra il logo orizzontale (17px peso 600, Y in acciaio).
  - A destra l'interruttore chiaro/scuro e l'avatar: cerchio di vetro da 36px con l'iniziale.
  - "Salvataggio…": 12px in `--text-muted`, con un pallino lime che pulsa.
- **Menu laterale (computer):** colonna in vetro contenuto, voce attiva come lente. Le sezioni restano nascondibili come oggi.
- **Grafici**
  - Barre arrotondate in `#3A3F45` (`#D5D9DE` nel tema chiaro); oggi o il valore selezionato in lime.
  - Ciambella "Distribuzione del tempo": colori di aree e materie, separatori di 2px del colore dello sfondo, totale al centro nello stile Numero.
  - Mappa di calore: 5 livelli di lime con opacità .12 / .3 / .5 / .75 / 1.
  - Assi ed etichette 11px in `--text-subtle`.
- **Stato vuoto:** un titolo breve con il punto finale, una riga di spiegazione, una sola azione.
- **Caricamento:** blocchi segnaposto in `--glass` con un riflesso che scorre in 1.2s (spento con "riduci movimento").
- **Errori:** toast in vetro fluttuante con icona nel colore dello stato, e testi gentili (vedi la sezione 9).

---

## 8. Schermate di accesso: "Il manifesto"
Riferimento: `Passo 7.1b - Accesso completo.dc.html`. Misure su iPhone 390×844.

Elementi comuni:
- Sfondo `--bg`.
- Pulsante "indietro": cerchio di vetro da 44px con "←", a 62px dall'alto e 20px da sinistra.
- Titolo a circa 150px dall'alto, margini laterali di 28px.
- Pulsante principale fisso in basso, a 40px dal fondo (più lo spazio sicuro), margini laterali di 20px.

Le 6 schermate:
1. **Benvenuto**
   - Sfondo con un tenue alone lime a sinistra: `radial-gradient(60% 30% at 0% 40%, rgba(200,242,90,.08), transparent 70%)`.
   - Il manifesto su 4 righe (68px, peso 700, −0.05em, interlinea .98): "**M**ake / **Y**our / **N**ext / **D**ecision.". Le iniziali sono in `--text` (la Y in acciaio), il resto delle parole in `#3A3F45`.
   - Sotto, 17px in `--text-muted`: "Studio, sport, sonno e progetti in un unico sistema che ti dice sempre cosa fare adesso."
   - Pulsante "Inizia" con la freccia, poi il link "Ho già un account".
   - Animazione: le parole entrano una alla volta (dissolvenza + 8px dal basso, 80ms una dall'altra), poi sulla Y passa un riflesso di 600ms.
2. **Accedi**
   - Titolo "Accedi." e sottotitolo "La prossima decisione è qui.".
   - Campi Email e Password, poi il link "Password dimenticata?".
   - Pulsante "Accedi" e, sotto, "Informativa sulla privacy" (12px, `--text-subtle`).
3. **Crea account**
   - Titolo "Inizia da te." e sottotitolo "Bastano 30 secondi.".
   - Campi Nome, Email e Password.
   - Indicatore di forza della password: 4 segmenti alti 4px, lime quelli raggiunti, con il testo "Password solida · almeno 8 caratteri ✓".
   - Casella "Ho letto l'informativa sulla privacy" (24px, raggio 7, lime quando è spuntata).
   - Pulsante "Crea account", disattivato finché i dati non sono validi.
4. **Recupera password**
   - Titolo "Nessun problema." e testo "Scrivi la tua email: ti mandiamo un link per sceglierne una nuova.", poi il campo Email.
   - Dopo l'invio compare una card in vetro: "✓ Link inviato. Controlla la posta, anche nello spam. Il link vale 1 ora." (adattare la durata a quella reale).
   - Pulsante "Apri la posta" e, sotto, "Invia di nuovo tra 0:42" con il conto alla rovescia.
5. **In attesa di approvazione**
   - Chip "● In revisione", con il pallino lime luminoso che pulsa.
   - Titolo "Quasi / pronto." (52px).
   - Testo: "MYND è su invito: il tuo account viene approvato a mano. Ti scriviamo appena è attivo."
   - 3 passaggi: "Account creato" (✓ lime), "Approvazione · in corso" (anello lime luminoso), "La tua prima giornata" (grigio).
   - Pulsanti "Esci" (secondario) e "Controlla lo stato" (principale).
6. **Privacy**
   - Titolo "Privacy." e "Ultimo aggiornamento · [data]".
   - Righe in vetro alte 56px, ognuna con "›": Quali dati raccogliamo · Dove sono salvati · L'AI e i tuoi file · Esporta o elimina i dati · Contatti.
   - Ogni sezione si apre con un riassunto di una riga, poi il testo completo.
   - **Il testo legale va preso dall'informativa attuale.**

---

## 9. Tono di voce
- Mai colpevolizzante: si dice "sotto l'obiettivo", "opportunità", "versione minima", **mai** "fallito".
- Frasi brevi, titoli con il punto finale.

| No | Sì |
|---|---|
| Hai fallito l'obiettivo. | Sotto l'obiettivo di 40 minuti. Domani si recupera. |
| Errore 500. Riprova. | Non siamo riusciti a salvare. Riprova tra un attimo. |
| Non hai studiato oggi! | Giornata leggera. La versione minima vale comunque. |
| Nessun dato disponibile. | Ancora niente qui. La prima sessione lo riempie. |

---

## 10. Piano di lavoro per Claude Code (in quest'ordine)
1. **Token**
   - Aggiungere `tokens.css` (importandolo nel CSS globale) e unire `tailwind.config.ts` a quello esistente.
   - Togliere i gradienti viola-indaco, le vecchie card in vetro e il font Inter.
   - Mettere `data-theme="dark|light"` su `<html>`, collegato all'interruttore del tema che c'è già.
2. **Nomi**
   - Student Hub → MYND, Mindset → Performance (con redirect dalla vecchia route), Progressi → Andamento.
   - Aggiornare manifest PWA, `<title>` e `theme-color` (#0A0B0C).
3. **Logo e icone**
   - Creare il componente `<Logo variant="horizontal | stacked" />` con la Y in acciaio.
   - Generare l'icona iOS "Metallo" (180×180), le icone del manifest (192 e 512) e la favicon con la Y.
4. **Componenti di base**
   - Button (primary / secondary / text), Input (manifesto / glass), Card (glass / hero), Chip, Scale1to5, ProgressRing, TimelineRow, Menu/Dropdown, Sheet/Modal, Toast, Skeleton, EmptyState, BottomNav con la lente animata.
   - Rispettare i 44px minimi e il focus visibile.
5. **Schermate di accesso:** rifare le 6 schermate della sezione 8, mantenendo tutta la logica attuale.
6. **Struttura generale:** barra in alto, menu laterale, indicatore di salvataggio, menu dell'account (esporta/importa, temi colore, esci). I "temi colore" esistenti restano, ma il tema predefinito diventa Lime su Grafite.
7. **Performance (Oggi, Focus, Piano, Andamento, Coach)**
   - Applicare i componenti e la barra in basso su telefono.
   - Anello del punteggio nella card "Adesso"; colori delle aree nella timeline.
8. **Tutte le altre sezioni:** Home, Impegni, Voti, Timer Studio (ciambella e barre con i nuovi colori), Archivio, Cosa studiare, Calendario, Guida Studio AI, Admin. Stesso sistema, **nessuna funzione rimossa**.
9. **Controllo finale**
   - Contrasti in entrambi i temi.
   - "Riduci movimento" e "riduci trasparenza".
   - Velocità su un iPhone non recente: sfocatura solo sugli elementi fluttuanti.
   - Test di tutte le funzioni esistenti.

## 11. Asset
- Nessuna immagine e nessun font esterno: si usa il font di sistema.
- Icone: Lucide (`lucide-react`).
- Logo e icone dell'app vanno generati come descritto nella sezione 5; i file HTML ne mostrano l'aspetto.

## 12. File in questa cartella
- `README.md`: questo documento
- `tokens.css`: variabili CSS (tema scuro e chiaro, vetro, raggi, movimento, accessibilità)
- `tailwind.config.ts`: estensione del tema Tailwind collegata alle variabili
- `Passo 8 - Brand book.dc.html`, `Passo 2b - Logo varianti.dc.html`, `Passo 5b - Liquid Glass.dc.html`, `Passo 7.1b - Accesso completo.dc.html`: riferimenti visivi
- `support.js`: serve solo ad aprire i file `.dc.html` nel browser
