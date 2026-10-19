// Panels of the Home page, in their default order. `wide` panels take the full row.
export const WIDGETS: { id: string; label: string; wide?: boolean }[] = [
  { id: 'quote', label: 'Frase motivazionale', wide: true },
  { id: 'stats', label: 'Statistiche (impegni, media, ore, streak)', wide: true },
  { id: 'goal', label: 'Obiettivo settimanale' },
  { id: 'summary', label: 'Riepilogo materie' },
  { id: 'upcoming', label: 'Prossimi impegni', wide: true },
  { id: 'chart', label: 'Tempo di studio per materia' },
  { id: 'notes', label: 'Note rapide', wide: true },
];
