'use client'

import { useEffect, useState, useRef } from 'react';

interface ServiceWorkerManagerProps {
  swPath?: string;
}

const isPWA = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.matchMedia('(display-mode: minimal-ui)').matches ||
         (window.navigator as any).standalone === true;
};

export default function ServiceWorkerManager({ swPath = '/sw.js' }: ServiceWorkerManagerProps) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const registeringRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkAndManageSW = async () => {
      const existingReg = await navigator.serviceWorker.getRegistration();
      const currentIsPWA = isPWA();

      // 如果不在 PWA 环境但已注册，则卸载
      if (!currentIsPWA && existingReg) {
        console.log('不在 PWA 环境，卸载 Service Worker');
        try {
          await existingReg.unregister();
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
          setRegistration(null);
          console.log('Service Worker 已卸载');
          // 触发状态变化事件
          window.dispatchEvent(new Event('sw-status-change'));
        } catch (error) {
          console.error('卸载 Service Worker 失败:', error);
        }
        return;
      }

      // 如果已注册，更新状态
      if (existingReg) {
        setRegistration(existingReg);
        // 触发状态变化事件
        window.dispatchEvent(new Event('sw-status-change'));
        return;
      }

      // 只在 PWA 环境注册
      if (!currentIsPWA || registeringRef.current) return;

      registeringRef.current = true;
      try {
        const reg = await navigator.serviceWorker.register(swPath);
        setRegistration(reg);
        console.log('Service Worker 注册成功（PWA 环境）', reg);
        
        // 触发状态变化事件
        window.dispatchEvent(new Event('sw-status-change'));
        
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('发现新版本，请刷新页面');
            }
          });
        });
      } catch (error) {
        console.error('Service Worker 注册失败:', error);
      } finally {
        registeringRef.current = false;
      }
    };

    checkAndManageSW();

    // 监听 display-mode 变化
    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const minimalUIMedia = window.matchMedia('(display-mode: minimal-ui)');
    
    const handleMediaChange = () => {
      checkAndManageSW();
    };

    standaloneMedia.addEventListener('change', handleMediaChange);
    minimalUIMedia.addEventListener('change', handleMediaChange);

    // 暴露全局方法
    (window as any).swManager = {
      unregister: async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        
        await reg.unregister();
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        window.location.reload();
      },
      status: () => ({
        isRegistered: !!registration,
        registration,
        isPWA: isPWA(),
      }),
    };

    return () => {
      standaloneMedia.removeEventListener('change', handleMediaChange);
      minimalUIMedia.removeEventListener('change', handleMediaChange);
    };
  }, [swPath, registration]);

  return null;
}

