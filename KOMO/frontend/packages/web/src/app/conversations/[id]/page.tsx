'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import ConversationSidebar from '@/components/ConversationSidebar/ConversationSidebar';
import {
  getMe,
  getMessages,
  listConversations,
  listDrafts,
  extractConversation,
  switchConversationKb,
  listKnowledgeBases,
  type MessageData,
  type ConversationData,
  type KnowledgeBaseData,
} from '@komo/shared/api-client';
import {
  conversationStreamStore,
  type ConversationStreamState,
} from '@/lib/conversationStream';
import styles from './page.module.css';

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const conversationId = params.id;

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [draftCount, setDraftCount] = useState(0);
  const [showDraftHint, setShowDraftHint] = useState(false);
  const [autoExtract, setAutoExtract] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<'idle' | 'success' | 'empty'>('idle');
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseData[]>([]);
  const [currentKbId, setCurrentKbId] = useState<string | null>(null);
  const [showKbSwitcher, setShowKbSwitcher] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 最近一次消息列表拉取完成时间（客户端时钟），
  // 用于判断流式交换是否已存在于服务端消息中
  const lastFetchTimeRef = useRef(0);

  // 流式状态存放在模块级 store：切换页面（unmount）不中断流，
  // 返回页面重新挂载即恢复展示。后端断连时照常落库，done 后重拉对齐。
  const streams = useSyncExternalStore(
    conversationStreamStore.subscribe,
    conversationStreamStore.getSnapshot,
    conversationStreamStore.getServerSnapshot
  );
  const activeStream: ConversationStreamState | null =
    streams[conversationId] ?? null;
  const sending = activeStream?.phase === 'streaming';

  // 验证登录，加载数据
  useEffect(() => {
    getMe().then((u) => {
      if (!u) {
        router.push('/login');
        return;
      }
      setAutoExtract(u.autoExtract);
      fetchData();
      listKnowledgeBases().then(setKnowledgeBases).catch(() => {});
    });
  }, [conversationId]);

  // 加载消息和侧边栏对话列表
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [msgs, convs] = await Promise.all([
        getMessages(conversationId),
        listConversations(),
      ]);
      setMessages(msgs);
      lastFetchTimeRef.current = Date.now();
      setConversations(convs);
      const current = convs.find(c => c.id === conversationId);
      if (current) {
        setCurrentKbId(current.knowledgeBaseId ?? null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 页面加载完成后聚焦输入框
  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  // 检查 URL 中是否有预填参数（来自每日推荐）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const question = urlParams.get('question');
    if (question) {
      setInput(question);
    }
    // Clean URL params
    const url = new URL(window.location.href);
    url.searchParams.delete('question');
    url.searchParams.delete('kb');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleSwitchKb = async (kbId: string | null) => {
    setShowKbSwitcher(false);
    try {
      const updated = await switchConversationKb(conversationId, kbId);
      setCurrentKbId(updated.knowledgeBaseId ?? null);
      window.dispatchEvent(new Event('conversation-sidebar-refresh'));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const getCurrentKbName = (): string => {
    if (currentKbId === null) return '\u{1F4C4} 无知识库';
    const kb = knowledgeBases.find(k => k.id === currentKbId);
    return kb ? `\u{1F4C1} ${kb.name}` : '\u{1F4C1} 知识库';
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setInput('');
    // SSE reader 在模块级 store 中运行，切换页面不中断；
    // 乐观消息（用户消息 + AI 占位）由 displayMessages 从流状态拼装
    await conversationStreamStore.start(conversationId, content);
  };

  const handleExtract = async () => {
    if (extracting) return;
    setExtracting(true);
    setExtractResult('idle');
    // 记录提取前的草稿数
    const prevCount = draftCount;
    let result: 'success' | 'empty' = 'empty';
    try {
      await extractConversation(conversationId);
      // 轮询等待异步 Worker 处理：每 1.5s 查一次草稿列表，
      // 发现新增立即结束；最多等 30s（提取含 LLM 调用，可能较慢）。
      const POLL_INTERVAL_MS = 1500;
      const POLL_DEADLINE = Date.now() + 30000;
      while (Date.now() < POLL_DEADLINE) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        const drafts = await listDrafts();
        const newCount = drafts.filter(d => d.status === 'PENDING').length;
        if (newCount > prevCount) {
          result = 'success';
          setDraftCount(newCount);
          setShowDraftHint(true);
          break;
        }
      }
    } catch {
      result = 'empty';
    } finally {
      setExtracting(false);
      setExtractResult(result);
      setTimeout(() => setExtractResult('idle'), result === 'empty' ? 5000 : 4000);
    }
  };

  const checkDraftCount = async () => {
    try {
      const drafts = await listDrafts();
      if (drafts.length > draftCount) {
        setDraftCount(drafts.length);
        setShowDraftHint(true);
      }
    } catch {
      // ignore
    }
  };

  // 合并服务端消息与流式状态：发送中的乐观消息、切页返回后的部分回复都在这里拼装。
  // 判断依据（同一客户端时钟，无服务器时钟偏差问题）：
  //   - 消息列表在流开始之后拉取过 → 后端已落库用户消息（streamMessage 先存用户消息再流式）
  //   - 此时尾条已是 AI 回复 → 本次回复也已落库（done/断连后重进页面）
  const displayMessages = useMemo<MessageData[]>(() => {
    if (!activeStream) return messages;
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
  // 后端在客户端断连时仍会完整落库，所以无论流是否在本页完成，重拉都能拿到完整回复。
  useEffect(() => {
    if (!activeStream || loading) return;
    if (activeStream.phase === 'done') {
      getMessages(conversationId)
        .then((msgs) => {
          setMessages(msgs);
          conversationStreamStore.clear(conversationId);
          checkDraftCount();
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
  }, [activeStream, loading, conversationId]);

  // 发送消息后自动滚到底部（流式期间 displayMessages 随 chunk 更新）
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentConv = conversations.find((c) => c.id === conversationId);

  return (
    <div className={styles.layout}>
      <ConversationSidebar activeConversationId={conversationId} />

      {/* Main Chat Area */}
      <main className={styles.chat}>
        {/* Top bar */}
        <div className={styles.chatHeader}>
          <div className={styles.kbSwitcherWrap}>
            <button
              className={`${styles.kbSwitcher} ${currentKbId === null ? styles.kbSwitcherNoKb : ''}`}
              onClick={() => setShowKbSwitcher(!showKbSwitcher)}
            >
              {getCurrentKbName()} ▾
            </button>
            {showKbSwitcher && (
              <div className={styles.kbSwitcherMenu}>
                {knowledgeBases.map(kb => (
                  <button
                    key={kb.id}
                    className={`${styles.kbSwitcherItem} ${
                      currentKbId === kb.id ? styles.kbSwitcherItemActive : ''
                    }`}
                    onClick={() => handleSwitchKb(kb.id)}
                  >
                    📁 {kb.name}
                  </button>
                ))}
                <div className={styles.kbSwitcherDivider} />
                <button
                  className={`${styles.kbSwitcherItem} ${
                    currentKbId === null ? styles.kbSwitcherItemActive : ''
                  }`}
                  onClick={() => handleSwitchKb(null)}
                >
                  📄 无知识库
                </button>
              </div>
            )}
          </div>
          <span className={styles.chatTitle}>
            {currentConv?.title || '对话'}
          </span>
          <div className={styles.chatHeaderRight}>
            {!autoExtract && currentKbId !== null && (
              <button
                className={styles.extractBtn}
                onClick={handleExtract}
                disabled={extracting}
                title="手动提取知识草稿"
              >
                {extracting
                  ? '提取中...'
                  : extractResult === 'success'
                  ? '✓ 已提取'
                  : extractResult === 'empty'
                  ? '未发现知识点'
                  : '提取知识'}
              </button>
            )}
          </div>
        </div>

        {/* Knowledge Hint Bar — 发现新知识点提示 */}
        {showDraftHint && (
          <div className={styles.draftHint}>
            <span className={styles.draftHintMsg}>
              💡 发现了 {draftCount} 个知识点
            </span>
            <div className={styles.draftHintActions}>
              <Link href="/drafts" className={styles.draftHintLink}>
                查看草稿
              </Link>
              <button
                className={styles.draftHintDismiss}
                onClick={() => setShowDraftHint(false)}
              >
                忽略
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className={styles.messageList}>
          {loading && (
            <p className={styles.statusMsg}>加载消息中...</p>
          )}
          {error && (
            <p className={styles.errorMsg}>{error}</p>
          )}
          {!loading &&
            displayMessages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.message} ${
                  msg.role === 'USER' ? styles.messageUser : styles.messageAssistant
                }`}
              >
                <div className={styles.bubble}>
                  {msg.role === 'USER' ? (
                    <p className={styles.bubbleText}>{msg.content}</p>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}
                </div>
              </div>
            ))}
          {sending && (
            <div className={`${styles.message} ${styles.messageAssistant}`}>
              <div className={styles.bubble}>
                <span className={styles.typing}>思考中...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className={styles.inputArea}>
          <div className={styles.inputWrapper}>
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              className={styles.input}
              placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              rows={3}
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={sending || !input.trim()}
            >
              发送
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
