import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Search, FolderOpen, FileText, ExternalLink, ChevronRight, ChevronDown } from 'lucide-react';
import { ArchiveItem, createId } from '../lib/store';

interface ArchivioProps {
  archive: ArchiveItem[];
  darkMode: boolean;
  onUpdate: (archive: ArchiveItem[]) => void;
}

export default function Archivio({ archive, darkMode, onUpdate }: ArchivioProps) {
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !topic.trim() || !name.trim()) return;
    onUpdate([...archive, { id: createId(), subject: subject.trim(), topic: topic.trim(), name: name.trim(), link: link.trim() || undefined }]);
    setSubject(''); setTopic(''); setName(''); setLink(''); setShowForm(false);
  };

  const hierarchy = useMemo(() => {
    const filtered = search ? archive.filter(a => a.subject.toLowerCase().includes(search.toLowerCase()) || a.topic.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase())) : archive;
    const map: Record<string, Record<string, ArchiveItem[]>> = {};
    filtered.forEach(item => {
      if (!map[item.subject]) map[item.subject] = {};
      if (!map[item.subject][item.topic]) map[item.subject][item.topic] = [];
      map[item.subject][item.topic].push(item);
    });
    return map;
  }, [archive, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={`text-2xl font-bold ${textColor}`}>📁 Archivio</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Nuovo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className={`${cardClass} p-6 space-y-4`}>
          <h3 className={`font-semibold ${textColor}`}>Nuovo Documento</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={subject} onChange={e => setSubject(e.target.value)} className={darkMode ? 'input-glass' : 'input-light'} placeholder="Materia" required />
            <input value={topic} onChange={e => setTopic(e.target.value)} className={darkMode ? 'input-glass' : 'input-light'} placeholder="Argomento" required />
            <input value={name} onChange={e => setName(e.target.value)} className={darkMode ? 'input-glass' : 'input-light'} placeholder="Nome documento" required />
            <input value={link} onChange={e => setLink(e.target.value)} className={darkMode ? 'input-glass' : 'input-light'} placeholder="Link (opzionale)" />
          </div>
          <button type="submit" className="btn-primary text-sm">Aggiungi</button>
        </form>
      )}

      <div className={`${cardClass} p-4`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subTextColor}`} />
          <input value={search} onChange={e => setSearch(e.target.value)} className={`${darkMode ? 'input-glass' : 'input-light'} w-full pl-10`} placeholder="Cerca..." />
        </div>
      </div>

      <div className="space-y-3">
        {Object.keys(hierarchy).length === 0 && <div className={`${cardClass} p-8 text-center`}><p className={subTextColor}>Archivio vuoto</p></div>}
        {Object.entries(hierarchy).map(([subjectName, topics]) => (
          <div key={subjectName} className={`${cardClass} overflow-hidden`}>
            <button onClick={() => { const next = new Set(expandedSubjects); if (next.has(subjectName)) next.delete(subjectName); else next.add(subjectName); setExpandedSubjects(next); }}
              className={`w-full flex items-center gap-3 p-4 ${darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
              {expandedSubjects.has(subjectName) ? <ChevronDown className="w-5 h-5 text-indigo-400" /> : <ChevronRight className="w-5 h-5 text-indigo-400" />}
              <FolderOpen className="w-5 h-5 text-amber-400" />
              <span className={`font-semibold ${textColor}`}>{subjectName}</span>
            </button>
            {expandedSubjects.has(subjectName) && (
              <div className="border-t border-white/5">
                {Object.entries(topics).map(([topicName, items]) => {
                  const topicKey = `${subjectName}::${topicName}`;
                  return (
                    <div key={topicKey}>
                      <button onClick={() => { const next = new Set(expandedTopics); if (next.has(topicKey)) next.delete(topicKey); else next.add(topicKey); setExpandedTopics(next); }}
                        className={`w-full flex items-center gap-3 px-8 py-3 ${darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
                        {expandedTopics.has(topicKey) ? <ChevronDown className="w-4 h-4 text-purple-400" /> : <ChevronRight className="w-4 h-4 text-purple-400" />}
                        <span className={`text-sm font-medium ${textColor}`}>{topicName}</span>
                      </button>
                      {expandedTopics.has(topicKey) && (
                        <div className="px-12 pb-2 space-y-1">
                          {items.map(item => (
                            <div key={item.id} className={`flex items-center gap-3 p-2 rounded-lg ${darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
                              <FileText className="w-4 h-4 text-emerald-400" />
                              <span className={`text-sm ${textColor} flex-1`}>{item.name}</span>
                              {item.link && <a href={item.link} target="_blank" className="text-indigo-400"><ExternalLink className="w-3.5 h-3.5" /></a>}
                              <button onClick={() => onUpdate(archive.filter(a => a.id !== item.id))} className="text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
