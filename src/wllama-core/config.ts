// See: https://vitejs.dev/guide/assets#explicit-url-imports
// 使用 esm 目录下的编译后文件，webpack alias 会将 @wllama/wllama 重定向到 esm
// @ts-ignore - webpack 会处理 ?url 查询参数
import wllamaSingle from '@wllama/wllama/single-thread/wllama.wasm?url';
// @ts-ignore - webpack 会处理 ?url 查询参数
import wllamaMulti from '@wllama/wllama/multi-thread/wllama.wasm?url';

export const WLLAMA_CONFIG_PATHS = {
  'single-thread/wllama.wasm': wllamaSingle,
  'multi-thread/wllama.wasm': wllamaMulti,
};

