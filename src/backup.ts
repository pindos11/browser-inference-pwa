import { storage } from './db';
import type { Chat, ChatMessage, Preferences, SessionBackupV1 } from './types';

const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
export function validateBackup(value: unknown): value is SessionBackupV1 {
  return isRecord(value) && value.version === 1 && Array.isArray(value.chats) && Array.isArray(value.messages) && isRecord(value.preferences)
    && value.chats.every(c => isRecord(c) && typeof c.id === 'string' && typeof c.title === 'string')
    && value.messages.every(m => isRecord(m) && typeof m.id === 'string' && typeof m.chatId === 'string' && typeof m.content === 'string');
}
export async function makeBackup(model: SessionBackupV1['model']): Promise<SessionBackupV1> {
  return { version: 1, exportedAt: new Date().toISOString(), chats: await storage.all<Chat>('chats'), messages: await storage.all<ChatMessage>('messages'), preferences: (await storage.get<Preferences>('settings', 'preferences')) ?? { theme: 'dark' }, model };
}
export function mergeBackup(existing: SessionBackupV1, incoming: SessionBackupV1): SessionBackupV1 {
  const chats = new Map(existing.chats.map(x => [x.id, x])); incoming.chats.forEach(x => { if (!chats.has(x.id)) chats.set(x.id, x); });
  const messages = new Map(existing.messages.map(x => [x.id, x])); incoming.messages.forEach(x => { if (!messages.has(x.id)) messages.set(x.id, x); });
  return { ...existing, chats: [...chats.values()], messages: [...messages.values()] };
}
export async function downloadBackup(model: SessionBackupV1['model']) {
  const blob = new Blob([JSON.stringify(await makeBackup(model), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `local-gguf-session-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
}
