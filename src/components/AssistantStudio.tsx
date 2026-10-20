import React, { useEffect } from 'react';
import { UserData } from '../lib/store';
import AppAssistant from './AppAssistant';

// "Crea con l'AI": the Assistente MYND in a side panel (full screen on the phone), so what it
// builds appears in the app behind it while the student keeps talking.

interface Props {
  data: UserData;
  darkMode: boolean;
  storageKey: string;
  userId?: string;
  request: { text: string; appId?: string; n: number };
  onUpdateData: (update: (prev: UserData) => UserData) => void;
  onNavigate: (section: string) => void;
  onClose: () => void;
}

export default function AssistantStudio({ onClose, darkMode, ...rest }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-black/30 sm:bg-black/20" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Crea con l'AI" onClick={e => e.stopPropagation()}
        className={`w-full sm:max-w-md h-full p-4 sm:p-5 sm:rounded-l-3xl animate-scale-in ${darkMode ? 'glass-float' : 'glass-card-light'}`}
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <AppAssistant variant="studio" darkMode={darkMode} onClose={onClose} {...rest} />
      </div>
    </div>
  );
}
