'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import {
  getToken,
  getMessages,
  sendMessage,
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
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const reply = await sendMessage(conversationId, content);
      // 移除临时的用户消息，替换为真实数据
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempUserMsg.id);
        const userMsg: MessageData = {
          ...tempUserMsg,
          id: `user-${reply.id}`,
        };
        return [...filtered, userMsg, reply];
      });
    } catch (err) {
      setError((err as Error).message);
      // 移除失败的用户消息
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      setInput(content); // 恢复输入
    } finally {
      setSending(false);
      // 检查是否有新提取的草稿
      checkDraftCount();
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
