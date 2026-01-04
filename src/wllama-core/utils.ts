import { Template } from '@huggingface/jinja';
import { Wllama } from '@wllama/wllama/esm';
import { Message } from './types';

export const DEFAULT_CHAT_TEMPLATE =
  "{% for message in messages %}{{'<|im_start|>' + message['role'] + '\n' + message['content'] + '<|im_end|>' + '\n'}}{% endfor %}{% if add_generation_prompt %}{{ '<|im_start|>assistant\n' }}{% endif %}";

export async function formatChat(
  wllama: Wllama,
  messages: Message[]
): Promise<string> {
  const templateStr = wllama.getChatTemplate() ?? DEFAULT_CHAT_TEMPLATE;
  
  // dirty patch for DeepSeek model (crash on @huggingface/jinja)
  const isDeepSeekR1 =
    templateStr.match(/<\|redacted_Assistant\|>/) &&
    templateStr.match(/<\|redacted_User\|>/) &&
    templateStr.match(/<\/think>/);
  
  if (isDeepSeekR1) {
    let result = '';
    for (const message of messages) {
      if (message.role === 'system') {
        result += `${message.content}\n\n`;
      } else if (message.role === 'user') {
        result += `<｜User｜>${message.content}`;
      } else {
        result += `<｜Assistant｜>${message.content.split('</think>').pop()}<｜end▁of▁sentence｜>`;
      }
    }
    return result + '<｜Assistant｜>';
  }
  
  const template = new Template(templateStr);
  const bos_token: string = await wllama.detokenize(
    [wllama.getBOS()],
    true
  );
  const eos_token: string = await wllama.detokenize(
    [wllama.getEOS()],
    true
  );
  
  return template.render({
    messages,
    bos_token,
    eos_token,
    add_generation_prompt: true,
  });
};

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const toHumanReadableSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

export const DebugLogger = {
  content: [] as string[],
  debug(...args: any) {
    console.debug('🔧', ...args);
    DebugLogger.content.push(`🔧 ${DebugLogger.argsToStr(args)}`);
  },
  log(...args: any) {
    console.log('ℹ️', ...args);
    DebugLogger.content.push(`ℹ️ ${DebugLogger.argsToStr(args)}`);
  },
  warn(...args: any) {
    console.warn('⚠️', ...args);
    DebugLogger.content.push(`⚠️ ${DebugLogger.argsToStr(args)}`);
  },
  error(...args: any) {
    console.error('☠️', ...args);
    DebugLogger.content.push(`☠️ ${DebugLogger.argsToStr(args)}`);
  },
  argsToStr(args: any[]): string {
    return args
      .map((arg) => {
        if (arg && typeof arg === 'string') {
          return arg;
        } else {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (_) {
            return String(arg);
          }
        }
      })
      .join(' ');
  },
};

