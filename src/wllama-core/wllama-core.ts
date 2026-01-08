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
import { cacheManager, DownloadOptions } from './cache-manager';

export class WllamaCore {
  private wllama: Wllama;
  private paths: {
    'single-thread/wllama.wasm': string;
    'multi-thread/wllama.wasm'?: string;
  };
  private logger: WllamaCoreOptions['logger'];
  private instanceId: string;
  private isModelLoaded: boolean = false;
  private isGenerating: boolean = false;
  private stopSignal: boolean = false;
  private modelMetadata: ModelMetadata | null = null;
  private runtimeInfo: RuntimeInfo | null = null;
  private inferenceParams: InferenceParams;
  private eventListeners: Map<WllamaCoreEvent, Set<EventListener>> = new Map();

  constructor(options: WllamaCoreOptions, instanceId?: string) {
    const { paths, logger } = options;
    this.paths = paths;
    this.logger = logger || DebugLogger;
    this.instanceId = instanceId || `wllama-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Ensure logger has all required methods
    const wllamaLogger = {
      debug: logger?.debug || DebugLogger.debug,
      log: logger?.log || DebugLogger.log,
      warn: logger?.warn || DebugLogger.warn,
      error: logger?.error || DebugLogger.error,
    };
    this.wllama = new Wllama(paths, { logger: wllamaLogger });
    
    // Load inference params from storage or use defaults
    // 每个实例使用独立的存储键
    const storageKey = `params-${this.instanceId}`;
    this.inferenceParams = WllamaStorage.load(storageKey, {
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
      // 事件数据已经包含 instanceId，直接传递
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

    this.emit(WllamaCoreEvent.MODEL_LOADING, { instanceId: this.instanceId });
    
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
        instanceId: this.instanceId,
      });
    } catch (error) {
      this.resetInstance();
      const errorMsg = (error as Error)?.message ?? 'Unknown error';
      this.emit(WllamaCoreEvent.ERROR, { data: errorMsg, instanceId: this.instanceId });
      throw new Error(errorMsg);
    }
  }

  /**
   * Load model from remote URL with caching support
   */
  async loadModelFromUrl(
    url: string,
    options?: LoadModelOptions & { 
      useCache?: boolean;
      downloadOptions?: DownloadOptions;
    }
  ): Promise<void> {
    if (this.isModelLoaded || this.isGenerating) {
      throw new Error('Another model is already loaded or generation is in progress');
    }

    if (!url) {
      throw new Error('URL is required');
    }

    this.emit(WllamaCoreEvent.MODEL_LOADING, { instanceId: this.instanceId });

    const useCache = options?.useCache !== false; // Default to true

    try {
      let file: File;

      // Check cache first if enabled
      if (useCache) {
        const cachedFile = await cacheManager.open(url);
        if (cachedFile) {
          this.logger?.log('Loading model from cache:', url);
          file = cachedFile;
        } else {
          // Download and cache
          this.logger?.log('Downloading and caching model:', url);
          await cacheManager.download(url, options?.downloadOptions);
          const downloadedFile = await cacheManager.open(url);
          if (!downloadedFile) {
            throw new Error('Failed to open cached file after download');
          }
          file = downloadedFile;
        }
      } else {
        // Direct download without caching
        const response = await fetch(url, {
          headers: options?.downloadOptions?.headers,
          signal: options?.downloadOptions?.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch model: ${response.statusText}`);
        }
        const blob = await response.blob();
        const fileName = url.split('/').pop() || 'model.gguf';
        file = new File([blob], fileName, { type: 'application/octet-stream' });
      }

      await this.loadModelFromFiles([file], options);
    } catch (error) {
      this.resetInstance();
      const errorMsg = (error as Error)?.message ?? 'Unknown error';
      this.emit(WllamaCoreEvent.ERROR, { data: errorMsg, instanceId: this.instanceId });
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
      this.emit(WllamaCoreEvent.MODEL_UNLOADED, { instanceId: this.instanceId });
    } catch (error) {
      const errorMsg = (error as Error)?.message ?? 'Unknown error';
      this.emit(WllamaCoreEvent.ERROR, { data: errorMsg, instanceId: this.instanceId });
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
    this.emit(WllamaCoreEvent.GENERATION_START, { instanceId: this.instanceId });

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
          this.emit(WllamaCoreEvent.GENERATION_UPDATE, { data: currentText, instanceId: this.instanceId });
          if (this.stopSignal) {
            opts.abortSignal();
          }
        },
      };

      const result = await this.wllama.createCompletion(input, completionOptions);
      this.emit(WllamaCoreEvent.GENERATION_END, { data: result, instanceId: this.instanceId });
      return result;
    } catch (error) {
      const errorMsg = (error as Error)?.message ?? 'Unknown error';
      this.emit(WllamaCoreEvent.ERROR, { data: errorMsg, instanceId: this.instanceId });
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
    // 每个实例使用独立的存储键
    const storageKey = `params-${this.instanceId}`;
    WllamaStorage.save(storageKey, this.inferenceParams);
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
   * Get instance ID
   */
  getInstanceId(): string {
    return this.instanceId;
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

