/**
 * 使用示例：如何使用 WllamaCore（不依赖 React）
 * 
 * 这个文件展示了如何使用 WllamaCore 类来加载模型和生成文本
 */

import { WllamaCore, Message, WllamaCoreEvent, WLLAMA_CONFIG_PATHS, cacheManager, wllamaCoreFactory } from './index';

// 创建 WllamaCore 实例（使用默认配置）
const wllamaCore = new WllamaCore({
  paths: WLLAMA_CONFIG_PATHS,
});

// 监听事件
wllamaCore.on(WllamaCoreEvent.MODEL_LOADED, (data) => {
  console.log('模型已加载:', data);
});

wllamaCore.on(WllamaCoreEvent.GENERATION_UPDATE, (data) => {
  // 多实例模式下，data 包含 instanceId
  console.log('生成中:', data.data, '实例ID:', data.instanceId);
});

wllamaCore.on(WllamaCoreEvent.GENERATION_END, (data) => {
  // 多实例模式下，data 包含 instanceId
  console.log('生成完成:', data.data, '实例ID:', data.instanceId);
});

wllamaCore.on(WllamaCoreEvent.ERROR, (error) => {
  console.error('错误:', error);
});

// 示例：从文件加载模型
export async function loadModelFromFiles(files: File[]) {
  try {
    await wllamaCore.loadModelFromFiles(files, {
      n_ctx: 4096,
      n_batch: 128,
    });
    
    const metadata = wllamaCore.getModelMetadata();
    console.log('模型名称:', metadata?.name);
    
    const runtimeInfo = wllamaCore.getRuntimeInfo();
    console.log('运行时信息:', runtimeInfo);
  } catch (error) {
    console.error('加载模型失败:', error);
  }
}

// 示例：创建聊天完成
export async function createChatCompletion(messages: Message[]) {
  if (!wllamaCore.getModelLoaded()) {
    throw new Error('请先加载模型');
  }

  try {
    const result = await wllamaCore.createChatCompletion(messages, {
      nPredict: 4096,
      useCache: true,
      sampling: {
        temp: 0.2,
      },
      onNewToken: (token, piece, currentText, opts) => {
        // 可以在这里处理每个新 token
        // piece 是 Uint8Array 类型
        // opts.abortSignal() 可以用于停止生成
        console.log('新 token:', currentText);
        
        // 示例：在某些条件下停止生成
        // if (currentText.length > 1000) {
        //   opts.abortSignal();
        // }
      },
    });
    
    return result;
  } catch (error) {
    console.error('生成失败:', error);
    throw error;
  }
}

// 示例：停止生成
export function stopGeneration() {
  wllamaCore.stopGeneration();
}

// 示例：卸载模型
export async function unloadModel() {
  await wllamaCore.unloadModel();
}

// 示例：设置推理参数
import { InferenceParams } from './types';
export function setInferenceParams(params: Partial<InferenceParams>) {
  wllamaCore.setInferenceParams(params);
}

// 示例：获取推理参数
export function getInferenceParams() {
  return wllamaCore.getInferenceParams();
}

// 示例：从 URL 加载模型（自动缓存）
export async function loadModelFromUrl(url: string) {
  try {
    await wllamaCore.loadModelFromUrl(url, {
      n_ctx: 4096,
      n_batch: 128,
      downloadOptions: {
        progressCallback: (progress) => {
          const percent = progress.total > 0 
            ? (progress.loaded / progress.total * 100).toFixed(1) 
            : '0';
          console.log(`下载进度: ${percent}%`);
        },
      },
    });
    
    const metadata = wllamaCore.getModelMetadata();
    console.log('模型名称:', metadata?.name);
  } catch (error) {
    console.error('加载模型失败:', error);
  }
}

// 示例：管理缓存
export async function cacheExamples() {
  // 列出所有缓存文件
  const entries = await cacheManager.list();
  console.log(`缓存文件数: ${entries.length}`);
  
  // 检查文件是否在缓存中
  const url = 'https://example.com/model.gguf';
  const exists = await cacheManager.exists(url);
  console.log(`文件是否存在: ${exists}`);
  
  // 如果不存在，下载并缓存
  if (!exists) {
    await cacheManager.download(url, {
      progressCallback: (progress) => {
        console.log(`下载: ${progress.loaded}/${progress.total}`);
      },
    });
  }
  
  // 从缓存加载文件
  const cachedFile = await cacheManager.open(url);
  if (cachedFile) {
    await wllamaCore.loadModelFromFiles([cachedFile], {
      n_ctx: 4096,
      n_batch: 128,
    });
  }
  
  // 删除缓存文件
  // await cacheManager.delete(url);
  
  // 清空所有缓存
  // await cacheManager.clear();
}

// ==================== 多实例模式示例 ====================

/**
 * 示例：使用工厂类创建多个实例（推荐方式）
 */
export async function multiInstanceExample() {
  // 方式1：使用工厂类创建实例（推荐）
  const instance1 = wllamaCoreFactory.create({ paths: WLLAMA_CONFIG_PATHS }, 'instance-1');
  const instance2 = wllamaCoreFactory.create({ paths: WLLAMA_CONFIG_PATHS }, 'instance-2');

  // 监听不同实例的事件
  instance1.on(WllamaCoreEvent.MODEL_LOADED, (data) => {
    console.log('实例1模型已加载:', data.instanceId);
  });

  instance2.on(WllamaCoreEvent.MODEL_LOADED, (data) => {
    console.log('实例2模型已加载:', data.instanceId);
  });

  // 加载不同的模型
  // await instance1.loadModelFromUrl('https://example.com/model1.gguf');
  // await instance2.loadModelFromUrl('https://example.com/model2.gguf');

  // 获取实例
  const retrievedInstance = wllamaCoreFactory.get('instance-1');
  if (retrievedInstance) {
    console.log('获取到实例:', retrievedInstance.getInstanceId());
  }

  // 获取所有实例
  const allInstances = wllamaCoreFactory.getAll();
  console.log(`当前有 ${allInstances.size} 个实例`);

  // 销毁指定实例
  // await wllamaCoreFactory.destroy('instance-1');

  // 销毁所有实例
  // await wllamaCoreFactory.destroyAll();
}

/**
 * 示例：使用默认实例（向后兼容）
 */
export async function defaultInstanceExample() {
  // 获取或创建默认实例
  const defaultInstance = wllamaCoreFactory.getDefault({ paths: WLLAMA_CONFIG_PATHS });
  
  // 使用默认实例
  // await defaultInstance.loadModelFromUrl('https://example.com/model.gguf');
  
  console.log('默认实例ID:', defaultInstance.getInstanceId());
}

/**
 * 示例：多实例事件隔离
 */
export async function multiInstanceEventExample() {
  const instance1 = wllamaCoreFactory.create({ paths: WLLAMA_CONFIG_PATHS }, 'chat-1');
  const instance2 = wllamaCoreFactory.create({ paths: WLLAMA_CONFIG_PATHS }, 'chat-2');

  // 监听所有实例的事件，但通过 instanceId 区分
  const handleGenerationUpdate = (data: { data: string; instanceId: string }) => {
    if (data.instanceId === 'chat-1') {
      console.log('聊天1更新:', data.data);
    } else if (data.instanceId === 'chat-2') {
      console.log('聊天2更新:', data.data);
    }
  };

  instance1.on(WllamaCoreEvent.GENERATION_UPDATE, handleGenerationUpdate);
  instance2.on(WllamaCoreEvent.GENERATION_UPDATE, handleGenerationUpdate);

  // 每个实例可以独立生成
  // const messages1: Message[] = [{ role: 'user', content: '你好' }];
  // const messages2: Message[] = [{ role: 'user', content: 'Hello' }];
  // await Promise.all([
  //   instance1.createChatCompletion(messages1),
  //   instance2.createChatCompletion(messages2),
  // ]);
}
