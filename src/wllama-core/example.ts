/**
 * 使用示例：如何使用 WllamaCore（不依赖 React）
 * 
 * 这个文件展示了如何使用 WllamaCore 类来加载模型和生成文本
 */

import { WllamaCore, Message, WllamaCoreEvent, WLLAMA_CONFIG_PATHS, cacheManager } from './index';

// 创建 WllamaCore 实例（使用默认配置）
const wllamaCore = new WllamaCore({
  paths: WLLAMA_CONFIG_PATHS,
});

// 监听事件
wllamaCore.on(WllamaCoreEvent.MODEL_LOADED, (data) => {
  console.log('模型已加载:', data);
});

wllamaCore.on(WllamaCoreEvent.GENERATION_UPDATE, (text) => {
  console.log('生成中:', text);
});

wllamaCore.on(WllamaCoreEvent.GENERATION_END, (result) => {
  console.log('生成完成:', result);
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
      onNewToken: (token, piece, currentText) => {
        // 可以在这里处理每个新 token
        // piece 是 Uint8Array 类型
        console.log('新 token:', currentText);
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

