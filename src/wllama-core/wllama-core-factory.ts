import { WllamaCore } from './wllama-core';
import { WllamaCoreOptions } from './types';
import { WLLAMA_CONFIG_PATHS } from './config';

/**
 * WllamaCore 工厂类，支持多实例管理
 * 参考 OnlyOffice Comp 的设计模式
 */
export class WllamaCoreFactory {
  private static instance: WllamaCoreFactory;
  private instances: Map<string, WllamaCore> = new Map();
  private defaultInstanceId: string = 'default';
  private instanceCounter: number = 0;

  private constructor() {}

  /**
   * 获取工厂单例
   */
  static getInstance(): WllamaCoreFactory {
    if (!WllamaCoreFactory.instance) {
      WllamaCoreFactory.instance = new WllamaCoreFactory();
    }
    return WllamaCoreFactory.instance;
  }

  /**
   * 生成唯一的实例 ID
   */
  private generateInstanceId(): string {
    return `wllama-${Date.now()}-${++this.instanceCounter}`;
  }

  /**
   * 创建新的 WllamaCore 实例
   * @param options WllamaCore 选项
   * @param instanceId 可选的实例 ID，如果不提供则自动生成
   * @returns WllamaCore 实例
   */
  create(
    options?: Partial<WllamaCoreOptions>,
    instanceId?: string
  ): WllamaCore {
    const id = instanceId || this.generateInstanceId();
    
    if (this.instances.has(id)) {
      throw new Error(`Instance with ID "${id}" already exists`);
    }

    const fullOptions: WllamaCoreOptions = {
      paths: options?.paths || WLLAMA_CONFIG_PATHS,
      logger: options?.logger,
    };

    const instance = new WllamaCore(fullOptions, id);
    this.instances.set(id, instance);
    
    return instance;
  }

  /**
   * 获取指定 ID 的实例
   * @param instanceId 实例 ID，默认为 'default'
   * @returns WllamaCore 实例，如果不存在则返回 null
   */
  get(instanceId: string = this.defaultInstanceId): WllamaCore | null {
    return this.instances.get(instanceId) || null;
  }

  /**
   * 获取或创建指定 ID 的实例（如果不存在则创建）
   * @param instanceId 实例 ID
   * @param options WllamaCore 选项
   * @returns WllamaCore 实例
   */
  getOrCreate(
    instanceId: string,
    options?: Partial<WllamaCoreOptions>
  ): WllamaCore {
    let instance = this.instances.get(instanceId);
    
    if (!instance) {
      instance = this.create(options, instanceId);
    }
    
    return instance;
  }

  /**
   * 获取或创建默认实例（向后兼容）
   * @param options 可选的 WllamaCore 选项
   * @returns WllamaCore 实例
   */
  getDefault(options?: Partial<WllamaCoreOptions>): WllamaCore {
    return this.getOrCreate(this.defaultInstanceId, options);
  }

  /**
   * 获取所有实例
   * @returns 所有 WllamaCore 实例的 Map
   */
  getAll(): Map<string, WllamaCore> {
    return new Map(this.instances);
  }

  /**
   * 检查指定 ID 的实例是否存在
   * @param instanceId 实例 ID
   * @returns 是否存在
   */
  exists(instanceId: string): boolean {
    return this.instances.has(instanceId);
  }

  /**
   * 销毁指定 ID 的实例
   * @param instanceId 实例 ID
   */
  async destroy(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      try {
        await instance.unloadModel();
      } catch (error) {
        // 忽略卸载错误，继续销毁
        console.warn(`Failed to unload model for instance ${instanceId}:`, error);
      }
      this.instances.delete(instanceId);
    }
  }

  /**
   * 销毁所有实例
   */
  async destroyAll(): Promise<void> {
    const destroyPromises = Array.from(this.instances.keys()).map(id =>
      this.destroy(id)
    );
    await Promise.all(destroyPromises);
  }

  /**
   * 获取实例数量
   */
  getInstanceCount(): number {
    return this.instances.size;
  }
}

// 导出单例实例
export const wllamaCoreFactory = WllamaCoreFactory.getInstance();
