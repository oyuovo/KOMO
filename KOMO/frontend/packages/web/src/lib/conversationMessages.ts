import type { MessageData } from '@komo/shared/api-client';
import type { ConversationStreamState } from './conversationStream';

/** Reconcile against server identity, never against fetch time or an old reply. */
export function mergeConversationMessages(
  messages: MessageData[], stream: ConversationStreamState | null, conversationId: string | null,
): MessageData[] {
  const saved = messages.filter(message => message.conversationId === conversationId);
  if (!stream || stream.conversationId !== conversationId) return saved;
  if (stream.assistantMessageId && saved.some(message => message.id === stream.assistantMessageId)) return saved;
  if (stream.phase === 'error' && !stream.aiContent) return saved;
  const previous = new Set(stream.previousMessageIds);
  const userSaved = saved.some(message => !previous.has(message.id)
    && message.role === 'USER' && message.content === stream.userContent);
  const common = { conversationId: stream.conversationId, tokensUsed: null,
    createdAt: new Date(stream.startedAt).toISOString() };
  return [...saved,
    ...(!userSaved ? [{ ...common, id: `stream-user-${stream.startedAt}`,
      role: 'USER' as const, content: stream.userContent }] : []),
    { ...common, id: `stream-ai-${stream.startedAt}`, role: 'ASSISTANT' as const,
      content: stream.aiContent, readingContext: stream.readingContext },
  ];
}
