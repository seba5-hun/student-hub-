import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, User, Trash2, Key, Sparkles, Loader2, Image as ImageIcon, X, Instagram, BookOpen, FolderOpen, Maximize2, Minimize2, PanelLeft, MessageSquare, Plus, Folder, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { Grade, Task, UserData, createId } from '../lib/store';
import { generateContent, getGeminiKey, setGeminiKey, GeminiContent, GeminiPart } from '../lib/gemini';
import { loadTranscript } from '../lib/archiveText';
import { ChatSummary, StoredMessage, listChats, loadChat, saveChat, renameChat, deleteChat, chatErrorMessage, titleFrom } from '../lib/chats';

interface GuidaStudioAIProps {
  userId: string;
  data: UserData;
  darkMode: boolean;
  analyzing: string[];
  onAnalyze: (ids: string[]) => void;
  onOpenArchive: () => void;
}

interface MessageImage {
  id: string;
  imageData: string;
  name: string;
  mimeType: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: MessageImage[];
  // Photos of a saved chat: only their number is kept.
  imageCount?: number;
  timestamp: Date;
}

interface ChatMeta {
  id: string;
  subject: string;
  topic: string;
  title: string;
}

// Keeps each request well inside Gemini's limits (and the free tier's tokens per minute).
const MAX_MATERIAL_CHARS = 350_000;

const QUICK_ACTIONS = [
  { label: '📝 Riassumi', prompt: 'Fammi un riassunto chiaro e ordinato del materiale selezionato, con titoli, elenchi e i concetti chiave in grassetto.' },
  { label: '❓ Interrogami', prompt: 'Interrogami sul materiale selezionato come farebbe un professore: fammi una domanda alla volta, aspetta la mia risposta, poi correggimi, spiegami cosa manca e dammi un voto.' },
  { label: '🧠 Schema', prompt: 'Crea uno schema (mappa concettuale in forma di elenco) del materiale selezionato, con i concetti principali e i collegamenti tra loro.' },
  { label: '💡 Spiegamelo semplice', prompt: 'Spiegami il materiale selezionato in modo semplice, con parole facili ed esempi concreti.' },
  { label: '🗂️ Flashcard', prompt: 'Crea 10 flashcard domanda/risposta sui punti più importanti del materiale selezionato.' },
];

function studentContext(data: UserData): string {
  const { grades, tasks } = data;
  let context = '';
  if (grades.length > 0) {
    const bySubject: Record<string, number[]> = {};
    grades.forEach((g: Grade) => { (bySubject[g.subject] ||= []).push(g.value); });
    context += 'VOTI DELLO STUDENTE:\n';
    Object.entries(bySubject).forEach(([subject, values]) => {
      context += `- ${subject}: media ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)}\n`;
    });
  }
  const activeTasks = tasks.filter((t: Task) => !t.done);
  if (activeTasks.length > 0) {
    context += '\nIMPEGNI IN PROGRAMMA:\n';
    activeTasks.forEach((t: Task) => { context += `- ${t.title} (${t.date}${t.subject ? `, ${t.subject}` : ''})\n`; });
  }
  return context;
}

const SYSTEM_PROMPT = `Sei il tutor di studio di Student Hub. Rispondi sempre in italiano, in modo chiaro e adatto a uno studente.
Hai a disposizione il MATERIALE DI STUDIO caricato dallo studente (trascrizioni di PDF, pagine del libro e appunti), diviso per file.
Quando rispondi:
- basati prima di tutto su quel materiale e indica da quale file prendi le informazioni (es. «dal file "Capitolo 3 (2)"»);
- se un'informazione non c'è nel materiale, dillo chiaramente; poi, se è utile, aggiungi quello che sai precisando che non viene dai suoi file;
- per i riassunti usa titoli ed elenchi puntati; per le interrogazioni fai una domanda alla volta e aspetta la risposta prima di correggere;
- non inventare pagine, date o citazioni che non sono nel materiale.`;

// Minimal formatting for the AI's answers: headings, bullet points and **bold**.
function FormattedText({ text, large = false }: { text: string; large?: boolean }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>,
    );
  return (
    <div className={large ? 'text-base leading-relaxed space-y-1.5' : 'text-sm space-y-1'}>
      {text.split('\n').map((line, i) => {
        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        if (heading) return <p key={i} className="font-bold mt-2">{inline(heading[2])}</p>;
        const bullet = /^(\s*)[-*•]\s+(.*)$/.exec(line);
        if (bullet) return <p key={i} className="pl-4 -indent-3" style={{ marginLeft: bullet[1].length * 6 }}>• {inline(bullet[2])}</p>;
        if (!line.trim()) return <div key={i} className="h-2" />;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

export default function GuidaStudioAI({ userId, data, darkMode, analyzing, onAnalyze, onOpenArchive }: GuidaStudioAIProps) {
  const [apiKey, setApiKey] = useState(getGeminiKey);
  const [showApiKeyInput, setShowApiKeyInput] = useState(!apiKey);
  const [tempApiKey, setTempApiKey] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploadedImages, setUploadedImages] = useState<MessageImage[]>([]);
  const [scopeSubject, setScopeSubject] = useState('');
  const [scopeTopic, setScopeTopic] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [currentChat, setCurrentChat] = useState<ChatMeta | null>(null);
  const [chatError, setChatError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fullscreenSidebar, setFullscreenSidebar] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // The chat shown on screen: a reply that arrives after switching chat must not end up in the new one.
  const activeChatId = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';
  const selectClass = `${darkMode ? 'input-glass' : 'input-light'} py-1.5 text-sm`;

  // Esc closes full screen; the page behind must not scroll while it is open.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [fullscreen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const { archive } = data;
  const subjects = useMemo(() => [...new Set(archive.map(a => a.subject))].sort(), [archive]);
  const topics = useMemo(() => [...new Set(archive.filter(a => a.subject === scopeSubject).map(a => a.topic))].sort(), [archive, scopeSubject]);
  const inScope = useMemo(
    () => archive.filter(a => (!scopeSubject || a.subject === scopeSubject) && (!scopeTopic || a.topic === scopeTopic)),
    [archive, scopeSubject, scopeTopic],
  );
  const readable = inScope.filter(a => a.file?.textStatus === 'done' && a.file.textPath);
  const unread = inScope.filter(a => a.file && (a.file.textStatus === 'pending' || a.file.textStatus === 'error') && !analyzing.includes(a.id));
  const reading = inScope.filter(a => analyzing.includes(a.id));

  // Transcriptions of the selected files, grouped by subject and topic.
  const buildMaterial = async (): Promise<string> => {
    let material = '';
    let used = 0;
    for (const item of readable) {
      const text = await loadTranscript(item.file!.textPath!);
      const block = `\n\n===== FILE: "${item.name}" (Materia: ${item.subject} > Argomento: ${item.topic}) =====\n${text}`;
      if (material.length + block.length > MAX_MATERIAL_CHARS) {
        setNotice(`Il materiale selezionato è molto lungo: ho usato ${used} file su ${readable.length}. Scegli una materia o un argomento qui sopra per concentrarti su una parte.`);
        return material;
      }
      material += block;
      used++;
    }
    setNotice('');
    return material;
  };

  const handleSaveApiKey = () => {
    if (!tempApiKey.trim()) return;
    setGeminiKey(tempApiKey.trim());
    setApiKey(tempApiKey.trim());
    setShowApiKeyInput(false);
    setError('');
    // Files that were waiting for the key can be read now.
    const waiting = archive.filter(a => a.file?.textStatus === 'pending' || a.file?.textStatus === 'error').map(a => a.id);
    if (waiting.length > 0) onAnalyze(waiting);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setUploadedImages(prev => [...prev, { id: Date.now().toString() + Math.random(), imageData: base64, name: file.name, mimeType: file.type }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const lastChatKey = `studenthub_lastchat_${userId}`;

  const rememberChat = (id: string | null) => {
    try {
      if (id) localStorage.setItem(lastChatKey, id);
      else localStorage.removeItem(lastChatKey);
    } catch { /* ignore */ }
  };

  const openChat = async (id: string) => {
    try {
      const chat = await loadChat(id);
      if (!chat) return;
      activeChatId.current = chat.id;
      setCurrentChat({ id: chat.id, subject: chat.subject, topic: chat.topic, title: chat.title });
      setMessages(chat.messages.map(m => ({ id: m.id, role: m.role, content: m.content, imageCount: m.images, timestamp: new Date() })));
      setScopeSubject(chat.subject);
      setScopeTopic(chat.topic);
      setError('');
      setNotice('');
      rememberChat(chat.id);
    } catch (err) {
      setChatError(chatErrorMessage(err));
    }
  };

  const newChat = () => {
    activeChatId.current = null;
    setCurrentChat(null);
    setMessages([]);
    setError('');
    setNotice('');
    rememberChat(null);
  };

  // Saved chats are reloaded when the page opens, and the last open one comes back.
  useEffect(() => {
    let cancelled = false;
    listChats()
      .then(list => {
        if (cancelled) return;
        setChats(list);
        let last: string | null = null;
        try { last = localStorage.getItem(lastChatKey); } catch { /* ignore */ }
        if (last && list.some(c => c.id === last)) openChat(last);
      })
      .catch(err => { if (!cancelled) setChatError(chatErrorMessage(err)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const persistChat = async (meta: ChatMeta, list: Message[]) => {
    const stored: StoredMessage[] = list.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ...((m.images?.length || m.imageCount) ? { images: m.images?.length || m.imageCount } : {}),
    }));
    const updatedAt = new Date().toISOString();
    try {
      await saveChat(userId, { ...meta, messages: stored, updatedAt });
      setChatError('');
      setChats(prev => [{ ...meta, updatedAt }, ...prev.filter(c => c.id !== meta.id)]);
    } catch (err) {
      setChatError(chatErrorMessage(err));
    }
  };

  const handleRenameChat = async (chat: ChatSummary) => {
    const title = window.prompt('Nuovo nome della chat:', chat.title)?.trim();
    if (!title || title === chat.title) return;
    try {
      await renameChat(chat.id, title);
      setChats(prev => prev.map(c => (c.id === chat.id ? { ...c, title } : c)));
      if (currentChat?.id === chat.id) setCurrentChat({ ...currentChat, title });
    } catch (err) {
      setChatError(chatErrorMessage(err));
    }
  };

  const handleDeleteChat = async (chat: ChatSummary) => {
    if (!window.confirm(`Eliminare la chat "${chat.title}"?`)) return;
    try {
      await deleteChat(chat.id);
      setChats(prev => prev.filter(c => c.id !== chat.id));
      if (currentChat?.id === chat.id) newChat();
    } catch (err) {
      setChatError(chatErrorMessage(err));
    }
  };

  // Each chat belongs to the folder of what is being studied: changing it starts a new chat.
  const changeScope = (subject: string, topic: string) => {
    if (messages.length > 0) newChat();
    setScopeSubject(subject);
    setScopeTopic(topic);
  };

  const toParts = (m: Pick<Message, 'content' | 'images'>): GeminiPart[] => {
    const parts: GeminiPart[] = [];
    if (m.content) parts.push({ text: m.content });
    m.images?.forEach(img => parts.push({ inline_data: { mime_type: img.mimeType, data: img.imageData.split(',')[1] } }));
    return parts;
  };

  const sendMessage = async (text = input, title?: string) => {
    if ((!text.trim() && uploadedImages.length === 0) || isLoading) return;

    const meta: ChatMeta = currentChat ?? {
      id: createId(),
      subject: scopeSubject,
      topic: scopeTopic,
      title: title || titleFrom(text || 'Foto'),
    };
    if (!currentChat) {
      setCurrentChat(meta);
      activeChatId.current = meta.id;
      rememberChat(meta.id);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      images: uploadedImages.length > 0 ? [...uploadedImages] : undefined,
      timestamp: new Date(),
    };

    const history = [...messages, userMessage];
    setMessages(history);
    persistChat(meta, history);
    setInput('');
    setUploadedImages([]);
    setIsLoading(true);
    setError('');

    try {
      const material = await buildMaterial();
      const scope = scopeSubject ? `${scopeSubject}${scopeTopic ? ` > ${scopeTopic}` : ''}` : 'tutto l\'archivio';
      const otherItems = inScope.filter(a => !(a.file?.textStatus === 'done'));
      let context = `${studentContext(data)}\nMATERIALE SELEZIONATO DALLO STUDENTE: ${scope}.`;
      context += material
        ? `\n${material}`
        : '\n(Nessun file letto dall\'AI in questa selezione: rispondi con le tue conoscenze e suggerisci di caricare il materiale nell\'Archivio.)';
      if (otherItems.length > 0) {
        context += `\n\nALTRI ELEMENTI DELL'ARCHIVIO (solo il nome, contenuto non disponibile): ${otherItems.map(a => `"${a.name}"`).join(', ')}`;
      }

      const contents: GeminiContent[] = [
        { role: 'user', parts: [{ text: context }] },
        { role: 'model', parts: [{ text: 'Ho letto il materiale. Sono pronto ad aiutarti a studiare.' }] },
      ];
      history.forEach(m => {
        const parts = toParts(m);
        if (parts.length > 0) contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
      });

      const reply = await generateContent(apiKey, contents, { systemInstruction: SYSTEM_PROMPT, temperature: 0.6, maxOutputTokens: 8192 });
      const answer: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply || 'Mi dispiace, non ho potuto generare una risposta.',
        timestamp: new Date(),
      };
      // Saved even if the user has moved to another chat or section in the meantime.
      persistChat(meta, [...history, answer]);
      if (activeChatId.current === meta.id) setMessages(prev => [...prev, answer]);
    } catch (err) {
      if (activeChatId.current === meta.id) setError(err instanceof Error ? err.message : 'Errore di connessione.');
    } finally {
      setIsLoading(false);
    }
  };

  if (showApiKeyInput || !apiKey) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className={`text-2xl font-bold ${textColor}`}>Guida Studio AI</h2>
            <p className={`text-sm ${subTextColor}`}>Powered by Google Gemini</p>
          </div>
        </div>

        <div className={`${cardClass} p-8 text-center`}>
          <Bot className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
          <h3 className={`text-xl font-semibold mb-2 ${textColor}`}>Configura API Key</h3>
          <p className={`text-sm ${subTextColor} mb-6`}>
            Ottieni la tua API key gratuita su <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Google AI Studio</a>
          </p>
          <div className="max-w-md mx-auto space-y-4">
            <input type="password" value={tempApiKey} onChange={e => setTempApiKey(e.target.value)} className={darkMode ? 'input-glass w-full' : 'input-light w-full'} placeholder="AIza..." />
            <button onClick={handleSaveApiKey} disabled={!tempApiKey.trim()} className="btn-primary w-full disabled:opacity-50">Salva e inizia</button>
            {tempApiKey.trim() && !tempApiKey.trim().startsWith('AIza') && (
              <p className="text-xs text-amber-400">Attenzione: di solito la chiave inizia con "AIza". Controlla di averla copiata tutta.</p>
            )}
            {apiKey && (
              <button onClick={() => setShowApiKeyInput(false)} className={`text-sm ${subTextColor}`}>Annulla</button>
            )}
          </div>
        </div>

        <ApiKeyGuide darkMode={darkMode} />
      </div>
    );
  }

  const hoverBg = darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5';

  const iconButton = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button onClick={onClick} title={label} aria-label={label} className={`p-2 rounded-lg ${hoverBg}`}>{icon}</button>
  );

  const clearChat = newChat;

  const onInputKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const quickActions = (wrapClass: string, buttonClass: string) => (
    <div className={`flex gap-2 ${wrapClass}`}>
      {QUICK_ACTIONS.map(a => (
        <button key={a.label} onClick={() => sendMessage(a.prompt, a.label)} disabled={isLoading}
          className={`${buttonClass} rounded-full border whitespace-nowrap disabled:opacity-50 ${darkMode ? 'border-white/15 text-white/80 hover:bg-white/10' : 'border-black/10 text-gray-700 hover:bg-black/5'}`}>
          {a.label}
        </button>
      ))}
    </div>
  );

  const messageImages = (msg: Message) => !msg.images?.length ? (
    msg.imageCount ? <p className="text-xs opacity-70 mb-1">📷 {msg.imageCount === 1 ? '1 foto allegata' : `${msg.imageCount} foto allegate`}</p> : null
  ) : (
    <div className="flex flex-wrap gap-2 mb-2">
      {msg.images.map(img => <img key={img.id} src={img.imageData} alt={img.name} className="max-w-[200px] max-h-[200px] rounded-lg object-cover" />)}
    </div>
  );

  const pendingImages = (extraClass: string) => uploadedImages.length > 0 && (
    <div className={`${cardClass} p-3 ${extraClass}`}>
      <div className="flex flex-wrap gap-2">
        {uploadedImages.map(img => (
          <div key={img.id} className="relative">
            <img src={img.imageData} alt={img.name} className="w-16 h-16 rounded-lg object-cover" />
            <button onClick={() => setUploadedImages(prev => prev.filter(i => i.id !== img.id))} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center" aria-label="Rimuovi immagine">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const imagePicker = (buttonClass: string) => (
    <>
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
      <button onClick={() => fileInputRef.current?.click()} className={`${buttonClass} flex items-center justify-center flex-shrink-0`} title="Allega foto" aria-label="Allega foto">
        <ImageIcon className={`w-5 h-5 ${textColor}`} />
      </button>
    </>
  );

  // Saved chats grouped in folders: subject, then topic ("Generale" when not chosen).
  const chatGroups = (() => {
    const groups: { subject: string; direct: ChatSummary[]; topics: { topic: string; chats: ChatSummary[] }[] }[] = [];
    for (const chat of chats) {
      let group = groups.find(g => g.subject === chat.subject);
      if (!group) { group = { subject: chat.subject, direct: [], topics: [] }; groups.push(group); }
      if (!chat.topic) { group.direct.push(chat); continue; }
      let topic = group.topics.find(t => t.topic === chat.topic);
      if (!topic) { topic = { topic: chat.topic, chats: [] }; group.topics.push(topic); }
      topic.chats.push(chat);
    }
    return groups;
  })();

  const toggleFolder = (key: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const renderChatList = (onPicked?: () => void) => {
    const chatRow = (chat: ChatSummary) => (
      <div key={chat.id} className={`group flex items-center gap-1 rounded-lg ${currentChat?.id === chat.id ? (darkMode ? 'bg-white/15' : 'bg-black/10') : hoverBg}`}>
        <button onClick={() => { openChat(chat.id); onPicked?.(); }} className={`flex-1 min-w-0 text-left text-sm truncate px-2 py-1.5 ${textColor}`} title={chat.title}>
          {chat.title}
        </button>
        <button onClick={() => handleRenameChat(chat)} className={`p-1 lg:opacity-0 lg:group-hover:opacity-100 ${subTextColor}`} aria-label="Rinomina chat" title="Rinomina">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => handleDeleteChat(chat)} className="p-1 pr-2 lg:opacity-0 lg:group-hover:opacity-100 text-red-400" aria-label="Elimina chat" title="Elimina">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
    const folderButton = (key: string, label: string, count: number, small = false) => (
      <button onClick={() => toggleFolder(key)} className={`w-full flex items-center gap-1.5 py-1.5 ${small ? 'pl-3 text-xs' : 'text-sm font-semibold'} ${small ? subTextColor : textColor}`}>
        {collapsed.has(key) ? <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
        {small ? <Folder className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" /> : <FolderOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />}
        <span className="truncate">{label}</span>
        <span className={`ml-auto text-xs font-normal ${subTextColor}`}>{count}</span>
      </button>
    );
    return (
      <div className="flex flex-col h-full min-h-0">
        <button onClick={() => { newChat(); onPicked?.(); }} className="btn-primary text-sm flex items-center justify-center gap-2 mb-3">
          <Plus className="w-4 h-4" /> Nuova chat
        </button>
        {chatError && <p className="text-xs text-amber-400 mb-2">{chatError}</p>}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {chats.length === 0 && (
            <p className={`text-xs ${subTextColor}`}>Qui trovi le chat salvate, divise in cartelle per materia e argomento.</p>
          )}
          {chatGroups.map(group => {
            const key = `s:${group.subject}`;
            const count = group.direct.length + group.topics.reduce((n, t) => n + t.chats.length, 0);
            return (
              <div key={key}>
                {folderButton(key, group.subject || 'Generale', count)}
                {!collapsed.has(key) && (
                  <div className="pl-2 space-y-0.5">
                    {group.direct.map(chatRow)}
                    {group.topics.map(t => {
                      const topicKey = `${key}/t:${t.topic}`;
                      return (
                        <div key={topicKey}>
                          {folderButton(topicKey, t.topic, t.chats.length, true)}
                          {!collapsed.has(topicKey) && <div className="pl-4 space-y-0.5">{t.chats.map(chatRow)}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const mobileChatList = sidebarOpen && (
    <div className="fixed inset-0 z-[70] bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)}>
      <aside className={`absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] p-3 flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className={`font-semibold ${textColor}`}>Le tue chat</span>
          {iconButton('Chiudi', <X className={`w-4 h-4 ${textColor}`} />, () => setSidebarOpen(false))}
        </div>
        {renderChatList(() => setSidebarOpen(false))}
      </aside>
    </div>
  );

  // Full screen, in the style of ChatGPT: no panels, one centered column, plain answers.
  const renderFullscreen = () => {
    const scopeLabel = scopeSubject ? `${scopeSubject}${scopeTopic ? ` › ${scopeTopic}` : ''}` : 'Tutto l\'archivio';
    return (
      <div className={`fixed inset-0 z-[60] flex ${darkMode ? 'gradient-bg mesh-gradient' : 'gradient-bg-light mesh-gradient-light'}`}>
        {mobileChatList}
        {fullscreenSidebar && (
          <aside className={`hidden lg:flex w-72 flex-shrink-0 flex-col p-3 border-r ${darkMode ? 'bg-black/20 border-white/10' : 'bg-white/50 border-black/5'}`}>
            {renderChatList()}
          </aside>
        )}
        <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="hidden lg:inline">{iconButton(fullscreenSidebar ? 'Nascondi chat' : 'Mostra chat', <PanelLeft className={`w-4 h-4 ${textColor}`} />, () => setFullscreenSidebar(v => !v))}</span>
            <span className="lg:hidden">{iconButton('Le tue chat', <PanelLeft className={`w-4 h-4 ${textColor}`} />, () => setSidebarOpen(true))}</span>
            <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <span className={`font-semibold ${textColor}`}>Guida Studio AI</span>
            <span className={`text-sm truncate ${subTextColor}`}>· {currentChat ? currentChat.title : scopeLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            {iconButton('Nuova chat', <Plus className={`w-4 h-4 ${textColor}`} />, clearChat)}
            {iconButton('Esci da schermo intero (Esc)', <Minimize2 className={`w-4 h-4 ${textColor}`} />, () => setFullscreen(false))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center pt-[18vh]">
                <h2 className={`text-3xl font-semibold ${textColor}`}>Cosa studiamo oggi?</h2>
                <p className={`mt-2 ${subTextColor}`}>Rispondo in base al tuo materiale: {scopeLabel}</p>
                {quickActions('mt-6 flex-wrap justify-center', 'text-sm px-4 py-2')}
              </div>
            )}

            {messages.map(msg => (
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className={`max-w-[75%] rounded-3xl px-5 py-3 ${darkMode ? 'bg-white/10 text-white' : 'bg-black/5 text-gray-800'}`}>
                    {messageImages(msg)}
                    <p className="text-base whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ) : (
                <div key={msg.id} className={textColor}>
                  <FormattedText text={msg.content} large />
                </div>
              )
            ))}

            {isLoading && <Loader2 className="w-5 h-5 animate-spin text-blue-400" />}
            {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">⚠️ {error}</div>}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="max-w-3xl w-full mx-auto px-4 pb-4">
          {pendingImages('mb-2')}
          <div className={`flex items-end gap-2 rounded-3xl p-2 border ${darkMode ? 'bg-white/10 border-white/15' : 'bg-white/90 border-black/10 shadow-lg'}`}>
            {imagePicker(`w-10 h-10 rounded-full ${hoverBg}`)}
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onInputKey} autoFocus
              placeholder="Chiedi qualcosa sul tuo materiale..." rows={1}
              className={`flex-1 resize-none bg-transparent outline-none py-2 text-base max-h-40 ${darkMode ? 'text-white placeholder-white/40' : 'text-gray-800 placeholder-gray-400'}`}
              disabled={isLoading} />
            <button onClick={() => sendMessage()} disabled={(!input.trim() && uploadedImages.length === 0) || isLoading}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-30 ${darkMode ? 'bg-white text-gray-900' : 'bg-gray-900 text-white'}`} aria-label="Invia">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className={`text-xs text-center mt-2 ${subTextColor}`}>L'AI può sbagliare: controlla le informazioni importanti sul libro.</p>
        </div>
        </div>
      </div>
    );
  };

  return fullscreen ? renderFullscreen() : (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
    {mobileChatList}
    <aside className={`${cardClass} hidden lg:flex w-72 flex-shrink-0 flex-col p-3`}>
      {renderChatList()}
    </aside>
    <div className="flex flex-col flex-1 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className={`text-xl font-bold ${textColor}`}>Guida Studio AI</h2>
            <p className={`text-xs ${subTextColor}`}>Studia sul tuo materiale • Google Gemini</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="lg:hidden">{iconButton('Le tue chat', <MessageSquare className={`w-4 h-4 ${textColor}`} />, () => setSidebarOpen(true))}</span>
          {iconButton('Schermo intero', <Maximize2 className={`w-4 h-4 ${textColor}`} />, () => setFullscreen(true))}
          {iconButton('Cambia API key', <Key className={`w-4 h-4 ${textColor}`} />, () => { setTempApiKey(''); setShowApiKeyInput(true); })}
          {iconButton('Nuova chat', <Plus className={`w-4 h-4 ${textColor}`} />, clearChat)}
        </div>
      </div>

      <div className={`${cardClass} p-3 mb-3 space-y-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium flex items-center gap-1.5 ${textColor}`}><BookOpen className="w-4 h-4 text-blue-400" /> Studia su:</span>
          <select value={scopeSubject} onChange={e => changeScope(e.target.value, '')} className={selectClass} aria-label="Materia">
            <option value="">Tutto l'archivio</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {scopeSubject && (
            <select value={scopeTopic} onChange={e => changeScope(scopeSubject, e.target.value)} className={selectClass} aria-label="Argomento">
              <option value="">Tutti gli argomenti</option>
              {topics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <button onClick={onOpenArchive} className="text-xs text-blue-400 underline flex items-center gap-1 ml-auto">
            <FolderOpen className="w-3.5 h-3.5" /> Apri archivio
          </button>
        </div>
        <p className={`text-xs ${subTextColor}`}>
          {archive.every(a => !a.file)
            ? <>Non hai ancora caricato file: aggiungi PDF, foto del libro e appunti nell'<button onClick={onOpenArchive} className="text-blue-400 underline">Archivio</button> e potrò aiutarti a studiarli.</>
            : <>
                📄 {readable.length} file pronti
                {reading.length > 0 && <> · <Loader2 className="w-3 h-3 inline animate-spin" /> {reading.length} in lettura</>}
                {unread.length > 0 && <> · {unread.length} da leggere <button onClick={() => onAnalyze(unread.map(a => a.id))} className="text-blue-400 underline">leggili ora</button></>}
              </>}
        </p>
        {notice && <p className="text-xs text-amber-400">{notice}</p>}
      </div>

      <div className={`flex-1 overflow-y-auto ${cardClass} p-4 space-y-4 mb-3`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className={`w-12 h-12 mb-3 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
            <p className={`font-medium ${textColor}`}>Ciao! Sono il tuo tutor di studio</p>
            <p className={`text-sm ${subTextColor} mt-1 max-w-md`}>
              Scegli qui sopra cosa studiare, poi fammi una domanda o usa uno dei pulsanti. Rispondo in base ai file del tuo archivio.
            </p>
            {quickActions('mt-4 max-w-lg justify-center flex-wrap', 'text-sm px-3 py-1.5')}
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white' : darkMode ? 'bg-white/10 text-white' : 'bg-black/5 text-gray-800'}`}>
              {messageImages(msg)}
              {msg.role === 'assistant' ? <FormattedText text={msg.content} /> : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
            </div>
            {msg.role === 'user' && (
              <div className={`w-8 h-8 rounded-lg ${darkMode ? 'bg-white/10' : 'bg-black/10'} flex items-center justify-center flex-shrink-0`}>
                <User className={`w-4 h-4 ${textColor}`} />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className={`rounded-2xl px-4 py-3 ${darkMode ? 'bg-white/10' : 'bg-black/5'}`}>
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            </div>
          </div>
        )}

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">⚠️ {error}</div>}
        <div ref={messagesEndRef} />
      </div>

      {pendingImages('mb-2')}
      {messages.length > 0 && quickActions('overflow-x-auto pb-2 mb-1', 'text-xs px-3 py-1')}

      <div className={`${cardClass} p-3`}>
        <div className="flex gap-2">
          {imagePicker(`w-10 h-10 rounded-xl ${darkMode ? 'bg-white/10' : 'bg-black/5'}`)}
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onInputKey}
            placeholder="Chiedi aiuto..." rows={1} className={`${darkMode ? 'input-glass' : 'input-light'} flex-1 resize-none`} disabled={isLoading} />
          <button onClick={() => sendMessage()} disabled={(!input.trim() && uploadedImages.length === 0) || isLoading}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}

const GUIDE_STEPS: { title: string; text: React.ReactNode }[] = [
  {
    title: 'Apri Google AI Studio',
    text: <>Clicca su <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">aistudio.google.com/app/apikey</a>. Si apre in una nuova scheda: lascia aperta anche questa.</>,
  },
  {
    title: 'Accedi con il tuo account Google',
    text: <>Usa lo stesso account di Gmail o YouTube. Se è la prima volta, Google ti chiede di accettare i termini di servizio: spunta le caselle e clicca <b>Continua</b>.</>,
  },
  {
    title: 'Crea la chiave',
    text: <>Clicca il pulsante <b>Create API key</b> (o <b>Crea chiave API</b>). Se ti chiede un progetto, scegli <b>Create API key in new project</b> (crea in un nuovo progetto). Non serve la carta di credito.</>,
  },
  {
    title: 'Copia la chiave',
    text: <>Compare una lunga sequenza di lettere e numeri che inizia con <b>AIza</b>. Clicca l'icona <b>Copia</b> accanto (o selezionala tutta e premi <b>Cmd + C</b> su Mac, <b>Ctrl + C</b> su Windows).</>,
  },
  {
    title: 'Incollala qui e salva',
    text: <>Torna su questa pagina, clicca nel campo qui sopra, incolla (<b>Cmd + V</b> o <b>Ctrl + V</b>) e premi <b>Salva e inizia</b>. Fatto: puoi scrivere al tutor!</>,
  },
];

// Step-by-step instructions for users who have never created an API key.
function ApiKeyGuide({ darkMode }: { darkMode: boolean }) {
  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/70' : 'text-gray-600';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';
  const boxClass = darkMode ? 'bg-white/5' : 'bg-black/5';

  return (
    <div className={`${cardClass} p-6 space-y-6`}>
      <div>
        <h3 className={`text-lg font-semibold ${textColor}`}>📖 Come ottenere la API key (5 minuti)</h3>
        <p className={`text-sm ${subTextColor} mt-1`}>
          La API key è come una "tessera" personale che permette a Student Hub di usare l'intelligenza artificiale di Google (Gemini). È gratuita.
        </p>
      </div>

      <ol className="space-y-4">
        {GUIDE_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
            <div>
              <p className={`font-medium ${textColor}`}>{step.title}</p>
              <p className={`text-sm ${subTextColor} mt-0.5`}>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className={`${boxClass} rounded-xl p-4 space-y-2`}>
        <p className={`font-medium ${textColor}`}>⚠️ Da sapere</p>
        <ul className={`text-sm ${subTextColor} list-disc pl-5 space-y-1`}>
          <li><b>Età:</b> Google permette di creare API key solo a chi ha almeno 18 anni. Se sei minorenne, chiedi a un genitore di crearla con il suo account.</li>
          <li><b>Tienila segreta:</b> chi ha la tua chiave può usarla al posto tuo. Non mandarla in chat e non pubblicarla.</li>
          <li><b>Resta su questo dispositivo:</b> la chiave è salvata solo in questo browser. Su un altro computer o sul telefono dovrai incollarla di nuovo (puoi creare più chiavi o riusare la stessa).</li>
          <li><b>Cosa viene inviato a Google:</b> quando usi il tutor, le tue domande, le foto che carichi, il testo dei file dell'Archivio che scegli di studiare e un riepilogo di voti e impegni vengono inviati a Google per generare la risposta. Anche per leggere le foto e i PDF scansionati dell'Archivio il file viene inviato a Google. Con la versione gratuita Google può usarli per migliorare i suoi servizi: evita di scrivere dati personali sensibili.</li>
        </ul>
      </div>

      <div className={`${boxClass} rounded-xl p-4 space-y-2`}>
        <p className={`font-medium ${textColor}`}>🛠️ Se qualcosa non va</p>
        <ul className={`text-sm ${subTextColor} list-disc pl-5 space-y-1`}>
          <li><b>"API key non valida":</b> probabilmente non è stata copiata tutta. Torna su AI Studio, copiala di nuovo e usa il pulsante 🔑 <b>Cambia API key</b> in alto nella chat.</li>
          <li><b>"Modelli occupati" o limite raggiunto:</b> la versione gratuita ha un numero massimo di domande al minuto e al giorno. Aspetta qualche minuto e riprova.</li>
          <li><b>Hai perso la chiave o pensi che qualcuno l'abbia vista:</b> su AI Studio eliminala (icona del cestino) e creane una nuova.</li>
          <li><b>Non vedi il pulsante "Create API key":</b> controlla di aver accettato i termini e di usare un account Google personale (quelli della scuola a volte hanno AI Studio bloccato).</li>
        </ul>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 pt-4 border-t ${darkMode ? 'border-white/10' : 'border-black/10'}`}>
        <p className={`text-sm ${subTextColor}`}>
          Guida a cura di <span className={`font-semibold ${textColor}`}>Sebastiano Zorzi</span>
        </p>
        <a
          href="https://www.instagram.com/sebastiano_zorzi_/"
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 text-sm font-medium ${textColor} hover:opacity-80`}
        >
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: 'linear-gradient(45deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5)' }}>
            <Instagram className="w-4 h-4" />
          </span>
          @sebastiano_zorzi_
        </a>
      </div>
    </div>
  );
}
