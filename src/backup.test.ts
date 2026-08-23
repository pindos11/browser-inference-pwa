import { describe, expect, it } from 'vitest';
import { mergeBackup, validateBackup } from './backup';
import { compareMessages } from './db';
import type { SessionBackupV1 } from './types';

const backup = (id: string): SessionBackupV1 => ({ version: 1, exportedAt: '2026-01-01T00:00:00Z', chats: [{ id, title: id, createdAt: '', updatedAt: '' }], messages: [], preferences: { theme: 'dark' }, model: null });
describe('session backups', () => { it('validates expected JSON shape', () => { expect(validateBackup(backup('a'))).toBe(true); expect(validateBackup({ version: 1 })).toBe(false); }); it('merges without duplicating ids', () => { expect(mergeBackup(backup('a'), backup('a')).chats).toHaveLength(1); expect(mergeBackup(backup('a'), backup('b')).chats).toHaveLength(2); }); });
describe('message ordering', () => { it('keeps same-timestamp prompts before replies', () => { const time = '2026-01-01T00:00:00.000Z'; const assistant = { id: 'a', chatId: 'c', role: 'assistant' as const, content: '', createdAt: time }; const user = { id: 'u', chatId: 'c', role: 'user' as const, content: '', createdAt: time }; expect([assistant, user].sort(compareMessages).map(x => x.role)).toEqual(['user', 'assistant']); }); });
