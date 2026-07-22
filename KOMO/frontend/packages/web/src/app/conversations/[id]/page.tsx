'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import ConversationSidebar from '@/components/ConversationSidebar/ConversationSidebar';
import {
  getMe,
  getCsrfToken,
  getApiBase,
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
import styles from './page.module.css';

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const conversationId = params.id;

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
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

  // 验证登录，加载数据
  useEffect(() => {
    getMe().then((u) => {
      if (!u) {
        router.push('/');
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

  // 发送消息后自动滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 页面加载完成后聚焦输入框
  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  // 检查 URL 中是否有引用参数（来自文章页追问 或 每日推荐）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const quote = urlParams.get('quote');
    const source = urlParams.get('source');
    const question = urlParams.get('question');
    if (quote) {
      const lines = [`> ${quote}`];
      if (source) lines.push(`> 来源：${source}`);
      lines.push('', '');
      setInput(lines.join('\n'));
    } else if (question) {
      setInput(question);
    }
    // Clean URL params
    const url = new URL(window.location.href);
    url.searchParams.delete('quote');
    url.searchParams.delete('source');
    url.searchParams.delete('sourceId');
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
    setSending(true);

    // 乐观更新：先显示用户消息
    const tempUserMsg: MessageData = {
      id: `temp-${Date.now()}`,
      conversationId,
      role: 'USER',
      content,
      tokensUsed: null,
      createdAt: new Date().toISOString(),
    };
    // 创建占位 AI 消息用于流式更新
    const aiMsgId = `ai-${Date.now()}`;
    const tempAiMsg: MessageData = {
      id: aiMsgId,
      conversationId,
      role: 'ASSISTANT',
      content: '',
      tokensUsed: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg, tempAiMsg]);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const csrf = getCsrfToken();
      if (csrf) headers['X-XSRF-TOKEN'] = csrf;

      const response = await fetch(
        `${getApiBase()}/conversations/${conversationId}/messages/stream`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ content }),
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('AI 服务请求失败');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let streamError: string | null = null;

      // SSE 解析状态
      let currentEvent = '';
      let firstDataLine = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            firstDataLine = true;
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (currentEvent === 'error') {
              streamError = data;
            } else if (currentEvent === 'done') {
              // done 事件的 data 忽略
            } else {
              // 多行 data: 用 \n 连接，还原原始换行
              if (firstDataLine) {
                fullContent += data;
                firstDataLine = false;
              } else {
                fullContent += '\n' + data;
              }
            }
          } else if (line === '') {
            // 空行 = SSE 事件边界，重置状态
            currentEvent = '';
            firstDataLine = true;
          }
        }

        // 每个 chunk 更新一次 UI，避免过多重渲染
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: fullContent } : m
          )
        );
      }

      // 流结束 — 刷新 decoder 和 buffer 中残留的数据
      buffer += decoder.decode(); // stream: false, flush final bytes
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.startsWith('data: [DONE]')) {
            fullContent += line.slice(6);
          }
        }
      }
      // 最终更新
      if (fullContent) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: fullContent } : m
          )
        );
      }

      // 流结束 — 用已接收的内容更新 AI 消息，不依赖 getMessages
      if (fullContent) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempUserMsg.id
              ? { ...m, id: `user-${Date.now()}` } // 去掉 temp 前缀
              : m
          )
        );
        checkDraftCount();
      }
      if (streamError) {
        setError('AI 服务提示: ' + streamError);
      }
    } catch (err) {
      // 只有在完全没有收到流内容时才是真正的网络错误
      setMessages((prev) => {
        const aiMsg = prev.find((m) => m.id === aiMsgId);
        if (aiMsg && aiMsg.content.length > 0) {
          return prev; // 已经有内容了，保留不删
        }
        // 真的失败了才回滚
        setError((err as Error).message);
        setInput(content);
        return prev.filter((m) => m.id !== tempUserMsg.id && m.id !== aiMsgId);
      });
    } finally {
      setSending(false);
    }
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
      // 等待异步 Worker 处理
      await new Promise(resolve => setTimeout(resolve, 3000));
      const drafts = await listDrafts();
      const newCount = drafts.filter(d => d.status === 'PENDING').length;
      if (newCount > prevCount) {
        result = 'success';
        setDraftCount(newCount);
        setShowDraftHint(true);
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
            messages.map((msg) => (
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
