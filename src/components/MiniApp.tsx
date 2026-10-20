import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserData, todayKey } from '../lib/store';
import { MAX_APP_STORE } from '../lib/custom';
import { applyWrite, WRITE_TYPES } from '../lib/miniAppWrites';
import { createId } from '../lib/store';

// A mini-app written by the Assistente MYND, running in a closed room: a sandboxed iframe with a
// unique (opaque) origin, no access to MYND's storage, cookies or keys, no network (CSP), no
// popups or navigation. It gets MYND's look (the theme tokens and a small stylesheet) and talks
// to MYND only through `window.mynd`: load/save its own data and, if allowed, read a summary of
// the student's subjects, tasks and grades and add to them (checked by MYND, see miniAppWrites).

const TOKENS = ['brand', 'brand-ring', 'brand-fill', 'on-brand', 'bg', 'surface', 'border', 'text', 'text-muted', 'text-subtle', 'success', 'warning', 'danger',
  'area-scuola', 'area-studio', 'area-sport', 'area-progetto', 'area-recupero', 'area-vita', 'area-viaggio', 'area-pasto', 'area-sonno', 'area-extra',
  'glass', 'glass-edge', 'glass-well', 'btn-primary', 'btn-primary-shadow', 'font-sans'];

// MYND's look for the mini-apps (the AI is told to use these classes).
export const MINI_APP_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent;color:var(--text);font-family:var(--font-sans);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
h1,h2,h3{margin:0 0 .5em;letter-spacing:-.03em;line-height:1.15}h1{font-size:28px}h2{font-size:21px}h3{font-size:17px}
p{margin:0 0 .6em}.muted{color:var(--text-muted)}.subtle{color:var(--text-subtle);font-size:13px}.lime{color:var(--brand-ring)}
.card{background:var(--glass);border:1px solid var(--glass-edge);border-radius:20px;padding:16px}
.well{background:var(--glass-well);border-radius:14px;padding:12px}
.btn{appearance:none;border:0;cursor:pointer;font:inherit;font-weight:600;padding:10px 18px;border-radius:999px;background:var(--btn-primary);color:var(--on-brand);box-shadow:var(--btn-primary-shadow)}
.btn:disabled{opacity:.4;cursor:default}
.btn-secondary{appearance:none;border:1px solid var(--border);cursor:pointer;font:inherit;font-weight:500;padding:9px 16px;border-radius:999px;background:var(--glass);color:var(--text)}
.btn-danger{appearance:none;border:0;cursor:pointer;font:inherit;font-weight:600;padding:9px 16px;border-radius:999px;background:color-mix(in srgb,var(--danger) 16%,transparent);color:var(--danger)}
.input,input,select,textarea{font:inherit;color:var(--text);background:var(--glass-well);border:1px solid var(--border);border-radius:12px;padding:9px 12px;outline:none;max-width:100%}
input:focus,select:focus,textarea:focus{border-color:var(--brand-ring)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:var(--glass-well);font-size:13px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.col{display:flex;flex-direction:column;gap:10px}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
.bar{height:8px;border-radius:999px;background:var(--glass-well);overflow:hidden}.bar>i{display:block;height:100%;background:var(--brand-fill);border-radius:999px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--border)}th{color:var(--text-muted);font-weight:500;font-size:13px}
.big{font-size:44px;font-weight:700;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.ok{color:var(--success)}.bad{color:var(--danger)}
`;

// The bridge inside the room: promises over postMessage, and the height of the page.
const SDK = `
(function(){
  var seq=0,pending={};
  window.addEventListener('message',function(e){var m=e.data;if(m&&m.__mynd&&m.reply&&pending[m.id]){pending[m.id](m.result);delete pending[m.id];}});
  function call(type,payload){return new Promise(function(res){var id=++seq;pending[id]=res;parent.postMessage({__mynd:true,id:id,type:type,payload:payload},'*');});}
  var last=0;function h(){var v=Math.ceil(document.documentElement.scrollHeight);if(v!==last){last=v;parent.postMessage({__mynd:true,type:'height',payload:v},'*');}}
  function w(op){return function(p){return call('write',{op:op,payload:p}).then(function(r){if(r&&r.error)throw new Error(r.error);return r&&r.result;});};}
  window.mynd={load:function(){return call('load')},save:function(data){return call('save',data)},data:function(){return call('data')},today:function(){return '__TODAY__'},
    addSession:w('addSession'),addTask:w('addTask'),setTaskDone:w('setTaskDone'),addGrade:w('addGrade'),addNote:w('addNote'),
    open:function(section){parent.postMessage({__mynd:true,type:'open',payload:String(section)},'*')}};
  window.addEventListener('load',function(){h();try{new ResizeObserver(h).observe(document.body)}catch(_){setInterval(h,500)}});
  window.addEventListener('error',function(e){parent.postMessage({__mynd:true,type:'error',payload:String(e.message||'errore')},'*')});
})();`;

interface Props {
  html: string;
  store: unknown;
  allowData: boolean;
  data: UserData;
  onSave: (store: unknown) => void;
  onError?: (message: string) => void;
  allowWrite?: boolean;
  onUpdateData?: (update: (prev: UserData) => UserData) => void;
  onNavigate?: (section: string) => void;
}

const WRITES_PER_MINUTE = 30;

export default function MiniApp({ html, store, allowData, data, onSave, onError, allowWrite, onUpdateData, onNavigate }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const latest = useRef({ store, allowData, data, onSave, onError, allowWrite, onUpdateData, onNavigate });
  latest.current = { store, allowData, data, onSave, onError, allowWrite, onUpdateData, onNavigate };
  const writes = useRef<number[]>([]);

  // The page is built once per code version (and theme), so saving data doesn't reload it.
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const srcDoc = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const vars = TOKENS.map(t => `--${t}:${cs.getPropertyValue(`--${t}`).trim() || 'initial'}`).join(';');
    const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'">`
      + `<meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${vars};color-scheme:${theme}}${MINI_APP_CSS}</style><script>${SDK.replace('__TODAY__', todayKey())}</script>`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => `${m}${head}`) : `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
  }, [html, theme]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win || e.source !== win) return;
      const m = e.data as { __mynd?: boolean; id?: number; type?: string; payload?: unknown };
      if (!m || !m.__mynd) return;
      const reply = (result: unknown) => win.postMessage({ __mynd: true, reply: true, id: m.id, result }, '*');
      const cur = latest.current;
      switch (m.type) {
        case 'height': setHeight(Math.max(80, Math.min(4000, Number(m.payload) || 240))); break;
        case 'load': reply(cur.store ?? null); break;
        case 'save': {
          let ok = false;
          try { const json = JSON.stringify(m.payload ?? null); ok = json.length <= MAX_APP_STORE; if (ok) cur.onSave(JSON.parse(json)); } catch { ok = false; }
          reply(ok);
          if (!ok) cur.onError?.('Questa mini-app sta salvando troppi dati.');
          break;
        }
        case 'data': {
          if (!cur.allowData) { reply(null); break; }
          const d = cur.data, today = todayKey();
          reply({
            today,
            subjects: (d.settings.subjects || []).map(s => ({ name: s.name, color: s.color })),
            tasks: d.tasks.filter(t => !t.cancelled).slice(-300).map(t => ({ id: t.id, title: t.title, date: t.date, time: t.time || null, subject: t.subject || null, done: t.done, type: t.type, importance: t.importance })),
            grades: d.grades.slice(-300).map(g => ({ subject: g.subject, value: g.value, scale: g.scale || 10, date: g.date, description: g.description })),
            studyMinutes: d.sessions.slice(-500).map(s => ({ subject: s.subject, minutes: s.duration, date: s.date.slice(0, 10) })),
          });
          break;
        }
        case 'write': {
          const { op, payload } = (m.payload || {}) as { op?: string; payload?: unknown };
          if (!cur.allowWrite || !cur.onUpdateData) { reply({ error: 'questa mini-app non ha il permesso di modificare i dati (Modifica: no)' }); break; }
          if (!op || !WRITE_TYPES.includes(op)) { reply({ error: 'operazione non permessa' }); break; }
          const now = Date.now();
          writes.current = writes.current.filter(t => now - t < 60_000);
          if (writes.current.length >= WRITES_PER_MINUTE) { reply({ error: 'troppe modifiche in poco tempo' }); break; }
          const id = createId();
          const res = applyWrite(cur.data, op, payload, id);
          if ('error' in res) { reply({ error: res.error }); break; }
          writes.current.push(now);
          cur.onUpdateData(prev => { const r = applyWrite(prev, op, payload, id); return 'error' in r ? prev : r.data; });
          reply({ result: res.result });
          break;
        }
        case 'open': if (typeof m.payload === 'string' && m.payload) cur.onNavigate?.(m.payload); break;
        case 'error': cur.onError?.(String(m.payload).slice(0, 200)); break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <iframe ref={frame} title="Mini-app" srcDoc={srcDoc} sandbox="allow-scripts" referrerPolicy="no-referrer"
      style={{ width: '100%', height, border: 0, display: 'block', background: 'transparent', colorScheme: theme === 'light' ? 'light' : 'dark' }} />
  );
}
