// MYND's building blocks: small ready-made pieces in the app's style (checklist, counter, habits,
// countdown, progress, note, links, filtered tasks) that the student or the Assistente MYND puts
// on the Home or in new menu sections. Only data: there is no code to run, so they are safe.

import { UserData, UserSettings, CustomBlock, CustomSection, CustomSpace, BlockKind, createId } from './store';

export const BLOCK_KINDS: { kind: BlockKind; label: string; wide: boolean; hint: string }[] = [
  { kind: 'checklist', label: 'Lista', wide: false, hint: 'config: {"items":[{"text":"Ripassare cap. 3","done":false}]}' },
  { kind: 'counter', label: 'Contatore', wide: false, hint: 'config: {"unit":"bicchieri d\'acqua","target":8,"daily":true} (si azzera ogni giorno se daily)' },
  { kind: 'habits', label: 'Abitudini della settimana', wide: true, hint: 'config: {"habits":["Leggere 20 minuti","Niente telefono dopo le 22"]}' },
  { kind: 'countdown', label: 'Conto alla rovescia', wide: false, hint: 'config: {"date":"2027-06-18","label":"alla Maturità"}' },
  { kind: 'progress', label: 'Avanzamento', wide: false, hint: 'config: {"current":40,"target":200,"unit":"pagine"}' },
  { kind: 'note', label: 'Nota', wide: false, hint: 'config: {"text":"testo libero"}' },
  { kind: 'links', label: 'Link', wide: false, hint: 'config: {"links":[{"label":"Classroom","url":"https://classroom.google.com"}]}' },
  { kind: 'tasks', label: 'Impegni filtrati', wide: true, hint: 'config: {"filter":"upcoming|school|personal","subject":"Matematica","limit":5}' },
];
export const isBlockKind = (k: string): k is BlockKind => BLOCK_KINDS.some(b => b.kind === k);
export const MAX_APP_HTML = 150_000;      // characters of a mini-app page
export const MAX_APP_STORE = 200_000;     // characters of a mini-app's saved data (as JSON)
export const blockWide = (k: BlockKind) => k === 'app' || !!BLOCK_KINDS.find(b => b.kind === k)?.wide;

export const SECTION_ICONS = ['star', 'book', 'target', 'heart', 'flame', 'list', 'calendar', 'sparkles', 'music', 'dumbbell', 'brain', 'coffee'];


export const customOf = (s: UserSettings): CustomSpace => ({ ...s.custom, widgets: s.custom?.widgets || [], sections: s.custom?.sections || [] });

// MYND's own sections where blocks and mini-apps can go (above, below or in place of the content),
// the Home included (a function on measure can even redo the whole Home).
export const BASE_SECTIONS = ['home', 'impegni', 'voti', 'timer', 'archivio', 'cosa-studiare', 'calendario', 'guida-ai'];
export const insideOf = (s: UserSettings, section: string): CustomBlock[] => customOf(s).inside?.[section] || [];
// The section is shown in the student's version (a mini-app in its place) instead of MYND's.
export const isReplaced = (s: UserSettings, section: string) =>
  insideOf(s, section).some(b => b.at === 'replace') && !(customOf(s).original || []).includes(section);
// Every block of the version, wherever it is.
export const allBlocks = (s: UserSettings): CustomBlock[] => {
  const c = customOf(s);
  return [...c.widgets, ...c.sections.flatMap(x => x.blocks), ...Object.values(c.inside || {}).flat()];
};

// The menu in the order chosen by the student (the ids not in the order keep theirs, after).
export function orderMenu<T extends { id: string }>(items: T[], order: string[] = []): T[] {
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length + items.findIndex(x => x.id === id) : i; };
  return [...items].sort((a, b) => rank(a.id) - rank(b.id));
}

// Cleans what comes from the AI (or an old version): only known fields, sensible sizes.
export function cleanConfig(kind: BlockKind, raw: Record<string, unknown> = {}): Record<string, unknown> {
  const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const n = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  switch (kind) {
    case 'checklist':
      return { items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 50).map((it: unknown) => {
        const o = (typeof it === 'string' ? { text: it } : it || {}) as Record<string, unknown>;
        return { id: createId(), text: text(o.text, 160), done: o.done === true };
      }).filter((it: { text: string }) => it.text) };
    case 'counter':
      return { unit: text(raw.unit, 40) || 'volte', target: Math.max(0, Math.round(n(raw.target, 0))), daily: raw.daily !== false, count: 0, day: '' };
    case 'habits':
      return { habits: (Array.isArray(raw.habits) ? raw.habits : []).map(h => text(h, 60)).filter(Boolean).slice(0, 8), done: {} };
    case 'countdown':
      return { date: /^\d{4}-\d{2}-\d{2}$/.test(text(raw.date)) ? text(raw.date) : '', label: text(raw.label, 60) };
    case 'progress':
      return { current: Math.max(0, n(raw.current)), target: Math.max(1, n(raw.target, 100)), unit: text(raw.unit, 30) };
    case 'note':
      return { text: text(raw.text, 2000) };
    case 'links':
      return { links: (Array.isArray(raw.links) ? raw.links : []).slice(0, 12).map((l: unknown) => {
        const o = (l || {}) as Record<string, unknown>;
        const url = text(o.url, 400);
        return { label: text(o.label, 60) || url, url: /^https?:\/\//i.test(url) ? url : '' };
      }).filter((l: { url: string }) => l.url) };
    case 'app': {
      // A mini-app written by the Assistente MYND: its page (HTML + JS), whether it may read the
      // student's subjects/tasks/grades, its own saved data and the previous versions of the page.
      const html = typeof raw.html === 'string' ? raw.html.slice(0, MAX_APP_HTML) : '';
      const history = (Array.isArray(raw.history) ? raw.history : []).filter((h: unknown) => h && typeof (h as { html?: unknown }).html === 'string').slice(-5);
      return { html, data: raw.data === true, write: raw.write === true, wantsWrite: raw.write === true || raw.wantsWrite === true, store: raw.store ?? null, history, description: text(raw.description, 300), lastError: '' };
    }
    case 'tasks':
      return { filter: ['upcoming', 'school', 'personal'].includes(text(raw.filter)) ? text(raw.filter) : 'upcoming', subject: text(raw.subject, 40), limit: Math.min(15, Math.max(1, Math.round(n(raw.limit, 5)))) };
  }
}

export function makeBlock(kind: BlockKind, title: string, config?: Record<string, unknown>): CustomBlock {
  return { id: createId(), kind, title: title.trim().slice(0, 60) || BLOCK_KINDS.find(b => b.kind === kind)!.label, config: cleanConfig(kind, config) };
}

// ---- Changes to the data ----
const withCustom = (data: UserData, custom: CustomSpace): UserData => ({ ...data, settings: { ...data.settings, custom } });

export function addWidget(data: UserData, block: CustomBlock, position?: number): UserData {
  const c = customOf(data.settings);
  const id = `cw:${block.id}`;
  const order = data.settings.homeLayout?.order || [];
  const nextOrder = order.filter(x => x !== id);
  // New panels go at the top of the Home, unless a position is given.
  nextOrder.splice(position && position > 0 ? position - 1 : 0, 0, id);
  return { ...data, settings: { ...data.settings, custom: { ...c, widgets: [...c.widgets, block] }, homeLayout: { order: nextOrder, hidden: data.settings.homeLayout?.hidden || [] } } };
}

export function addSection(data: UserData, name: string, icon: string, blocks: CustomBlock[]): { data: UserData; section: CustomSection } {
  const c = customOf(data.settings);
  const section: CustomSection = { id: createId(), name: name.trim().slice(0, 28) || 'La mia sezione', icon: SECTION_ICONS.includes(icon) ? icon : 'star', blocks };
  return { data: withCustom(data, { ...c, sections: [...c.sections, section] }), section };
}

export function updateBlock(data: UserData, blockId: string, update: (b: CustomBlock) => CustomBlock | null): UserData {
  const c = customOf(data.settings);
  const map = (list: CustomBlock[]) => list.map(b => (b.id === blockId ? update(b) : b)).filter((b): b is CustomBlock => !!b);
  const inside = c.inside ? Object.fromEntries(Object.entries(c.inside).map(([k, list]) => [k, map(list)])) : undefined;
  return withCustom(data, { ...c, widgets: map(c.widgets), sections: c.sections.map(s => ({ ...s, blocks: map(s.blocks) })), ...(inside ? { inside } : {}) });
}

// Puts a block inside one of MYND's sections (above, below or in place of its content).
export function addInside(data: UserData, section: string, block: CustomBlock, at: 'above' | 'below' | 'replace'): UserData {
  const c = customOf(data.settings);
  // Only one thing in place of the section: an older one is not lost, it moves below.
  const kept = (c.inside?.[section] || []).map(b => (at === 'replace' && b.at === 'replace' ? { ...b, at: 'below' as const } : b));
  const next = at === 'above' ? [{ ...block, at }, ...kept] : [...kept, { ...block, at }];
  return withCustom(data, { ...c, inside: { ...c.inside, [section]: next }, original: (c.original || []).filter(x => x !== section) });
}

// Takes a block out of wherever it is (to move it somewhere else).
export function takeBlock(data: UserData, blockId: string): { data: UserData; block?: CustomBlock } {
  const block = allBlocks(data.settings).find(b => b.id === blockId);
  if (!block) return { data };
  const next = updateBlock(data, blockId, () => null);
  const order = next.settings.homeLayout;
  const homeLayout = order ? { ...order, order: order.order.filter(x => x !== `cw:${blockId}`) } : order;
  return { data: { ...next, settings: { ...next.settings, homeLayout } }, block: { ...block, at: undefined } };
}

// Shows MYND's original section again, or the student's version (when it has one).
export function setOriginal(data: UserData, section: string, original: boolean): UserData {
  const c = customOf(data.settings);
  const list = (c.original || []).filter(x => x !== section);
  return withCustom(data, { ...c, original: original ? [...list, section] : list });
}

export function removeSection(data: UserData, sectionId: string): UserData {
  const c = customOf(data.settings);
  return withCustom(data, { ...c, sections: c.sections.filter(s => s.id !== sectionId) });
}

// A mini-app written by the Assistente MYND.
export function makeApp(title: string, html: string, useData: boolean, description = '', write = false): CustomBlock {
  return { id: createId(), kind: 'app', title: title.trim().slice(0, 60) || 'Mini-app', config: cleanConfig('app', { html, data: useData, write, description }) };
}
