import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    // 修复 @wllama/wllama 包的导入问题
    // 包的 index.ts 试图从 ./src 导入，但应该使用编译后的 esm 目录
    const wllamaEsmPath = path.resolve(
      __dirname,
      'node_modules/@wllama/wllama/esm'
    );
    const wllamaEsmIndexPath = path.resolve(
      __dirname,
      'node_modules/@wllama/wllama/esm/index.js'
    );
    
    // 对于主模块导入，指向 index.js
    // 对于子路径（如 single-thread/wllama.wasm），指向 esm 目录
    config.resolve.alias = {
      ...config.resolve.alias,
      // 主模块导入
      '@wllama/wllama$': wllamaEsmIndexPath,
      '@wllama/wllama/esm$': wllamaEsmIndexPath,
      // 子路径导入（如 single-thread/wllama.wasm）
      '@wllama/wllama/esm': wllamaEsmPath,
      '@wllama/wllama': wllamaEsmPath,
    };
    
    // 确保 webpack 能正确解析模块
    if (!config.resolve.extensions) {
      config.resolve.extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
    }

    // 配置 WASM 文件处理
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    // 处理 ?url 查询参数
    config.module.rules.push({
      resourceQuery: /url/,
      type: 'asset/resource',
    });

    // 减少文件监听，避免 EMFILE 错误
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/dist/**',
        '**/build/**',
      ],
      aggregateTimeout: 300,
      poll: 1000, // 使用轮询代替文件监听
    };

    return config;
  },
 
};

export default nextConfig;
