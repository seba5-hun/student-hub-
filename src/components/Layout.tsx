import React, { useState } from 'react';
import { Menu, X, Sun, Moon, LogOut, Home, Calendar, Clock, BookMarked, Archive, Target, BarChart3, Download, Upload, Palette, Sparkles, ShieldCheck, Compass, Briefcase, Wand2 } from 'lucide-react';
import { AuthUser, UserData, parseImportedData } from '../lib/store';
import { useDialog } from './Dialog';
import Logo from './Logo';

interface LayoutProps {
  children: React.ReactNode;
  currentSection: string;
  onSectionChange: (section: string, prefillDate?: string) => void;
  user: AuthUser;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  data: UserData;
  onDataImport: (data: UserData) => void;
  colorTheme?: string;
  onThemeChange?: (theme: string) => void;
  hiddenSections?: string[];
  showDeveloper?: boolean;
  // Accounts waiting for approval, shown next to "Admin" in the menu.
  adminBadge?: number;
  // Opens the guided tour ("App") that explains the sections and sets up the data.
  onOpenGuide?: () => void;
}

export const SECTIONS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'impegni', label: 'Impegni', icon: Target },
  { id: 'voti', label: 'Voti', icon: BarChart3 },
  { id: 'timer', label: 'Timer Studio', icon: Clock },
  { id: 'archivio', label: 'Archivio', icon: Archive },
  { id: 'cosa-studiare', label: 'Cosa studiare', icon: BookMarked },
  { id: 'calendario', label: 'Calendario', icon: Calendar },
  { id: 'guida-ai', label: 'Guida Studio AI', icon: Sparkles },
];

// Only for the developer account (statistics of the whole site).
const DEVELOPER_SECTION = { id: 'sviluppatori', label: 'Admin', icon: ShieldCheck };
// Mindset: for now only on the developer account.
const MINDSET_SECTION = { id: 'mindset', label: 'Performance', icon: Compass };
// MYND Business: for now only on the developer account.
const BUSINESS_SECTION = { id: 'business', label: 'Business', icon: Briefcase };

export default function Layout({ children, currentSection, onSectionChange, user, darkMode, onToggleDarkMode, onLogout, data, onDataImport, colorTheme = 'default', onThemeChange, hiddenSections = [], showDeveloper = false, adminBadge = 0, onOpenGuide }: LayoutProps) {
  const dialog = useDialog();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mynd-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShowMenu(false);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const result = ev.target?.result as string;
          const imported = parseImportedData(result);
          if (!imported) {
            dialog.alert({ title: 'File non valido', message: 'Seleziona un backup esportato da MYND.' });
            return;
          }
          const ok = await dialog.confirm({
            title: 'Importare il backup?',
            message: 'Sostituirai tutti i dati attuali (impegni, voti, sessioni, archivio e impostazioni).',
            confirmLabel: 'Importa',
            danger: true,
          });
          if (!ok) return;
          onDataImport(imported);
          dialog.alert({ title: 'Dati importati!' });
        };
        reader.readAsText(file);
      }
    };
    input.click();
    setShowMenu(false);
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'gradient-bg mesh-gradient' : 'gradient-bg-light mesh-gradient-light'}`}>
      <header className="fixed top-0 left-0 right-0 z-50 glass-float !border-x-0 !border-t-0 safe-top" style={{ borderRadius: 0 }}>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} aria-label="Menu" className={`w-11 h-11 -ml-1.5 flex items-center justify-center rounded-full ${darkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-gray-700'}`}>
              <span className="relative block">
                <Menu className="w-5 h-5" />
                {adminBadge > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500" />}
              </span>
            </button>
            <button onClick={() => onSectionChange('home')} aria-label="MYND, vai alla Home"><Logo size={17} /></button>
            {onOpenGuide && (
              <button onClick={onOpenGuide} aria-label="App: guida e configurazione" className="h-9 px-3.5 rounded-full glass-card !rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--brand-ring)' }}>
                <Wand2 className="w-4 h-4" /> App
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onToggleDarkMode} aria-label={darkMode ? 'Tema chiaro' : 'Tema scuro'} className={`w-11 h-11 flex items-center justify-center rounded-full ${darkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-gray-700'}`}>
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} aria-label="Account" className="w-9 h-9 rounded-full glass-card !rounded-full flex items-center justify-center text-sm font-semibold">
                {user.email[0].toUpperCase()}
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-12 w-60 rounded-3xl glass-float z-50 animate-scale-in overflow-hidden p-1.5">
                    <div className={`px-4 py-3 border-b ${darkMode ? 'border-white/10' : 'border-black/5'}`}>
                      <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>{user.email}</p>
                    </div>
                    <button onClick={handleExport} className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 ${darkMode ? 'text-white/80 hover:bg-white/5' : 'text-gray-700 hover:bg-black/5'}`}>
                      <Download className="w-4 h-4" /> Esporta dati
                    </button>
                    <button onClick={handleImport} className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 ${darkMode ? 'text-white/80 hover:bg-white/5' : 'text-gray-700 hover:bg-black/5'}`}>
                      <Upload className="w-4 h-4" /> Importa dati
                    </button>
                    <button onClick={onLogout} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 text-red-400 hover:bg-red-500/10">
                      <LogOut className="w-4 h-4" /> Esci
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 sidebar-overlay" onClick={() => setSidebarOpen(false)}>
          <div className="h-full w-72 glass-panel !rounded-none !border-y-0 !border-l-0 animate-slide-in safe-top" onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between px-5 h-16 border-b ${darkMode ? 'border-white/10' : 'border-black/5'}`}>
              <Logo size={20} />
              <button onClick={() => setSidebarOpen(false)} className={`p-1 rounded-lg ${darkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-gray-700'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {[...(showDeveloper ? [SECTIONS[0], MINDSET_SECTION, BUSINESS_SECTION] : [SECTIONS[0]]), ...SECTIONS.slice(1).filter(section => !hiddenSections.includes(section.id)), ...(showDeveloper ? [DEVELOPER_SECTION] : [])].map(section => (
                <button
                  key={section.id}
                  onClick={() => { onSectionChange(section.id); setSidebarOpen(false); }}
                  aria-current={currentSection === section.id ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-4 h-12 rounded-2xl text-[15px] font-medium transition-all duration-150 ${
                    currentSection === section.id
                      ? 'glass-lens text-[var(--brand-ring)]'
                      : darkMode ? 'text-white/70 hover:bg-white/5' : 'text-gray-600 hover:bg-black/5'
                  }`}
                >
                  <section.icon className="w-5 h-5" />
                  {section.label}
                  {section.id === 'sviluppatori' && adminBadge > 0 && (
                    <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">{adminBadge}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      <main className="pb-8 px-4 max-w-7xl mx-auto" style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}>
        <div key={currentSection} className="animate-section-in">{children}</div>
      </main>
    </div>
  );
}
