// "Adatta MYND a te": the kind of student (high school, middle school, university, online school, a
// test or public exam…) changes the names of the sections and of things ("Verifica" → "Esame",
// "Materia" → "Corso"), the grade scale (1–10, 18–30 e lode with CFU, scores out of 100) and what
// the tutor knows. The student can also describe what they need and let the AI choose.

import { createContext, useContext } from 'react';
import { StudyProfile, StudentKind, LabelKey, Grade, fromOn10, gradeOn10, toDateKey, parseDate } from './store';

export interface KindPreset {
  kind: StudentKind;
  emoji: string;
  title: string;
  blurb: string;
  gradeScale: 10 | 30 | 100;
  labels: Record<LabelKey, string>;
  // For the tutor: who the student is, and how to quiz them.
  tutor: string;
  quiz: string;
  taskPlaceholder: string;
  // "Ripeti … fino a": the end of the school year / semester (null: no such date).
  termEndLabel: string | null;
}

const SCHOOL: Record<LabelKey, string> = {
  impegni: 'Impegni', voti: 'Voti', archivio: 'Archivio', 'cosa-studiare': 'Cosa studiare', timer: 'Timer Studio',
  calendario: 'Calendario', 'guida-ai': 'Guida Studio AI',
  subject: 'Materia', subjects: 'Materie', test: 'Verifica', tests: 'Verifiche', oral: 'Interrogazione',
  homework: 'Compito', grade: 'Voto', grades: 'Voti', studyType: 'Scolastico',
};

export const PRESETS: Record<StudentKind, KindPreset> = {
  superiori: {
    kind: 'superiori', emoji: '🎒', title: 'Scuola superiore', blurb: 'Verifiche, interrogazioni e voti in decimi.',
    gradeScale: 10, labels: SCHOOL,
    tutor: 'uno studente delle scuole superiori italiane',
    quiz: 'con un voto in decimi motivato',
    taskPlaceholder: 'Es. Verifica di matematica', termEndLabel: 'Fine della scuola',
  },
  medie: {
    kind: 'medie', emoji: '✏️', title: 'Scuola media', blurb: 'Come le superiori, con spiegazioni più semplici.',
    gradeScale: 10, labels: SCHOOL,
    tutor: 'uno studente delle scuole medie italiane (11–14 anni): usa parole semplici, frasi brevi e tanti esempi della vita di tutti i giorni',
    quiz: 'con un voto in decimi motivato e un incoraggiamento',
    taskPlaceholder: 'Es. Compito di grammatica', termEndLabel: 'Fine della scuola',
  },
  universita: {
    kind: 'universita', emoji: '🎓', title: 'Università', blurb: 'Esami, CFU, libretto in trentesimi e media ponderata.',
    gradeScale: 30,
    labels: {
      impegni: 'Esami e scadenze', voti: 'Libretto', archivio: 'Materiali', 'cosa-studiare': 'Cosa studiare', timer: 'Timer Studio',
      calendario: 'Calendario', 'guida-ai': 'Guida Studio AI',
      subject: 'Corso', subjects: 'Corsi', test: 'Esame', tests: 'Esami', oral: 'Orale',
      homework: 'Esercitazione', grade: 'Voto', grades: 'Esami', studyType: 'Università',
    },
    tutor: 'uno studente universitario italiano che prepara esami scritti e orali: puoi andare in profondità, usare il linguaggio tecnico della disciplina e collegare gli argomenti tra loro',
    quiz: 'come all\'orale d\'esame, con un voto in trentesimi motivato',
    taskPlaceholder: 'Es. Esame di Analisi 1 (scritto)', termEndLabel: 'Fine del semestre',
  },
  online: {
    kind: 'online', emoji: '💻', title: 'Scuola online', blurb: 'Videolezioni, consegne e verifiche a distanza.',
    gradeScale: 10,
    labels: {
      ...SCHOOL, impegni: 'Consegne e verifiche', archivio: 'Lezioni e materiali', homework: 'Consegna',
    },
    tutor: 'uno studente di una scuola online o a distanza: studia spesso da solo, con videolezioni e consegne da inviare; aiutalo anche a organizzarsi e a restare costante',
    quiz: 'con un voto in decimi motivato',
    taskPlaceholder: 'Es. Consegna di storia sulla piattaforma', termEndLabel: 'Fine dell\'anno',
  },
  test: {
    kind: 'test', emoji: '🎯', title: 'Test o concorso', blurb: 'Test d\'ingresso, concorsi e certificazioni: simulazioni e punteggi.',
    gradeScale: 100,
    labels: {
      impegni: 'Scadenze e simulazioni', voti: 'Punteggi', archivio: 'Archivio', 'cosa-studiare': 'Cosa ripassare', timer: 'Timer Studio',
      calendario: 'Calendario', 'guida-ai': 'Guida Studio AI',
      subject: 'Materia', subjects: 'Materie', test: 'Simulazione', tests: 'Simulazioni', oral: 'Prova orale',
      homework: 'Esercizi', grade: 'Punteggio', grades: 'Punteggi', studyType: 'Preparazione',
    },
    tutor: 'una persona che si prepara a un test d\'ingresso, a un concorso o a una certificazione: conta allenarsi su quiz a risposta multipla, con il tempo contato, e ripassare gli argomenti più frequenti',
    quiz: 'come in una simulazione (anche a risposta multipla), con un punteggio in centesimi',
    taskPlaceholder: 'Es. Simulazione completa del test', termEndLabel: null,
  },
  altro: {
    kind: 'altro', emoji: '✨', title: 'Altro', blurb: 'Descrivi come studi: MYND si adatta.',
    gradeScale: 10, labels: SCHOOL,
    tutor: 'una persona che studia (vedi la descrizione che ha dato di sé)',
    quiz: 'con una valutazione motivata',
    taskPlaceholder: 'Es. Ripasso del capitolo 3', termEndLabel: null,
  },
};

export const KIND_ORDER: StudentKind[] = ['superiori', 'medie', 'universita', 'online', 'test', 'altro'];
export const LABEL_KEYS = Object.keys(SCHOOL) as LabelKey[];
export const SECTION_KEYS: LabelKey[] = ['impegni', 'voti', 'archivio', 'cosa-studiare', 'timer', 'calendario', 'guida-ai'];

export interface ProfileApi {
  profile: StudyProfile;
  preset: KindPreset;
  scale: 10 | 30 | 100;
  // Name of a thing or a section ("Materia", "Esami e scadenze"); l(): lower case for the middle of a sentence.
  L: (key: LabelKey) => string;
  l: (key: LabelKey) => string;
  // Name of a menu section (sections without a name of their own keep `fallback`).
  section: (id: string, fallback: string) => string;
  // An average on the 1–10 scale shown on the student's scale ("27,4", "7,5", "74").
  showAvg: (v10: number) => string;
  showGrade: (g: Pick<Grade, 'value' | 'scale' | 'lode'>) => string;
  termEnd: (from: string) => string | null;
  tutorIntro: string;
}

export const DEFAULT_PROFILE: StudyProfile = { kind: 'superiori' };

const lowerFirst = (s: string) => (/^[A-Z][a-zà-ù]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const fmt = (v: number, decimals: number) => String(Number(v.toFixed(decimals))).replace('.', ',');

export function makeProfileApi(profile: StudyProfile = DEFAULT_PROFILE): ProfileApi {
  const preset = PRESETS[profile.kind] || PRESETS.superiori;
  const scale = profile.gradeScale || preset.gradeScale;
  const L = (key: LabelKey) => (profile.labels?.[key]?.trim() || preset.labels[key]);
  const showAvg = (v10: number) => fmt(fromOn10(v10, scale), scale === 100 ? 0 : 1);
  return {
    profile, preset, scale, L,
    l: key => lowerFirst(L(key)),
    section: (id, fallback) => ((SECTION_KEYS as string[]).includes(id) ? L(id as LabelKey) : fallback),
    showAvg,
    showGrade: g => {
      const own = g.scale || 10;
      if (own === 30) return `${g.value}${g.lode ? ' e lode' : ''}`;
      if (own === 100) return `${fmt(g.value, 0)}%`;
      return scale === 10 ? fmt(g.value, 2) : `${fmt(g.value, 2)}/10`;
    },
    termEnd: from => {
      if (!preset.termEndLabel) return null;
      const d = parseDate(from);
      const y = d.getFullYear(), m = d.getMonth();
      let end: Date;
      if (profile.kind === 'universita') {
        // First semester until the end of January, second until the end of June.
        end = m <= 0 ? new Date(y, 0, 31) : m <= 5 ? new Date(y, 5, 30) : new Date(y + 1, 0, 31);
      } else {
        end = new Date(m >= 6 ? y + 1 : y, 5, 10);  // 10 June of this school year
      }
      if (end <= d) end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate());
      return toDateKey(end);
    },
    tutorIntro: [
      `Stai aiutando ${preset.tutor}.`,
      profile.description ? `Come si descrive lo studente: «${profile.description.trim().slice(0, 600)}».` : '',
      profile.focus ? `Da tenere presente: ${profile.focus.trim().slice(0, 600)}` : '',
    ].filter(Boolean).join('\n'),
  };
}

export const ProfileContext = createContext<ProfileApi>(makeProfileApi());
export const useProfile = () => useContext(ProfileContext);

// Average of the grades on 1–10 (all subjects), and for university the weighted average by CFU.
export function overallAverage(grades: Grade[]): number | null {
  if (!grades.length) return null;
  return grades.reduce((s, g) => s + gradeOn10(g), 0) / grades.length;
}

export function universityStats(grades: Grade[]) {
  const exams = grades.filter(g => g.scale === 30 && g.value >= 18);
  const cfu = exams.reduce((s, g) => s + (g.cfu || 0), 0);
  const weighted = cfu > 0 ? exams.reduce((s, g) => s + Math.min(g.value, 30) * (g.cfu || 0), 0) / cfu : null;
  const arithmetic = exams.length ? exams.reduce((s, g) => s + Math.min(g.value, 30), 0) / exams.length : null;
  const lodi = exams.filter(g => g.lode).length;
  return { count: exams.length, cfu, weighted, arithmetic, base: weighted !== null ? (weighted * 110) / 30 : null, lodi };
}

// ---------- "Descrivi di cosa hai bisogno": the AI chooses kind, names and what the tutor should know

export const ADAPT_SYSTEM = `Sei il configuratore di MYND, un'app italiana per organizzare lo studio (sezioni: Impegni, Voti, Archivio dei file, Cosa studiare, Timer Studio, Calendario, Guida Studio AI).
Lo studente descrive come studia e di cosa ha bisogno. Tu scegli come adattare l'app e rispondi SOLO con un oggetto JSON, senza testo prima o dopo, con questa forma:
{
  "kind": "superiori" | "medie" | "universita" | "online" | "test" | "altro",
  "gradeScale": 10 | 30 | 100,
  "labels": {
    "impegni": "...", "voti": "...", "archivio": "...", "cosa-studiare": "...", "timer": "...", "calendario": "...", "guida-ai": "...",
    "subject": "...", "subjects": "...", "test": "...", "tests": "...", "oral": "...", "homework": "...", "grade": "...", "grades": "...", "studyType": "..."
  },
  "focus": "...",
  "summary": "..."
}
Regole:
- kind: superiori e medie = scuola; universita = università (esami, CFU, voti in trentesimi); online = scuola online o a distanza; test = test d'ingresso, concorsi, certificazioni, patente, esami di lingua; altro = tutto il resto (corsi, formazione, studio per lavoro…).
- gradeScale: 30 per l'università, 100 per punteggi di test e simulazioni, altrimenti 10.
- labels: nomi in italiano, brevi (massimo 22 caratteri), con la maiuscola iniziale, chiari per quello studente. Le chiavi delle sezioni sono i nomi del menu; "subject" è come chiama le materie (es. Materia, Corso, Modulo), "subjects" il plurale; "test" la prova scritta (Verifica, Esame, Simulazione), "tests" il plurale; "oral" la prova orale; "homework" i compiti (Compito, Esercitazione, Consegna); "grade" e "grades" il voto e i voti (o Punteggio, Esami); "studyType" il tipo di impegno di studio (Scolastico, Università, Lavoro…). Cambia solo ciò che serve davvero: se un nome va già bene, lascia quello usuale.
- focus: 2–3 frasi per il tutor AI su chi è lo studente, cosa prepara, le scadenze o i limiti che ha detto, e come aiutarlo meglio. Non inventare dati che non ha scritto.
- summary: 1 frase rivolta allo studente (dandogli del tu) su come hai adattato MYND.`;

export interface AdaptResult { profile: StudyProfile; summary: string }

// Reads the AI's answer; anything missing or odd falls back to the names of the kind.
export function parseAdaptAnswer(answer: string, description: string): AdaptResult {
  const match = answer.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('L\'AI non ha risposto nel formato giusto. Riprova o scegli un profilo qui sopra.');
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(match[0]); } catch { throw new Error('L\'AI non ha risposto nel formato giusto. Riprova o scegli un profilo qui sopra.'); }
  const kind = KIND_ORDER.includes(raw.kind as StudentKind) ? raw.kind as StudentKind : 'altro';
  const preset = PRESETS[kind];
  const scale = [10, 30, 100].includes(Number(raw.gradeScale)) ? Number(raw.gradeScale) as 10 | 30 | 100 : preset.gradeScale;
  const labels: Partial<Record<LabelKey, string>> = {};
  const given = (raw.labels && typeof raw.labels === 'object' ? raw.labels : {}) as Record<string, unknown>;
  for (const key of LABEL_KEYS) {
    const v = typeof given[key] === 'string' ? (given[key] as string).replace(/\s+/g, ' ').trim() : '';
    if (v && v.length <= 28 && v !== preset.labels[key]) labels[key] = v.charAt(0).toUpperCase() + v.slice(1);
  }
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    profile: { kind, description: description.trim(), focus: text(raw.focus, 600) || undefined, labels, gradeScale: scale === preset.gradeScale ? undefined : scale },
    summary: text(raw.summary, 300),
  };
}
