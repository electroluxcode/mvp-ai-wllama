# wllama-core

## 特性

- 🚀 **零 React 依赖** - 纯 TypeScript/JavaScript 实现，可在任何环境中使用
- 📦 **开箱即用** - 内置配置管理和默认参数
- 🎯 **事件驱动** - 支持监听模型加载、生成等事件
- 🔧 **类型安全** - 完整的 TypeScript 类型定义
- 💾 **持久化存储** - 自动保存推理参数到 localStorage
- 🎨 **简洁 API** - 易于使用的接口设计
- 💿 **模型缓存** - 基于 IndexedDB 的模型文件缓存系统，支持从 URL 下载和本地文件导入
- ⚡ **多线程支持** - 自动检测并使用多线程模式（需要正确的 HTTP 响应头配置）
- 🔀 **多实例支持** - 支持创建和管理多个独立的 WllamaCore 实例，每个实例可以加载不同的模型

## 安装

```typescript
import { WllamaCore, WLLAMA_CONFIG_PATHS, wllamaCoreFactory } from './wllama-core';
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
        onNewToken(_token, _piece, text, _opts) {
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

## 多实例模式

wllama-core 支持创建和管理多个独立的实例，每个实例可以加载不同的模型，独立进行推理。这对于需要同时运行多个模型或管理多个对话场景非常有用。

### 快速开始

#### 单实例模式（向后兼容）

```typescript
import { wllamaCoreFactory, WLLAMA_CONFIG_PATHS } from './wllama-core';

// 获取或创建默认实例
const defaultInstance = wllamaCoreFactory.getDefault({ paths: WLLAMA_CONFIG_PATHS });

// 使用默认实例
await defaultInstance.loadModelFromUrl('https://example.com/model.gguf');
const result = await defaultInstance.createChatCompletion([...]);
```

#### 多实例模式

```typescript
import { wllamaCoreFactory, WLLAMA_CONFIG_PATHS, Message, WllamaCoreEvent } from './wllama-core';

// 创建多个实例
const instance1 = wllamaCoreFactory.create({ paths: WLLAMA_CONFIG_PATHS }, 'chat-1');
const instance2 = wllamaCoreFactory.create({ paths: WLLAMA_CONFIG_PATHS }, 'chat-2');

// 每个实例可以加载不同的模型
await instance1.loadModelFromUrl('https://example.com/model1.gguf');
await instance2.loadModelFromUrl('https://example.com/model2.gguf');

// 独立进行推理
const messages1: Message[] = [{ role: 'user', content: '你好' }];
const messages2: Message[] = [{ role: 'user', content: 'Hello' }];

const [result1, result2] = await Promise.all([
  instance1.createChatCompletion(messages1),
  instance2.createChatCompletion(messages2),
]);
```

### 事件系统

在多实例模式下，所有事件数据都包含 `instanceId` 字段，用于区分不同实例的事件：

```typescript
// 监听特定实例的事件
instance1.on(WllamaCoreEvent.MODEL_LOADED, (data) => {
  console.log('实例1模型已加载:', data.instanceId);
  console.log('模型元数据:', data.metadata);
});

instance2.on(WllamaCoreEvent.GENERATION_UPDATE, (data) => {
  console.log('实例2生成更新:', data.data);
  console.log('实例ID:', data.instanceId);
});

// 或者监听所有实例的事件，通过 instanceId 区分
const handleUpdate = (data: { data: string; instanceId: string }) => {
  if (data.instanceId === 'chat-1') {
    console.log('聊天1更新:', data.data);
  } else if (data.instanceId === 'chat-2') {
    console.log('聊天2更新:', data.data);
  }
};

instance1.on(WllamaCoreEvent.GENERATION_UPDATE, handleUpdate);
instance2.on(WllamaCoreEvent.GENERATION_UPDATE, handleUpdate);
```

### 实例管理

```typescript
// 获取指定实例
const instance = wllamaCoreFactory.get('chat-1');
if (instance) {
  console.log('实例ID:', instance.getInstanceId());
}

// 获取所有实例
const allInstances = wllamaCoreFactory.getAll();
console.log(`当前有 ${allInstances.size} 个实例`);

// 检查实例是否存在
if (wllamaCoreFactory.exists('chat-1')) {
  console.log('实例存在');
}

// 销毁指定实例（会自动卸载模型）
await wllamaCoreFactory.destroy('chat-1');

// 销毁所有实例
await wllamaCoreFactory.destroyAll();
```

### 在 React 中使用多实例

```typescript
import { useEffect, useRef } from 'react';
import { wllamaCoreFactory, WLLAMA_CONFIG_PATHS, WllamaCoreEvent } from './wllama-core';

function MultiChatComponent() {
  const instance1Ref = useRef(wllamaCoreFactory.create({ paths: WLLAMA_CONFIG_PATHS }, 'chat-1'));
  const instance2Ref = useRef(wllamaCoreFactory.create({ paths: WLLAMA_CONFIG_PATHS }, 'chat-2'));

  useEffect(() => {
    const instance1 = instance1Ref.current;
    const instance2 = instance2Ref.current;

    // 监听事件
    instance1.on(WllamaCoreEvent.GENERATION_UPDATE, (data) => {
      console.log('聊天1:', data.data);
    });

    instance2.on(WllamaCoreEvent.GENERATION_UPDATE, (data) => {
      console.log('聊天2:', data.data);
    });

    return () => {
      // 清理
      wllamaCoreFactory.destroy('chat-1');
      wllamaCoreFactory.destroy('chat-2');
    };
  }, []);

  // ...
}
```

### 注意事项

1. **实例ID唯一性**：每个实例必须使用唯一的 ID，如果尝试创建相同 ID 的实例会抛出错误
2. **资源隔离**：每个实例的推理参数存储在独立的 localStorage 键中（格式：`params-{instanceId}`）
3. **事件隔离**：每个实例的事件监听器是独立的，但事件数据包含 `instanceId` 用于区分
4. **内存管理**：使用完毕后记得调用 `destroy()` 或 `destroyAll()` 释放资源
5. **向后兼容**：原有的直接创建 `WllamaCore` 实例的方式仍然支持，但推荐使用工厂类管理实例

## API 文档

### WllamaCoreFactory

工厂类，用于创建和管理多个 WllamaCore 实例。

#### 获取工厂实例

```typescript
import { wllamaCoreFactory } from './wllama-core';

// wllamaCoreFactory 是单例实例，可以直接使用
```

#### 方法

##### `create(options?: Partial<WllamaCoreOptions>, instanceId?: string): WllamaCore`

创建新的 WllamaCore 实例。

**参数：**
- `options?`: WllamaCore 选项（可选）
  - `paths?`: WASM 文件路径配置
  - `logger?`: 日志记录器
- `instanceId?`: 可选的实例 ID，如果不提供则自动生成

**返回值：** `WllamaCore` 实例

**示例：**
```typescript
// 自动生成实例 ID
const instance1 = wllamaCoreFactory.create({ paths: WLLAMA_CONFIG_PATHS });

// 指定实例 ID
const instance2 = wllamaCoreFactory.create({ paths: WLLAMA_CONFIG_PATHS }, 'my-instance');
```

##### `get(instanceId?: string): WllamaCore | null`

获取指定 ID 的实例。

**参数：**
- `instanceId?`: 实例 ID，默认为 `'default'`

**返回值：** WllamaCore 实例，如果不存在则返回 `null`

**示例：**
```typescript
const instance = wllamaCoreFactory.get('my-instance');
if (instance) {
  console.log('找到实例:', instance.getInstanceId());
}
```

##### `getDefault(options?: Partial<WllamaCoreOptions>): WllamaCore`

获取或创建默认实例（向后兼容）。

**参数：**
- `options?`: WllamaCore 选项（可选）

**返回值：** WllamaCore 实例

**示例：**
```typescript
const defaultInstance = wllamaCoreFactory.getDefault({ paths: WLLAMA_CONFIG_PATHS });
```

##### `getAll(): Map<string, WllamaCore>`

获取所有实例。

**返回值：** 所有实例的 Map

**示例：**
```typescript
const allInstances = wllamaCoreFactory.getAll();
console.log(`当前有 ${allInstances.size} 个实例`);
```

##### `exists(instanceId: string): boolean`

检查指定 ID 的实例是否存在。

**参数：**
- `instanceId`: 实例 ID

**返回值：** 是否存在

**示例：**
```typescript
if (wllamaCoreFactory.exists('my-instance')) {
  console.log('实例存在');
}
```

##### `destroy(instanceId: string): Promise<void>`

销毁指定 ID 的实例（会自动卸载模型）。

**参数：**
- `instanceId`: 实例 ID

**示例：**
```typescript
await wllamaCoreFactory.destroy('my-instance');
```

##### `destroyAll(): Promise<void>`

销毁所有实例。

**示例：**
```typescript
await wllamaCoreFactory.destroyAll();
```

##### `getInstanceCount(): number`

获取实例数量。

**返回值：** 实例数量

**示例：**
```typescript
const count = wllamaCoreFactory.getInstanceCount();
console.log(`当前有 ${count} 个实例`);
```

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

##### `loadModelFromUrl(url: string, options?: LoadModelOptions & { useCache?: boolean; downloadOptions?: DownloadOptions }): Promise<void>`

从远程 URL 加载模型（支持自动缓存）。

**参数：**
- `url`: 模型文件的 URL
- `options?`: 加载选项
  - `useCache?`: 是否使用缓存（默认 `true`）
  - `downloadOptions?`: 下载选项
    - `progressCallback?`: 下载进度回调
    - `headers?`: 自定义请求头
    - `signal?`: AbortSignal 用于取消下载
  - 其他选项同 `loadModelFromFiles`

**示例：**
```typescript
// 从 URL 加载并自动缓存
await wllamaCore.loadModelFromUrl('https://example.com/model.gguf', {
  n_ctx: 4096,
  n_batch: 128,
  downloadOptions: {
    progressCallback: (progress) => {
      console.log(`下载进度: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
    },
  },
});

// 禁用缓存，直接下载
await wllamaCore.loadModelFromUrl('https://example.com/model.gguf', {
  useCache: false,
  n_ctx: 4096,
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
    ```typescript
    (token: number, piece: Uint8Array, currentText: string, opts: { abortSignal: () => void }) => void
    ```

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
  onNewToken(token, piece, currentText, opts) {
    console.log('生成中:', currentText);
    // opts.abortSignal() 可以用于停止生成
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

##### `getInstanceId(): string`

获取实例的唯一 ID。

**返回值：** 实例 ID 字符串

**示例：**
```typescript
const instanceId = wllamaCore.getInstanceId();
console.log('实例ID:', instanceId);
```

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

### CacheEntry

```typescript
interface CacheEntry {
  name: string;              // 缓存中的文件名
  size: number;              // 文件大小（字节）
  metadata: CacheEntryMetadata;
}
```

### CacheEntryMetadata

```typescript
interface CacheEntryMetadata {
  originalURL: string;       // 原始 URL（必需）
  [key: string]: any;        // 可选的扩展字段，如 etag、originalSize 等
}
```

**注意：** `originalURL` 是唯一必需的字段。其他字段（如 `etag`、`originalSize`、`createdAt` 等）都是可选的扩展字段，可以根据需要添加。

### DownloadOptions

```typescript
interface DownloadOptions {
  progressCallback?: (progress: { loaded: number; total: number }) => void;
  headers?: Record<string, string>;  // 自定义请求头
  signal?: AbortSignal;               // 用于取消下载
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

### CacheManager

模型缓存管理器，基于 IndexedDB 实现，具有广泛的浏览器兼容性。

```typescript
import { cacheManager, CacheEntry } from './wllama-core';

// 下载并缓存模型
await cacheManager.download('https://example.com/model.gguf', {
  progressCallback: (progress) => {
    console.log(`进度: ${progress.loaded}/${progress.total}`);
  },
});

// 从缓存读取文件
const cachedFile = await cacheManager.open('https://example.com/model.gguf');
if (cachedFile) {
  // 使用缓存的文件
  await wllamaCore.loadModelFromFiles([cachedFile]);
}

// 列出所有缓存文件
const entries: CacheEntry[] = await cacheManager.list();
entries.forEach(entry => {
  console.log(`${entry.name}: ${entry.size} bytes`);
});

// 删除单个缓存文件
await cacheManager.delete('https://example.com/model.gguf');

// 清空所有缓存
await cacheManager.clear();

// 检查文件是否在缓存中
const exists = await cacheManager.exists('https://example.com/model.gguf');

// 保存文件到缓存
const file = new File([blob], 'model.gguf');
await cacheManager.write('/model.gguf', file, {
  etag: '',
  originalSize: file.size,
  originalURL: '/model.gguf',
});
```

**CacheManager 方法：**

- `download(url: string, options?: DownloadOptions): Promise<void>` - 从 URL 下载并缓存
- `open(nameOrURL: string): Promise<File | null>` - 从缓存打开文件
- `list(): Promise<CacheEntry[]>` - 列出所有缓存文件
- `delete(nameOrURL: string): Promise<void>` - 删除单个缓存文件
- `clear(): Promise<void>` - 清空所有缓存
- `exists(nameOrURL: string): Promise<boolean>` - 检查文件是否存在
- `write(url: string, file: File | Blob, metadata?: CacheEntryMetadata): Promise<void>` - 写入文件到缓存
- `getSize(name: string): Promise<number>` - 获取文件大小
- `getMetadata(name: string): Promise<CacheEntryMetadata | null>` - 获取文件元数据

## 配置

### WLLAMA_CONFIG_PATHS

默认的 WASM 文件路径配置。

```typescript
import { WLLAMA_CONFIG_PATHS } from './wllama-core';

const wllamaCore = new WllamaCore({
  paths: WLLAMA_CONFIG_PATHS,
});
```

### 启用多线程支持

要启用多线程支持，需要在 Next.js 中配置 middleware 设置正确的 HTTP 响应头：

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // 启用 SharedArrayBuffer 支持（多线程所需）
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

**注意：**
- 必须在 HTTPS 环境下运行（或 localhost）
- 需要浏览器支持 SharedArrayBuffer
- 设置响应头后需要重启开发服务器

### 缓存系统要求

缓存系统基于 IndexedDB，具有广泛的浏览器兼容性：

- 支持所有现代浏览器（Chrome、Firefox、Edge、Safari 等）
- 支持低版本浏览器（Chrome 24+, Firefox 16+, Safari 10+）
- 无需特殊配置，开箱即用

## 完整示例

### 基本使用

查看 `example.ts` 文件获取更多使用示例。

### 使用缓存加载模型

```typescript
import { WllamaCore, cacheManager, WLLAMA_CONFIG_PATHS } from './wllama-core';

const wllamaCore = new WllamaCore({ paths: WLLAMA_CONFIG_PATHS });

// 方式 1: 从 URL 加载（自动缓存）
await wllamaCore.loadModelFromUrl('https://example.com/model.gguf', {
  n_ctx: 4096,
  downloadOptions: {
    progressCallback: (progress) => {
      console.log(`下载: ${progress.loaded}/${progress.total}`);
    },
  },
});

// 方式 2: 手动下载并缓存
await cacheManager.download('https://example.com/model.gguf');
const cachedFile = await cacheManager.open('https://example.com/model.gguf');
if (cachedFile) {
  await wllamaCore.loadModelFromFiles([cachedFile], { n_ctx: 4096 });
}

// 方式 3: 从本地文件导入到缓存
const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
const file = fileInput.files?.[0];
if (file) {
  await cacheManager.write(`/${file.name}`, file, {
    etag: '',
    originalSize: file.size,
    originalURL: `/${file.name}`,
  });
  
  // 然后从缓存加载
  const cachedFile = await cacheManager.open(`/${file.name}`);
  if (cachedFile) {
    await wllamaCore.loadModelFromFiles([cachedFile], { n_ctx: 4096 });
  }
}
```

### 管理缓存

```typescript
import { cacheManager, toHumanReadableSize } from './wllama-core';

// 列出所有缓存文件
const entries = await cacheManager.list();
console.log(`缓存文件数: ${entries.length}`);
entries.forEach(entry => {
  console.log(`${entry.metadata.originalURL || entry.name}: ${toHumanReadableSize(entry.size)}`);
});

// 获取缓存总大小
const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
console.log(`总大小: ${toHumanReadableSize(totalSize)}`);

// 删除特定文件
await cacheManager.delete('https://example.com/model.gguf');

// 清空所有缓存
await cacheManager.clear();
```


