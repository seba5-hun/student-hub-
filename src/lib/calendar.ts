import { Task } from './store';

export function generateICS(tasks: Task[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Student Hub//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Student Hub - Impegni',
    'X-WR-TIMEZONE:Europe/Rome',
  ];

  tasks.forEach(task => {
    const startDate = new Date(task.date + 'T09:00:00');
    const endDate = new Date(startDate.getTime() + task.estimatedTime * 60000);
    
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const importanceLabels = ['Tranquillo', 'Normale', 'Importante', 'Urgente', 'Priorità massima'];
    const description = `${task.type === 'scolastico' ? '📚 Scolastico' : '👤 Personale'}\nImportanza: ${importanceLabels[task.importance - 1]}\nTempo stimato: ${Math.round(task.estimatedTime / 60 * 10) / 10}h`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${task.id}@studenthub`,
      `DTSTAMP:${formatDate(new Date())}`,
      `DTSTART:${formatDate(startDate)}`,
      `DTEND:${formatDate(endDate)}`,
      `SUMMARY:${escapeICS(task.title)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      `PRIORITY:${6 - task.importance}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Promemoria Student Hub',
      'END:VALARM',
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function downloadICS(tasks: Task[], filename: string = 'student-hub-impegni.ics'): void {
  const ics = generateICS(tasks);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
