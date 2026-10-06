'use client';

/**
 * 对话流式消息同步 hook — 供对话页与文章侧边栏阅读问答面板共用。
 *
 * 封装：模块级流式 store 订阅、服务端消息拉取、乐观消息拼装、
 * 流结束/出错后的对齐（done → 重拉落库消息并清流；error → 提示与回滚）。
 * 后端在客户端断连时仍会完整落库，所以无论流是否在本组件存活期间完成，
 * 重拉都能拿到完整回复。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { getMessages, type MessageData } from '@komo/shared/api-client';
import {
  conversationStreamStore,
  type ConversationStreamState,
} from './conversationStream';

export interface UseConversationStreamResult {
  /** 服务端已落库的消息 */
  messages: MessageData[];
  /** 服务端消息 + 流式乐观消息的合并展示列表 */
  displayMessages: MessageData[];
  loading: boolean;
  error: string | null;
  /** 是否正在流式输出 */
  sending: boolean;
  input: string;
  setInput: (v: string) => void;
  /** 发送消息（SSE 流在模块级 store 中运行，unmount 不中断） */
  handleSend: () => Promise<void>;
  /** 重新拉取服务端消息 */
  reload: () => Promise<void>;
  activeStream: ConversationStreamState | null;
}

export function useConversationStream(
  conversationId: string | null,
  options?: { onDone?: () => void }
): UseConversationStreamResult {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  // 最近一次消息列表拉取完成时间（客户端时钟），
  // 用于判断流式交换是否已存在于服务端消息中
  const lastFetchTimeRef = useRef(0);
  const onDoneRef = useRef(options?.onDone);
  onDoneRef.current = options?.onDone;

  // 流式状态存放在模块级 store：切换页面（unmount）不中断流，
  // 重新挂载即恢复展示
  const streams = useSyncExternalStore(
    conversationStreamStore.subscribe,
    conversationStreamStore.getSnapshot,
    conversationStreamStore.getServerSnapshot
  );
  const activeStream: ConversationStreamState | null =
    conversationId ? streams[conversationId] ?? null : null;
  const sending = activeStream?.phase === 'streaming';

  const reload = useCallback(async () => {
    if (!conversationId) return;
    const msgs = await getMessages(conversationId);
    setMessages(msgs);
    lastFetchTimeRef.current = Date.now();
  }, [conversationId]);

  // 会话切换时重置并拉取
  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    setMessages([]);
    reload()
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [conversationId, reload]);

  // 合并服务端消息与流式状态：发送中的乐观消息、切页返回后的部分回复都在这里拼装。
  // 判断依据（同一客户端时钟，无服务器时钟偏差问题）：
  //   - 消息列表在流开始之后拉取过 → 后端已落库用户消息（streamMessage 先存用户消息再流式）
  //   - 此时尾条已是 AI 回复 → 本次回复也已落库（done/断连后重进页面）
  const displayMessages = useMemo<MessageData[]>(() => {
    if (!activeStream || !conversationId) return messages;
    // 网络错误且未收到任何内容 → 回滚乐观消息
    if (activeStream.phase === 'error' && !activeStream.aiContent) return messages;

    const userPersisted = lastFetchTimeRef.current > activeStream.startedAt;
    const tail = messages[messages.length - 1];
    const assistantPersisted = userPersisted && tail?.role === 'ASSISTANT';

    const result = [...messages];
    if (!userPersisted) {
      result.push({
        id: `stream-user-${activeStream.startedAt}`,
        conversationId,
        role: 'USER',
        content: activeStream.userContent,
        tokensUsed: null,
        createdAt: new Date(activeStream.startedAt).toISOString(),
      });
    }
    if (!assistantPersisted) {
      result.push({
        id: `stream-ai-${activeStream.startedAt}`,
        conversationId,
        role: 'ASSISTANT',
        content: activeStream.aiContent,
        tokensUsed: null,
        createdAt: new Date(activeStream.startedAt).toISOString(),
      });
    }
    return result;
  }, [messages, activeStream, conversationId]);

  // 流结束/出错后的对齐：done → 重拉已落库消息并清理流状态；error → 提示与回滚。
  useEffect(() => {
    if (!activeStream || !conversationId || loading) return;
    if (activeStream.phase === 'done') {
      reload()
        .then(() => {
          conversationStreamStore.clear(conversationId);
          onDoneRef.current?.();
        })
        .catch(() => {
          // 拉取失败：保留流式内容展示，下次进入页面再对齐
        });
    } else if (activeStream.phase === 'error') {
      setError(activeStream.error ?? 'AI 服务连接中断');
      if (!activeStream.aiContent) {
        // 完全没收到内容：回滚乐观消息，恢复输入框
        setInput(activeStream.userContent);
        conversationStreamStore.clear(conversationId);
      }
    }
  }, [activeStream, loading, conversationId, reload]);

  const handleSend = useCallback(async () => {
    if (!conversationId) return;
    const content = input.trim();
    if (!content || sending) return;
    setInput('');
    await conversationStreamStore.start(conversationId, content);
  }, [conversationId, input, sending]);

  return {
    messages,
    displayMessages,
    loading,
    error,
    sending,
    input,
    setInput,
    handleSend,
    reload,
    activeStream,
  };
}
