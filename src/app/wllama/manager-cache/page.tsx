"use client"
import { useState, useEffect, useRef } from 'react';
import { cacheManager, CacheEntry, toHumanReadableSize } from '@/wllama-core';
import { Button, Table, Space, Popconfirm, message } from 'antd';
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

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <span className="font-mono text-sm">{text}</span>
      ),
    },
    {
      title: '原始URL',
      dataIndex: ['metadata', 'originalURL'],
      key: 'originalURL',
      render: (url: string) => (
        <span className="text-xs text-gray-600 truncate max-w-md block" title={url}>
          {url || '-'}
        </span>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => toHumanReadableSize(size),
    },
    {
      title: '原始大小',
      dataIndex: ['metadata', 'originalSize'],
      key: 'originalSize',
      render: (size: number) => size > 0 ? toHumanReadableSize(size) : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: CacheEntry) => (
        <Popconfirm
          title="确定删除这个缓存文件吗？"
          onConfirm={() => handleDelete(record)}
          okText="确定"
          cancelText="取消"
        >
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            size="small"
          >
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const totalSize = cacheEntries.reduce((sum, entry) => sum + entry.size, 0);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="w-full mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">模型缓存管理</h1>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadCache}
                loading={loading}
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
                  <Button danger icon={<DeleteOutlined />}>
                    清空所有
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              缓存文件: {cacheEntries.length} | 总大小: {toHumanReadableSize(totalSize)}
            </span>
            <div className="flex-1 flex gap-2">
              <label className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded cursor-pointer hover:bg-blue-700 disabled:opacity-50">
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
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
                placeholder="输入模型URL..."
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                disabled={importing}
                onKeyDown={(e) => e.key === 'Enter' && handleImportFromUrl()}
              />
              <button
                className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
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

      <div className="flex-1 overflow-scroll p-4">
        <div className="w-full">
          {cacheEntries.length === 0 ? (
            <div className="text-center text-gray-400 mt-20">
              <p>暂无缓存文件</p>
              <p className="text-sm mt-2">从 URL 加载模型时会自动缓存</p>
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={cacheEntries}
              rowKey="name"
              loading={loading}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

