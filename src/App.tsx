import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import confetti from 'canvas-confetti';
import Auth from './components/Auth';
import ResetPassword from './components/ResetPassword';
import Layout from './components/Layout';
import Home from './components/Home';
// Sections are downloaded separately (the first page opens faster) and preloaded in the
// background right after login, so switching section stays instant.
const loaders = {
  impegni: () => import('./components/Impegni'),
  voti: () => import('./components/Voti'),
  timer: () => import('./components/Timer'),
  archivio: () => import('./components/Archivio'),
  cosaStudiare: () => import('./components/CosaStudiare'),
  calendario: () => import('./components/Calendario'),
  guida: () => import('./components/GuidaStudioAI'),
  admin: () => import('./components/AdminPanel'),
  mindset: () => import('./components/mindset/Mindset'),
};
const Impegni = lazy(loaders.impegni);
const Voti = lazy(loaders.voti);
const Timer = lazy(loaders.timer);
const Archivio = lazy(loaders.archivio);
const CosaStudiare = lazy(loaders.cosaStudiare);
const Calendario = lazy(loaders.calendario);
const GuidaStudioAI = lazy(loaders.guida);
const AdminPanel = lazy(loaders.admin);
const Mindset = lazy(loaders.mindset);

function preloadSections() {
  const run = () => Object.values(loaders).forEach(load => { load().catch(() => { /* retried on open */ }); });
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 3000 });
  else window.setTimeout(run, 1500);
}

function SectionFallback() {
  return (
    <div className="py-24 flex justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" />
    </div>
  );
}
import { useDialog } from './components/Dialog';
import { AccountStatus, fetchMyStatus, loadAdminUsers } from './lib/admin';
import { setAnalyticsUser, setAnalyticsSection, isDeveloper } from './lib/analytics';
import {
  AuthUser,
  UserData,
  ArchiveFile,
  todayKey,
  loadCachedData,
  findLegacyLocalData,
  createEmptyData,
  usedSubjectNames,
  nextSubjectColor,
  SubjectDef,
  isTaskExpired,
  createId,
} from './lib/store';
import { renameSubjectInChats } from './lib/chats';
import {
  supabase,
  fetchRemoteData,
  saveRemoteData,
  authErrorMessage,
  openedFromRecoveryLink,
  linkErrorMessage,
  configError,
} from './lib/supabase';
import { analyzeArchiveFile, MissingApiKeyError } from './lib/archiveText';
import { DriveNotConnectedError } from './lib/googleDrive';

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
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [adminPending, setAdminPending] = useState(0);
  // Opened as …/admin: go straight to the admin panel after login.
  const openAdmin = useRef(window.location.pathname.replace(/\/+$/, '') === '/admin');
  // Opened as …/?mindset=sera (iPhone automation): straight to Mindset's evening reset.
  const openMindset = useRef(new URLSearchParams(window.location.search).get('mindset'));
  const [mindsetView, setMindsetView] = useState<string | null>(null);
  const dialog = useDialog();
  // Login screens are light; inside the app the dialogs follow the dashboard theme.
  useEffect(() => { dialog.setDark(!!user && darkMode); }, [dialog, user, darkMode]);

  // Usage statistics: who is using the app (or just the login page) and which section is open.
  useEffect(() => {
    if (!initialized) return;
    setAnalyticsUser(user?.id ?? null);
  }, [initialized, user]);
  useEffect(() => {
    if (!initialized) return;
    setAnalyticsSection(user && data ? currentSection : isResetPassword ? 'reset-password' : 'accesso');
  }, [initialized, user, data, currentSection, isResetPassword]);
  const pendingSave = useRef<{ userId: string; data: UserData } | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const savingNow = useRef(false);
  const lastLocalChange = useRef(0);

  // Load the user's data from Supabase. The first time, upload what this browser already has.
  const loadUser = useCallback(async (authUser: AuthUser) => {
    setUser(authUser);
    preloadSections();
    setLoadError('');
    try {
      // Accounts not approved by the admin see only the waiting screen (the server refuses
      // their data anyway).
      const status = isDeveloper(authUser.email) ? 'approved' : await fetchMyStatus(authUser.id);
      setAccountStatus(status);
      if (status !== 'approved') {
        setData(null);
        return;
      }
      let userData = await fetchRemoteData(authUser.id);
      if (!userData) {
        const legacy = loadCachedData(authUser.id) || findLegacyLocalData(authUser.email);
        if (legacy) {
          userData = legacy;
          await saveRemoteData(authUser.id, legacy);
        } else {
          // Not saved until the first change: if the account is opened from another browser
          // (e.g. the confirmation link), the old data can still be uploaded from the right one.
          userData = createEmptyData();
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
      savingNow.current = true;
      try {
        await saveRemoteData(pending.userId, pending.data);
        if (!pendingSave.current) setSaveStatus('idle');
      } catch (err) {
        console.error('Error saving data:', err);
        if (!pendingSave.current) pendingSave.current = pending;
        setSaveStatus('error');
        saveTimer.current = window.setTimeout(() => { flushSave(); }, 10000);
      } finally {
        savingNow.current = false;
      }
    };
    saveChain.current = saveChain.current.then(run);
    return saveChain.current;
  }, []);

  // Accepts the new data or a function of the current data: the function form is needed by
  // work that finishes later (file uploads, AI reading) so it doesn't overwrite newer edits.
  const updateData = useCallback((update: UserData | ((prev: UserData) => UserData)) => {
    if (!user) return;
    const userId = user.id;
    lastLocalChange.current = Date.now();
    setData(prev => {
      if (!prev) return prev;
      const next = typeof update === 'function' ? update(prev) : update;
      pendingSave.current = { userId, data: next };
      return next;
    });
    setSaveStatus('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { flushSave(); }, 800);
  }, [user, flushSave]);

  const dataRef = useRef(data);
  const userRef = useRef(user);
  userRef.current = user;
  dataRef.current = data;

  // Study done in Mindset goes into the Study Timer's sessions (and its charts), kept in sync.
  const mindsetData = data?.mindset;
  const isDev = !!user && isDeveloper(user.email);
  useEffect(() => {
    if (!isDev || !mindsetData) return;
    let alive = true;
    const run = () => import('./lib/mindset').then(({ normalizeMindset, mindsetStudySessions }) => {
      const current = dataRef.current;
      const mm = current && normalizeMindset(current.mindset);
      if (!alive || !current || !mm) return;
      const desired = mindsetStudySessions(mm, new Date(), current.settings.sessionsResetAt, current.tasks);
      const synced = current.sessions.filter(s => s.id.startsWith('mindset-'));
      const same = desired.length === synced.length && desired.every(d => synced.some(c => c.id === d.id && c.duration === d.duration && c.subject === d.subject));
      if (same) return;
      updateData(prev => ({ ...prev, sessions: [...prev.sessions.filter(s => !s.id.startsWith('mindset-')), ...desired] }));
    }).catch(() => { /* retried at the next change */ });
    run();
    const id = window.setInterval(run, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [isDev, mindsetData, data?.tasks, updateData]);

  // Tasks whose date has passed are completed automatically (checked every minute).
  const hasData = !!data;
  useEffect(() => {
    if (!hasData) return;
    const check = () => {
      const current = dataRef.current;
      if (!current || !current.tasks.some(t => isTaskExpired(t))) return;
      updateData(prev => {
        const now = new Date();
        if (!prev.tasks.some(t => isTaskExpired(t, now))) return prev;
        return { ...prev, tasks: prev.tasks.map(t => (isTaskExpired(t, now) ? { ...t, done: true, autoDone: true } : t)) };
      });
    };
    check();
    const id = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(id); window.removeEventListener('focus', check); };
  }, [hasData, updateData]);

  // Archive files are read by the AI one at a time, in the background, so it keeps going
  // while the user moves between sections.
  const [analyzing, setAnalyzing] = useState<string[]>([]);
  const analyzeQueue = useRef<string[]>([]);
  const analyzeRunning = useRef(false);

  // After reading, a photo of a book page is renamed "<title chosen by the student> – pag. N".
  const setArchiveFile = useCallback((id: string, file: ArchiveFile) => {
    updateData(prev => ({
      ...prev,
      archive: prev.archive.map(a => {
        if (a.id !== id) return a;
        if (!file.pageLabel || !a.baseTitle) return { ...a, file };
        const base = `${a.baseTitle} – pag. ${file.pageLabel}`;
        const taken = new Set(prev.archive.filter(o => o.id !== id && o.subject === a.subject && o.topic === a.topic).map(o => o.name));
        let name = base;
        for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
        return { ...a, file, name };
      }),
    }));
  }, [updateData]);

  const analyzeFiles = useCallback(async (ids: string[]) => {
    for (const id of ids) if (!analyzeQueue.current.includes(id)) analyzeQueue.current.push(id);
    setAnalyzing(prev => [...new Set([...prev, ...ids])]);
    if (analyzeRunning.current) return;
    analyzeRunning.current = true;
    while (analyzeQueue.current.length > 0) {
      const id = analyzeQueue.current.shift()!;
      // A file uploaded a moment ago may not be in the rendered data yet: wait for it briefly.
      let item = dataRef.current?.archive.find(a => a.id === id);
      for (let i = 0; !item && i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        item = dataRef.current?.archive.find(a => a.id === id);
      }
      if (item?.file) {
        try {
          setArchiveFile(id, await analyzeArchiveFile(item, userRef.current?.id || ''));
        } catch (err) {
          // Missing API key or Drive not connected here: the file stays "to read", not failed.
          const waiting = err instanceof MissingApiKeyError || err instanceof DriveNotConnectedError;
          if (!waiting) console.error('Error reading file:', err);
          const message = err instanceof Error ? err.message : String(err);
          setArchiveFile(id, { ...item.file, textStatus: waiting ? 'pending' : 'error', textError: message });
        }
      }
      setAnalyzing(prev => prev.filter(x => x !== id));
    }
    analyzeRunning.current = false;
  }, [setArchiveFile]);

  // All subjects are editable in "Le mie materie": those found in grades, sessions, tasks or
  // archive but not in the list yet are added to it (with the color they already had).
  useEffect(() => {
    if (!data) return;
    const defs = data.settings.subjects || [];
    const hidden = (data.settings.hiddenSubjects || []).map(h => h.toLowerCase());
    const missing = usedSubjectNames(data).filter(n =>
      !defs.some(d => d.name.toLowerCase() === n.toLowerCase()) && !hidden.includes(n.toLowerCase()));
    if (missing.length === 0) return;
    updateData(prev => {
      const current = prev.settings.subjects || [];
      const add = missing.filter(n => !current.some(d => d.name.toLowerCase() === n.toLowerCase()));
      if (add.length === 0) return prev;
      const next = [...current];
      for (const name of add) next.push({ name, color: nextSubjectColor(next) });
      return { ...prev, settings: { ...prev.settings, subjects: next } };
    });
  }, [data, updateData]);

  const updateSubjects = useCallback((subjects: SubjectDef[]) => {
    updateData(prev => {
      const before = prev.settings.subjects || [];
      const removed = before.filter(b => !subjects.some(s => s.name.toLowerCase() === b.name.toLowerCase())).map(b => b.name);
      const hidden = (prev.settings.hiddenSubjects || [])
        .filter(h => !subjects.some(s => s.name.toLowerCase() === h.toLowerCase()))
        .concat(removed);
      return { ...prev, settings: { ...prev.settings, subjects, hiddenSubjects: [...new Set(hidden)] } };
    });
  }, [updateData]);

  // Renaming a subject renames it everywhere: grades, sessions, tasks, archive and chat folders.
  const renameSubject = useCallback((oldName: string, newName: string) => {
    if (!user) return;
    const same = (s?: string) => !!s && s.toLowerCase() === oldName.toLowerCase();
    updateData(prev => ({
      ...prev,
      grades: prev.grades.map(g => (same(g.subject) ? { ...g, subject: newName } : g)),
      sessions: prev.sessions.map(x => (same(x.subject) ? { ...x, subject: newName } : x)),
      tasks: prev.tasks.map(t => (same(t.subject) ? { ...t, subject: newName } : t)),
      archive: prev.archive.map(a => (same(a.subject) ? { ...a, subject: newName } : a)),
      settings: {
        ...prev.settings,
        subjects: (prev.settings.subjects || []).map(d => (same(d.name) ? { ...d, name: newName } : d)),
        hiddenSubjects: (prev.settings.hiddenSubjects || []).filter(h => !same(h)),
      },
    }));
    renameSubjectInChats(user.id, oldName, newName).catch(err => console.error('Chat folders not renamed:', err));
  }, [user, updateData]);

  // Sync between devices: when the user comes back to the app (tab shown again, phone
  // unlocked) and every 30 seconds while it is open, load the changes made elsewhere.
  // Never while there are local changes not yet saved, so they can't be overwritten.
  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    const busy = () => !!pendingSave.current || savingNow.current || Date.now() - lastLocalChange.current < 3000;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || busy()) return;
      try {
        const remote = await fetchRemoteData(userId);
        if (!remote || busy()) return;
        setData(prev => (prev && JSON.stringify(prev) !== JSON.stringify(remote) ? remote : prev));
      } catch {
        // Offline or temporary error: try again at the next occasion.
      }
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(interval);
    };
  }, [user]);

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
  // Admin: how many accounts are waiting, for the badge in the menu (refreshed every minute).
  useEffect(() => {
    if (!user || !data || !isDeveloper(user.email)) return;
    const check = () => loadAdminUsers()
      .then(r => setAdminPending(r.users.filter(u => u.status === 'pending').length))
      .catch(() => {});
    check();
    const id = window.setInterval(check, 60000);
    return () => window.clearInterval(id);
  }, [user, data]);

  useEffect(() => {
    if (!openMindset.current || !user || !data) return;
    const view = openMindset.current;
    openMindset.current = null;
    window.history.replaceState({}, document.title, '/');
    if (isDeveloper(user.email)) { setMindsetView(view); setCurrentSection('mindset'); }
  }, [user, data]);

  useEffect(() => {
    if (!openAdmin.current || !user || !data) return;
    openAdmin.current = false;
    window.history.replaceState({}, document.title, '/');
    if (isDeveloper(user.email)) setCurrentSection('sviluppatori');
  }, [user, data]);

  // Waiting screen: check again every 20 seconds, so the app opens as soon as the admin approves.
  useEffect(() => {
    if (!user || accountStatus !== 'pending') return;
    const id = window.setInterval(() => { loadUser(user); }, 20000);
    return () => window.clearInterval(id);
  }, [user, accountStatus, loadUser]);

  const handleLogout = async () => {
    analyzeQueue.current = [];
    setAnalyzing([]);
    await flushSave();
    await supabase?.auth.signOut();
    setUser(null);
    setData(null);
    setLoadError('');
    setAccountStatus(null);
    setAdminPending(0);
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

  // Account waiting for approval, rejected or blocked
  if (user && accountStatus && accountStatus !== 'approved') {
    const info = {
      pending: { icon: '⏳', title: 'Account in attesa di approvazione', text: 'La tua registrazione è arrivata! Potrai usare Student Hub appena verrà approvata. Questa pagina si aggiorna da sola.' },
      rejected: { icon: '🚫', title: 'Richiesta non accettata', text: 'La tua richiesta di accesso non è stata accettata. Se pensi sia un errore, contatta l\'amministratore.' },
      blocked: { icon: '🔒', title: 'Account sospeso', text: 'Il tuo account è stato sospeso. Per informazioni contatta l\'amministratore.' },
    }[accountStatus];
    return (
      <div className="min-h-screen gradient-bg-light mesh-gradient-light flex items-center justify-center p-4">
        <div className="glass-card-light p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">{info.icon}</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{info.title}</h1>
          <p className="text-sm text-gray-600 mb-2">{info.text}</p>
          <p className="text-xs text-gray-500 mb-6">Account: {user.email}</p>
          <div className="flex gap-2 justify-center">
            {accountStatus === 'pending' && <button onClick={() => loadUser(user)} className="btn-primary text-sm">Controlla di nuovo</button>}
            <button onClick={handleLogout} className="px-4 py-2 rounded-xl text-sm text-gray-700 bg-black/5 hover:bg-black/10">Esci</button>
          </div>
        </div>
      </div>
    );
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
      <div className={`${darkMode ? 'glass-card' : 'glass-card-light'} px-4 py-2 flex items-center gap-2`}>
        <div className={`w-2 h-2 rounded-full animate-pulse ${saveStatus === 'error' ? 'bg-red-400' : 'bg-emerald-400'}`} />
        <span className={`text-xs ${darkMode ? 'text-white/70' : 'text-gray-600'}`}>{saveStatus === 'error' ? 'Non salvato, riprovo tra poco…' : 'Salvataggio...'}</span>
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
        hiddenSections={data.settings.hiddenSections}
        showDeveloper={isDeveloper(user.email)}
        adminBadge={adminPending}
        onThemeChange={(theme) => {
          if (data) {
            updateData({ ...data, settings: { ...data.settings, colorTheme: theme } });
          }
        }}
      >
        <Suspense fallback={<SectionFallback />}>
        {currentSection === 'home' && (
          <Home
            data={data}
            darkMode={darkMode}
            onNavigate={handleSectionChange}
            onUpdateSettings={(patch) => updateData(prev => ({ ...prev, settings: { ...prev.settings, ...patch } }))}
          />
        )}
        {currentSection === 'impegni' && (
          <Impegni tasks={data.tasks} knownSubjects={[...(data.settings.subjects || []).map(d => d.name), ...data.grades.map(g => g.subject), ...data.sessions.map(s => s.subject)]} darkMode={darkMode} onUpdate={handleTasksUpdate} prefillDate={prefillImpegniDate} />
        )}
        {currentSection === 'voti' && (
          <Voti grades={data.grades} subjectNames={(data.settings.subjects || []).map(d => d.name)} darkMode={darkMode} onUpdate={(grades) => updateData({ ...data, grades })} />
        )}
        {currentSection === 'timer' && (
          <Timer
            sessions={data.sessions}
            extraSubjects={data.tasks.map(t => t.subject).filter((s): s is string => !!s)}
            grades={data.grades}
            darkMode={darkMode}
            onUpdate={(sessions) => updateData(prev => ({ ...prev, sessions, ...(sessions.length === 0 ? { settings: { ...prev.settings, sessionsResetAt: new Date().toISOString() } } : {}) }))}
            preselectedSubject={preselectedSubject}
            subjectDefs={data.settings.subjects || []}
            onUpdateSubjects={updateSubjects}
            onRenameSubject={renameSubject}
          />
        )}
        {currentSection === 'archivio' && (
          <Archivio
            userId={user.id}
            subjectNames={(data.settings.subjects || []).map(d => d.name)}
            archive={data.archive}
            darkMode={darkMode}
            onUpdate={(update) => updateData(prev => ({ ...prev, archive: update(prev.archive) }))}
            analyzing={analyzing}
            onAnalyze={analyzeFiles}
            onOpenGuide={() => handleSectionChange('guida-ai')}
          />
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
        {currentSection === 'mindset' && isDeveloper(user.email) && (
          <Mindset
            mindset={data.mindset}
            darkMode={darkMode}
            initialView={mindsetView}
            subjects={(data.settings.subjects || []).map(d => d.name)}
            onUpdate={fn => updateData(prev => ({ ...prev, mindset: fn(prev.mindset) }))}
            study={{ tasks: data.tasks, grades: data.grades, sessions: data.sessions, subjects: (data.settings.subjects || []).map(d => d.name), weeklyGoal: data.settings.weeklyGoal }}
            onStudySession={(subject, minutes) => updateData(prev => ({ ...prev, sessions: [...prev.sessions, { id: createId(), subject, duration: minutes, date: new Date().toISOString() }] }))}
          />
        )}
        {currentSection === 'sviluppatori' && isDeveloper(user.email) && (
          <AdminPanel darkMode={darkMode} onPendingChange={setAdminPending} />
        )}
        {currentSection === 'guida-ai' && (
          <GuidaStudioAI
            userId={user.id}
            data={data}
            darkMode={darkMode}
            analyzing={analyzing}
            onAnalyze={analyzeFiles}
            onOpenArchive={() => handleSectionChange('archivio')}
          />
        )}
        </Suspense>
      </Layout>
      <SaveIndicator />
    </>
  );
}

export default App;
