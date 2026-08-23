export type ModelFamily = 'gemma4' | 'qwen35';
export type MessageRole = 'system' | 'user' | 'assistant';

export interface ModelProfile { id: ModelFamily; label: string; metadataHints: string[]; }
export interface ModelInfo { family: ModelFamily; fileName: string; loadedAt: string; backend: 'webgpu' | 'wasm'; threads: number; gpuLayers?: number; totalLayers?: number; }
export interface ChatMessage { id: string; chatId: string; role: MessageRole; content: string; createdAt: string; incomplete?: boolean; }
export interface Chat { id: string; title: string; createdAt: string; updatedAt: string; }
export interface Preferences { theme: 'dark' | 'light'; }
export interface SessionBackupV1 { version: 1; exportedAt: string; chats: Chat[]; messages: ChatMessage[]; preferences: Preferences; model: ModelInfo | null; }

export const PROFILES: Record<ModelFamily, ModelProfile> = {
  gemma4: { id: 'gemma4', label: 'Gemma 4', metadataHints: ['gemma'] },
  qwen35: { id: 'qwen35', label: 'Qwen 3.5', metadataHints: ['qwen'] }
};

export const DEFAULT_CONTEXT = 4096;
export const DEFAULT_MAX_TOKENS = 512;
