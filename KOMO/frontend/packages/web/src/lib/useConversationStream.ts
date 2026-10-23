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
import { mergeConversationMessages } from './conversationMessages';
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
  canSend: boolean;
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
  const scope = useMemo(() => ({ id: conversationId, active: false, request: 0 }), [conversationId]);
  const [readyScope, setReadyScope] = useState<typeof scope | null>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;
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
  const canSend = readyScope === scope && !loading && !sending && activeStream?.phase !== 'done';

  const reload = useCallback(async () => {
    if (!scope.id || !scope.active) return;
    const request = ++scope.request;
    setLoading(true);
    setError(null);
    const current = () => scope.active && currentScope.current === scope && request === scope.request;
    try {
      const msgs = await getMessages(scope.id);
      if (!current()) return;
      setMessages(msgs);
      setReadyScope(scope);
      const stream = conversationStreamStore.getSnapshot()[scope.id];
      if (stream?.phase === 'done' && msgs.some(message => message.id === stream.assistantMessageId)) {
        conversationStreamStore.clear(scope.id, stream);
        onDoneRef.current?.();
      }
    } catch (err) {
      if (current()) setError((err as Error).message);
    } finally {
      if (current()) setLoading(false);
    }
  }, [scope]);

  // 会话切换时重置并拉取
  useEffect(() => {
    scope.active = true;
    setLoading(Boolean(scope.id));
    setError(null);
    setMessages([]);
    setReadyScope(null);
    void reload();
    return () => { scope.active = false; };
  }, [scope, reload]);

  const displayMessages = useMemo(() => readyScope === scope
    ? mergeConversationMessages(messages, activeStream, conversationId) : [],
    [messages, activeStream, conversationId, readyScope, scope]);

  // 流结束/出错后的对齐：done → 重拉已落库消息并清理流状态；error → 提示与回滚。
  useEffect(() => {
    if (!activeStream || !conversationId || loading || readyScope !== scope) return;
    let cancelled = false;
    if (activeStream.phase === 'done') {
      const request = ++scope.request;
      getMessages(conversationId)
        .then((msgs) => {
          if (cancelled || currentScope.current !== scope || request !== scope.request) return;
          setMessages(msgs);
          if (!msgs.some(message => message.id === activeStream.assistantMessageId)) {
            setError('回答已生成，历史消息尚未同步，请重新加载会话');
            return;
          }
          conversationStreamStore.clear(conversationId, activeStream);
          onDoneRef.current?.();
        })
        .catch(() => {
          if (!cancelled) setError('回答已生成，历史消息加载失败，请重新加载会话');
        });
    } else if (activeStream.phase === 'error') {
      setError(activeStream.error ?? 'AI 服务连接中断');
      if (!activeStream.aiContent) {
        // 完全没收到内容：回滚乐观消息，恢复输入框
        setInput(activeStream.userContent);
        conversationStreamStore.clear(conversationId, activeStream);
      }
    }
    return () => { cancelled = true; };
  }, [activeStream, loading, conversationId, scope, readyScope]);

  const handleSend = useCallback(async () => {
    if (!conversationId) return;
    const content = input.trim();
    if (!content || !canSend) return;
    setError(null);
    setInput('');
    await conversationStreamStore.start(conversationId, content, messages.map(message => message.id));
  }, [conversationId, input, canSend, messages]);

  return {
    messages,
    displayMessages,
    loading,
    canSend,
    error,
    sending,
    input,
    setInput,
    handleSend,
    reload,
    activeStream,
  };
}
