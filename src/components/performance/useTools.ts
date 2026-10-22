import { useCallback, useEffect, useRef, useState } from 'react';
import { Tool, ToolItem, ToolSpec, createTool, deleteItem, deleteTool, loadTools, saveItem, updateTool } from '../../lib/tools';

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
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
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

  const removeItem = useCallback(async (id: string) => {
    const before = items;
    setItems(is => is.filter(x => x.id !== id));
    try { await deleteItem(id); } catch (err) { setItems(before); throw err; }
  }, [items]);

  return { ready, tools, items, error, reload, addTool, editTool, removeTool, putItem, removeItem };
}

export type ToolsApi = ReturnType<typeof useTools>;
