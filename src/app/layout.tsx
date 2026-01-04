'use client'

import StudioLayout from '@/components/StudioLayout';
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <StudioLayout>{children}</StudioLayout>
      </body>
    </html>
  );
}
