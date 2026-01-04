/**
 * 使用示例：如何使用 WllamaCore（不依赖 React）
 * 
 * 这个文件展示了如何使用 WllamaCore 类来加载模型和生成文本
 */

import { WllamaCore, Message, WllamaCoreEvent } from './index';
import wllamaSingle from '@wllama/wllama/src/single-thread/wllama.wasm?url';
import wllamaMulti from '@wllama/wllama/src/multi-thread/wllama.wasm?url';

// 配置路径
const PATHS = {
  'single-thread/wllama.wasm': wllamaSingle,
  'multi-thread/wllama.wasm': wllamaMulti,
};

// 创建 WllamaCore 实例
const wllamaCore = new WllamaCore({
  paths: PATHS,
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

