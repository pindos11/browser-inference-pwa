import type { Chat, ChatMessage, Preferences } from './types';

const DB_NAME = 'local-gguf-chat';
const DB_VERSION = 1;
type Store = 'chats' | 'messages' | 'settings';

// Older records can have an identical timestamp for a user prompt and its
// assistant placeholder. IndexedDB orders those by random UUID key, so retain
// the natural prompt-before-reply order for that tie.
export function compareMessages(a: ChatMessage, b: ChatMessage) {
  const byTime = a.createdAt.localeCompare(b.createdAt);
  if (byTime) return byTime;
  const roleOrder = { system: 0, user: 1, assistant: 2 } as const;
  return roleOrder[a.role] - roleOrder[b.role] || a.id.localeCompare(b.id);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('chats')) db.createObjectStore('chats', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('messages')) {
        const messages = db.createObjectStore('messages', { keyPath: 'id' });
        messages.createIndex('chatId', 'chatId');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function request<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export const storage = {
  all: <T>(store: Store) => request<T[]>(store, 'readonly', s => s.getAll()),
  put: <T>(store: Store, value: T, key?: IDBValidKey) => request<IDBValidKey>(store, 'readwrite', s => key === undefined ? s.put(value) : s.put(value, key)),
  delete: (store: Store, key: IDBValidKey) => request<undefined>(store, 'readwrite', s => s.delete(key)),
  get: <T>(store: Store, key: IDBValidKey) => request<T | undefined>(store, 'readonly', s => s.get(key)),
  async getMessages(chatId: string) {
    const db = await openDb();
    return new Promise<ChatMessage[]>((resolve, reject) => {
      const tx = db.transaction('messages', 'readonly');
      const index = tx.objectStore('messages').index('chatId');
      const req = index.getAll(chatId);
      req.onsuccess = () => resolve((req.result as ChatMessage[]).sort(compareMessages));
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  },
  async deleteChat(chatId: string) {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['chats', 'messages'], 'readwrite');
      tx.objectStore('chats').delete(chatId);
      const index = tx.objectStore('messages').index('chatId');
      index.openKeyCursor(IDBKeyRange.only(chatId)).onsuccess = e => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) { tx.objectStore('messages').delete(cursor.primaryKey); cursor.continue(); }
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  },
  async replaceAll(chats: Chat[], messages: ChatMessage[], preferences: Preferences) {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['chats', 'messages', 'settings'], 'readwrite');
      for (const store of ['chats', 'messages', 'settings'] as Store[]) tx.objectStore(store).clear();
      chats.forEach(x => tx.objectStore('chats').put(x)); messages.forEach(x => tx.objectStore('messages').put(x));
      tx.objectStore('settings').put(preferences, 'preferences');
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    });
  }
};
