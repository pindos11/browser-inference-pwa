import { Wllama } from '@wllama/wllama';
import wasmUrl from '@wllama/wllama/esm/wasm/wllama.wasm?url';
import compatWasmUrl from '@wllama/wllama-compat/wasm/wllama.wasm?url';
import compatWorkerCode from '@wllama/wllama-compat/wasm/wllama.js?raw';
import { DEFAULT_CONTEXT, DEFAULT_MAX_TOKENS, PROFILES, type ChatMessage, type ModelFamily, type ModelInfo } from './types';

export interface RuntimeStatus { state: 'idle' | 'loading' | 'ready' | 'generating' | 'error'; message: string; supportsWebGpu: boolean; crossOriginIsolated: boolean; }
export interface InferenceEngine { load(file: File, profile: ModelFamily): Promise<ModelInfo>; generate(messages: ChatMessage[], onToken: (text: string) => void): Promise<void>; abort(): void; unload(): Promise<void>; status(): RuntimeStatus; }

export class WllamaEngine implements InferenceEngine {
  private instance: Wllama | null = null;
  private controller: AbortController | null = null;
  private stoppedByUser = false;
  private current: RuntimeStatus = { state: 'idle', message: 'Choose a local GGUF model to begin.', supportsWebGpu: 'gpu' in navigator, crossOriginIsolated };
  status = () => this.current;
  async load(file: File, profile: ModelFamily): Promise<ModelInfo> {
    if (!file.name.toLowerCase().endsWith('.gguf')) throw new Error('Choose a .gguf model file. Model files are never saved by this app.');
    await this.unload(); this.current = { ...this.current, state: 'loading', message: `Loading ${file.name}…` };
    const gpuRequested = 'gpu' in navigator;
    let runtime: Wllama | null = null;
    let backend: ModelInfo['backend'] = 'wasm';
    let gpuLayers = 0;
    let totalLayers = 0;
    try {
      const start = async (useGpu: boolean): Promise<Wllama> => {
        const logger = {
          debug: (...args: unknown[]) => {
            const line = args.map(String).join(' ');
            // llama.cpp reports this after model loading, e.g. "offloaded 24/24 layers to GPU".
            const match = /offloaded\s+(\d+)\s*\/\s*(\d+)\s+layers\s+to\s+GPU/i.exec(line);
            if (match) { gpuLayers = Number(match[1]); totalLayers = Number(match[2]); }
          },
          log: (...args: unknown[]) => console.log(...args),
          warn: (...args: unknown[]) => console.warn(...args),
          error: (...args: unknown[]) => console.error(...args)
        };
        const next = new Wllama({ default: wasmUrl }, { logger });
        // The compatibility build is bundled into this app rather than fetched
        // from wllama's default CDN. Its default "safari" mode intentionally
        // leaves Firefox on the native path: Firefox WebGPU compat is very slow.
        next.setCompat({ wasm: compatWasmUrl, worker: { code: compatWorkerCode } });
        await next.loadModel([file], {
          n_ctx: DEFAULT_CONTEXT,
          n_gpu_layers: useGpu ? 999 : 0,
          n_threads: crossOriginIsolated ? undefined : 1,
          // Avoid the harmless-but-noisy CPU warning and make the fallback explicit.
          flash_attn: false,
          // Qwen's compact models are more useful in a 512-token chat response
          // with the optional reasoning channel disabled.
          reasoning: profile === 'qwen35' ? false : undefined
        });
        backend = useGpu ? 'webgpu' : 'wasm';
        return next;
      };
      if (gpuRequested) {
        try { runtime = await start(true); }
        catch { await runtime?.exit().catch(() => undefined); runtime = await start(false); }
      } else runtime = await start(false);
      if (!runtime) throw new Error('Could not start the local inference runtime.');
      const meta = runtime.getModelMetadata(); const text = JSON.stringify(meta.meta).toLowerCase();
      if (!PROFILES[profile].metadataHints.some(hint => text.includes(hint))) throw new Error(`This GGUF does not identify as ${PROFILES[profile].label}. Select the matching family or choose a compatible model.`);
      this.instance = runtime;
      const reportedBackend: ModelInfo['backend'] = gpuLayers > 0 ? 'webgpu' : backend;
      const info: ModelInfo = { family: profile, fileName: file.name, loadedAt: new Date().toISOString(), backend: reportedBackend, threads: runtime.getNumThreads(), gpuLayers, totalLayers };
      const offload = totalLayers ? ` ${gpuLayers}/${totalLayers} layers offloaded.` : gpuRequested ? ' GPU offload requested; layer count unavailable.' : '';
      this.current = { ...this.current, state: 'ready', message: `${PROFILES[profile].label} ready (${info.threads} thread${info.threads === 1 ? '' : 's'}).${offload}` }; return info;
    } catch (error) { await runtime?.exit().catch(() => undefined); this.current = { ...this.current, state: 'error', message: error instanceof Error ? error.message : 'Model failed to load.' }; throw error; }
  }
  async generate(messages: ChatMessage[], onToken: (text: string) => void) {
    if (!this.instance) throw new Error('Load a model before sending a message.');
    this.stoppedByUser = false; this.controller = new AbortController(); this.current = { ...this.current, state: 'generating', message: 'Generating…' };
    try {
      await this.instance.createChatCompletion({ model: 'local', messages: messages.filter(m => !m.incomplete).map(m => ({ role: m.role, content: m.content })), max_tokens: DEFAULT_MAX_TOKENS, temperature: 0.7, stream: true, abortSignal: this.controller.signal, onData: chunk => onToken(chunk.choices[0]?.delta.content ?? '') });
      this.current = { ...this.current, state: 'ready', message: 'Ready.' };
    } finally { this.controller = null; }
  }
  abort() { this.stoppedByUser = true; this.controller?.abort(); }
  wasStoppedByUser() { return this.stoppedByUser; }
  async unload() { this.controller?.abort(); if (this.instance) await this.instance.exit(); this.instance = null; if (this.current.state !== 'loading') this.current = { ...this.current, state: 'idle', message: 'Model unloaded. Chats remain saved on this device.' }; }
}
