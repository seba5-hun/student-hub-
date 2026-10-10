import { SubjectDef, UserData, createId, todayKey } from './store';
import { isReady, setKey, setProvider } from './ai';

// Answers of the "App" guide (components/Onboarding.tsx) and how they are saved. Kept apart from
// the guide itself, so the guide's code is downloaded only when it opens.

export type TaskKind = 'verifica' | 'interrogazione' | 'compito';
export const KINDS: { id: TaskKind; label: string; importance: 3 | 4 | 5; minutes: number }[] = [
  { id: 'verifica', label: 'Verifica', importance: 5, minutes: 120 },
  { id: 'interrogazione', label: 'Interrogazione', importance: 4, minutes: 90 },
  { id: 'compito', label: 'Compito', importance: 3, minutes: 60 },
];

export interface OnboardingDraft {
  subjects: SubjectDef[];
  tasks: { kind: TaskKind; subject: string; date: string }[];
  grades: { subject: string; value: number }[];
  weeklyGoal: number;
  hiddenSections: string[];
  geminiKey: string;
}

// Merges the answers into the user's data (subjects removed in the tour are not re-added later).
export function applyOnboarding(prev: UserData, d: OnboardingDraft): UserData {
  const before = prev.settings.subjects || [];
  const removed = before.filter(b => !d.subjects.some(s => s.name.toLowerCase() === b.name.toLowerCase())).map(b => b.name);
  const hiddenSubjects = [...new Set((prev.settings.hiddenSubjects || [])
    .filter(h => !d.subjects.some(s => s.name.toLowerCase() === h.toLowerCase()))
    .concat(removed))];
  const tasks = d.tasks.map(t => {
    const k = KINDS.find(x => x.id === t.kind)!;
    return {
      id: createId(), title: t.subject ? `${k.label} di ${t.subject}` : k.label, date: t.date, type: 'scolastico' as const,
      importance: k.importance, estimatedTime: k.minutes, done: false, ...(t.subject ? { subject: t.subject } : {}),
    };
  });
  const grades = d.grades.map(g => ({ id: createId(), subject: g.subject, value: g.value, description: '', date: todayKey() }));
  return {
    ...prev,
    tasks: [...prev.tasks, ...tasks],
    grades: [...prev.grades, ...grades],
    settings: { ...prev.settings, subjects: d.subjects, hiddenSubjects, weeklyGoal: d.weeklyGoal, hiddenSections: d.hiddenSections, onboardingSeen: true },
  };
}


// Called by the app after "Carica tutto": the key lives in this browser, like the AI settings.
export function applyOnboardingKey(d: OnboardingDraft) {
  const key = d.geminiKey.trim();
  if (!key) return;
  const wasReady = isReady();
  setKey('gemini', key);
  if (!wasReady) setProvider('free');
}
