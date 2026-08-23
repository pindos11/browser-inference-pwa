import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT, DEFAULT_MAX_TOKENS, PROFILES } from './types';
describe('model profiles', () => { it('exposes the two supported profiles and fixed limits', () => { expect(Object.keys(PROFILES)).toEqual(['gemma4', 'qwen35']); expect(DEFAULT_CONTEXT).toBe(4096); expect(DEFAULT_MAX_TOKENS).toBe(512); }); });
