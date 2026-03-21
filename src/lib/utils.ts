import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合并 Tailwind CSS 类名工具函数。
 * 结合了 clsx 和 tailwind-merge：首先使用 clsx 处理条件类名，
 * 然后使用 twMerge 解决 Tailwind 样式冲突（例如后续类名覆盖前置类名）。
 *
 * @param inputs - 类名数组、对象或字符串
 * @returns 合并和去重后的最终类名字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 清理包含 JSON 的字符串，移除 Markdown 代码块标记和代码注释。
 * 主要是为了提高对大语言模型 (AI) 生成的非标准或带有额外格式的 JSON 字符串的解析容错率。
 *
 * 核心逻辑：
 * 1. 尝试匹配并提取被 ```json 和 ``` 包裹的真实内容。
 * 2. 如果没有严格的包裹结构，则强行移除所有的 ```json 和 ``` 标记。
 * 3. 使用正则替换精准剥离单行 (//) 和多行 (/* *\/) 注释，同时利用正则分组匹配特性巧妙避开字符串字面量内部的类似字符。
 *
 * @param jsonString - 待处理的原始 JSON 字符串
 * @returns 清理完成的纯净 JSON 字符串
 */
export function cleanAIJson(jsonString: string): string {
  let clean = jsonString.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
  const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    clean = match[1].trim();
  } else {
    clean = clean.replace(/```json/gi, '').replace(/```/g, '').trim();
  }

  clean = clean.replace(/\\.|"(?:\\.|[^"\\])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g1) => {
    if (g1) return "";
    return m;
  });

  return clean.trim();
}

/**
 * 安全地解析由大语言模型生成的 JSON 字符串。
 * 内部会先调用 cleanAIJson 方法去除无关的 Markdown 标记和注释内容，然后再执行标准的 JSON.parse。
 * 若解析失败，则抛出带有具体错误信息的异常。
 *
 * @template T - 期望返回的数据结构类型，默认为 any
 * @param jsonString - 待解析的 AI 响应字符串
 * @returns 解析并转换为对象的指定类型数据
 * @throws 当清理后的字符串仍不符合合法 JSON 格式时，抛出包含详细原因的 Error
 */
export function parseAIJson<T = any>(jsonString: string): T {
  try {
    const clean = cleanAIJson(jsonString);
    return JSON.parse(clean);
  } catch (e) {
    throw new Error("Invalid AI JSON: " + (e instanceof Error ? e.message : String(e)));
  }
}
