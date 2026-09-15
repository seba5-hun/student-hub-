import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Trash2, Key, BookOpen, Sparkles, Settings, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { ArchiveItem, Grade, Task, UserData } from '../lib/store';

interface GuidaStudioAIProps {
  data: UserData;
  darkMode: boolean;
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
  timestamp: Date;
}

export default function GuidaStudioAI({ data, darkMode }: GuidaStudioAIProps) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [showApiKeyInput, setShowApiKeyInput] = useState(!apiKey);
  const [tempApiKey, setTempApiKey] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadedImages, setUploadedImages] = useState<MessageImage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buildContext = (): string => {
    const { archive, grades, tasks } = data;
    let context = `Sei un tutor AI di nome "Gemini 3.6 Tutor" integrato in Student Hub. Rispondi SEMPRE in italiano.\n\n`;

    if (grades.length > 0) {
      context += `📊 VOTI:\n`;
      const subjectAvgs: Record<string, number[]> = {};
      grades.forEach((g: Grade) => {
        if (!subjectAvgs[g.subject]) subjectAvgs[g.subject] = [];
        subjectAvgs[g.subject].push(g.value);
      });
      Object.entries(subjectAvgs).forEach(([subject, values]) => {
        const avg = (values.reduce((a: number, b: number) => a + b, 0) / values.length).toFixed(1);
        context += `- ${subject}: media ${avg}\n`;
      });
    }

    const activeTasks = tasks.filter((t: Task) => !t.done);
    if (activeTasks.length > 0) {
      context += `\n📋 IMPEGNI ATTIVI:\n`;
      activeTasks.forEach((t: Task) => {
        context += `- ${t.title} (${t.date})\n`;
      });
    }

    if (archive.length > 0) {
      context += `\n📁 ARCHIVIO:\n`;
      archive.forEach((item: ArchiveItem) => {
        context += `- ${item.subject} > ${item.topic}: ${item.name}\n`;
      });
    }

    return context;
  };

  const handleSaveApiKey = () => {
    if (!tempApiKey.trim()) return;
    localStorage.setItem('gemini_api_key', tempApiKey.trim());
    setApiKey(tempApiKey.trim());
    setShowApiKeyInput(false);
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: '👋 Ciao! Sono il tuo tutor AI powered by Gemini 3.6 Flash. Conosco i tuoi documenti, voti e impegni. Come posso aiutarti?',
      timestamp: new Date(),
    }]);
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

  const sendMessage = async () => {
    if ((!input.trim() && uploadedImages.length === 0) || isLoading) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      images: uploadedImages.length > 0 ? [...uploadedImages] : undefined,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setUploadedImages([]);
    setIsLoading(true);
    setError('');

    try {
      const context = buildContext();
      const contents: any[] = [
        { role: 'user', parts: [{ text: context }] },
        { role: 'model', parts: [{ text: 'Ho capito il contesto. Sono pronto!' }] }
      ];

      messages.forEach(m => {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        if (m.images && m.images.length > 0) {
          m.images.forEach(img => {
            const base64Data = img.imageData.split(',')[1];
            parts.push({ inline_data: { mime_type: img.mimeType, data: base64Data } });
          });
        }
        if (parts.length > 0) contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
      });

      const currentParts: any[] = [];
      if (userMessage.content) currentParts.push({ text: userMessage.content });
      if (uploadedImages.length > 0) {
        uploadedImages.forEach(img => {
          const base64Data = img.imageData.split(',')[1];
          currentParts.push({ inline_data: { mime_type: img.mimeType, data: base64Data } });
        });
      }
      if (currentParts.length > 0) contents.push({ role: 'user', parts: currentParts });

      const MODELS = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'];
      let lastError = '';
      let success = false;

      for (const model of MODELS) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error?.message || `Errore ${response.status}`;
            if (errorMsg.includes('high demand') || errorMsg.includes('not available') || errorMsg.includes('overloaded') || errorMsg.includes('503') || errorMsg.includes('429')) {
              lastError = errorMsg;
              continue;
            }
            throw new Error(errorMsg);
          }

          const responseData = await response.json();
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: responseData.candidates?.[0]?.content?.parts?.[0]?.text || 'Mi dispiace, non ho potuto generare una risposta.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, assistantMessage]);
          success = true;
          break;
        } catch (err: any) {
          lastError = err.message || 'Errore di connessione';
          if (!lastError.includes('high demand') && !lastError.includes('not available') && !lastError.includes('overloaded')) break;
        }
      }

      if (!success) setError(`⚠️ ${lastError}\n\n💡 Tutti i modelli sono occupati. Riprova tra poco.`);
    } catch (err: any) {
      setError(err.message || 'Errore di connessione.');
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
            <p className={`text-sm ${subTextColor}`}>Powered by Gemini 3.6 Flash</p>
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className={`text-xl font-bold ${textColor}`}>Guida Studio AI</h2>
            <p className={`text-xs ${subTextColor}`}>Gemini 3.6 Flash • Con visione</p>
          </div>
        </div>
        <button onClick={() => setMessages([])} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
          <Trash2 className={`w-4 h-4 ${textColor}`} />
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto ${cardClass} p-4 space-y-4 mb-4`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className={`w-12 h-12 mb-3 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
            <p className={`font-medium ${textColor}`}>Ciao! Sono il tuo tutor AI</p>
            <p className={`text-sm ${subTextColor} mt-1`}>Chiedimi aiuto o carica foto</p>
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
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {msg.images.map(img => <img key={img.id} src={img.imageData} alt={img.name} className="max-w-[200px] max-h-[200px] rounded-lg object-cover" />)}
                </div>
              )}
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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

      {uploadedImages.length > 0 && (
        <div className={`${cardClass} p-3 mb-2`}>
          <div className="flex flex-wrap gap-2">
            {uploadedImages.map(img => (
              <div key={img.id} className="relative">
                <img src={img.imageData} alt={img.name} className="w-16 h-16 rounded-lg object-cover" />
                <button onClick={() => setUploadedImages(prev => prev.filter(i => i.id !== img.id))} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`${cardClass} p-3`}>
        <div className="flex gap-2">
          <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className={`w-10 h-10 rounded-xl ${darkMode ? 'bg-white/10' : 'bg-black/5'} flex items-center justify-center`}>
            <ImageIcon className={`w-5 h-5 ${textColor}`} />
          </button>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Chiedi aiuto..." rows={1} className={`${darkMode ? 'input-glass' : 'input-light'} flex-1 resize-none`} disabled={isLoading} />
          <button onClick={sendMessage} disabled={(!input.trim() && uploadedImages.length === 0) || isLoading}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
