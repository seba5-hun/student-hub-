// "Le tue MYND": next to the default MYND the student can create other versions of the app (e.g.
// "Università" while preparing an exam), each with its own adaptations: kind of student and names,
// grade scale and tutor, Home panels and menu sections. Switching keeps all the data (tasks, grades,
// files…): only how the app looks and talks changes. The active version always lives in the usual
// settings fields; switching saves them into the version being left and loads the other one.

import { UserSettings, StudyProfile, LayoutSnapshot, MyndLayout, createId } from './store';
import { PRESETS } from './profile';

export const DEFAULT_LAYOUT_ID = 'default';

// A profile that changes nothing (school, usual names): the default MYND.
const isPlainProfile = (p?: StudyProfile) =>
  !p || (p.kind === 'superiori' && !p.description && !p.focus && !p.gradeScale && !Object.keys(p.labels || {}).length);

const snapshot = (s: UserSettings): LayoutSnapshot => ({ profile: s.profile, homeLayout: s.homeLayout, hiddenSections: s.hiddenSections, custom: s.custom });

// Accounts that adapted MYND before versions existed: that adaptation becomes their first version.
export function normalizeLayouts(s: UserSettings): UserSettings {
  if (s.activeLayout || isPlainProfile(s.profile)) return s;
  const layout: MyndLayout = { id: createId(), name: PRESETS[s.profile!.kind]?.title || 'La mia MYND', ...snapshot(s) };
  return {
    ...s, layouts: [...(s.layouts || []), layout], activeLayout: layout.id,
    defaultLayout: { homeLayout: s.homeLayout, hiddenSections: s.hiddenSections, custom: s.custom },
  };
}

export interface LayoutView { id: string; name: string; emoji: string; active: boolean; custom: boolean }

export function listLayouts(settings: UserSettings): LayoutView[] {
  const s = normalizeLayouts(settings);
  const active = s.activeLayout || DEFAULT_LAYOUT_ID;
  return [
    { id: DEFAULT_LAYOUT_ID, name: 'MYND', emoji: '⚡️', active: active === DEFAULT_LAYOUT_ID, custom: false },
    ...(s.layouts || []).map(l => ({ id: l.id, name: l.name, emoji: PRESETS[l.profile?.kind || 'superiori']?.emoji || '✨', active: active === l.id, custom: true })),
  ];
}

export function activeLayoutName(settings: UserSettings): string {
  return listLayouts(settings).find(l => l.active)?.name || 'MYND';
}

export function switchLayout(settings: UserSettings, id: string): UserSettings {
  const s = normalizeLayouts(settings);
  const current = s.activeLayout || DEFAULT_LAYOUT_ID;
  if (current === id) return s;
  // Save the version being left…
  const layouts = (s.layouts || []).map(l => (l.id === current ? { ...l, ...snapshot(s) } : l));
  const defaultLayout = current === DEFAULT_LAYOUT_ID ? { homeLayout: s.homeLayout, hiddenSections: s.hiddenSections, custom: s.custom } : s.defaultLayout;
  // …and load the other one.
  const target: LayoutSnapshot | undefined = id === DEFAULT_LAYOUT_ID ? { ...defaultLayout, profile: undefined } : layouts.find(l => l.id === id);
  if (!target) return s;
  return {
    ...s, layouts, defaultLayout,
    activeLayout: id === DEFAULT_LAYOUT_ID ? undefined : id,
    profile: target.profile, homeLayout: target.homeLayout, hiddenSections: target.hiddenSections, custom: target.custom,
  };
}

// A new version, starting from the Home and menu of the active one, becomes the active one.
export function createLayout(settings: UserSettings, name: string, profile: StudyProfile): UserSettings {
  const s = normalizeLayouts(settings);
  // A new version starts from the Home and menu of the active one, with no sections or mini-apps of its own.
  const ownHome = s.homeLayout ? { order: s.homeLayout.order.filter(id => !id.startsWith('cw:')), hidden: s.homeLayout.hidden.filter(id => !id.startsWith('cw:')) } : undefined;
  const layout: MyndLayout = { id: createId(), name: name.trim() || nextName(s), profile, homeLayout: ownHome, hiddenSections: (s.hiddenSections || []).filter(id => !id.startsWith('cs:')), custom: { widgets: [], sections: [] } };
  const withNew = { ...s, layouts: [...(s.layouts || []), layout] };
  return { ...switchLayout(withNew, layout.id), profile };
}

// Changes of the active version (its name and adaptation).
export function updateActiveLayout(settings: UserSettings, name: string, profile: StudyProfile): UserSettings {
  const s = normalizeLayouts(settings);
  if (!s.activeLayout) return createLayout(s, name, profile);
  return {
    ...s, profile,
    layouts: (s.layouts || []).map(l => (l.id === s.activeLayout ? { ...l, name: name.trim() || l.name, profile } : l)),
  };
}

export function deleteLayout(settings: UserSettings, id: string): UserSettings {
  if (id === DEFAULT_LAYOUT_ID) return settings;
  let s = normalizeLayouts(settings);
  if (s.activeLayout === id) s = switchLayout(s, DEFAULT_LAYOUT_ID);
  return { ...s, layouts: (s.layouts || []).filter(l => l.id !== id) };
}

export function nextName(settings: UserSettings): string {
  const names = new Set((settings.layouts || []).map(l => l.name));
  for (let n = 2; ; n++) if (!names.has(`MYND ${n}`)) return `MYND ${n}`;
}
