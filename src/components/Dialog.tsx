import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// In-app replacements for the browser's confirm / prompt / alert, which look like error
// messages ("student-hub.vercel.app says…") and can't be styled.

interface DialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions extends DialogOptions {
  defaultValue?: string;
  placeholder?: string;
}

interface DialogApi {
  // Follows the app's light/dark theme (called by App).
  setDark: (dark: boolean) => void;
  confirm: (options: DialogOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  alert: (options: DialogOptions) => Promise<void>;
}

type Request =
  | { kind: 'confirm'; options: DialogOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }
  | { kind: 'alert'; options: DialogOptions; resolve: () => void };

// Outside the provider (should not happen) fall back to the browser dialogs.
const DialogContext = createContext<DialogApi>({
  setDark: () => {},
  confirm: async o => window.confirm([o.title, o.message].filter(Boolean).join('\n\n')),
  prompt: async o => window.prompt([o.title, o.message].filter(Boolean).join('\n\n'), o.defaultValue),
  alert: async o => window.alert([o.title, o.message].filter(Boolean).join('\n\n')),
});

export const useDialog = () => useContext(DialogContext);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const [value, setValue] = useState('');
  const [dark, setDark] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = queue[0];

  const push = useCallback((request: Request) => setQueue(q => [...q, request]), []);
  const api = useRef<DialogApi>({
    setDark,
    confirm: options => new Promise(resolve => push({ kind: 'confirm', options, resolve })),
    prompt: options => new Promise(resolve => push({ kind: 'prompt', options, resolve })),
    alert: options => new Promise(resolve => push({ kind: 'alert', options, resolve })),
  }).current;

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setValue(current.options.defaultValue || '');
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [current]);

  const close = (ok: boolean) => {
    if (!current) return;
    if (current.kind === 'confirm') current.resolve(ok);
    else if (current.kind === 'prompt') current.resolve(ok ? value : null);
    else current.resolve();
    setQueue(q => q.slice(1));
  };

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter' && current.kind !== 'prompt') { e.preventDefault(); close(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const o = current?.options;
  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && o && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => close(false)}>
          <div role="dialog" aria-modal="true" aria-label={o.title} onClick={e => e.stopPropagation()}
            className={`w-full max-w-sm p-6 animate-scale-in ${dark ? 'glass-float' : 'glass-card-light'}`}>
            <h2 className={`text-lg font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{o.title}</h2>
            {o.message && <p className={`mt-2 text-sm whitespace-pre-line ${dark ? 'text-white/70' : 'text-gray-600'}`}>{o.message}</p>}
            {current.kind === 'prompt' && (
              <form onSubmit={e => { e.preventDefault(); if (value.trim()) close(true); }} className="mt-4">
                <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)} placeholder={(o as PromptOptions).placeholder}
                  className={`${dark ? 'input-glass' : 'input-light'} w-full`} maxLength={80} />
              </form>
            )}
            <div className="mt-6 flex justify-end gap-2">
              {current.kind !== 'alert' && (
                <button onClick={() => close(false)} className={`px-4 py-2 rounded-xl text-sm font-medium ${dark ? 'text-white/80 bg-white/10 hover:bg-white/15' : 'text-gray-700 bg-black/5 hover:bg-black/10'}`}>
                  {o.cancelLabel || 'Annulla'}
                </button>
              )}
              <button
                onClick={() => close(true)}
                disabled={current.kind === 'prompt' && !value.trim()}
                autoFocus={current.kind !== 'prompt'}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 shadow-lg ${o.danger ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-red-500/20' : 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-indigo-500/30'}`}
              >
                {o.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
