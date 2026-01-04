import { Wllama } from '@wllama/wllama/esm';
import {
  Message,
  InferenceParams,
  RuntimeInfo,
  ModelMetadata,
  WllamaCoreOptions,
  LoadModelOptions,
  CompletionOptions,
  WllamaCoreEvent,
  EventListener,
} from './types';
import { formatChat, DebugLogger } from './utils';
import { WllamaStorage } from './storage';

export class WllamaCore {
  private wllama: Wllama;
  private paths: {
    'single-thread/wllama.wasm': string;
    'multi-thread/wllama.wasm'?: string;
  };
  private logger: WllamaCoreOptions['logger'];
  private isModelLoaded: boolean = false;
  private isGenerating: boolean = false;
  private stopSignal: boolean = false;
  private modelMetadata: ModelMetadata | null = null;
  private runtimeInfo: RuntimeInfo | null = null;
  private inferenceParams: InferenceParams;
  private eventListeners: Map<WllamaCoreEvent, Set<EventListener>> = new Map();

  constructor(options: WllamaCoreOptions) {
    const { paths, logger } = options;
    this.paths = paths;
    this.logger = logger || DebugLogger;
    // Ensure logger has all required methods
    const wllamaLogger = {
      debug: logger?.debug || DebugLogger.debug,
      log: logger?.log || DebugLogger.log,
      warn: logger?.warn || DebugLogger.warn,
      error: logger?.error || DebugLogger.error,
    };
    this.wllama = new Wllama(paths, { logger: wllamaLogger });
    
    // Load inference params from storage or use defaults
    this.inferenceParams = WllamaStorage.load('params', {
      nThreads: -1,
      nContext: 4096,
      nBatch: 128,
      temperature: 0.2,
      nPredict: 4096,
    });
  }

  /**
   * Event listener management
   */
  on(event: WllamaCoreEvent, listener: EventListener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  off(event: WllamaCoreEvent, listener: EventListener) {
    this.eventListeners.get(event)?.delete(listener);
  }

  private emit(event: WllamaCoreEvent, data?: unknown) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => listener(data));
    }
  }

  /**
   * Load model from files
   */
  async loadModelFromFiles(
    files: File[],
    options?: LoadModelOptions
  ): Promise<void> {
    if (this.isModelLoaded || this.isGenerating) {
      throw new Error('Another model is already loaded or generation is in progress');
    }

    if (!files || files.length === 0) {
      throw new Error('No files provided');
    }

    this.emit(WllamaCoreEvent.MODEL_LOADING);
    
    try {
      const loadOptions = {
        n_ctx: options?.n_ctx ?? this.inferenceParams.nContext,
        n_batch: options?.n_batch ?? this.inferenceParams.nBatch,
        n_threads: options?.n_threads ?? (this.inferenceParams.nThreads > 0 ? this.inferenceParams.nThreads : undefined),
      };

      await this.wllama.loadModel(files, loadOptions);

      if (!this.wllama.isModelLoaded()) {
        throw new Error('Model loading completed but model is not actually loaded');
      }

      // Get model metadata
      const metadata = this.wllama.getModelMetadata();
      this.modelMetadata = {
        name: metadata.meta['general.name'] || 
              metadata.meta['llama.context_length'] || 
              files[0].name.replace('.gguf', ''),
        ...metadata.meta,
      };

      // Get runtime info
      this.runtimeInfo = {
        isMultithread: this.wllama.isMultithread(),
        hasChatTemplate: !!this.wllama.getChatTemplate(),
      };

      this.isModelLoaded = true;
      this.emit(WllamaCoreEvent.MODEL_LOADED, {
        metadata: this.modelMetadata,
        runtimeInfo: this.runtimeInfo,
      });
    } catch (error) {
      this.resetInstance();
      const errorMsg = (error as Error)?.message ?? 'Unknown error';
      this.emit(WllamaCoreEvent.ERROR, errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Unload current model
   */
  async unloadModel(): Promise<void> {
    if (!this.isModelLoaded) {
      return;
    }

    try {
      await this.wllama.exit();
      this.resetInstance();
      this.isModelLoaded = false;
      this.modelMetadata = null;
      this.runtimeInfo = null;
      this.emit(WllamaCoreEvent.MODEL_UNLOADED);
    } catch (error) {
      const errorMsg = (error as Error)?.message ?? 'Unknown error';
      this.emit(WllamaCoreEvent.ERROR, errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Create completion from formatted input
   */
  async createCompletion(
    input: string,
    options?: CompletionOptions
  ): Promise<string> {
    if (!this.isModelLoaded) {
      throw new Error('Model is not loaded. Please load a model first.');
    }

    if (this.isGenerating) {
      throw new Error('Generation is already in progress');
    }

    this.isGenerating = true;
    this.stopSignal = false;
    this.emit(WllamaCoreEvent.GENERATION_START);

    try {
      const completionOptions = {
        nPredict: options?.nPredict ?? this.inferenceParams.nPredict,
        useCache: options?.useCache ?? true,
        sampling: {
          temp: options?.sampling?.temp ?? this.inferenceParams.temperature,
          top_k: options?.sampling?.top_k,
          top_p: options?.sampling?.top_p,
        },
        onNewToken: (token: number, piece: Uint8Array, currentText: string, opts: { abortSignal: () => void }) => {
          if (options?.onNewToken) {
            options.onNewToken(token, piece, currentText, opts);
          }
          this.emit(WllamaCoreEvent.GENERATION_UPDATE, currentText);
          if (this.stopSignal) {
            opts.abortSignal();
          }
        },
      };

      const result = await this.wllama.createCompletion(input, completionOptions);
      this.emit(WllamaCoreEvent.GENERATION_END, result);
      return result;
    } catch (error) {
      const errorMsg = (error as Error)?.message ?? 'Unknown error';
      this.emit(WllamaCoreEvent.ERROR, errorMsg);
      throw new Error(errorMsg);
    } finally {
      this.isGenerating = false;
      this.stopSignal = false;
    }
  }

  /**
   * Create chat completion from messages
   */
  async createChatCompletion(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<string> {
    if (!this.isModelLoaded) {
      throw new Error('Model is not loaded. Please load a model first.');
    }

    const formatted = await formatChat(this.wllama, messages);
    return this.createCompletion(formatted, options);
  }

  /**
   * Stop current generation
   */
  stopGeneration(): void {
    this.stopSignal = true;
  }

  /**
   * Get inference parameters
   */
  getInferenceParams(): InferenceParams {
    return { ...this.inferenceParams };
  }

  /**
   * Set inference parameters
   */
  setInferenceParams(params: Partial<InferenceParams>): void {
    this.inferenceParams = { ...this.inferenceParams, ...params };
    WllamaStorage.save('params', this.inferenceParams);
  }

  /**
   * Get model metadata
   */
  getModelMetadata(): ModelMetadata | null {
    return this.modelMetadata;
  }

  /**
   * Get runtime info
   */
  getRuntimeInfo(): RuntimeInfo | null {
    return this.runtimeInfo;
  }

  /**
   * Get Wllama instance (for advanced usage)
   */
  getWllamaInstance(): Wllama {
    return this.wllama;
  }

  /**
   * Check if model is loaded
   */
  getModelLoaded(): boolean {
    return this.isModelLoaded;
  }

  /**
   * Check if generation is in progress
   */
  getGenerating(): boolean {
    return this.isGenerating;
  }

  /**
   * Reset Wllama instance
   */
  private resetInstance(): void {
    // Ensure logger has all required methods
    const wllamaLogger = {
      debug: this.logger?.debug || DebugLogger.debug,
      log: this.logger?.log || DebugLogger.log,
      warn: this.logger?.warn || DebugLogger.warn,
      error: this.logger?.error || DebugLogger.error,
    };
    this.wllama = new Wllama(this.paths, { logger: wllamaLogger });
  }
}

