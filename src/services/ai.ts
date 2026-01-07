import { AISettings } from "@/db";

export type MessageContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | MessageContentPart[];
}

export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
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

export async function getAICompletion(messages: Message[], settings: AISettings): Promise<string> {
   if (!settings.apiKey) throw new Error("API Key is missing");

   let url = settings.baseUrl;
   if (url.endsWith('/')) url = url.slice(0, -1);
   
    // Ensure /v1 is present for standard OpenAI compatible endpoints if missing
   if (!url.endsWith('/v1') && !url.includes('/v1/') && settings.provider === 'openai') {
        url = `${url}/v1`;
   }

   const response = await fetch(`${url}/chat/completions`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${settings.apiKey}`
     },
     body: JSON.stringify({
       model: settings.model,
       messages: messages,
       temperature: 0.7
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
  onChunk: (chunk: string) => void
): Promise<void> {
  if (!settings.apiKey) throw new Error("API Key is missing");

  let url = settings.baseUrl;
  if (url.endsWith('/')) url = url.slice(0, -1);
  
  if (!url.endsWith('/v1') && !url.includes('/v1/') && settings.provider === 'openai') {
       url = `${url}/v1`;
  }

  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: messages,
      temperature: 0.7,
      stream: true
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI Request Failed: ${error}`);
  }

  if (!response.body) throw new Error("ReadableStream not supported");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.trim() === 'data: [DONE]') continue;
        
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            const content = json.choices[0]?.delta?.content || '';
            if (content) onChunk(content);
          } catch (e) {
            console.error('Error parsing stream chunk', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
