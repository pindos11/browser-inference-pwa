import { describe, expect, it } from 'vitest';
import { mergeBackup, validateBackup } from './backup';
import type { SessionBackupV1 } from './types';

const backup = (id: string): SessionBackupV1 => ({ version: 1, exportedAt: '2026-01-01T00:00:00Z', chats: [{ id, title: id, createdAt: '', updatedAt: '' }], messages: [], preferences: { theme: 'dark' }, model: null });
describe('session backups', () => { it('validates expected JSON shape', () => { expect(validateBackup(backup('a'))).toBe(true); expect(validateBackup({ version: 1 })).toBe(false); }); it('merges without duplicating ids', () => { expect(mergeBackup(backup('a'), backup('a')).chats).toHaveLength(1); expect(mergeBackup(backup('a'), backup('b')).chats).toHaveLength(2); }); });
