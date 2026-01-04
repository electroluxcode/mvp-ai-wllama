# wllama-core

## 特性

- 🚀 **零 React 依赖** - 纯 TypeScript/JavaScript 实现，可在任何环境中使用
- 📦 **开箱即用** - 内置配置管理和默认参数
- 🎯 **事件驱动** - 支持监听模型加载、生成等事件
- 🔧 **类型安全** - 完整的 TypeScript 类型定义
- 💾 **持久化存储** - 自动保存推理参数到 localStorage
- 🎨 **简洁 API** - 易于使用的接口设计

## 安装

```typescript
import { WllamaCore, WLLAMA_CONFIG_PATHS } from './wllama-core';
```

## 快速开始

### 基本使用

```typescript
import { WllamaCore, Message, WLLAMA_CONFIG_PATHS } from './wllama-core';

// 创建实例
const wllamaCore = new WllamaCore({
  paths: WLLAMA_CONFIG_PATHS,
});

// 加载模型
const files = [/* File 对象 */];
await wllamaCore.loadModelFromFiles(files, {
  n_ctx: 4096,
  n_batch: 128,
});

// 创建聊天完成
const messages: Message[] = [
  { role: 'user', content: '你好！' }
];

const result = await wllamaCore.createChatCompletion(messages, {
  nPredict: 4096,
  sampling: { temp: 0.2 },
});

console.log(result);
```

### 在 React 中使用

```typescript
import { useState, useRef, useEffect } from 'react';
import { WllamaCore, Message, WLLAMA_CONFIG_PATHS } from './wllama-core';

function ChatComponent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const wllamaCoreRef = useRef<WllamaCore | null>(null);

  useEffect(() => {
    wllamaCoreRef.current = new WllamaCore({ paths: WLLAMA_CONFIG_PATHS });
    return () => {
      wllamaCoreRef.current?.unloadModel().catch(() => {});
    };
  }, []);

  const sendMessage = async (content: string) => {
    if (!wllamaCoreRef.current?.getModelLoaded()) return;
    
    const userMsg: Message = { role: 'user', content };
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    const result = await wllamaCoreRef.current.createChatCompletion(
      [...messages, userMsg],
      {
        onNewToken(_token, _piece, text) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].content = text;
            return updated;
          });
        },
      }
    );
  };

  // ...
}
```

## API 文档

### WllamaCore

核心类，封装了 Wllama 的所有功能。

#### 构造函数

```typescript
new WllamaCore(options: WllamaCoreOptions)
```

**参数：**
- `options.paths`: WASM 文件路径配置
  ```typescript
  {
    'single-thread/wllama.wasm': string;
    'multi-thread/wllama.wasm'?: string;
  }
  ```
- `options.logger?`: 可选的日志记录器

#### 方法

##### `loadModelFromFiles(files: File[], options?: LoadModelOptions): Promise<void>`

从文件加载模型。

**参数：**
- `files`: GGUF 模型文件数组
- `options?`: 加载选项
  - `n_ctx?`: 上下文窗口大小
  - `n_batch?`: 批处理大小
  - `n_threads?`: 线程数（-1 表示自动）

**示例：**
```typescript
const files = [/* File 对象 */];
await wllamaCore.loadModelFromFiles(files, {
  n_ctx: 4096,
  n_batch: 128,
});
```

##### `unloadModel(): Promise<void>`

卸载当前加载的模型。

##### `createCompletion(input: string, options?: CompletionOptions): Promise<string>`

从格式化输入创建文本完成。

**参数：**
- `input`: 格式化后的输入文本
- `options?`: 完成选项
  - `nPredict?`: 最大预测 token 数
  - `useCache?`: 是否使用缓存
  - `sampling?`: 采样参数
    - `temp?`: 温度
    - `top_k?`: Top-K 采样
    - `top_p?`: Top-P 采样
  - `onNewToken?`: 新 token 回调

##### `createChatCompletion(messages: Message[], options?: CompletionOptions): Promise<string>`

从消息列表创建聊天完成（自动格式化）。

**参数：**
- `messages`: 消息数组
- `options?`: 完成选项（同上）

**示例：**
```typescript
const messages: Message[] = [
  { role: 'user', content: '你好' },
  { role: 'assistant', content: '你好！有什么可以帮助你的吗？' },
  { role: 'user', content: '介绍一下你自己' }
];

const result = await wllamaCore.createChatCompletion(messages, {
  nPredict: 4096,
  sampling: { temp: 0.2 },
  onNewToken(token, piece, currentText) {
    console.log('生成中:', currentText);
  },
});
```

##### `stopGeneration(): void`

停止当前的生成过程。

##### `getInferenceParams(): InferenceParams`

获取当前推理参数。

**返回：**
```typescript
{
  nThreads: number;
  nContext: number;
  nBatch: number;
  temperature: number;
  nPredict: number;
}
```

##### `setInferenceParams(params: Partial<InferenceParams>): void`

设置推理参数（会自动保存到 localStorage）。

##### `getModelMetadata(): ModelMetadata | null`

获取模型元数据。

##### `getRuntimeInfo(): RuntimeInfo | null`

获取运行时信息。

**返回：**
```typescript
{
  isMultithread: boolean;
  hasChatTemplate: boolean;
}
```

##### `getModelLoaded(): boolean`

检查模型是否已加载。

##### `getGenerating(): boolean`

检查是否正在生成。

##### `getWllamaInstance(): Wllama`

获取底层 Wllama 实例（用于高级用法）。

##### `on(event: WllamaCoreEvent, listener: EventListener): void`

注册事件监听器。

##### `off(event: WllamaCoreEvent, listener: EventListener): void`

移除事件监听器。

## 事件系统

WllamaCore 支持以下事件：

```typescript
enum WllamaCoreEvent {
  MODEL_LOADING = 'model_loading',      // 模型加载中
  MODEL_LOADED = 'model_loaded',        // 模型加载完成
  MODEL_UNLOADED = 'model_unloaded',    // 模型已卸载
  GENERATION_START = 'generation_start', // 生成开始
  GENERATION_UPDATE = 'generation_update', // 生成更新
  GENERATION_END = 'generation_end',     // 生成结束
  ERROR = 'error',                       // 错误
}
```

**示例：**
```typescript
wllamaCore.on(WllamaCoreEvent.MODEL_LOADED, (data) => {
  const { metadata, runtimeInfo } = data as {
    metadata?: ModelMetadata;
    runtimeInfo?: RuntimeInfo;
  };
  console.log('模型已加载:', metadata?.name);
});

wllamaCore.on(WllamaCoreEvent.GENERATION_UPDATE, (text) => {
  console.log('生成中:', text as string);
});

wllamaCore.on(WllamaCoreEvent.ERROR, (error) => {
  console.error('错误:', error as string);
});
```

## 类型定义

### Message

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

### InferenceParams

```typescript
interface InferenceParams {
  nThreads: number;      // 线程数（-1 表示自动）
  nContext: number;      // 上下文窗口大小
  nBatch: number;        // 批处理大小
  temperature: number;   // 温度参数
  nPredict: number;      // 最大预测 token 数
}
```

### CompletionOptions

```typescript
interface CompletionOptions {
  nPredict?: number;
  useCache?: boolean;
  sampling?: {
    temp?: number;
    top_k?: number;
    top_p?: number;
  };
  onNewToken?: (
    token: number,
    piece: Uint8Array,
    currentText: string,
    opts: { abortSignal: () => void }
  ) => void;
}
```

## 工具函数

### formatChat

格式化聊天消息为模型输入。

```typescript
import { formatChat } from './wllama-core';
import { Wllama } from '@wllama/wllama';

const formatted = await formatChat(wllama, messages);
```

### WllamaStorage

本地存储工具，用于保存和加载配置。

```typescript
import { WllamaStorage } from './wllama-core';

// 保存
WllamaStorage.save('params', inferenceParams);

// 加载
const params = WllamaStorage.load('params', defaultParams);
```

### DebugLogger

调试日志记录器。

```typescript
import { DebugLogger } from './wllama-core';

DebugLogger.debug('调试信息');
DebugLogger.log('日志信息');
DebugLogger.warn('警告信息');
DebugLogger.error('错误信息');
```

## 配置

### WLLAMA_CONFIG_PATHS

默认的 WASM 文件路径配置。

```typescript
import { WLLAMA_CONFIG_PATHS } from './wllama-core';

const wllamaCore = new WllamaCore({
  paths: WLLAMA_CONFIG_PATHS,
});
```

## 完整示例

查看 `example.ts` 文件获取更多使用示例。


