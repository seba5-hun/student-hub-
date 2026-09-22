import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import Auth from './components/Auth';
import ResetPassword from './components/ResetPassword';
import Layout from './components/Layout';
import Home from './components/Home';
import Impegni from './components/Impegni';
import Voti from './components/Voti';
import Timer from './components/Timer';
import Archivio from './components/Archivio';
import CosaStudiare from './components/CosaStudiare';
import Calendario from './components/Calendario';
import GuidaStudioAI from './components/GuidaStudioAI';
import {
  AuthUser,
  UserData,
  getAuthUser,
  setAuthUser,
  ensureUserIdMapping,
  todayKey,
  loadUserData as loadLocalData,
  saveUserData as saveLocalData,
} from './lib/store';

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<UserData | null>(null);
  const [currentSection, setCurrentSection] = useState('home');
  const [darkMode, setDarkMode] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [preselectedSubject, setPreselectedSubject] = useState<string | undefined>();
  const [prefillImpegniDate, setPrefillImpegniDate] = useState<string | undefined>();
  const [initialized, setInitialized] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);

  // Initialize auth
  useEffect(() => {
    // Controlla se c'è un token di reset password nell'URL
    const urlParams = new URLSearchParams(window.location.search);
    const hasResetToken = urlParams.has('token');
    
    if (hasResetToken) {
      setIsResetPassword(true);
      setInitialized(true);
      return;
    }

    const authUser = getAuthUser();
    if (authUser) {
      // Accounts registered before the fix never saved their id: save it now,
      // otherwise the next login would open an empty account.
      ensureUserIdMapping(authUser);
      setUser(authUser);
      const localData = loadLocalData(authUser.id);
      setData(localData);
      setDarkMode(localData.settings.darkMode);
    }
    setInitialized(true);
  }, []);

  // Save data whenever it changes
  const updateData = useCallback((newData: UserData) => {
    setData(newData);
    if (user) {
      setSyncing(true);
      saveLocalData(user.id, newData);
      setTimeout(() => setSyncing(false), 500);
    }
  }, [user]);

  // Handle login
  const handleLogin = (authUser: AuthUser) => {
    setUser(authUser);
    const localData = loadLocalData(authUser.id);
    setData(localData);
    setDarkMode(localData.settings.darkMode);
  };

  // Handle logout
  const handleLogout = () => {
    setAuthUser(null);
    setUser(null);
    setData(null);
    setCurrentSection('home');
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    if (data && user) {
      const newData = { ...data, settings: { ...data.settings, darkMode: newDarkMode } };
      updateData(newData);
    }
  };

  // Navigate to timer with preselected subject
  const handleNavigateToTimer = (subject: string) => {
    setPreselectedSubject(subject);
    setCurrentSection('timer');
  };

  // Handle section change (clear preselected subject)
  const handleSectionChange = (section: string, prefillDate?: string) => {
    if (section !== 'timer') setPreselectedSubject(undefined);
    if (section !== 'impegni') setPrefillImpegniDate(undefined);
    else if (prefillDate) setPrefillImpegniDate(prefillDate);
    setCurrentSection(section);
  };

  // Handle data import refresh
  const handleDataImport = () => {
    if (user) {
      const userData = loadLocalData(user.id);
      setData(userData);
      setDarkMode(userData.settings.darkMode);
    }
  };

  // Browser notifications for tasks due today
  useEffect(() => {
    if (!data || !user) return;
    const today = todayKey();
    const todayTasks = data.tasks.filter(t => !t.done && t.date <= today && (t.endDate || t.date) >= today);
    
    if (todayTasks.length > 0 && 'Notification' in window) {
      const notify = () => {
        if (Notification.permission !== 'granted') return;
        if (sessionStorage.getItem(`notified_${today}`)) return;
        try {
          new Notification('Student Hub 📚', {
            body: `Hai ${todayTasks.length} impegn${todayTasks.length === 1 ? 'o' : 'i'} per oggi!`,
            icon: '/icon.svg',
          });
          sessionStorage.setItem(`notified_${today}`, 'true');
        } catch {
          // Some mobile browsers only allow notifications from a service worker.
        }
      };
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(notify).catch(() => {});
      } else {
        notify();
      }
    }
  }, [data, user]);

  // Confetti on task completion
  const handleTasksUpdate = useCallback((tasks: UserData['tasks']) => {
    if (!data) return;
    const prevDone = data.tasks.filter(t => t.done).length;
    const newDone = tasks.filter(t => t.done).length;
    if (newDone > prevDone) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
    }
    updateData({ ...data, tasks });
  }, [data, updateData]);

  // Loading state
  if (!initialized) {
    return (
      <div className="min-h-screen gradient-bg mesh-gradient flex items-center justify-center">
        <div className="animate-pulse text-white/60">Caricamento...</div>
      </div>
    );
  }

  // Reset password screen
  if (isResetPassword) {
    return <ResetPassword onBackToLogin={() => {
      setIsResetPassword(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    }} />;
  }

  // Auth screen
  if (!user || !data) {
    return <Auth onLogin={handleLogin} />;
  }

  // Sync indicator
  const SyncIndicator = () => syncing ? (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div className="glass-card px-4 py-2 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs text-white/70">Salvataggio...</span>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Layout
        currentSection={currentSection}
        onSectionChange={handleSectionChange}
        user={user}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        onLogout={handleLogout}
        userId={user.id}
        onDataImport={handleDataImport}
        colorTheme={data?.settings.colorTheme}
        onThemeChange={(theme) => {
          if (data) {
            updateData({ ...data, settings: { ...data.settings, colorTheme: theme } });
          }
        }}
      >
        {currentSection === 'home' && (
          <Home
            data={data}
            darkMode={darkMode}
            onNavigate={handleSectionChange}
            onUpdateSettings={(settings) => updateData({ ...data, settings })}
          />
        )}
        {currentSection === 'impegni' && (
          <Impegni tasks={data.tasks} knownSubjects={[...data.grades.map(g => g.subject), ...data.sessions.map(s => s.subject)]} darkMode={darkMode} onUpdate={handleTasksUpdate} prefillDate={prefillImpegniDate} />
        )}
        {currentSection === 'voti' && (
          <Voti grades={data.grades} darkMode={darkMode} onUpdate={(grades) => updateData({ ...data, grades })} />
        )}
        {currentSection === 'timer' && (
          <Timer
            sessions={data.sessions}
            extraSubjects={data.tasks.map(t => t.subject).filter((s): s is string => !!s)}
            grades={data.grades}
            darkMode={darkMode}
            onUpdate={(sessions) => updateData({ ...data, sessions })}
            preselectedSubject={preselectedSubject}
          />
        )}
        {currentSection === 'archivio' && (
          <Archivio archive={data.archive} darkMode={darkMode} onUpdate={(archive) => updateData({ ...data, archive })} />
        )}
        {currentSection === 'cosa-studiare' && (
          <CosaStudiare data={data} darkMode={darkMode} onNavigateToTimer={handleNavigateToTimer} />
        )}
        {currentSection === 'calendario' && (
          <Calendario 
            tasks={data.tasks} 
            darkMode={darkMode} 
            onNavigate={handleSectionChange}
            onAddTask={(task) => updateData({ ...data, tasks: [...data.tasks, task] })}
          />
        )}
        {currentSection === 'guida-ai' && (
          <GuidaStudioAI data={data} darkMode={darkMode} />
        )}
      </Layout>
      <SyncIndicator />
    </>
  );
}

export default App;
