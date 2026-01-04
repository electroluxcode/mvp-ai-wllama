'use client'

import StudioLayout from '@/components/StudioLayout';
import { useEffect } from 'react';
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    // 动态添加 PWA 相关标签
    if (typeof document === 'undefined') return;
    // 添加 manifest 链接
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = '/manifest.json';
      document.head.appendChild(manifest);
    }
  }, []);

  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <StudioLayout>{children}</StudioLayout>
      </body>
    </html>
  );
}
