import { db } from '@/db';
import { AI_ONLY_HINT_PREFIX } from '@/lib/utils';

function visibleContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap(part => {
      if (!part || typeof part !== 'object') return [];
      const typedPart = part as { type?: string; text?: string };
      if (typedPart.type !== 'text' || !typedPart.text || typedPart.text.startsWith(AI_ONLY_HINT_PREFIX)) return [];
      return [typedPart.text];
    })
    .join('\n\n');
}

export async function buildChatTranscript(sessionId: string): Promise<string> {
  const session = await db.chatSessions.get(sessionId);
  const messages = await db.chatMessages.where('sessionId').equals(sessionId).sortBy('createdAt');
  const body = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => {
      const content = visibleContent(message.content).trim();
      if (!content) return '';
      return `${message.role === 'user' ? '用户' : 'AI'}：\n${content}`;
    })
    .filter(Boolean)
    .join('\n\n');
  return `${session?.title || 'AI 对话'}\n\n${body}`.trim();
}
