export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface InferenceParams {
  nThreads: number;
  nContext: number;
  nBatch: number;
  temperature: number;
  nPredict: number;
}

export interface RuntimeInfo {
  isMultithread: boolean;
  hasChatTemplate: boolean;
}

export interface ModelMetadata {
  name: string;
  [key: string]: any;
}

export interface WllamaCoreOptions {
  paths: {
    'single-thread/wllama.wasm': string;
    'multi-thread/wllama.wasm'?: string;
  };
  logger?: {
    debug?: (...args: any[]) => void;
    log?: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
  };
}

export interface LoadModelOptions {
  n_ctx?: number;
  n_batch?: number;
  n_threads?: number;
}

export interface CompletionOptions {
  nPredict?: number;
  useCache?: boolean;
  sampling?: {
    temp?: number;
    top_k?: number;
    top_p?: number;
  };
  onNewToken?: (token: number, piece: Uint8Array, currentText: string, opts: { abortSignal: () => void }) => void;
}

export type EventListener<T = unknown> = (data: T) => void;

export enum WllamaCoreEvent {
  MODEL_LOADING = 'model_loading',
  MODEL_LOADED = 'model_loaded',
  MODEL_UNLOADED = 'model_unloaded',
  GENERATION_START = 'generation_start',
  GENERATION_UPDATE = 'generation_update',
  GENERATION_END = 'generation_end',
  ERROR = 'error',
}

