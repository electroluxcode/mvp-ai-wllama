# MVP AI Wllama

基于浏览器的大语言模型（LLM）推理解决方案，使用 Wllama 技术栈在客户端完全运行 AI 模型。所有推理操作都在用户设备上完成，无需后端服务。

## 🎯 核心优势

- 🛡️ **数据安全**：模型推理完全在浏览器内完成，数据永远不会离开本地环境
- 🚀 **零部署成本**：客户端架构，无需服务器设置
- ⚡ **快速启动**：访问页面即可使用，无需额外配置
- 💾 **智能缓存**：基于 IndexedDB 的模型文件缓存系统，支持从 URL 下载和本地文件导入
- 🔀 **多实例支持**：支持创建和管理多个独立的 WllamaCore 实例，每个实例可以加载不同的模型
- 🧵 **多线程支持**：自动检测并使用多线程模式（需要正确的 HTTP 响应头配置）
- 🎯 **事件驱动**：支持监听模型加载、生成等事件
- 🔧 **类型安全**：完整的 TypeScript 类型定义

## 📘 用户指南

### 快速开始

1. 访问应用页面
2. 选择模型加载方式：
   - `/wllama/load-from-file` - 从本地文件加载模型
   - `/wllama/load-from-url` - 从远程 URL 加载模型（支持自动缓存）
   - `/wllama/load-from-cache` - 从缓存加载模型
   - `/wllama/multi-instance` - 多实例演示（同时运行多个独立的模型实例）
   - `/wllama/manager-cache` - 缓存管理页面（导入、导出、删除缓存模型）
3. 加载 GGUF 格式的模型文件
4. 开始与 AI 对话

### 模型加载方式

#### 从本地文件加载

1. 点击"加载GGUF模型"按钮
2. 选择本地的 GGUF 模型文件
3. 等待模型加载完成
4. 开始对话

#### 从远程 URL 加载

1. 在输入框中输入模型文件的 URL
2. 点击"加载"按钮
3. 系统会自动下载并缓存模型文件
4. 等待模型加载完成
5. 开始对话

**示例 URL：**
```
https://huggingface.co/LiquidAI/LFM2-700M-GGUF/resolve/main/LFM2-700M-Q4_K_M.gguf
```

#### 从缓存加载

1. 访问 `/wllama/load-from-cache` 页面
2. 在缓存列表中选择已缓存的模型
3. 点击模型条目加载
4. 开始对话

### 缓存管理

访问 `/wllama/manager-cache` 页面可以：

- **导入模型**：从 URL 下载或从本地文件导入模型到缓存
- **查看缓存**：查看所有已缓存的模型文件及其大小
- **导出模型**：将缓存的模型文件导出到本地
- **删除模型**：删除不需要的缓存文件
- **清空缓存**：一键清空所有缓存

## 🔌 API 文档

### WllamaCoreFactory

工厂类，用于创建和管理多个 WllamaCore 实例。

#### 单实例模式（向后兼容）

```typescript
import { wllamaCoreFactory, WLLAMA_CONFIG_PATHS } from '@/wllama-core';

// 获取或创建默认实例
const defaultInstance = wllamaCoreFactory.getDefault({ paths: WLLAMA_CONFIG_PATHS });

// 使用默认实例
await defaultInstance.loadModelFromUrl('https://example.com/model.gguf');
const result = await defaultInstance.createChatCompletion([...]);
```

#### 多实例模式

```typescript
import { wllamaCoreFactory, WLLAMA_CONFIG_PATHS, Message } from '@/wllama-core';

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

#### 实例管理

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

### WllamaCore

核心类，封装了 Wllama 的所有功能。

#### 模型加载

##### 从文件加载

```typescript
import { WllamaCore, WLLAMA_CONFIG_PATHS } from '@/wllama-core';

const wllamaCore = new WllamaCore({ paths: WLLAMA_CONFIG_PATHS });

const files = [/* File 对象 */];
await wllamaCore.loadModelFromFiles(files, {
  n_ctx: 4096,
  n_batch: 128,
});
```

##### 从 URL 加载（支持自动缓存）

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

#### 聊天完成

```typescript
import { Message } from '@/wllama-core';

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

#### 推理参数管理

```typescript
// 获取当前推理参数
const params = wllamaCore.getInferenceParams();
console.log('线程数:', params.nThreads);
console.log('上下文窗口:', params.nContext);
console.log('温度:', params.temperature);

// 设置推理参数（会自动保存到 localStorage）
wllamaCore.setInferenceParams({
  temperature: 0.7,
  nPredict: 2048,
});
```

#### 模型信息

```typescript
// 检查模型是否已加载
const isLoaded = wllamaCore.getModelLoaded();

// 获取模型元数据
const metadata = wllamaCore.getModelMetadata();
console.log('模型名称:', metadata?.name);

// 获取运行时信息
const runtimeInfo = wllamaCore.getRuntimeInfo();
console.log('是否多线程:', runtimeInfo?.isMultithread);
console.log('是否有聊天模板:', runtimeInfo?.hasChatTemplate);
```

### CacheManager

模型缓存管理器，基于 IndexedDB 实现。

```typescript
import { cacheManager, CacheEntry, toHumanReadableSize } from '@/wllama-core';

// 下载并缓存模型
await cacheManager.download('https://example.com/model.gguf', {
  progressCallback: (progress) => {
    console.log(`进度: ${progress.loaded}/${progress.total}`);
  },
});

// 从缓存读取文件
const cachedFile = await cacheManager.open('https://example.com/model.gguf');
if (cachedFile) {
  await wllamaCore.loadModelFromFiles([cachedFile]);
}

// 列出所有缓存文件
const entries: CacheEntry[] = await cacheManager.list();
entries.forEach(entry => {
  console.log(`${entry.metadata.originalURL || entry.name}: ${toHumanReadableSize(entry.size)}`);
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

### 事件系统

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
import { WllamaCoreEvent } from '@/wllama-core';

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

**多实例模式下的事件：**

在多实例模式下，所有事件数据都包含 `instanceId` 字段，用于区分不同实例的事件：

```typescript
instance1.on(WllamaCoreEvent.MODEL_LOADED, (data) => {
  console.log('实例1模型已加载:', data.instanceId);
  console.log('模型元数据:', data.metadata);
});

instance2.on(WllamaCoreEvent.GENERATION_UPDATE, (data) => {
  console.log('实例2生成更新:', data.data);
  console.log('实例ID:', data.instanceId);
});
```

## 🏗️ 技术实现

- **Wllama SDK**：集成 @wllama/wllama JavaScript SDK，提供核心模型推理能力
- **WebAssembly**：使用 WASM 模块实现模型推理功能
- **IndexedDB**：基于 IndexedDB 的模型文件缓存系统，具有广泛的浏览器兼容性
- **客户端架构**：所有功能模块都在浏览器环境中运行，无需服务器依赖
- **Next.js**：基于 Next.js 15 构建，支持静态导出和动态路由

## 🚀 部署选项

### Vercel 部署

项目配置了静态导出，可以直接部署到 Vercel：

```bash
# 安装依赖
pnpm install

# 构建项目
pnpm build

# Vercel 会自动检测并部署
```

### 静态文件部署

项目支持静态导出，构建后的文件可以部署到任何静态托管服务：

```bash
# 构建静态文件
pnpm build

# 输出目录: out/
# 可以直接部署到 GitHub Pages、Netlify、Nginx 等
```

### 本地开发

```bash
# 克隆仓库
git clone <repository-url>
cd mvp-ai-wllama

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 访问 http://localhost:3090
```

## 🛠️ 配置

### WLLAMA_CONFIG_PATHS

默认的 WASM 文件路径配置。

```typescript
import { WLLAMA_CONFIG_PATHS } from '@/wllama-core';

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

## 📝 项目结构

```
mvp-ai-wllama/
├── src/
│   ├── app/                    # Next.js 应用页面
│   │   ├── wllama/
│   │   │   ├── load-from-file/     # 从文件加载模型页面 (/wllama/load-from-file)
│   │   │   ├── load-from-url/      # 从 URL 加载模型页面 (/wllama/load-from-url)
│   │   │   ├── load-from-cache/    # 从缓存加载模型页面 (/wllama/load-from-cache)
│   │   │   ├── multi-instance/     # 多实例演示页面 (/wllama/multi-instance)
│   │   │   └── manager-cache/      # 缓存管理页面 (/wllama/manager-cache)
│   │   └── page.tsx            # 首页（重定向到 /wllama/load-from-file）
│   ├── wllama-core/            # Wllama 核心库
│   │   ├── wllama-core.ts          # 核心类实现
│   │   ├── wllama-core-factory.ts  # 工厂类实现
│   │   ├── cache-manager.ts        # 缓存管理器
│   │   ├── storage.ts              # 存储工具
│   │   ├── types.ts                # 类型定义
│   │   └── ...
│   └── components/             # 通用组件
│       ├── Loading.tsx
│       ├── ServiceWorkerManager.tsx
│       └── ...
├── public/                     # 静态资源
│   ├── wasm/                   # WebAssembly 文件
│   │   └── wllama/
│   │       ├── single-thread/      # 单线程 WASM
│   │       └── multi-thread/       # 多线程 WASM
│   └── sw.js                   # Service Worker
└── scripts/                    # 构建脚本
```

### 页面路由说明

- `/` - 首页，自动重定向到 `/wllama/load-from-file`
- `/wllama/load-from-file` - 从本地文件加载模型（单实例模式）
- `/wllama/load-from-url` - 从远程 URL 加载模型（单实例模式，支持自动缓存）
- `/wllama/load-from-cache` - 从缓存加载模型（单实例模式）
- `/wllama/multi-instance` - 多实例演示，展示多个独立的模型实例同时运行
- `/wllama/manager-cache` - 缓存管理页面，用于导入、导出、删除缓存模型

## 📚 相关资源

- [@wllama/wllama](https://www.npmjs.com/package/@wllama/wllama) - Wllama JavaScript SDK
- [Wllama GitHub](https://github.com/wllama/wllama) - Wllama 项目源码
- [Next.js 文档](https://nextjs.org/docs) - Next.js 官方文档
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) - IndexedDB API 参考

## 🤝 贡献

欢迎提交 Issues 和 Pull Requests 来帮助改进项目！

## 📄 开源许可

项目使用开源许可。详情请参阅 [LICENSE](LICENSE) 文件。

## 📌 注意事项

### 浏览器兼容性

建议使用现代浏览器（Chrome、Firefox、Edge、Safari 的最新版本）以获得最佳体验。

### 模型格式

目前仅支持 GGUF 格式的模型文件。

### 性能建议

- 模型文件较大，首次加载可能需要较长时间
- 建议使用量化模型（如 Q4_K_M、Q8_0）以获得更好的性能
- 多线程模式可以显著提升推理速度，但需要正确的 HTTP 响应头配置

### 内存使用

- 模型加载会占用大量内存，建议在具有足够 RAM 的设备上使用
- 使用完毕后记得调用 `unloadModel()` 释放内存

### Service Worker

项目包含 Service Worker 用于离线支持和资源缓存。首次访问时会自动注册。
