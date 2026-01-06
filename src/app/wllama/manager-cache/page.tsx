"use client"
import { useState, useEffect, useRef } from 'react';
import { cacheManager, CacheEntry, toHumanReadableSize } from '@/wllama-core';
import { Button, Space, Popconfirm, message, Spin } from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';

export default function CacheManager() {
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<number>(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCache = async () => {
    setLoading(true);
    try {
      const entries = await cacheManager.list();
      setCacheEntries(entries);
    } catch (error) {
      message.error(`加载缓存失败: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCache();
  }, []);

  const handleDelete = async (entry: CacheEntry) => {
    try {
      await cacheManager.delete(entry.name);
      message.success('删除成功');
      await loadCache();
    } catch (error) {
      message.error(`删除失败: ${(error as Error).message}`);
    }
  };

  const handleClearAll = async () => {
    try {
      await cacheManager.clear();
      message.success('清空成功');
      await loadCache();
    } catch (error) {
      message.error(`清空失败: ${(error as Error).message}`);
    }
  };

  const handleImportFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setImporting(true);
    try {
      const file = files[0];
      // Use file name as URL identifier
      const url = `/${file.name}`;
      
      // Save to cache
      await cacheManager.write(url, file, {
        etag: '',
        originalSize: file.size,
        originalURL: url,
      });

      message.success('导入成功');
      await loadCache();
    } catch (error) {
      message.error(`导入失败: ${(error as Error).message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleImportFromUrl = async () => {
    if (!importUrl.trim()) {
      message.warning('请输入URL');
      return;
    }

    setImporting(true);
    setDownloadProgress(0);
    try {
      await cacheManager.download(importUrl, {
        progressCallback: (progress) => {
          const percent = progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0;
          setDownloadProgress(percent);
        },
      });
      message.success('下载并缓存成功');
      setImportUrl('');
      await loadCache();
    } catch (error) {
      message.error(`下载失败: ${(error as Error).message}`);
    } finally {
      setImporting(false);
      setDownloadProgress(-1);
    }
  };

  const totalSize = cacheEntries.reduce((sum, entry) => sum + entry.size, 0);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 p-3 md:p-4">
        <div className="w-full mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h1 className="text-lg md:text-xl font-semibold">模型缓存管理</h1>
            <Space className="flex-wrap">
              <Button
                icon={<ReloadOutlined />}
                onClick={loadCache}
                loading={loading}
                size="small"
              >
                刷新
              </Button>
              {cacheEntries.length > 0 && (
                <Popconfirm
                  title="确定清空所有缓存吗？此操作不可恢复！"
                  onConfirm={handleClearAll}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button danger icon={<DeleteOutlined />} size="small">
                    清空所有
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-xs md:text-sm text-gray-600">
              缓存文件: {cacheEntries.length} | 总大小: {toHumanReadableSize(totalSize)}
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <label className="px-3 py-1.5 bg-blue-600 text-white text-xs md:text-sm rounded cursor-pointer hover:bg-blue-700 disabled:opacity-50 text-center whitespace-nowrap">
                {importing ? '导入中...' : '从文件导入'}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".gguf"
                  onChange={handleImportFromFile}
                  disabled={importing}
                />
              </label>
              <input
                type="text"
                className="flex-1 px-3 py-1.5 text-xs md:text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
                placeholder="输入模型URL..."
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                disabled={importing}
                onKeyDown={(e) => e.key === 'Enter' && handleImportFromUrl()}
              />
              <button
                className="px-4 py-1.5 bg-blue-600 text-white text-xs md:text-sm rounded hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                onClick={handleImportFromUrl}
                disabled={importing || !importUrl.trim()}
              >
                {importing ? '下载中...' : '从URL下载'}
              </button>
            </div>
          </div>
          {importing && downloadProgress >= 0 && (
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 md:p-4">
        <div className="w-full">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Spin size="large" />
            </div>
          ) : cacheEntries.length === 0 ? (
            <div className="text-center text-gray-400 mt-20">
              <p>暂无缓存文件</p>
              <p className="text-sm mt-2">从 URL 加载模型时会自动缓存</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {cacheEntries.map((entry) => (
                <div
                  key={entry.name}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">文件名</div>
                      <div className="font-mono text-sm break-all text-gray-900">
                        {entry.name}
                      </div>
                    </div>
                    
                    {entry.metadata.originalURL && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">原始URL</div>
                        <div className="text-xs text-gray-600 break-all" title={entry.metadata.originalURL}>
                          {entry.metadata.originalURL}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-100">
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 mb-1">大小</div>
                        <div className="text-sm font-medium">
                          {toHumanReadableSize(entry.size)}
                        </div>
                      </div>
                      
                      {entry.metadata.originalSize > 0 && (
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 mb-1">原始大小</div>
                          <div className="text-sm font-medium">
                            {toHumanReadableSize(entry.metadata.originalSize)}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="pt-2 border-t border-gray-100">
                      <Popconfirm
                        title="确定删除这个缓存文件吗？"
                        onConfirm={() => handleDelete(entry)}
                        okText="确定"
                        cancelText="取消"
                      >
                        <Button
                          type="link"
                          danger
                          icon={<DeleteOutlined />}
                          size="small"
                          className="p-0"
                        >
                          删除
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

