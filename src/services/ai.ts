import { AISettings } from "@/db";
import { DEFAULT_MAX_TOKENS, TEMPERATURE } from "./promptConfig";

/**
 * 消息内容片段。
 * 支持多模态消息体，允许单条消息内混合文本和图片链接等多种媒体格式。
 */
export type MessageContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/**
 * 工具调用结构定义。
 * 用于 OpenAI 兼容的 Function Calling 规范，封装 AI 返回的函数调用请求。
 */
export interface ToolCall {
  /** 工具调用的唯一标识符，执行结果需携带该 ID 返回 */
  id: string;
  /** 调用类型，目前主流固定为 'function' */
  type: 'function';
  /** 具体函数调用的核心参数和名称信息 */
  function: {
    /** 注册的工具函数名称 */
    name: string;
    /** 序列化的 JSON 格式的函数参数字符串 */
    arguments: string;
  };
}

/**
 * AI 聊天上下文中单条消息的结构定义。
 * 遵循 OpenAI API 消息体规范，承载会话中的角色扮演及对应的发言内容或工具指令。
 */
export interface Message {
  /** 发送者的身份角色 */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** 
   * 消息具体内容。
   * 支持纯字符串（文本）或者多模态结构体数组，在工具返回场景下允许为 null
   */
  content: string | MessageContentPart[] | null;
  /** 可选的发言者名字，用于多角色场景或区分具体是哪个工具执行的结果 */
  name?: string;
  /** 当前助手回复中附带的工具调用请求数组 */
  tool_calls?: ToolCall[];
  /** 当该消息是工具的执行结果时，需填入对应的调用 ID，以便 AI 将结果与之前的请求对应 */
  tool_call_id?: string;
}

/**
 * AI 服务提供商支持的模型基础信息。
 * 对应获取模型列表 API 的标准响应项。
 */
export interface Model {
  /** 模型的标识符，如 'gpt-4'，在请求生成时需传递该值 */
  id: string;
  /** 对应 API 规范的对象类型，通常为 'model' */
  object: string;
  /** 模型注册的创建时间戳（秒级） */
  created: number;
  /** 模型所有者或组织标识 */
  owned_by: string;
}

/**
 * AI 请求的额外参数选项。
 * 用于覆盖全局设置，满足特定生成场景对 token 或随机性的个性化要求。
 */
export interface AIRequestOptions {
  /** 生成的最高 token 上限，限制输出长度 */
  maxTokens?: number;
  /** 采样温度，控制生成结果的随机性与创造力（范围 0.0 ~ 2.0） */
  temperature?: number;
}

/**
 * 获取当前 AI 配置下所有可用的模型列表。
 * 通过向配置的 API 地址发送 GET 请求，拉取服务器端支持的模型。
 * 
 * @param settings - 包含 API 密钥及 baseUrl 等配置的实体对象
 * @returns 包含各模型详情的列表数据
 * @throws 当鉴权失败或网络不通时抛出异常
 */
export async function getModels(settings: AISettings): Promise<Model[]> {
  if (!settings.apiKey) throw new Error("未配置 API Key");
  
  let url = settings.baseUrl;
  // 规范化 url 处理，移除末尾斜杠
  if (url.endsWith('/')) url = url.slice(0, -1);
  
  // 兼容性处理：若使用 OpenAI 提供商且基础 URL 未包含 API 版本路径，则自动补全 /v1
  if (!url.includes('/v1') && settings.provider === 'openai') {
      url = `${url}/v1`;
  }
  
  try {
    const response = await fetch(`${url}/models`, {
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`
      }
    });
    
    if (!response.ok) {
        throw new Error(`获取模型列表失败: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.data || []; 
  } catch (e) {
    console.error(e);
    throw e;
  }
}

/**
 * 阻塞式的获取 AI 完整回答。
 * 适用于无需流式输出（即时呈现）的场景，如命名生成或结构化数据提取。
 *
 * @param messages - 包含上下文历史的消息数组
 * @param settings - AI 供应商及身份验证等基础配置
 * @param options - 控制生成结果特性的可选覆盖参数
 * @returns AI 生成的完整文本内容
 */
export async function getAICompletion(
  messages: Message[], 
  settings: AISettings, 
  options?: AIRequestOptions
): Promise<string> {
   if (!settings.apiKey) throw new Error("未配置 API Key");

   let url = settings.baseUrl;
   if (url.endsWith('/')) url = url.slice(0, -1);
   
   if (!url.endsWith('/v1') && !url.includes('/v1/') && settings.provider === 'openai') {
        url = `${url}/v1`;
   }

   const maxTokens = options?.maxTokens ?? settings.maxTokens ?? DEFAULT_MAX_TOKENS;
   const temperature = options?.temperature ?? settings.temperature ?? TEMPERATURE.balanced;

   const response = await fetch(`${url}/chat/completions`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${settings.apiKey}`
     },
     body: JSON.stringify({
       model: settings.model,
       messages: messages,
       temperature: temperature,
       max_tokens: maxTokens
     })
   });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`AI 请求失败: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

/**
 * 基于 Server-Sent Events (SSE) 协议的流式 AI 回答生成逻辑。
 * 通过读取分块数据，实现打字机效果并实时处理工具调用指令。
 *
 * @param messages - 对话历史记录
 * @param settings - AI 提供商的相关配置信息
 * @param onChunk - 接收到普通文本分块时的回调函数
 * @param tools - 可选参数，注入给模型可调用的本地或远程工具规范描述
 * @param onToolCallChunk - 接收到工具调用流式数据分块时的回调函数
 * @param options - 额外的推理参数（如 maxTokens 和 temperature）
 */
export async function streamAICompletion(
  messages: Message[], 
  settings: AISettings, 
  onChunk: (chunk: string) => void,
  tools?: any[],
  onToolCallChunk?: (toolCallChunk: any) => void,
  options?: AIRequestOptions
): Promise<void> {
  if (!settings.apiKey) throw new Error("未配置 API Key");

  let url = settings.baseUrl;
  if (url.endsWith('/')) url = url.slice(0, -1);
  
  if (!url.endsWith('/v1') && !url.includes('/v1/') && settings.provider === 'openai') {
       url = `${url}/v1`;
  }

  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = options?.temperature ?? TEMPERATURE.balanced;

  // 构建核心请求负载，强制开启 stream 模式
  const body: any = {
    model: settings.model,
    messages: messages,
    temperature: temperature,
    max_tokens: maxTokens,
    stream: true
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI 请求失败: ${error}`);
  }

  if (!response.body) throw new Error("当前环境不支持 ReadableStream，无法处理流式响应");

  // 使用 Reader 消费流式数据
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  
  // 缓存数据流中可能被截断的字符串片段
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // stream 参数确保了由于网络拆包造成的字节断层能够被正确拼接
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // 最后一行可能是不完整的 JSON 数据，弹出并留在下个循环处理
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        // 忽略空行以及代表流结束的标准标记
        if (trimmedLine === '' || trimmedLine === 'data: [DONE]') continue;
        
        // 提取标准的 SSE 数据包前缀
        if (trimmedLine.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmedLine.slice(6));
            const delta = json.choices[0]?.delta || {};
            
            // 触发普通文本分片回调
            if (delta.content) {
              onChunk(delta.content);
            }
            // 触发工具调用的参数流分片回调
            if (delta.tool_calls && onToolCallChunk) {
              onToolCallChunk(delta.tool_calls);
            }
          } catch (e) {
            console.error('流式数据分块解析异常:', e, '原始行数据:', trimmedLine);
          }
        }
      }
    }
  } finally {
    // 确保无论正常结束或发生异常都能释放流锁
    reader.releaseLock();
  }
}
