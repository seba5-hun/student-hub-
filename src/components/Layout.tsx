import React, { useState } from 'react';
import { BookOpen, Menu, X, Sun, Moon, LogOut, Home, Calendar, Clock, BookMarked, Archive, Target, BarChart3, Download, Upload, Palette, Sparkles } from 'lucide-react';
import { AuthUser, exportData, importData } from '../lib/store';

interface LayoutProps {
  children: React.ReactNode;
  currentSection: string;
  onSectionChange: (section: string, prefillDate?: string) => void;
  user: AuthUser;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  userId: string;
  onDataImport: () => void;
  colorTheme?: string;
  onThemeChange?: (theme: string) => void;
}

const SECTIONS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'impegni', label: 'Impegni', icon: Target },
  { id: 'voti', label: 'Voti', icon: BarChart3 },
  { id: 'timer', label: 'Timer Studio', icon: Clock },
  { id: 'archivio', label: 'Archivio', icon: Archive },
  { id: 'cosa-studiare', label: 'Cosa studiare', icon: BookMarked },
  { id: 'calendario', label: 'Calendario', icon: Calendar },
  { id: 'guida-ai', label: 'Guida Studio AI', icon: Sparkles },
];

export default function Layout({ children, currentSection, onSectionChange, user, darkMode, onToggleDarkMode, onLogout, userId, onDataImport, colorTheme = 'default', onThemeChange }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleExport = () => {
    const data = exportData(userId);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student-hub-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          if (importData(userId, result)) {
            onDataImport();
            alert('Dati importati!');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'gradient-bg mesh-gradient' : 'gradient-bg-light mesh-gradient-light'}`}>
      <header className={`fixed top-0 left-0 right-0 z-50 ${darkMode ? 'bg-black/30' : 'bg-white/70'} backdrop-blur-xl border-b ${darkMode ? 'border-white/10' : 'border-black/5'}`}>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-gray-700'}`}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className={`font-bold text-lg hidden sm:block ${darkMode ? 'text-white' : 'text-gray-800'}`}>Student Hub</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onToggleDarkMode} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-gray-700'}`}>
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                {user.email[0].toUpperCase()}
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className={`absolute right-0 top-10 w-56 rounded-xl ${darkMode ? 'bg-gray-900/95 border-white/10' : 'bg-white border-black/10'} border backdrop-blur-xl shadow-xl z-50 animate-scale-in overflow-hidden`}>
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
          <div className={`h-full w-72 ${darkMode ? 'bg-gray-900/95' : 'bg-white/95'} backdrop-blur-xl border-r ${darkMode ? 'border-white/10' : 'border-black/5'} animate-slide-in`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Student Hub</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className={`p-1 rounded-lg ${darkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-gray-700'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {SECTIONS.map(section => (
                <button
                  key={section.id}
                  onClick={() => { onSectionChange(section.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    currentSection === section.id
                      ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-400 border border-indigo-500/30'
                      : darkMode ? 'text-white/70 hover:bg-white/5' : 'text-gray-600 hover:bg-black/5'
                  }`}
                >
                  <section.icon className="w-5 h-5" />
                  {section.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      <main className="pt-14 pb-8 px-4 max-w-7xl mx-auto">
        <div className="animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
