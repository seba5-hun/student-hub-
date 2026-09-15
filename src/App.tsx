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
  loadUserData as loadLocalData,
  saveUserData as saveLocalData,
} from './lib/store';
import {
  isSupabaseConfigured,
  signOut as supabaseSignOut,
  loadUserData as loadSupabaseData,
  saveTasks,
  saveGrades,
  saveSessions,
  saveArchive,
  saveSettings,
  supabase,
} from './lib/supabase';

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<UserData | null>(null);
  const [currentSection, setCurrentSection] = useState('home');
  const [darkMode, setDarkMode] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [preselectedSubject, setPreselectedSubject] = useState<string | undefined>();
  const [prefillImpegniDate, setPrefillImpegniDate] = useState<string | undefined>();
  const [initialized, setInitialized] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Check for password reset token in URL
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery') && hash.includes('access_token')) {
      setIsResettingPassword(true);
    }
  }, []);

  // Initialize auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Se stiamo resettando la password, non inizializzare l'auth normale
        if (isResettingPassword) {
          setInitialized(true);
          return;
        }

        const authUser = getAuthUser();
        
        if (authUser) {
          setUser(authUser);
          
          // Se Supabase è configurato, prova a caricare dal cloud
          if (isSupabaseConfigured()) {
            try {
              const cloudData = await loadSupabaseData(authUser.id);
              if (cloudData) {
                setData(cloudData);
                setDarkMode(cloudData.settings.darkMode);
                saveLocalData(authUser.id, cloudData);
              } else {
                const localData = loadLocalData(authUser.id);
                setData(localData);
                setDarkMode(localData.settings.darkMode);
              }
            } catch (err) {
              console.error('Errore caricamento Supabase:', err);
              const localData = loadLocalData(authUser.id);
              setData(localData);
              setDarkMode(localData.settings.darkMode);
            }
          } else {
            // Solo locale
            const localData = loadLocalData(authUser.id);
            setData(localData);
            setDarkMode(localData.settings.darkMode);
          }
        }
      } catch (err) {
        console.error('Errore inizializzazione:', err);
      }
      
      setInitialized(true);
    };
    
    initAuth();
  }, [isResettingPassword]);

  // Save data whenever it changes
  const updateData = useCallback(async (newData: UserData) => {
    setData(newData);
    if (user) {
      setSyncing(true);
      
      // Salva sempre in locale
      saveLocalData(user.id, newData);
      
      // Se Supabase è configurato, salva anche nel cloud
      if (isSupabaseConfigured()) {
        try {
          await Promise.all([
            saveTasks(user.id, newData.tasks),
            saveGrades(user.id, newData.grades),
            saveSessions(user.id, newData.sessions),
            saveArchive(user.id, newData.archive),
            saveSettings(user.id, newData.settings),
          ]);
        } catch (err) {
          console.error('Errore salvataggio Supabase:', err);
        }
      }
      
      setTimeout(() => setSyncing(false), 500);
    }
  }, [user]);

  // Handle login
  const handleLogin = async (authUser: AuthUser) => {
    setUser(authUser);
    
    // Se Supabase è configurato, prova a caricare dal cloud
    if (isSupabaseConfigured()) {
      try {
        const cloudData = await loadSupabaseData(authUser.id);
        if (cloudData) {
          setData(cloudData);
          setDarkMode(cloudData.settings.darkMode);
          saveLocalData(authUser.id, cloudData);
        } else {
          const localData = loadLocalData(authUser.id);
          setData(localData);
          setDarkMode(localData.settings.darkMode);
        }
      } catch (err) {
        console.error('Errore caricamento Supabase:', err);
        const localData = loadLocalData(authUser.id);
        setData(localData);
        setDarkMode(localData.settings.darkMode);
      }
    } else {
      const localData = loadLocalData(authUser.id);
      setData(localData);
      setDarkMode(localData.settings.darkMode);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    // Se Supabase è configurato, fai logout anche dal cloud
    if (isSupabaseConfigured()) {
      try {
        await supabaseSignOut();
      } catch (err) {
        console.error('Errore logout Supabase:', err);
      }
    }
    
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

  // Register service worker for PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.log('SW registration failed:', err);
      });
    }
  }, []);

  // Browser notifications for tasks due today
  useEffect(() => {
    if (!data || !user) return;
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = data.tasks.filter(t => t.date === today && !t.done);
    
    if (todayTasks.length > 0 && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
      if (Notification.permission === 'granted') {
        const alreadyNotified = sessionStorage.getItem(`notified_${today}`);
        if (!alreadyNotified) {
          new Notification('Student Hub 📚', {
            body: `Hai ${todayTasks.length} impegn${todayTasks.length === 1 ? 'o' : 'i'} per oggi!`,
            icon: '/icon-192.png',
          });
          sessionStorage.setItem(`notified_${today}`, 'true');
        }
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

  // Password reset screen
  if (isResettingPassword) {
    return <ResetPassword onSuccess={() => {
      setIsResettingPassword(false);
      window.location.hash = '';
      window.location.href = '/';
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
        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
        <span className="text-xs text-white/70">Sincronizzazione...</span>
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
          <Impegni tasks={data.tasks} darkMode={darkMode} onUpdate={handleTasksUpdate} prefillDate={prefillImpegniDate} />
        )}
        {currentSection === 'voti' && (
          <Voti grades={data.grades} darkMode={darkMode} onUpdate={(grades) => updateData({ ...data, grades })} />
        )}
        {currentSection === 'timer' && (
          <Timer
            sessions={data.sessions}
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
