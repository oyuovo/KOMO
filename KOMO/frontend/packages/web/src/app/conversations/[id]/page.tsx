'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import {
  getToken,
  getMessages,
  listConversations,
  createConversation,
  listDrafts,
  type MessageData,
  type ConversationData,
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 验证登录，加载数据
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/');
      return;
    }
    fetchData();
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

  // 页面加载完成后聚焦输入框（Vue 等价于 nextTick）
  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

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
      const token = getToken();
      const response = await fetch(
        `http://localhost:8081/api/conversations/${conversationId}/messages/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
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
      {/* Sidebar — 对话列表（Vue 等价: 侧边栏始终显示，类似 v-if 条件渲染） */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>对话列表</span>
          <button
            className={styles.sidebarNew}
            onClick={async () => {
              try {
                const conv = await createConversation();
                router.push(`/conversations/${conv.id}`);
              } catch {
                // ignore
              }
            }}
            title="新建对话"
          >
            +
          </button>
        </div>
        <div className={styles.sidebarList}>
          {conversations.map((conv) => (
            <button
              key={conv.id}
              className={`${styles.sidebarItem} ${
                conv.id === conversationId ? styles.sidebarItemActive : ''
              }`}
              onClick={() => router.push(`/conversations/${conv.id}`)}
            >
              <span className={styles.sidebarItemIcon}>💬</span>
              <span className={styles.sidebarItemTitle}>{conv.title}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className={styles.chat}>
        {/* Top bar */}
        <div className={styles.chatHeader}>
          <h2 className={styles.chatTitle}>
            {currentConv?.title || '对话'}
          </h2>
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
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              placeholder="输入消息，Enter 发送..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
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
