"use client"
import { useState, useRef, useEffect } from 'react';
import { WllamaCore, Message, WLLAMA_CONFIG_PATHS } from '@/wllama-core';

export default function MinimalExample() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [modelName, setModelName] = useState<string>('');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const wllamaCoreRef = useRef<WllamaCore | null>(null);

  useEffect(() => {
    wllamaCoreRef.current = new WllamaCore({ paths: WLLAMA_CONFIG_PATHS });
    return () => {
      wllamaCoreRef.current?.unloadModel().catch(() => {});
    };
  }, []);

  const loadModel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !wllamaCoreRef.current) return;
    setLoading(true);
    setError('');
    try {
      await wllamaCoreRef.current.loadModelFromFiles(files, { n_ctx: 4096, n_batch: 128 });
      const metadata = wllamaCoreRef.current.getModelMetadata();
      setModelName(metadata?.name || files[0].name.replace('.gguf', ''));
      setIsModelLoaded(true);
    } catch (err) {
      setError((err as Error)?.message || '加载失败');
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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <label className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded cursor-pointer hover:bg-blue-700 disabled:opacity-50">
            {loading ? '加载中...' : '加载GGUF模型'}
            <input type="file" className="hidden" accept=".gguf" multiple onChange={loadModel} disabled={loading} />
          </label>
          {isModelLoaded && <span className="text-sm text-green-600">✓ {modelName || '已加载'}</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-2">
          {!messages.length && (
            <div className="text-center text-gray-400 mt-20 text-sm">
              {isModelLoaded ? '输入消息开始对话' : '请先加载模型'}
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
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded resize-none focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
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
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
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
