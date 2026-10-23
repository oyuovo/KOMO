'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import ConversationSidebar from '@/components/ConversationSidebar/ConversationSidebar';
import {
  getMe,
  listConversations,
  switchConversationKb,
  listKnowledgeBases,
  type ConversationData,
  type KnowledgeBaseData,
} from '@komo/shared/api-client';
import { useConversationStream } from '@/lib/useConversationStream';
import styles from './page.module.css';

function ConversationDetailContent({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseData[]>([]);
  const [currentKbId, setCurrentKbId] = useState<string | null>(null);
  const [showKbSwitcher, setShowKbSwitcher] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { displayMessages, loading: messagesLoading, error: streamError, sending,
    input, setInput, handleSend, canSend, reload } = useConversationStream(conversationId);
  const loading = metadataLoading || messagesLoading;
  const error = metadataError || streamError;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const user = await getMe();
        if (cancelled) return;
        if (!user) { router.push('/login'); return; }
        const [convs, bases] = await Promise.all([listConversations(), listKnowledgeBases()]);
        if (cancelled) return;
        setConversations(convs);
        setKnowledgeBases(bases);
        setCurrentKbId(convs.find(c => c.id === conversationId)?.knowledgeBaseId ?? null);
      } catch (err) {
        if (!cancelled) setMetadataError((err as Error).message);
      } finally {
        if (!cancelled) setMetadataLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [conversationId, router]);

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
      setMetadataError((err as Error).message);
    }
  };

  const getCurrentKbName = (): string => {
    if (currentKbId === null) return '\u{1F4C4} 无知识库';
    const kb = knowledgeBases.find(k => k.id === currentKbId);
    return kb ? `\u{1F4C1} ${kb.name}` : '\u{1F4C1} 知识库';
  };

  // 发送消息后自动滚到底部（流式期间 displayMessages 随 chunk 更新）
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229 || loading) return;
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
        </div>

        {/* Messages */}
        <div className={styles.messageList}>
          {loading && (
            <p className={styles.statusMsg}>加载消息中...</p>
          )}
          {error && (
            <div><p className={styles.errorMsg}>{error}</p>
              {streamError && <button className={styles.sendBtn} disabled={loading || sending}
                onClick={() => void reload()}>重新加载会话</button>}
            </div>
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
              disabled={sending || loading}
              rows={3}
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={loading || !canSend || !input.trim()}
            >
              发送
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ConversationRoute() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  return <ConversationDetailContent key={id} conversationId={id} />;
}

export default function ConversationDetailPage() {
  return (
    <Suspense fallback={<div />}>
      <ConversationRoute />
    </Suspense>
  );
}
