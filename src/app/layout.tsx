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
    
    // 如果域名包含 github，使用 GitHub Pages 路径
    const isGitHub = window.location.hostname.includes('github');
    const manifestPath = isGitHub ? '/mvp-ai-wllama/manifest.json' : '/manifest.json';
    
    // 添加或更新 manifest 链接
    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestPath;
  }, []);

  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <StudioLayout>{children}</StudioLayout>
      </body>
    </html>
  );
}
