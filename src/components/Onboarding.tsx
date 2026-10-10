import React, { useEffect, useRef, useState } from 'react';
import {
  X, ArrowLeft, ArrowRight, Check, Sparkles, Target, BarChart3, Clock, BookMarked, Archive, Calendar, Camera, Loader2, Plus, ExternalLink, Rocket, LayoutGrid,
} from 'lucide-react';
import { SubjectDef, SUBJECT_COLORS, UserData, nextSubjectColor, todayKey } from '../lib/store';
import { getKey, setKey, isReady, providerLabel, transcribeFile } from '../lib/ai';
import { KINDS, OnboardingDraft, TaskKind } from '../lib/onboarding';
import { blobToBase64 } from '../lib/gemini';
import { SECTIONS } from './Layout';
import OnboardingArt from './OnboardingArt';
import { useDialog } from './Dialog';

// "Crea la tua MYND": a guided tour in slides. Feature slides explain a section, question slides
// collect the student's data (typed, or read from a photo by the AI); nothing is saved until the
// last slide ("Carica tutto"). Every slide can be skipped. On a computer (and iPad held sideways)
// each slide is a two-column page with its illustration; narrower screens put the illustration on top.

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "matematica, italiano; storia" → three names, cleaned.
function splitNames(text: string): string[] {
  return text.split(/[,;\n]+/)
    .map(n => n.replace(/^[\s\-*•·\d.)]+/, '').replace(/\s+/g, ' ').trim())
    .filter(n => n.length >= 2 && n.length <= 40)
    .map(capitalize);
}

function addNames(list: SubjectDef[], names: string[]): SubjectDef[] {
  const next = [...list];
  for (const name of names) {
    if (!next.some(s => s.name.toLowerCase() === name.toLowerCase())) next.push({ name, color: nextSubjectColor(next) });
  }
  return next;
}

interface Props {
  data: UserData;
  onClose: (draft: OnboardingDraft | null) => void;
  onNavigate: (section: string) => void;
}

export default function Onboarding({ data, onClose, onNavigate }: Props) {
  const dialog = useDialog();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(() => ({
    subjects: data.settings.subjects || [],
    tasks: [],
    grades: [],
    weeklyGoal: data.settings.weeklyGoal || 10,
    hiddenSections: data.settings.hiddenSections || [],
    geminiKey: '',
  }));
  const [touched, setTouched] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<OnboardingDraft>) => { setDraft(d => ({ ...d, ...patch })); setTouched(true); };

  const slides = buildSlides(draft, set, data, id => setIndex(slideIds.indexOf(id)));
  const slideIds = slides.map(s => s.id);
  const slide = slides[index];
  const last = index === slides.length - 1;

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [index]);

  const close = async () => {
    if (touched) {
      const save = await dialog.confirm({
        title: 'Salvare quello che hai inserito?',
        message: 'Le risposte date finora vengono caricate nell\'app. Puoi riaprire la guida quando vuoi da "Crea la tua MYND" nella Home.',
        confirmLabel: 'Salva ed esci', cancelLabel: 'Esci senza salvare',
      });
      onClose(save ? draft : null);
    } else onClose(null);
  };

  const finish = () => onClose(draft);
  const next = () => (last ? finish() : setIndex(i => i + 1));
  const back = () => setIndex(i => Math.max(0, i - 1));

  // Computer: the arrow keys move between slides (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || document.querySelector('[role=alertdialog]')) return;
      if (e.key === 'ArrowRight' && !last) setIndex(i => i + 1);
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  const nav = (
    <div className="flex gap-3">
      {index > 0 && (
        <button onClick={back} aria-label="Indietro" className="btn-secondary w-14 h-14 !rounded-full flex items-center justify-center flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <button onClick={next} className="btn-primary flex-1 md:flex-none md:min-w-[240px] h-14 !rounded-full text-base font-semibold inline-flex items-center justify-center gap-2 px-8">
        {last ? <>Carica tutto <Check className="w-5 h-5" /></> : index === 0 ? <>Iniziamo <ArrowRight className="w-5 h-5" /></> : <>Avanti <ArrowRight className="w-5 h-5" /></>}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col animate-fade-in" style={{ background: 'var(--bg, #0A0B0C)' }} role="dialog" aria-modal="true" aria-label="Crea la tua MYND">
      <div className="absolute inset-0 gradient-bg mesh-gradient -z-10" aria-hidden />
      <div className="safe-top flex-shrink-0">
        <div className="max-w-6xl mx-auto px-4 md:px-8 lg:px-12 h-14 md:h-20 flex items-center gap-3 md:gap-6">
          <button onClick={close} aria-label="Chiudi la guida" className="w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text)' }}>
            <X className="w-5 h-5" />
          </button>
          <span className="hidden md:block text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>Crea la tua M<span style={{ color: 'var(--brand-ring)' }}>Y</span>ND</span>
          <div className="flex-1 flex gap-1" aria-label={`Passo ${index + 1} di ${slides.length}`}>
            {slides.map((s, i) => (
              <button key={s.id} onClick={() => setIndex(i)} aria-label={`Vai a: ${s.short}`} title={s.short} className="flex-1 h-6 flex items-center">
                <span className="block w-full h-1 rounded-full transition-colors" style={{ background: i <= index ? 'var(--brand-fill)' : 'var(--border)' }} />
              </button>
            ))}
          </div>
          <span className="hidden md:block text-sm tabular" style={{ color: 'var(--text-subtle)' }}>{index + 1}/{slides.length}</span>
          {!last && <button onClick={() => setIndex(i => i + 1)} className="h-11 px-2 text-sm font-medium flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Salta</button>}
        </div>
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div key={slide.id} className="max-w-xl md:max-w-2xl lg:max-w-6xl mx-auto px-5 md:px-8 lg:px-12 pt-3 pb-10 md:pt-6 lg:py-8 lg:min-h-full lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:items-center animate-section-in">
          <div className={slide.body ? 'hidden md:block mb-8 lg:mb-0' : 'mb-6 md:mb-8 lg:mb-0'}>
            <div className="glass-card !rounded-[32px] overflow-hidden flex items-center justify-center p-3 md:p-6 lg:p-8 h-[210px] sm:h-[260px] md:h-[320px] lg:h-auto lg:aspect-[8/7]">
              <OnboardingArt id={slide.id} className="w-full h-full" />
            </div>
          </div>
          <div className="min-w-0 lg:py-6">
            <div className="flex items-center gap-3 mb-4 md:mb-5">
              <span className="w-11 h-11 md:w-12 md:h-12 rounded-2xl glass-lens flex items-center justify-center" style={{ color: 'var(--brand-ring)' }}>{slide.icon}</span>
              <span className="text-xs font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--text-subtle)' }}>{slide.kicker}</span>
            </div>
            <h2 className="text-[32px] sm:text-[40px] lg:text-[48px] font-bold leading-[1.04]" style={{ letterSpacing: '-0.045em', color: 'var(--text)' }}>{slide.title}</h2>
            {slide.text && <p className="mt-3 md:mt-4 text-[16px] lg:text-[17px] leading-relaxed max-w-[34rem]" style={{ color: 'var(--text-muted)' }}>{slide.text}</p>}
            {slide.points && (
              <ul className="mt-6 space-y-3">
                {slide.points.map(p => (
                  <li key={p} className="flex gap-3 text-[15px] lg:text-base" style={{ color: 'var(--text)' }}>
                    <span className="mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}><Check className="w-3 h-3" strokeWidth={3} /></span>
                    {p}
                  </li>
                ))}
              </ul>
            )}
            {slide.body && <div className="mt-6">{slide.body}</div>}
            {slide.open && (
              <button onClick={() => { onClose(touched ? draft : null); onNavigate(slide.open!); }} className="mt-6 text-sm underline" style={{ color: 'var(--text-muted)' }}>
                Apri {slide.short} adesso
              </button>
            )}
            <div className="hidden md:block mt-10">{nav}</div>
          </div>
        </div>
      </div>

      <div className="md:hidden flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="px-5 py-4">{nav}</div>
      </div>
    </div>
  );
}

interface Slide {
  id: string;
  short: string;
  kicker: string;
  icon: React.ReactNode;
  title: string;
  text?: string;
  points?: string[];
  body?: React.ReactNode;
  open?: string; // section that can be opened straight from the slide
}

function buildSlides(d: OnboardingDraft, set: (p: Partial<OnboardingDraft>) => void, data: UserData, goTo: (id: string) => void): Slide[] {
  const ic = (I: typeof Sparkles) => <I className="w-6 h-6" />;
  const aiReady = isReady() || !!d.geminiKey.trim();
  const hidden = d.hiddenSections.filter(id => SECTIONS.some(s => s.id === id)).map(id => SECTIONS.find(s => s.id === id)!.label);
  const photo = { draftKey: d.geminiKey, onGoToAI: () => goTo('ai') };
  return [
    {
      id: 'intro', short: 'Benvenuto', kicker: 'Benvenuto', icon: ic(Rocket),
      title: 'MYND ti dice sempre cosa fare adesso.',
      text: 'Mette in ordine verifiche, compiti, voti e ore di studio in un unico posto e ti aiuta a capire dove migliorare.',
      points: [
        'Tutto insieme: impegni, voti, tempo di studio e materiali.',
        'Ogni giorno ti suggerisce cosa studiare, e perché.',
        'Un tutor AI che conosce i tuoi appunti.',
        'In pochi minuti lo configuriamo insieme: puoi saltare qualsiasi passaggio e riprendere quando vuoi da "Crea la tua MYND" nella Home.',
      ],
    },
    {
      id: 'ai', short: 'Collega l\'AI', kicker: 'Primo passo · AI', icon: ic(Sparkles),
      title: 'Colleghiamo l\'AI, gratis.',
      text: 'Ti serve per due cose: leggere le foto in questa guida (materie, voti, verifiche) e il tutor della Guida Studio AI. Si crea in un minuto, senza carta di credito. Se preferisci, salta: puoi farlo anche dopo.',
      body: <AIStep value={d.geminiKey} onChange={geminiKey => set({ geminiKey })} />,
    },
    {
      id: 'materie', short: 'Materie', kicker: 'Domanda · Materie', icon: ic(LayoutGrid),
      title: 'Quali sono le tue materie?',
      text: 'Scrivile una alla volta o tutte insieme separate da virgola, oppure fai una foto all\'orario o alla pagella. Ognuna prende un colore diverso: tocca il pallino per cambiarlo.',
      body: <SubjectsStep subjects={d.subjects} onChange={subjects => set({ subjects })} {...photo} />,
    },
    {
      id: 'impegni', short: 'Impegni', kicker: 'Funzione · Impegni', icon: ic(Target), open: 'impegni',
      title: 'Impegni: niente più scadenze dimenticate.',
      text: 'Verifiche, interrogazioni, compiti e impegni personali, con data, orario, materia e importanza.',
      points: [
        'La Home ti mostra sempre i prossimi.',
        'Il tempo che serve viene distribuito nei giorni della settimana.',
        'Quelli passati si segnano come fatti da soli.',
      ],
    },
    {
      id: 'impegni-q', short: 'Verifiche', kicker: 'Domanda · Impegni', icon: ic(Target),
      title: 'Hai verifiche o interrogazioni in arrivo?',
      text: 'Aggiungile a mano, oppure fai una foto al diario o al registro: l\'AI trova date e materie da sola.',
      body: <TasksStep subjects={d.subjects} tasks={d.tasks} onPatch={set} {...photo} />,
    },
    {
      id: 'voti', short: 'Voti', kicker: 'Funzione · Voti', icon: ic(BarChart3), open: 'voti',
      title: 'Voti: le medie si fanno da sole.',
      text: 'Inserisci i voti e MYND calcola la media di ogni materia, ti mostra la migliore e quella più debole.',
      points: [
        'Media generale e per materia sempre aggiornate.',
        'Le materie con la media bassa salgono nei consigli di studio.',
      ],
    },
    {
      id: 'voti-q', short: 'I tuoi voti', kicker: 'Domanda · Voti', icon: ic(BarChart3),
      title: 'Hai già preso dei voti quest\'anno?',
      text: 'Aggiungi quelli che ricordi, oppure fai una foto al registro elettronico o alla pagella: l\'AI li legge tutti.',
      body: <GradesStep subjects={d.subjects} grades={d.grades} onPatch={set} {...photo} />,
    },
    {
      id: 'timer', short: 'Timer Studio', kicker: 'Funzione · Timer Studio', icon: ic(Clock), open: 'timer',
      title: 'Timer Studio: sai quanto studi davvero.',
      text: 'Avvii il timer quando studi; alla fine il tempo va alla materia scelta, oppure lo dividi tra più materie.',
      points: [
        'Statistiche per giorno, settimana e anno, materia per materia.',
        'Serie di giorni di studio e obiettivo settimanale.',
        'Puoi avviarlo anche senza scegliere la materia e decidere dopo.',
      ],
    },
    {
      id: 'timer-q', short: 'Obiettivo', kicker: 'Domanda · Timer Studio', icon: ic(Clock),
      title: 'Quante ore vuoi studiare a settimana?',
      text: 'È il tuo obiettivo: in Home vedi a che punto sei. Puoi cambiarlo quando vuoi.',
      body: <GoalStep value={d.weeklyGoal} onChange={weeklyGoal => set({ weeklyGoal })} />,
    },
    {
      id: 'cosa', short: 'Cosa studiare', kicker: 'Funzione · Cosa studiare', icon: ic(BookMarked), open: 'cosa-studiare',
      title: 'Cosa studiare: la priorità di oggi, già pronta.',
      text: 'Ogni giorno MYND mette in ordine le materie guardando verifiche vicine, medie basse, ore che mancano e materie trascurate da troppo.',
      points: [
        'Il focus del giorno in cima.',
        'Per ogni consiglio ti dice il perché.',
        'Da lì fai partire subito il timer sulla materia giusta.',
      ],
    },
    {
      id: 'archivio', short: 'Archivio', kicker: 'Funzione · Archivio', icon: ic(Archive), open: 'archivio',
      title: 'Archivio: tutti i materiali in un posto.',
      text: 'Carichi appunti, PDF e foto del libro, divisi per materia e argomento. Puoi salvarli anche nel tuo Google Drive.',
      points: [
        'L\'AI legge i file e le foto e ne trascrive il testo.',
        'La Guida Studio AI li usa per risponderti.',
      ],
    },
    {
      id: 'calendario', short: 'Calendario', kicker: 'Funzione · Calendario', icon: ic(Calendar), open: 'calendario',
      title: 'Calendario: il mese a colpo d\'occhio.',
      text: 'Tutti gli impegni nel mese; tocchi un giorno per aggiungerne uno al volo.',
      points: ['Puoi esportarli nel calendario dell\'iPhone.'],
    },
    {
      id: 'guida', short: 'Guida Studio AI', kicker: 'Funzione · Guida Studio AI', icon: ic(Sparkles), open: 'guida-ai',
      title: 'Guida Studio AI: un tutor sempre disponibile.',
      text: 'Ti spiega gli argomenti, ti interroga e ti prepara alle verifiche usando i materiali del tuo Archivio.',
      points: [
        'Chat salvate in cartelle per materia.',
        'Puoi allegare la foto di un esercizio.',
        aiReady ? 'Usa l\'AI che hai collegato all\'inizio.' : 'Funziona gratis con la chiave Gemini (primo passo di questa guida).',
      ],
    },
    {
      id: 'sezioni', short: 'Menu', kicker: 'Domanda · Menu', icon: ic(LayoutGrid),
      title: 'Cosa vuoi vedere nel menu?',
      text: 'Nascondi quello che non usi: puoi cambiarlo quando vuoi rifacendo questa guida.',
      body: <SectionsStep hidden={d.hiddenSections} onChange={hiddenSections => set({ hiddenSections })} />,
    },
    {
      id: 'fine', short: 'Riepilogo', kicker: 'Fatto', icon: ic(Check),
      title: 'Tutto pronto.',
      text: 'Premi "Carica tutto" e MYND si prepara con le tue risposte.',
      body: (
        <ul className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-well)' }}>
          {[
            ['Materie', d.subjects.length ? `${d.subjects.length}: ${d.subjects.map(s => s.name).join(', ')}` : 'nessuna'],
            ['Verifiche e compiti', d.tasks.length ? `${d.tasks.length} da aggiungere` : 'nessuno'],
            ['Voti', d.grades.length ? `${d.grades.length} da aggiungere` : 'nessuno'],
            ['Obiettivo', `${d.weeklyGoal} ore a settimana`],
            ['AI', d.geminiKey.trim() ? 'Gemini collegata' : aiReady ? `già collegata (${providerLabel()})` : 'da collegare più avanti'],
            ['Menu', hidden.length ? `nascoste: ${hidden.join(', ')}` : 'tutte le sezioni'],
          ].map(([k, v]) => (
            <li key={k} className="flex gap-3 px-4 py-3 text-[15px]" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="w-32 flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>{k}</span>
              <span className="min-w-0" style={{ color: 'var(--text)' }}>{v}</span>
            </li>
          ))}
          {data.settings.onboardingSeen && <li className="px-4 py-3 text-xs" style={{ color: 'var(--text-subtle)' }}>I dati che hai già restano: vengono solo aggiunti quelli nuovi.</li>}
        </ul>
      ),
    },
  ];
}

// ---- Question steps ----

// The subject as already written in the list (same name, any case), or the new name capitalized.
function matchSubject(subjects: SubjectDef[], name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  return subjects.find(s => s.name.toLowerCase() === clean.toLowerCase())?.name || capitalize(clean);
}

// "Read from a photo": the image goes to the free Gemini (the only AI used to read files), which
// answers in plain lines; `onText` turns them into data and returns what it found.
function PhotoButton({ label, prompt, onText, draftKey, onGoToAI }: {
  label: string; prompt: () => string; onText: (text: string) => string; draftKey: string; onGoToAI: () => void;
}) {
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasKey = !!getKey('gemini') || !!draftKey.trim();

  const read = async (file: File) => {
    setReading(true); setNote(null);
    try {
      if (!getKey('gemini') && draftKey.trim()) setKey('gemini', draftKey.trim());
      const out = await transcribeFile(await blobToBase64(file), file.type || 'image/jpeg', prompt());
      const found = onText(out);
      setNote(found ? { ok: true, text: found } : { ok: false, text: 'Non ho trovato niente in questa foto. Prova con una foto più nitida o scrivi a mano.' });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setReading(false);
    }
  };

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) read(f); }} />
      <button onClick={() => (hasKey ? fileRef.current?.click() : onGoToAI())} disabled={reading}
        className="btn-secondary w-full h-12 !rounded-full inline-flex items-center justify-center gap-2 text-[15px]">
        {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        {reading ? 'Leggo la foto…' : label}
      </button>
      {!hasKey && <p className="text-xs mt-1.5" style={{ color: 'var(--text-subtle)' }}>Per leggere le foto serve l'AI gratuita: tocca il pulsante per collegarla, poi torna qui.</p>}
      {note && <p className="text-xs mt-1.5" style={{ color: note.ok ? 'var(--brand-ring)' : 'var(--danger)' }}>{note.ok ? '✓ ' : ''}{note.text}</p>}
    </div>
  );
}

const OR = (
  <div className="flex items-center gap-3 text-xs uppercase tracking-[0.12em]" style={{ color: 'var(--text-subtle)' }}>
    <span className="flex-1 h-px" style={{ background: 'var(--border)' }} /> oppure <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
  </div>
);

function SubjectsStep({ subjects, onChange, draftKey, onGoToAI }: { subjects: SubjectDef[]; onChange: (s: SubjectDef[]) => void; draftKey: string; onGoToAI: () => void }) {
  const [text, setText] = useState('');
  const [picking, setPicking] = useState<string | null>(null);

  const add = () => {
    const names = splitNames(text);
    if (names.length) onChange(addNames(subjects, names));
    setText('');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Es. Matematica, Italiano, Storia" aria-label="Materie" className="input-glass flex-1 min-w-0 h-12 text-[15px]" />
        <button onClick={add} disabled={!text.trim()} aria-label="Aggiungi" className="btn-primary w-12 h-12 !rounded-full !p-0 flex items-center justify-center flex-shrink-0 disabled:opacity-40">
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <PhotoButton label="Leggile da una foto (orario o pagella)" draftKey={draftKey} onGoToAI={onGoToAI}
        prompt={() => 'Questa immagine o documento contiene un orario scolastico, una pagella o un elenco di materie. Scrivi SOLO i nomi delle materie scolastiche, ' +
          'uno per riga, senza ripetizioni e senza orari, voti, giorni o nomi di professori. Usa il nome italiano normale (es. Matematica, Italiano, Storia).'}
        onText={out => {
          const names = splitNames(out);
          const added = names.filter(n => !subjects.some(s => s.name.toLowerCase() === n.toLowerCase()));
          onChange(addNames(subjects, names));
          return names.length ? `${added.length} materie aggiunte` : '';
        }} />

      {subjects.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-2">
            {subjects.map(s => (
              <span key={s.name} className="h-10 pl-1.5 pr-1 rounded-full glass-card !rounded-full inline-flex items-center gap-1.5 text-[15px]" style={{ color: 'var(--text)' }}>
                <button onClick={() => setPicking(picking === s.name ? null : s.name)} aria-label={`Cambia colore di ${s.name}`} aria-expanded={picking === s.name}
                  className="w-7 h-7 rounded-full flex items-center justify-center">
                  <span className="w-5 h-5 rounded-full" style={{ background: s.color, boxShadow: picking === s.name ? '0 0 0 2px var(--text)' : undefined }} />
                </button>
                {s.name}
                <button onClick={() => onChange(subjects.filter(x => x !== s))} aria-label={`Togli ${s.name}`} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'var(--text-subtle)' }}>
                  <X className="w-4 h-4" />
                </button>
              </span>
            ))}
          </div>
          {picking && (
            <div className="mt-3 p-3 rounded-2xl flex flex-wrap gap-2" style={{ background: 'var(--glass-well)' }} role="radiogroup" aria-label={`Colore di ${picking}`}>
              {SUBJECT_COLORS.map(c => {
                const on = subjects.find(s => s.name === picking)?.color.toLowerCase() === c.toLowerCase();
                return (
                  <button key={c} role="radio" aria-checked={on} aria-label={c} onClick={() => { onChange(subjects.map(s => (s.name === picking ? { ...s, color: c } : s))); setPicking(null); }}
                    className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: c, boxShadow: on ? '0 0 0 3px var(--text)' : undefined }}>
                    {on && <Check className="w-4 h-4 text-black/70" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubjectPicker({ subjects, value, onChange, id }: { subjects: SubjectDef[]; value: string; onChange: (v: string) => void; id: string }) {
  if (!subjects.length) {
    return <input id={id} value={value} onChange={e => onChange(e.target.value)} placeholder="Materia" className="input-glass w-full h-12 text-[15px]" />;
  }
  return (
    <select id={id} value={value} onChange={e => onChange(e.target.value)} className="input-glass w-full h-12 text-[15px]">
      <option value="">Materia…</option>
      {subjects.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
    </select>
  );
}

function RemovableList({ items, onRemove }: { items: { key: string; label: string; color?: string }[]; onRemove: (i: number) => void }) {
  if (!items.length) return null;
  return (
    <ul className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-well)' }}>
      {items.map((it, i) => (
        <li key={it.key} className="flex items-center gap-3 pl-4 pr-1 h-12 text-[15px]" style={{ color: 'var(--text)', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : undefined }}>
          {it.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: it.color }} />}
          <span className="flex-1 min-w-0 truncate">{it.label}</span>
          <button onClick={() => onRemove(i)} aria-label={`Togli ${it.label}`} className="w-11 h-11 flex items-center justify-center" style={{ color: 'var(--text-subtle)' }}><X className="w-4 h-4" /></button>
        </li>
      ))}
    </ul>
  );
}

const colorOf = (subjects: SubjectDef[], name: string) => subjects.find(s => s.name === name)?.color;
const longDate = (k: string) => new Date(k + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

type PhotoProps = { draftKey: string; onGoToAI: () => void };

function TasksStep({ subjects, tasks, onPatch, draftKey, onGoToAI }: PhotoProps & { subjects: SubjectDef[]; tasks: OnboardingDraft['tasks']; onPatch: (p: Partial<OnboardingDraft>) => void }) {
  const [kind, setKind] = useState<TaskKind>('verifica');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState('');
  const add = () => {
    if (!date) return;
    onPatch({ tasks: [...tasks, { kind, subject: subject.trim(), date }] });
    setSubject(''); setDate('');
  };
  // Lines "2026-12-15 | verifica | Matematica": only from today on, new subjects join the list.
  const fromPhoto = (out: string) => {
    const today = todayKey();
    let list = subjects;
    const found: OnboardingDraft['tasks'] = [];
    for (const line of out.split('\n')) {
      const m = line.match(/(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.*)$/);
      if (!m || m[1] < today) continue;
      const k = m[2].toLowerCase();
      const name = m[3].replace(/[*_]/g, '').trim();
      const subj = name && name.length <= 40 ? matchSubject(list, name) : '';
      if (subj) list = addNames(list, [subj]);
      const t = { kind: (k.includes('interrog') ? 'interrogazione' : k.includes('compit') ? 'compito' : 'verifica') as TaskKind, subject: subj, date: m[1] };
      if (![...tasks, ...found].some(x => x.date === t.date && x.kind === t.kind && x.subject === t.subject)) found.push(t);
    }
    if (found.length) onPatch({ tasks: [...tasks, ...found], subjects: list });
    return found.length ? `${found.length} ${found.length === 1 ? 'impegno trovato' : 'impegni trovati'}` : '';
  };
  return (
    <div className="space-y-4">
      <PhotoButton label="Leggili da una foto (diario o registro)" draftKey={draftKey} onGoToAI={onGoToAI} onText={fromPhoto}
        prompt={() => `Oggi è ${longDate(todayKey())} (${todayKey()}). Questa immagine contiene un diario, un registro elettronico, un calendario o un elenco con verifiche, ` +
          'interrogazioni o compiti. Scrivi SOLO quelli da oggi in poi, uno per riga, nel formato: AAAA-MM-GG | tipo | materia — dove tipo è verifica, interrogazione o compito. ' +
          'Se manca l\'anno usa quello che rende la data futura. Usa il nome italiano normale della materia. Nessun altro testo.'} />
      {OR}
      <div className="flex gap-1 p-1 rounded-full w-fit" style={{ background: 'var(--glass-well)' }} role="radiogroup" aria-label="Tipo">
        {KINDS.map(k => (
          <button key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
            className={`h-10 px-4 rounded-full text-sm font-medium ${kind === k.id ? 'glass-lens' : ''}`} style={{ color: kind === k.id ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{k.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <SubjectPicker id="ob-task-subject" subjects={subjects} value={subject} onChange={setSubject} />
        <input type="date" value={date} min={todayKey()} onChange={e => setDate(e.target.value)} aria-label="Data" className="input-glass w-full h-12 text-[15px]" />
      </div>
      <button onClick={add} disabled={!date} className="btn-secondary w-full h-12 !rounded-full inline-flex items-center justify-center gap-2 text-[15px] disabled:opacity-40">
        <Plus className="w-4 h-4" /> Aggiungi
      </button>
      <RemovableList
        items={[...tasks].sort((a, b) => a.date.localeCompare(b.date)).map(t => ({
          key: `${t.date}-${t.kind}-${t.subject}`,
          label: `${KINDS.find(k => k.id === t.kind)!.label}${t.subject ? ` di ${t.subject}` : ''} · ${new Date(t.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}`,
          color: colorOf(subjects, t.subject),
        }))}
        onRemove={i => { const sorted = [...tasks].sort((a, b) => a.date.localeCompare(b.date)); onPatch({ tasks: tasks.filter(x => x !== sorted[i]) }); }}
      />
    </div>
  );
}

function GradesStep({ subjects, grades, onPatch, draftKey, onGoToAI }: PhotoProps & { subjects: SubjectDef[]; grades: OnboardingDraft['grades']; onPatch: (p: Partial<OnboardingDraft>) => void }) {
  const [subject, setSubject] = useState('');
  const [value, setValue] = useState('');
  const num = Number(value.replace(',', '.'));
  const valid = subject.trim() && value && num >= 1 && num <= 10;
  const add = () => {
    if (!valid) return;
    const name = matchSubject(subjects, subject);
    onPatch({ grades: [...grades, { subject: name, value: Math.round(num * 100) / 100 }], subjects: addNames(subjects, [name]) });
    setValue('');
  };
  // Lines "Matematica | 7.5": new subjects join the list.
  const fromPhoto = (out: string) => {
    let list = subjects;
    const found: OnboardingDraft['grades'] = [];
    for (const line of out.split('\n')) {
      const m = line.replace(/[*_]/g, '').match(/^[\s\-•·]*(.+?)\s*[|:;\t]\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*$/);
      if (!m) continue;
      const v = Number(m[2].replace(',', '.'));
      if (!(v >= 1 && v <= 10) || m[1].length > 40) continue;
      const name = matchSubject(list, m[1]);
      list = addNames(list, [name]);
      found.push({ subject: name, value: Math.round(v * 100) / 100 });
    }
    if (found.length) onPatch({ grades: [...grades, ...found], subjects: list });
    return found.length ? `${found.length} ${found.length === 1 ? 'voto trovato' : 'voti trovati'}` : '';
  };
  return (
    <div className="space-y-4">
      <PhotoButton label="Leggili da una foto (registro o pagella)" draftKey={draftKey} onGoToAI={onGoToAI} onText={fromPhoto}
        prompt={() => 'Questa immagine contiene dei voti scolastici (registro elettronico, pagella, diario o un elenco). Scrivi SOLO i voti, uno per riga, nel formato: ' +
          'Materia | voto. Il voto è un numero da 1 a 10 con il punto per i decimali: 7+ = 7.25, 7- = 6.75, 7½ o 7/8 = 7.5, 6-- = 5.5. ' +
          'Ignora medie, assenze, note, giudizi senza numero e voti di condotta. Usa il nome italiano normale della materia. Nessun altro testo.'} />
      {OR}
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
        <SubjectPicker id="ob-grade-subject" subjects={subjects} value={subject} onChange={setSubject} />
        <input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="Voto" aria-label="Voto da 1 a 10" className="input-glass w-full h-12 text-[15px] tabular" />
      </div>
      {value && !(num >= 1 && num <= 10) && <p className="text-xs" style={{ color: 'var(--danger)' }}>Scrivi un voto da 1 a 10 (anche 6,5).</p>}
      <button onClick={add} disabled={!valid} className="btn-secondary w-full h-12 !rounded-full inline-flex items-center justify-center gap-2 text-[15px] disabled:opacity-40">
        <Plus className="w-4 h-4" /> Aggiungi voto
      </button>
      <RemovableList
        items={grades.map((g, i) => ({ key: `${i}-${g.subject}-${g.value}`, label: `${g.subject} · ${String(g.value).replace('.', ',')}`, color: colorOf(subjects, g.subject) }))}
        onRemove={i => onPatch({ grades: grades.filter((_, j) => j !== i) })}
      />
    </div>
  );
}

function GoalStep({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-center tabular font-bold" style={{ fontSize: 64, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1 }}>
        {value}<span className="text-2xl font-semibold ml-1" style={{ color: 'var(--text-muted)' }}>ore</span>
      </p>
      <p className="text-center text-sm" style={{ color: 'var(--text-subtle)' }}>circa {Math.round((value / 6) * 10) / 10} ore al giorno, 6 giorni su 7</p>
      <input type="range" min={1} max={40} value={value} onChange={e => onChange(Number(e.target.value))} aria-label="Ore di studio a settimana" className="w-full accent-[var(--brand-fill)]" />
      <div className="flex gap-2 justify-center flex-wrap">
        {[5, 10, 15, 20].map(v => (
          <button key={v} onClick={() => onChange(v)} className={`h-10 px-4 rounded-full text-sm font-medium ${value === v ? 'glass-lens' : 'btn-secondary'}`} style={{ color: value === v ? 'var(--brand-ring)' : undefined }}>{v} ore</button>
        ))}
      </div>
    </div>
  );
}

function AIStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ready = isReady();
  const v = value.trim();
  return (
    <div className="space-y-4">
      {ready && !v && (
        <p className="rounded-2xl px-4 py-3 text-[15px] flex items-center gap-2" style={{ background: 'var(--glass-well)', color: 'var(--text)' }}>
          <Check className="w-4 h-4" style={{ color: 'var(--brand-ring)' }} /> L'AI è già collegata ({providerLabel()}). Puoi saltare.
        </p>
      )}
      <ol className="space-y-3">
        {[
          <>Apri <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1" style={{ color: 'var(--brand-ring)' }}>aistudio.google.com <ExternalLink className="w-3.5 h-3.5" /></a> e accedi con il tuo account Google.</>,
          <>Premi <b>Create API key</b> (Crea chiave API). Se te lo chiede, accetta i termini.</>,
          <>Copia la chiave (inizia con <b>AIza</b>) e incollala qui sotto.</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-3 text-[15px]" style={{ color: 'var(--text)' }}>
            <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold tabular" style={{ border: '1.5px solid var(--brand-ring)', color: 'var(--brand-ring)' }}>{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <input type="password" value={value} onChange={e => onChange(e.target.value)} placeholder="AIza…" aria-label="Chiave Gemini" autoComplete="off" className="input-glass w-full h-12 text-[15px]" />
      {v && !v.startsWith('AIza') && <p className="text-xs" style={{ color: 'var(--danger)' }}>Di solito la chiave inizia con "AIza": controlla di averla copiata tutta.</p>}
      <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>La chiave resta salvata solo su questo dispositivo. Con la versione gratuita Google può usare le domande per migliorare i suoi modelli: evita dati personali.</p>
    </div>
  );
}

function SectionsStep({ hidden, onChange }: { hidden: string[]; onChange: (h: string[]) => void }) {
  return (
    <ul className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-well)' }}>
      {SECTIONS.filter(s => s.id !== 'home').map((s, i, all) => {
        const on = !hidden.includes(s.id);
        return (
          <li key={s.id} style={{ borderBottom: i < all.length - 1 ? '1px solid var(--border)' : undefined }}>
            <button role="switch" aria-checked={on} onClick={() => onChange(on ? [...hidden, s.id] : hidden.filter(x => x !== s.id))}
              className="w-full h-14 px-4 flex items-center gap-3 text-[15px]" style={{ color: 'var(--text)' }}>
              <s.icon className="w-5 h-5" style={{ color: on ? 'var(--brand-ring)' : 'var(--text-subtle)' }} />
              <span className="flex-1 text-left">{s.label}</span>
              <span className="w-11 h-[26px] rounded-full p-[3px] transition-colors" style={{ background: on ? 'var(--brand-fill)' : 'var(--border)' }}>
                <span className="block w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: on ? 'translateX(18px)' : 'none' }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
