import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBackup, makeBackup, mergeBackup, validateBackup } from './backup';
import { storage } from './db';
import { WllamaEngine } from './inference';
import { renderMarkdown } from './markdown';
import { PROFILES, type Chat, type ChatMessage, type ModelFamily, type ModelInfo, type Preferences, type SessionBackupV1 } from './types';

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const newChat = (): Chat => ({ id: id(), title: 'New chat', createdAt: now(), updatedAt: now() });

function MessageView({ message }: { message: ChatMessage }) {
  const copyCode = (event: React.MouseEvent<HTMLDivElement>) => {
    const code = (event.target as HTMLElement).closest('pre')?.innerText;
    if (code) void navigator.clipboard.writeText(code);
  };
  return <article className={`message ${message.role}`}><span className="role">{message.role === 'assistant' ? 'Local model' : 'You'}</span><div className="markdown" onClick={copyCode} dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content || (message.incomplete ? '…' : '')) }} />{message.incomplete && <small>Generation stopped</small>}</article>;
}

export default function App() {
  const engine = useMemo(() => new WllamaEngine(), []);
  const [chats, setChats] = useState<Chat[]>([]); const [activeId, setActiveId] = useState<string | null>(null); const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState<ModelInfo | null>(null); const [family, setFamily] = useState<ModelFamily>('gemma4'); const [status, setStatus] = useState(engine.status());
  const [text, setText] = useState(''); const [error, setError] = useState(''); const [drawer, setDrawer] = useState(false); const [preferences, setPreferences] = useState<Preferences>({ theme: 'dark' });
  const importRef = useRef<HTMLInputElement>(null); const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void (async () => { const saved = (await storage.all<Chat>('chats')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); const prefs = (await storage.get<Preferences>('settings', 'preferences')) ?? { theme: 'dark' }; setPreferences(prefs); document.documentElement.dataset.theme = prefs.theme; if (saved.length) { setChats(saved); setActiveId(saved[0].id); } else { const chat = newChat(); await storage.put('chats', chat); setChats([chat]); setActiveId(chat.id); } })(); }, []);
  useEffect(() => { if (activeId) void storage.getMessages(activeId).then(setMessages); }, [activeId]);
  useEffect(() => { const timer = window.setInterval(() => setStatus({ ...engine.status() }), 250); return () => window.clearInterval(timer); }, [engine]);
  useEffect(() => () => { void engine.unload(); }, [engine]);

  const selectChat = (chatId: string) => { setActiveId(chatId); setDrawer(false); };
  const createChat = async () => { const chat = newChat(); await storage.put('chats', chat); setChats(x => [chat, ...x]); setActiveId(chat.id); setMessages([]); setDrawer(false); };
  const removeChat = async (chatId: string) => { if (!confirm('Delete this chat and all its messages?')) return; await storage.deleteChat(chatId); const remaining = chats.filter(c => c.id !== chatId); setChats(remaining); if (activeId === chatId) { if (remaining[0]) setActiveId(remaining[0].id); else await createChat(); } };
  const renameChat = async (chat: Chat) => { const title = prompt('Chat name', chat.title)?.trim(); if (!title) return; const changed = { ...chat, title, updatedAt: now() }; await storage.put('chats', changed); setChats(all => all.map(x => x.id === chat.id ? changed : x)); };
  const updateChat = async (chatId: string, title?: string) => { const chat = chats.find(c => c.id === chatId); if (!chat) return; const changed = { ...chat, updatedAt: now(), title: title ?? chat.title }; await storage.put('chats', changed); setChats(all => all.map(x => x.id === chatId ? changed : x).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); };
  const loadFile = async (file: File | undefined) => { if (!file) return; setError(''); try { setModel(await engine.load(file, family)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this model.'); } finally { if (fileRef.current) fileRef.current.value = ''; } };
  const send = async () => {
    const content = text.trim(); if (!content || !activeId || status.state === 'generating') return; setError(''); const user: ChatMessage = { id: id(), chatId: activeId, role: 'user', content, createdAt: now() }; const assistant: ChatMessage = { id: id(), chatId: activeId, role: 'assistant', content: '', createdAt: now(), incomplete: true };
    setText(''); await storage.put('messages', user); await storage.put('messages', assistant); const transcript = [...messages, user]; setMessages([...transcript, assistant]); await updateChat(activeId, messages.length ? undefined : content.slice(0, 48));
    try { await engine.generate(transcript, token => { if (!token) return; setMessages(current => { const updated = current.map(m => m.id === assistant.id ? { ...m, content: m.content + token } : m); const changed = updated.find(m => m.id === assistant.id)!; void storage.put('messages', changed); return updated; }); }); setMessages(current => { const updated = current.map(m => m.id === assistant.id ? { ...m, incomplete: false } : m); void storage.put('messages', updated.find(m => m.id === assistant.id)!); return updated; }); }
    catch (e) {
      if (e instanceof Error && e.name === 'AbortError' && !engine.wasStoppedByUser()) {
        console.error('Local inference was aborted unexpectedly.', e);
        setError('The local inference worker stopped unexpectedly. Reload the model and retry; if it repeats, use the red error text and browser details to diagnose the runtime.');
      } else setError(e instanceof Error && e.name === 'AbortError' ? '' : (e instanceof Error ? e.message : 'Generation failed.'));
    }
  };
  const importSession = async (file: File | undefined) => { if (!file) return; try { const incoming: unknown = JSON.parse(await file.text()); if (!validateBackup(incoming)) throw new Error('This is not a supported Local GGUF Chat backup.'); const merged = mergeBackup(await makeBackup(model), incoming); if (!confirm(`Import ${incoming.chats.length} chats? Existing chats will be kept.`)) return; await storage.replaceAll(merged.chats, merged.messages, merged.preferences); setChats(merged.chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); setPreferences(merged.preferences); setActiveId(merged.chats[0]?.id ?? null); } catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); } finally { if (importRef.current) importRef.current.value = ''; } };
  const setTheme = async () => { const next = { theme: preferences.theme === 'dark' ? 'light' : 'dark' } as Preferences; setPreferences(next); document.documentElement.dataset.theme = next.theme; await storage.put('settings', next, 'preferences'); };

  return <main><header><button className="mobile-only" onClick={() => setDrawer(true)} aria-label="Open chats">☰</button><div><strong>Local GGUF Chat</strong><p>{status.message}</p></div><div className="header-actions"><button onClick={setTheme} aria-label="Toggle colour theme">◐</button><button onClick={() => void downloadBackup(model)}>Export</button><button onClick={() => importRef.current?.click()}>Import</button><input ref={importRef} type="file" accept="application/json" hidden onChange={e => void importSession(e.target.files?.[0])} /></div></header>
    <aside className={drawer ? 'open' : ''}><div className="side-head"><button className="primary" onClick={() => void createChat()}>+ New chat</button><button className="mobile-only" onClick={() => setDrawer(false)}>×</button></div>{chats.map(chat => <div className={`chat-row ${chat.id === activeId ? 'active' : ''}`} key={chat.id}><button onClick={() => selectChat(chat.id)}>{chat.title}</button><span><button onClick={() => void renameChat(chat)}>✎</button><button onClick={() => void removeChat(chat.id)}>×</button></span></div>)}</aside>
    <section className="conversation"><div className="model-bar"><label>Model family <select value={family} disabled={!!model || status.state === 'loading'} onChange={e => setFamily(e.target.value as ModelFamily)}>{Object.values(PROFILES).map(p => <option value={p.id} key={p.id}>{p.label}</option>)}</select></label>{model ? <><span className="model-name">{model.fileName}</span><button onClick={() => void engine.unload().then(() => setModel(null))}>Unload</button></> : <><button className="primary" onClick={() => fileRef.current?.click()} disabled={status.state === 'loading'}>Choose GGUF</button><input ref={fileRef} type="file" accept=".gguf,application/octet-stream" hidden onChange={e => void loadFile(e.target.files?.[0])} /></>}<small>{status.supportsWebGpu ? 'WebGPU available' : 'CPU/WASM mode'} · {status.crossOriginIsolated ? 'multi-thread capable' : 'single-thread until COOP/COEP headers are set'}</small></div>
      {error && <div role="alert" className="error">{error}</div>}<div className="privacy">Your model and chats stay on this device. The model file is used only for this open session.</div><div className="messages">{messages.length ? messages.map(m => <MessageView key={m.id} message={m} />) : <div className="empty"><h1>Start privately.</h1><p>Select a local GGUF model, then send a message. Chats are saved locally and can be exported as JSON.</p></div>}</div>
      <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}><textarea value={text} onChange={e => setText(e.target.value)} placeholder={model ? 'Message your local model…' : 'Load a GGUF model to chat…'} disabled={!model || status.state === 'loading'} rows={3} /><div><small>4K context · 512 max output</small>{status.state === 'generating' ? <button type="button" onClick={() => engine.abort()}>Stop</button> : <button className="primary" disabled={!model || !text.trim()} type="submit">Send</button>}</div></form>
    </section></main>;
}
