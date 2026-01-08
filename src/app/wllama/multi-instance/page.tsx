"use client"
import { useState, useRef, useEffect } from 'react';
import { wllamaCoreFactory, Message, WLLAMA_CONFIG_PATHS, WllamaCoreEvent } from '@/wllama-core';

interface ChatInstance {
  id: string;
  messages: Message[];
  input: string;
  loading: boolean;
  generating: boolean;
  error: string;
  modelName: string;
  isModelLoaded: boolean;
}

export default function MultiInstanceDemo() {
  const [instances, setInstances] = useState<ChatInstance[]>([
    {
      id: 'chat-1',
      messages: [],
      input: '',
      loading: false,
      generating: false,
      error: '',
      modelName: '',
      isModelLoaded: false,
    },
    {
      id: 'chat-2',
      messages: [],
      input: '',
      loading: false,
      generating: false,
      error: '',
      modelName: '',
      isModelLoaded: false,
    },
  ]);

  const instanceRefs = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    // 创建两个实例
    const instanceIds = ['chat-1', 'chat-2'];
    
    instanceIds.forEach((instanceId) => {
      // 获取或创建实例（如果已存在则使用现有实例，否则创建新实例）
      const wllamaCore = wllamaCoreFactory.getOrCreate(instanceId, { paths: WLLAMA_CONFIG_PATHS });
      instanceRefs.current.set(instanceId, wllamaCore);

      // 监听事件
      wllamaCore.on(WllamaCoreEvent.MODEL_LOADED, (data: any) => {
        setInstances((prev) =>
          prev.map((inst) =>
            inst.id === data.instanceId
              ? { ...inst, isModelLoaded: true, modelName: data.metadata?.name || '已加载', loading: false }
              : inst
          )
        );
      });

      wllamaCore.on(WllamaCoreEvent.ERROR, (data: any) => {
        setInstances((prev) =>
          prev.map((inst) =>
            inst.id === data.instanceId ? { ...inst, error: data.data, loading: false, generating: false } : inst
          )
        );
      });
    });

    return () => {
      // 清理所有实例
      instanceIds.forEach((instanceId) => {
        wllamaCoreFactory.destroy(instanceId).catch(() => {});
      });
    };
  }, []);

  const loadModel = async (instanceId: string, files: File[]) => {
    const wllamaCore = instanceRefs.current.get(instanceId);
    if (!wllamaCore || !files.length) return;

    setInstances((prev) =>
      prev.map((inst) => (inst.id === instanceId ? { ...inst, loading: true, error: '' } : inst))
    );

    try {
      await wllamaCore.loadModelFromFiles(files, { n_ctx: 4096, n_batch: 128 });
      const metadata = wllamaCore.getModelMetadata();
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === instanceId
            ? { ...inst, isModelLoaded: true, modelName: metadata?.name || files[0].name.replace('.gguf', ''), loading: false }
            : inst
        )
      );
    } catch (err) {
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === instanceId ? { ...inst, error: (err as Error)?.message || '加载失败', loading: false } : inst
        )
      );
    }
  };

  const send = async (instanceId: string) => {
    const instance = instances.find((inst) => inst.id === instanceId);
    const wllamaCore = instanceRefs.current.get(instanceId);
    if (!instance || !wllamaCore || !instance.input.trim() || instance.generating || !instance.isModelLoaded) return;

    const userMsg: Message = { role: 'user', content: instance.input.trim() };
    const assistantMsg: Message = { role: 'assistant', content: '' };

    setInstances((prev) =>
      prev.map((inst) =>
        inst.id === instanceId
          ? { ...inst, messages: [...inst.messages, userMsg, assistantMsg], input: '', generating: true, error: '' }
          : inst
      )
    );

    try {
      const result = await wllamaCore.createChatCompletion([...instance.messages, userMsg], {
        nPredict: 4096,
        useCache: true,
        sampling: { temp: 0.2 },
        onNewToken(_token, _piece, text) {
          setInstances((prev) =>
            prev.map((inst) => {
              if (inst.id === instanceId) {
                const updated = [...inst.messages];
                if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
                  updated[updated.length - 1].content = text;
                }
                return { ...inst, messages: updated };
              }
              return inst;
            })
          );
        },
      });

      setInstances((prev) =>
        prev.map((inst) => {
          if (inst.id === instanceId) {
            const updated = [...inst.messages];
            if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
              updated[updated.length - 1].content = result;
            }
            return { ...inst, messages: updated, generating: false };
          }
          return inst;
        })
      );
    } catch (err) {
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === instanceId
            ? {
                ...inst,
                error: (err as Error)?.message || '生成失败',
                messages: inst.messages.slice(0, -2),
                generating: false,
              }
            : inst
        )
      );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-3">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-lg font-semibold mb-2">多实例 Demo</h1>
          <div className="text-sm text-gray-600">
            当前实例数: {wllamaCoreFactory.getInstanceCount()} | 每个实例可以独立加载模型和进行对话
          </div>
        </div>
      </div>

      {/* Chat Instances */}
      <div className="flex-1 overflow-scroll grid grid-cols-2 gap-4 p-4">
        {instances.map((instance) => {
          const wllamaCore = instanceRefs.current.get(instance.id);
          return (
            <div key={instance.id} className="flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm">
              {/* Instance Header */}
              <div className="border-b border-gray-200 p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">实例: {instance.id}</span>
                    <span className="text-xs text-gray-500">ID: {wllamaCore?.getInstanceId()}</span>
                  </div>
                  {instance.isModelLoaded && (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">✓ 已加载</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 px-2 py-1 bg-blue-600 text-white text-xs rounded cursor-pointer hover:bg-blue-700 disabled:opacity-50">
                    {instance.loading ? '加载中...' : '加载模型'}
                    <input
                      type="file"
                      className="hidden"
                      accept=".gguf"
                      multiple
                      onChange={(e) => loadModel(instance.id, Array.from(e.target.files || []))}
                      disabled={instance.loading}
                    />
                  </label>
                </div>
                {instance.modelName && (
                  <div className="mt-2 text-xs text-gray-600">模型: {instance.modelName}</div>
                )}
                {instance.error && <div className="mt-2 text-xs text-red-600">{instance.error}</div>}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-auto p-3 space-y-2">
                {!instance.messages.length && (
                  <div className="text-center text-gray-400 mt-10 text-xs">
                    {instance.isModelLoaded ? '输入消息开始对话' : '请先加载模型'}
                  </div>
                )}
                {instance.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded px-2 py-1.5 text-xs ${
                        msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {!msg.content && instance.generating && i === instance.messages.length - 1 ? (
                        <div className="flex gap-1">
                          <span className="w-1 h-1 bg-current rounded-full animate-pulse"></span>
                          <span className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="border-t border-gray-200 p-2">
                {instance.generating && (
                  <button
                    className="w-full mb-2 px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
                    onClick={() => wllamaCore?.stopGeneration()}
                  >
                    停止生成
                  </button>
                )}
                <div className="flex gap-2">
                  <textarea
                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded resize-none focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
                    placeholder={instance.isModelLoaded ? '输入消息...' : '请先加载模型'}
                    value={instance.input}
                    onChange={(e) =>
                      setInstances((prev) =>
                        prev.map((inst) => (inst.id === instance.id ? { ...inst, input: e.target.value } : inst))
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send(instance.id);
                      }
                    }}
                    disabled={!instance.isModelLoaded || instance.generating}
                    rows={2}
                  />
                  <button
                    className="px-3 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    onClick={() => send(instance.id)}
                    disabled={!instance.isModelLoaded || instance.generating || !instance.input.trim()}
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
