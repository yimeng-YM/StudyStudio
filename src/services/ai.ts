import { AISettings } from "@/db";
import { DEFAULT_MAX_TOKENS, TEMPERATURE } from "./promptConfig";

export type MessageContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | MessageContentPart[] | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface AIRequestOptions {
  maxTokens?: number;
  temperature?: number;
}

export async function getModels(settings: AISettings): Promise<Model[]> {
  if (!settings.apiKey) throw new Error("API Key is missing");
  
  let url = settings.baseUrl;
  if (url.endsWith('/')) url = url.slice(0, -1);
  
  // Handle some common baseUrl issues if user inputs just the domain
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
        throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.data || []; 
  } catch (e) {
    console.error(e);
    throw e;
  }
}

export async function getAICompletion(
  messages: Message[], 
  settings: AISettings, 
  options?: AIRequestOptions
): Promise<string> {
   if (!settings.apiKey) throw new Error("API Key is missing");

   let url = settings.baseUrl;
   if (url.endsWith('/')) url = url.slice(0, -1);
   
    // Ensure /v1 is present for standard OpenAI compatible endpoints if missing
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
        throw new Error(`AI Request Failed: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

export async function streamAICompletion(
  messages: Message[], 
  settings: AISettings, 
  onChunk: (chunk: string) => void,
  tools?: any[],
  onToolCallChunk?: (toolCallChunk: any) => void,
  options?: AIRequestOptions
): Promise<void> {
  if (!settings.apiKey) throw new Error("API Key is missing");

  let url = settings.baseUrl;
  if (url.endsWith('/')) url = url.slice(0, -1);
  
  if (!url.endsWith('/v1') && !url.includes('/v1/') && settings.provider === 'openai') {
       url = `${url}/v1`;
  }

  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = options?.temperature ?? TEMPERATURE.balanced;

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
    throw new Error(`AI Request Failed: ${error}`);
  }

  if (!response.body) throw new Error("ReadableStream not supported");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '' || trimmedLine === 'data: [DONE]') continue;
        
        if (trimmedLine.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmedLine.slice(6));
            const delta = json.choices[0]?.delta || {};
            
            if (delta.content) {
              onChunk(delta.content);
            }
            if (delta.tool_calls && onToolCallChunk) {
              onToolCallChunk(delta.tool_calls);
            }
          } catch (e) {
            console.error('Error parsing stream chunk', e, 'Line:', trimmedLine);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
