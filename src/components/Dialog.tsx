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
  confirm: async o => window.confirm([o.title, o.message].filter(Boolean).join('\n\n')),
  prompt: async o => window.prompt([o.title, o.message].filter(Boolean).join('\n\n'), o.defaultValue),
  alert: async o => window.alert([o.title, o.message].filter(Boolean).join('\n\n')),
});

export const useDialog = () => useContext(DialogContext);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const current = queue[0];

  const push = useCallback((request: Request) => setQueue(q => [...q, request]), []);
  const api = useRef<DialogApi>({
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
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-scale-in">
            <h2 className="text-lg font-semibold text-gray-900">{o.title}</h2>
            {o.message && <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{o.message}</p>}
            {current.kind === 'prompt' && (
              <form onSubmit={e => { e.preventDefault(); if (value.trim()) close(true); }} className="mt-4">
                <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)} placeholder={(o as PromptOptions).placeholder}
                  className="input-light w-full" maxLength={80} />
              </form>
            )}
            <div className="mt-6 flex justify-end gap-2">
              {current.kind !== 'alert' && (
                <button onClick={() => close(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
                  {o.cancelLabel || 'Annulla'}
                </button>
              )}
              <button
                onClick={() => close(true)}
                disabled={current.kind === 'prompt' && !value.trim()}
                autoFocus={current.kind !== 'prompt'}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${o.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-gradient-to-r from-indigo-500 to-purple-600'}`}
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
