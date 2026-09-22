import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  todayKey,
  loadCachedData,
  findLegacyLocalData,
  generateDemoData,
} from './lib/store';
import {
  supabase,
  fetchRemoteData,
  saveRemoteData,
  authErrorMessage,
  openedFromRecoveryLink,
  linkErrorMessage,
  configError,
} from './lib/supabase';

type SaveStatus = 'idle' | 'saving' | 'error';

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<UserData | null>(null);
  const [currentSection, setCurrentSection] = useState('home');
  const [darkMode, setDarkMode] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [loadError, setLoadError] = useState('');
  const [preselectedSubject, setPreselectedSubject] = useState<string | undefined>();
  const [prefillImpegniDate, setPrefillImpegniDate] = useState<string | undefined>();
  const [initialized, setInitialized] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(openedFromRecoveryLink);
  const pendingSave = useRef<{ userId: string; data: UserData } | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  // Load the user's data from Supabase. The first time, upload what this browser already has.
  const loadUser = useCallback(async (authUser: AuthUser) => {
    setUser(authUser);
    setLoadError('');
    try {
      let userData = await fetchRemoteData(authUser.id);
      if (!userData) {
        const legacy = loadCachedData(authUser.id) || findLegacyLocalData(authUser.email);
        if (legacy) {
          userData = legacy;
          await saveRemoteData(authUser.id, legacy);
        } else {
          // Not saved until the first change: if the account is opened from another browser
          // (e.g. the confirmation link), the old data can still be uploaded from the right one.
          userData = generateDemoData();
        }
      }
      setData(userData);
      setDarkMode(userData.settings.darkMode);
    } catch (err) {
      console.error('Error loading data:', err);
      setData(null);
      setLoadError(authErrorMessage(err));
    }
  }, []);

  // Initialize auth
  useEffect(() => {
    if (!supabase) {
      setInitialized(true);
      return;
    }
    const client = supabase;
    let cancelled = false;

    const init = async () => {
      // Reset links in the format ?token_hash=...&type=recovery
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      if (tokenHash && params.get('type') === 'recovery') {
        await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const { data: { session } } = await client.auth.getSession();
      if (cancelled) return;
      if (session?.user && !openedFromRecoveryLink) {
        await loadUser({ id: session.user.id, email: session.user.email || '' });
      }
      if (!cancelled) setInitialized(true);
    };

    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setIsResetPassword(true);
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setData(null);
      }
    });

    init();
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [loadUser]);

  // Changes are saved to Supabase shortly after the last edit, so typing in the notes
  // doesn't send a request for every key.
  // Saves run one at a time, so an older version can never overwrite a newer one.
  const flushSave = useCallback((): Promise<void> => {
    window.clearTimeout(saveTimer.current);
    const run = async () => {
      const pending = pendingSave.current;
      if (!pending) return;
      pendingSave.current = null;
      try {
        await saveRemoteData(pending.userId, pending.data);
        if (!pendingSave.current) setSaveStatus('idle');
      } catch (err) {
        console.error('Error saving data:', err);
        if (!pendingSave.current) pendingSave.current = pending;
        setSaveStatus('error');
        saveTimer.current = window.setTimeout(() => { flushSave(); }, 10000);
      }
    };
    saveChain.current = saveChain.current.then(run);
    return saveChain.current;
  }, []);

  const updateData = useCallback((newData: UserData) => {
    setData(newData);
    if (!user) return;
    pendingSave.current = { userId: user.id, data: newData };
    setSaveStatus('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { flushSave(); }, 800);
  }, [user, flushSave]);

  // Don't lose the last change when the page is closed.
  useEffect(() => {
    const onPageHide = () => { flushSave(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!pendingSave.current) return;
      flushSave();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [flushSave]);

  // Handle login
  const handleLogin = (authUser: AuthUser) => loadUser(authUser);

  // Handle logout
  const handleLogout = async () => {
    await flushSave();
    await supabase?.auth.signOut();
    setUser(null);
    setData(null);
    setLoadError('');
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

  if (!supabase) {
    return (
      <div className="min-h-screen gradient-bg mesh-gradient flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md text-center text-white">
          <h1 className="text-xl font-bold mb-3">Supabase non configurato</h1>
          <p className="text-sm text-white/90 mb-3">{configError || 'Impossibile avviare Supabase.'}</p>
          <p className="text-sm text-white/70">
            In locale: file <code>.env</code> (vedi <code>.env.example</code>), poi riavvia l'app.
            Online: impostazioni del progetto (Vercel/Netlify) → Environment Variables, poi rifai il deploy.
          </p>
        </div>
      </div>
    );
  }

  // Reset password screen
  if (isResetPassword) {
    return <ResetPassword onDone={async () => {
      setIsResetPassword(false);
      window.history.replaceState({}, document.title, window.location.pathname);
      const { data: { session } } = await supabase!.auth.getSession();
      if (session?.user) await loadUser({ id: session.user.id, email: session.user.email || '' });
    }} />;
  }

  // Data could not be loaded
  if (user && !data) {
    return (
      <div className="min-h-screen gradient-bg mesh-gradient flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md text-center text-white">
          {loadError ? (
            <>
              <h1 className="text-xl font-bold mb-3">Impossibile caricare i dati</h1>
              <p className="text-sm text-white/70 mb-6">{loadError}</p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => loadUser(user)} className="btn-primary text-sm">Riprova</button>
                <button onClick={handleLogout} className="px-4 py-2 rounded-lg text-sm text-white/70 bg-white/10">Esci</button>
              </div>
            </>
          ) : (
            <div className="animate-pulse text-white/60">Caricamento dati...</div>
          )}
        </div>
      </div>
    );
  }

  // Auth screen
  if (!user || !data) {
    return <Auth onLogin={handleLogin} initialError={linkErrorMessage ? authErrorMessage(new Error(linkErrorMessage)) : ''} />;
  }

  // Save indicator
  const SaveIndicator = () => saveStatus === 'idle' ? null : (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div className="glass-card px-4 py-2 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full animate-pulse ${saveStatus === 'error' ? 'bg-red-400' : 'bg-emerald-400'}`} />
        <span className="text-xs text-white/70">{saveStatus === 'error' ? 'Non salvato, riprovo tra poco…' : 'Salvataggio...'}</span>
      </div>
    </div>
  );

  return (
    <>
      <Layout
        currentSection={currentSection}
        onSectionChange={handleSectionChange}
        user={user}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        onLogout={handleLogout}
        data={data}
        onDataImport={(imported) => {
          updateData(imported);
          setDarkMode(imported.settings.darkMode);
        }}
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
      <SaveIndicator />
    </>
  );
}

export default App;
