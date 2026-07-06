/**
 * 结构化工具错误。
 *
 * 项目里所有工具原本用 `throw new Error(msg)` 表达失败，全局 catch 只能拿到
 * `error.message` 字符串，结构化诊断信息（错误类型、详情、恢复建议）全部丢失。
 *
 * `ToolError` 携带 type / details / suggestion 三个额外字段；在工具执行 catch 处
 * 调用 {@link serializeToolError} 即可把它们原样回传给大模型。普通 Error 仍保持
 * 旧行为（`{ error: <message> }`），完全向后兼容。
 */

export interface ToolErrorDetails {
  [key: string]: any;
}

export class ToolError extends Error {
  /** 机器可读的错误类型，如 search_not_found / ambiguous_match / entity_not_found */
  readonly type: string;
  /** 结构化补充信息（行号、相似度、所有命中位置等），供调用方程序化处理 */
  readonly details?: ToolErrorDetails;
  /** 建议的恢复操作，用自然语言写明下一步该怎么做 */
  readonly suggestion?: string;

  constructor(
    type: string,
    message: string,
    details?: ToolErrorDetails,
    suggestion?: string,
  ) {
    super(message);
    this.name = 'ToolError';
    this.type = type;
    if (details) this.details = details;
    if (suggestion) this.suggestion = suggestion;
  }
}

/** 构造一个 ToolError 的便捷工厂。 */
export function toolError(
  type: string,
  message: string,
  details?: ToolErrorDetails,
  suggestion?: string,
): ToolError {
  return new ToolError(type, message, details, suggestion);
}

/**
 * 在工具执行 catch 处统一序列化错误：
 *  - ToolError → `{ error: { type, message, details?, suggestion? } }`
 *  - 普通 Error / 其它 → `{ error: <message> }`（保持原行为，向后兼容）
 */
export function serializeToolError(error: any): { error: any } {
  if (error instanceof ToolError) {
    const err: any = { type: error.type, message: error.message };
    if (error.details !== undefined) err.details = error.details;
    if (error.suggestion !== undefined) err.suggestion = error.suggestion;
    return { error: err };
  }
  return { error: error?.message ?? String(error) };
}
