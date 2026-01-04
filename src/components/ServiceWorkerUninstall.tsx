'use client'

import { Button, message } from 'antd';
import { useState, useEffect } from 'react';

/**
 * Service Worker 卸载组件
 * 可以在设置页面或开发者工具中使用
 */
export default function ServiceWorkerUninstall() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkStatus();

    // 监听 Service Worker 状态变化事件
    const handleStatusChange = () => {
      checkStatus();
    };

    window.addEventListener('sw-status-change', handleStatusChange);
    
    // 定期检查状态（作为备用）
    const interval = setInterval(checkStatus, 2000);

    return () => {
      window.removeEventListener('sw-status-change', handleStatusChange);
      clearInterval(interval);
    };
  }, []);

  const checkStatus = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        setIsRegistered(!!registration);
      } catch (error) {
        console.error('检查 Service Worker 状态失败:', error);
      }
    }
  };

  const handleUninstall = async () => {
    setLoading(true);
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          const unregistered = await registration.unregister();
          if (unregistered) {
            // 清除所有缓存
            if ('caches' in window) {
              const cacheNames = await caches.keys();
              await Promise.all(
                cacheNames.map(cacheName => caches.delete(cacheName))
              );
            }
            setIsRegistered(false);
            // 触发状态变化事件
            window.dispatchEvent(new Event('sw-status-change'));
            message.success('Service Worker 已卸载，正在刷新页面...');
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          } else {
            message.error('卸载失败');
            setLoading(false);
          }
        } else {
          message.warning('没有已注册的 Service Worker');
          setLoading(false);
        }
      }
    } catch (error) {
      console.error('卸载失败:', error);
      message.error('卸载失败');
      setLoading(false);
    }
  };

  if (!isRegistered) {
    return (
      <div>
        <p style={{ margin: 0, color: '#999' }}>当前没有注册的 Service Worker</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ marginBottom: '12px', color: '#666' }}>
        Service Worker 已注册，提供离线缓存功能
      </p>
      <Button 
        type="primary" 
        danger 
        onClick={handleUninstall}
        loading={loading}
        size="small"
      >
        卸载 Service Worker
      </Button>
    </div>
  );
}

