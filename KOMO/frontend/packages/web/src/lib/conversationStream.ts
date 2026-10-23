/**
 * 对话流式输出全局单例 — SSE fetch reader 与页面组件解耦。
 *
 * 为什么存在：此前 reader 生命周期绑定在 conversations/[id] 页面组件上，
 * 切换页面（组件 unmount）后流式状态丢失，返回页面时看不到正在生成/刚完成的回复。
 * 现在流状态存放在模块级 store：unmount 不中断读取，组件通过
 * useSyncExternalStore 订阅，重新挂载即恢复展示。
 * 后端（ConversationService.streamMessage）在客户端断连时仍会完整落库，
 * 流结束后页面重新拉取消息即可拿到完整回复。
 */
import { authenticatedFetch } from '@komo/shared/api-client';
import { SseDecoder } from './sse';

export interface ConversationStreamState {
  conversationId: string;
  /** 用户发送的内容（乐观渲染 + 失败时恢复输入框） */
  userContent: string;
  /** 已累积的 AI 回复 */
  aiContent: string;
  readingContext?: string;
  /** IDs observed before sending; timestamps cannot prove persistence. */
  previousMessageIds: string[];
  assistantMessageId?: string;
  phase: 'streaming' | 'done' | 'error';
  error: string | null;
  startedAt: number;
}

/** 以 conversationId 为键，支持多个对话各自独立流式 */
type StreamMap = Record<string, ConversationStreamState>;

class ConversationStreamStore {
  private streams: StreamMap = {};
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): StreamMap => this.streams;

  /** SSR 预渲染阶段无流状态（模块单例在服务端进程内共享，必须恒定） */
  getServerSnapshot = (): StreamMap => EMPTY_STREAMS;

  isActive(conversationId: string): boolean {
    return this.streams[conversationId]?.phase === 'streaming';
  }

  /** 清除指定对话的流状态（页面在服务端消息对齐后调用） */
  clear(conversationId: string, expected?: ConversationStreamState): void {
    if (expected && this.streams[conversationId] !== expected) return;
    if (!(conversationId in this.streams)) return;
    const next = { ...this.streams };
    delete next[conversationId];
    this.streams = next;
    this.emit();
  }

  /**
   * 发起流式请求。reader 存活于模块级，组件 unmount 不中断。
   * 同一对话同时只允许一个活跃流；网络层异常在内部消化，不会抛出。
   */
  async start(conversationId: string, content: string, previousMessageIds: string[] = []): Promise<void> {
    if (this.isActive(conversationId)) return;

    this.streams = {
      ...this.streams,
      [conversationId]: {
        conversationId,
        userContent: content,
        aiContent: '',
        previousMessageIds: [...previousMessageIds],
        phase: 'streaming',
        error: null,
        startedAt: Date.now(),
      },
    };
    this.emit();

    let fullContent = '';
    let streamError: string | null = null;

    try {
      const response = await authenticatedFetch(
        `/conversations/${conversationId}/messages/stream`,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        }
      );

      if (!response.ok) {
        throw new Error('AI 服务请求失败');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      const parser = new SseDecoder();
      let completed = false;
      const consume = (text: string) => {
        for (const event of parser.push(text)) {
          if (event.type === 'token') fullContent += event.data;
          else if (event.type === 'reading_context') this.patch(conversationId, { readingContext: event.data });
          else if (event.type === 'error') streamError = event.data;
          else if (event.type === 'done') {
            const payload = JSON.parse(event.data);
            if (typeof payload.messageId !== 'string' || !payload.messageId) {
              throw new Error('回答保存状态未知，请重新加载会话');
            }
            this.patch(conversationId, { assistantMessageId: payload.messageId });
            completed = true;
          }
        }
        this.patch(conversationId, { aiContent: fullContent });
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          consume(decoder.decode(value, { stream: true }));
          // The server's terminal event is authoritative; a proxy may keep HTTP open.
          if (completed || streamError) {
            await reader.cancel();
            break;
          }
        }
        consume(decoder.decode());
      } finally {
        reader.releaseLock();
      }
      if (!completed && !streamError) streamError = '连接中断，回答尚未完成，请重试';

      this.finish(
        conversationId,
        fullContent,
        streamError ? 'AI 服务提示: ' + streamError : null
      );
    } catch (err) {
      // 网络层失败：完全无内容时由页面回滚；有部分内容则保留展示
      this.finish(conversationId, fullContent, (err as Error).message);
    }
  }

  private finish(
    conversationId: string,
    content: string,
    error: string | null
  ): void {
    this.patch(conversationId, {
      aiContent: content,
      phase: error ? 'error' : 'done',
      error,
    });
  }

  private patch(conversationId: string, patch: Partial<ConversationStreamState>): void {
    const current = this.streams[conversationId];
    if (!current) return;
    this.streams = {
      ...this.streams,
      [conversationId]: { ...current, ...patch },
    };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

const EMPTY_STREAMS: StreamMap = {};

export const conversationStreamStore = new ConversationStreamStore();
