"use client"
import { useState, useRef, useEffect } from 'react';
import { WllamaCore, Message, WLLAMA_CONFIG_PATHS, cacheManager, CacheEntry, toHumanReadableSize } from '@/wllama-core';

export default function LoadFromCache() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [modelName, setModelName] = useState<string>('');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [loadingCache, setLoadingCache] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CacheEntry | null>(null);
  const wllamaCoreRef = useRef<WllamaCore | null>(null);

  useEffect(() => {
    wllamaCoreRef.current = new WllamaCore({ paths: WLLAMA_CONFIG_PATHS });
    loadCacheEntries();
    return () => {
      wllamaCoreRef.current?.unloadModel().catch(() => {});
    };
  }, []);

  const loadCacheEntries = async () => {
    setLoadingCache(true);
    try {
      const entries = await cacheManager.list();
      setCacheEntries(entries);
    } catch (error) {
      setError(`加载缓存列表失败: ${(error as Error).message}`);
    } finally {
      setLoadingCache(false);
    }
  };

  const loadModelFromCache = async (entry: CacheEntry) => {
    if (!wllamaCoreRef.current) return;
    
    setLoading(true);
    setError('');
    setSelectedEntry(entry);
    
    try {
      // Get the file from cache
      const cachedFile = await cacheManager.open(entry.name);
      if (!cachedFile) {
        throw new Error('无法从缓存中读取文件');
      }

      // Load model from cached file
      await wllamaCoreRef.current.loadModelFromFiles([cachedFile], { n_ctx: 4096, n_batch: 128 });
      
      const metadata = wllamaCoreRef.current.getModelMetadata();
      const displayName = entry.metadata.originalURL 
        ? entry.metadata.originalURL.split('/').pop()?.replace('.gguf', '') || entry.name
        : entry.name.replace(/^[^_]+_/, '').replace('.gguf', '');
      
      setModelName(metadata?.name || displayName);
      setIsModelLoaded(true);
      setMessages([]); // Clear previous messages
    } catch (err) {
      setError((err as Error)?.message || '加载失败');
      setIsModelLoaded(false);
      setSelectedEntry(null);
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    if (!input.trim() || generating || !wllamaCoreRef.current || !isModelLoaded) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setGenerating(true);
    setError('');

    try {
      const result = await wllamaCoreRef.current.createChatCompletion([...messages, userMsg], {
        nPredict: 4096,
        useCache: true,
        sampling: { temp: 0.2 },
        onNewToken(_token, _piece, text) {
          setMessages((prev) => {
            const updated = [...prev];
            if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
              updated[updated.length - 1].content = text;
            }
            return updated;
          });
        },
      });
      setMessages((prev) => {
        const updated = [...prev];
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
          updated[updated.length - 1].content = result;
        }
        return updated;
      });
    } catch (err) {
      setError((err as Error)?.message || '生成失败');
      setMessages((prev) => prev.slice(0, -2));
    } finally {
      setGenerating(false);
    }
  };

  const getDisplayName = (entry: CacheEntry): string => {
    if (entry.metadata.originalURL) {
      return entry.metadata.originalURL.split('/').pop()?.replace('.gguf', '') || entry.name;
    }
    return entry.name.replace(/^[^_]+_/, '').replace('.gguf', '');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-3">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex items-center gap-3">
            <button
              className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 disabled:opacity-50"
              onClick={loadCacheEntries}
              disabled={loadingCache}
            >
              {loadingCache ? '加载中...' : '刷新缓存列表'}
            </button>
            {isModelLoaded && (
              <span className="text-sm text-green-600">✓ {modelName || '已加载'}</span>
            )}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>

          {cacheEntries.length > 0 ? (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {cacheEntries.map((entry) => {
                const displayName = getDisplayName(entry);
                const isSelected = selectedEntry?.name === entry.name;
                return (
                  <button
                    key={entry.name}
                    className={`w-full text-left px-3 py-2 text-sm rounded border transition-colors ${
                      isSelected && isModelLoaded
                        ? 'bg-blue-50 border-blue-500'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    onClick={() => loadModelFromCache(entry)}
                    disabled={loading}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate flex-1">{displayName}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        {toHumanReadableSize(entry.size)}
                      </span>
                    </div>
                    {entry.metadata.originalURL && (
                      <div className="text-xs text-gray-400 truncate mt-1">
                        {entry.metadata.originalURL}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-400 text-center py-4">
              {loadingCache ? '加载中...' : '暂无缓存模型，请先在缓存管理页面导入模型'}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-2">
          {!messages.length && (
            <div className="text-center text-gray-400 mt-20 text-sm">
              {isModelLoaded ? '输入消息开始对话' : '请先从缓存中选择并加载模型'}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded px-3 py-2 text-sm ${
                  msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200'
                }`}
              >
                {!msg.content && generating && i === messages.length - 1 ? (
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse"></span>
                    <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-3">
        <div className="max-w-3xl mx-auto">
          {generating && (
            <button
              className="w-full mb-2 px-3 py-1.5 text-sm border border-gray-200 rounded hover:bg-gray-50"
              onClick={() => wllamaCoreRef.current?.stopGeneration()}
            >
              停止生成
            </button>
          )}
          <div className="flex gap-2">
            <textarea
              className="flex-1 px-3 text-sm border border-gray-200 rounded resize-none focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
              placeholder={isModelLoaded ? '输入消息...' : '请先加载模型'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={!isModelLoaded || generating}
              rows={2}
            />
            <button
              className="px-4 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              onClick={send}
              disabled={!isModelLoaded || generating || !input.trim()}
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

