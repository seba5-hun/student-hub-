import { useCallback, useEffect, useRef, useState } from 'react';
import { Tool, ToolItem, ToolSpec, createTool, deleteItem, deleteTool, loadTools, saveItem, saveItems, updateTool } from '../../lib/tools';

// Sent when tools of a project were changed elsewhere (e.g. prepared in the background).
export const TOOLS_CHANGED = 'mynd-tools-changed';

// The tools of the open project and their items, kept up to date (the others' changes every 30 s).
export function useTools(projectId: string | null, active = true) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const [ready, setReady] = useState<boolean | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [items, setItems] = useState<ToolItem[]>([]);
  const [error, setError] = useState('');
  const toolsRef = useRef(tools);
  toolsRef.current = tools;

  const reload = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await loadTools(projectId);
      setReady(r.ready); setTools(r.tools); setItems(r.items); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }, [projectId]);

  useEffect(() => { setReady(null); setTools([]); setItems([]); reload(); }, [reload]);
  useEffect(() => {
    if (!projectId) return;
    const id = window.setInterval(() => { if (document.visibilityState === 'visible' && activeRef.current) reload(); }, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    const onChanged = (e: Event) => { if ((e as CustomEvent<string>).detail === projectId) reload(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(TOOLS_CHANGED, onChanged);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener(TOOLS_CHANGED, onChanged); };
  }, [projectId, reload]);

  const addTool = useCallback(async (spec: ToolSpec, forProject?: string) => {
    const pid = forProject || projectId;
    if (!pid) throw new Error('Nessun progetto aperto.');
    const t = await createTool(pid, spec, Math.max(-1, ...toolsRef.current.map(x => x.position)) + 1);
    if (pid === projectId) setTools(ts => [...ts, t]);
    return t;
  }, [projectId]);

  const editTool = useCallback(async (id: string, patch: Partial<Pick<Tool, 'name' | 'icon' | 'description' | 'config'>>) => {
    const t = await updateTool(id, patch);
    setTools(ts => ts.map(x => (x.id === id ? t : x)));
    return t;
  }, []);

  const removeTool = useCallback(async (id: string) => {
    await deleteTool(id);
    setTools(ts => ts.filter(x => x.id !== id));
    setItems(is => is.filter(x => x.tool_id !== id));
  }, []);

  const putItem = useCallback(async (tool: Tool, data: Record<string, unknown>, id?: string) => {
    if (id) setItems(is => is.map(x => (x.id === id ? { ...x, data } : x)));
    try {
      const saved = await saveItem(tool, data, id, Date.now() / 1000);
      setItems(is => (id ? is.map(x => (x.id === id ? saved : x)) : [...is, saved]));
      return saved;
    } catch (err) { if (id) reload(); throw err; }
  }, [reload]);

  // Many items at once: they appear immediately and are saved with one request.
  const putItems = useCallback(async (tool: Tool, datas: Record<string, unknown>[]) => {
    if (!datas.length) return [];
    const stamp = Date.now();
    const temp: ToolItem[] = datas.map((data, i) => ({ id: `tmp-${stamp}-${i}`, tool_id: tool.id, project_id: tool.project_id, data, position: stamp / 1000 + i / 1000, created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
    if (tool.project_id === projectId) setItems(is => [...is, ...temp]);
    try {
      const saved = await saveItems(tool, datas, stamp / 1000);
      if (tool.project_id === projectId) setItems(is => [...is.filter(x => !temp.some(t => t.id === x.id)), ...saved]);
      return saved;
    } catch (err) {
      setItems(is => is.filter(x => !temp.some(t => t.id === x.id)));
      throw err;
    }
  }, [projectId]);

  const removeItem = useCallback(async (id: string) => {
    const before = items;
    setItems(is => is.filter(x => x.id !== id));
    try { await deleteItem(id); } catch (err) { setItems(before); throw err; }
  }, [items]);

  return { ready, tools, items, error, reload, addTool, editTool, removeTool, putItem, putItems, removeItem };
}

export type ToolsApi = ReturnType<typeof useTools>;
