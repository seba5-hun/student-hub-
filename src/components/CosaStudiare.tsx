import React, { useMemo } from 'react';
import { Brain, Calendar, TrendingDown, Clock, AlertTriangle, Zap } from 'lucide-react';
import { UserData, getSubjectAverages, getSubjectStudyTime } from '../lib/store';

interface CosaStudiareProps {
  data: UserData;
  darkMode: boolean;
  onNavigateToTimer: (subject: string) => void;
}

export default function CosaStudiare({ data, darkMode, onNavigateToTimer }: CosaStudiareProps) {
  const { tasks, grades, sessions } = data;

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const recommendations = useMemo(() => {
    const subjectAvgs = getSubjectAverages(grades);
    const subjectTimes = getSubjectStudyTime(sessions);
    const subjects = [...new Set([...Object.keys(subjectAvgs), ...tasks.filter(t => t.subject).map(t => t.subject!)])];

    const recs = subjects.map(subject => {
      let score = 0;
      const reasons: string[] = [];

      const subjectTasks = tasks.filter(t => t.subject === subject && !t.done);
      subjectTasks.forEach(task => {
        const daysUntil = Math.ceil((new Date(task.date).getTime() - Date.now()) / 86400000);
        if (daysUntil >= 0 && daysUntil <= 7) {
          score += Math.max(0, 7 - daysUntil) * 2;
          if (daysUntil <= 2) reasons.push(`Verifica tra ${daysUntil === 0 ? 'oggi' : daysUntil === 1 ? '1 giorno' : `${daysUntil} giorni`}`);
        }
        score += task.importance * 1.5;
      });

      const avg = subjectAvgs[subject];
      if (avg !== undefined && avg < 7) {
        score += (7 - avg) * 5;
        reasons.push(`Media bassa (${avg.toFixed(1)})`);
      }

      const totalEstimated = subjectTasks.reduce((sum, t) => sum + t.estimatedTime, 0);
      const actualMinutes = subjectTimes[subject] || 0;
      const remaining = totalEstimated - actualMinutes;
      if (remaining > 0) {
        score += Math.min(remaining / 60, 5) * 2;
        const remainingHours = Math.round(remaining / 60 * 10) / 10;
        if (remainingHours >= 0.5) reasons.push(`Ti manca ancora ${remainingHours >= 1 ? `${remainingHours}h` : `${remaining}min`}`);
      }

      const subjectSessions = sessions.filter(s => s.subject === subject);
      if (subjectSessions.length > 0) {
        const lastSession = subjectSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        const daysSince = Math.floor((Date.now() - new Date(lastSession.date).getTime()) / 86400000);
        if (daysSince > 3) {
          score += Math.min(daysSince, 10);
          reasons.push(`Non studi da ${daysSince} giorni`);
        }
      }

      let priority: 'alta' | 'media' | 'bassa' = 'bassa';
      if (score >= 15) priority = 'alta';
      else if (score >= 8) priority = 'media';

      return { subject, score, reasons, suggestedMinutes: Math.min(Math.max(30, Math.round(remaining / 3 || 60)), 120), priority };
    }).filter(r => r.score > 0);

    return recs.sort((a, b) => b.score - a.score);
  }, [tasks, grades, sessions]);

  const focusOfTheDay = recommendations[0];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'alta': return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' };
      case 'media': return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' };
      default: return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    }
  };

  return (
    <div className="space-y-6">
      <h2 className={`text-2xl font-bold ${textColor}`}>🧠 Cosa studiare</h2>

      {focusOfTheDay && (
        <div className={`${cardClass} p-6 border-l-4 border-indigo-500`}>
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-indigo-400" />
            <h3 className={`font-semibold ${textColor}`}>Focus del giorno</h3>
          </div>
          <p className={`text-xl font-bold ${textColor} mb-2`}>{focusOfTheDay.subject}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {focusOfTheDay.reasons.slice(0, 3).map((reason, i) => (
              <span key={i} className={`text-xs px-2 py-1 rounded-full ${darkMode ? 'bg-white/10 text-white/70' : 'bg-black/5 text-gray-600'}`}>{reason}</span>
            ))}
          </div>
          <button onClick={() => onNavigateToTimer(focusOfTheDay.subject)} className="btn-primary flex items-center gap-2 text-sm">
            ▶ Inizia a studiare
          </button>
        </div>
      )}

      {!focusOfTheDay && (
        <div className={`${cardClass} p-8 text-center`}>
          <p className={`text-lg ${textColor}`}>🎉 Tutto in ordine!</p>
          <p className={`text-sm ${subTextColor} mt-2`}>Nessuna materia richiede attenzione.</p>
        </div>
      )}

      {recommendations.length > 1 && (
        <div className="space-y-3">
          <h3 className={`font-semibold ${textColor}`}>Altre raccomandazioni</h3>
          {recommendations.slice(1, 10).map((rec, index) => {
            const colors = getPriorityColor(rec.priority);
            return (
              <div key={rec.subject} className={`${cardClass} p-5`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold ${subTextColor}`}>#{index + 2}</span>
                    <div>
                      <p className={`font-semibold ${textColor}`}>{rec.subject}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>Priorità {rec.priority}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs ${subTextColor}`}>Punteggio</p>
                    <p className={`text-lg font-bold ${textColor}`}>{Math.round(rec.score)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {rec.reasons.map((reason, i) => (
                    <span key={i} className={`text-xs px-2 py-1 rounded-full ${darkMode ? 'bg-white/5 text-white/60' : 'bg-black/5 text-gray-500'}`}>{reason}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${subTextColor}`}>Sessione suggerita: {rec.suggestedMinutes}min</span>
                  <button onClick={() => onNavigateToTimer(rec.subject)} className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">
                    ▶ Inizia
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
