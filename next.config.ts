import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // 修复 @wllama/wllama 包的导入问题（仅处理主模块导入）
    // 包的 index.ts 试图从 ./src 导入，需要重定向到编译后的 esm 目录
    config.resolve.alias = {
      ...config.resolve.alias,
    };

    // 文件监听优化
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**'],
      aggregateTimeout: 300,
      poll: 1000,
    };

    return config;
  },
};

export default nextConfig;
