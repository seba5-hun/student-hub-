// "Dai un'occhiata": an example student, so anyone can try MYND without an account. The data is
// built around today's date (upcoming tests, last weeks' study) and lives only in memory: nothing
// is saved anywhere.

import { UserData, AuthUser, toDateKey } from './store';
import { buildSeries, weekdayOf } from './recurrence';

export const DEMO_USER: AuthUser = { id: 'demo', email: 'ospite@myndspace.world' };
export const isDemoUser = (user: AuthUser | null | undefined) => user?.id === DEMO_USER.id;

const day = (offset: number, hour?: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (hour !== undefined) { d.setHours(hour, 0, 0, 0); return d.toISOString(); }
  return toDateKey(d);
};

const file = (path: string, mimeType: string, size: number, originalName: string) => ({
  path: `demo/${path}`, mimeType, size, originalName, textStatus: 'done' as const, textPath: `demo/${path}.txt`,
});

export function createDemoData(): UserData {
  const subjects = [
    { name: 'Matematica', color: '#83AFDF' },
    { name: 'Italiano', color: '#D89B7C' },
    { name: 'Storia', color: '#6BBDAB' },
    { name: 'Inglese', color: '#ABA1DD' },
    { name: 'Fisica', color: '#C9A46C' },
    { name: 'Scienze', color: '#8CB987' },
  ];
  const task = (id: string, title: string, offset: number, extra: Record<string, unknown> = {}) => ({
    id, title, date: day(offset), type: 'scolastico' as const, importance: 3 as const, estimatedTime: 60, done: false, ...extra,
  });
  const tasks = [
    task('d-t1', 'Verifica di Matematica: equazioni di 2° grado', 2, { subject: 'Matematica', importance: 5, estimatedTime: 180, time: '09:00' }),
    task('d-t2', 'Interrogazione di Storia: Rivoluzione francese', 4, { subject: 'Storia', importance: 4, estimatedTime: 120 }),
    task('d-t3', 'Tema di Italiano da consegnare', 6, { subject: 'Italiano', importance: 3, estimatedTime: 90 }),
    task('d-t4', 'Verifica di Inglese: Romanticismo', 9, { subject: 'Inglese', importance: 4, estimatedTime: 120, movedFrom: day(5) }),
    task('d-t5', 'Esercizi di Fisica pag. 112', 1, { subject: 'Fisica', importance: 2, estimatedTime: 45 }),
    task('d-t7', 'Laboratorio di Scienze: relazione', 12, { subject: 'Scienze', importance: 3, estimatedTime: 60 }),
    task('d-t8', 'Ricerca su Leopardi', -3, { subject: 'Italiano', done: true }),
    task('d-t9', 'Verifica di Scienze', -6, { subject: 'Scienze', done: true, importance: 4 }),
    // Training twice a week until the end of next month: a repeated task.
    ...buildSeries(task('d-t6', 'Allenamento', 0, { type: 'personale', importance: 2, estimatedTime: 90, time: '18:00', endTime: '19:30' }),
      { freq: 'weekly', interval: 1, days: [...new Set([weekdayOf(day(0)), (weekdayOf(day(0)) + 3) % 7])], until: day(45) }, 'd-series-1'),
  ];
  const grades: UserData['grades'] = [];
  const marks: Record<string, number[]> = {
    Matematica: [5.5, 6, 6.5, 5], Italiano: [7, 7.5, 8], Storia: [8, 7, 8.5], Inglese: [7.5, 8, 7], Fisica: [6, 5.5, 6.5], Scienze: [8, 8.5],
  };
  Object.entries(marks).forEach(([subject, values]) => values.forEach((value, i) => grades.push({
    id: `d-g-${subject}-${i}`, subject, value, description: i === values.length - 1 ? 'Ultima verifica' : '', date: day(-60 + i * 14),
  })));
  // About two weeks of study, a bit every day (so the streak and the charts have something to show).
  const sessions: UserData['sessions'] = [];
  const plan: [string, number][] = [['Matematica', 75], ['Storia', 50], ['Inglese', 40], ['Fisica', 45], ['Italiano', 35], ['Matematica', 60], ['Scienze', 30]];
  for (let d = 13; d >= 0; d--) {
    const [subject, minutes] = plan[d % plan.length];
    sessions.push({ id: `d-s-${d}`, subject, duration: minutes + ((d * 7) % 20), date: day(-d, 16) });
    if (d % 3 === 0) sessions.push({ id: `d-s-${d}-b`, subject: 'Matematica', duration: 30, date: day(-d, 20) });
  }
  const archive: UserData['archive'] = [
    { id: 'd-a1', subject: 'Storia', topic: 'Rivoluzione francese', name: 'Capitolo 3 – La crisi dell\'Antico regime', file: file('storia-cap3.pdf', 'application/pdf', 2_400_000, 'storia-cap3.pdf') },
    { id: 'd-a2', subject: 'Storia', topic: 'Rivoluzione francese', name: 'Appunti – presa della Bastiglia – pag. 12', file: { ...file('bastiglia.jpg', 'image/jpeg', 850_000, 'bastiglia.jpg'), pageLabel: '12' } },
    { id: 'd-a3', subject: 'Matematica', topic: 'Equazioni di 2° grado', name: 'Formule e esercizi svolti', file: file('equazioni.pdf', 'application/pdf', 1_100_000, 'equazioni.pdf') },
    { id: 'd-a4', subject: 'Inglese', topic: 'Romanticismo', name: 'Wordsworth e Coleridge', file: file('romanticismo.pdf', 'application/pdf', 1_700_000, 'romanticismo.pdf') },
    { id: 'd-a5', subject: 'Fisica', topic: 'Moto rettilineo', name: 'Schema del capitolo', file: file('moto.jpg', 'image/jpeg', 640_000, 'moto.jpg') },
    { id: 'd-a6', subject: 'Italiano', topic: 'Leopardi', name: 'Video lezione su L\'infinito', link: 'https://it.wikipedia.org/wiki/L%27infinito' },
  ];
  return {
    tasks, grades, sessions, archive,
    settings: {
      darkMode: true, weeklyGoal: 12, colorTheme: 'default', subjects, onboardingSeen: true,
      notes: 'Chiedere alla prof di Fisica gli esercizi in più.\nPortare la calcolatrice giovedì!',
    },
  };
}
