'use client';

/**
 * 文章侧边栏阅读问答面板。
 *
 * 每篇文章对应一个 READING 类型会话（后端 getOrCreateReadingConversation），
 * 回答基于文章全文 + 选区上下文 + KB 检索，不产生知识草稿。
 * 流式输出复用模块级 conversationStreamStore：切换页面/收起面板不中断流。
 */
import { useEffect, useRef, useState } from 'react';
import {
  getOrCreateReadingConversation,
} from '@komo/shared/api-client';
import { useConversationStream } from '@/lib/useConversationStream';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import styles from './ReadingAgentPanel.module.css';

interface ReadingAgentPanelProps {
  articleId: string;
  articleTitle: string;
  /** 划词引用（来自文章页右键菜单），非空时预填输入框后回调清空 */
  quote: string | null;
  onQuoteConsumed: () => void;
}

export default function ReadingAgentPanel({
  articleId,
  articleTitle,
  quote,
  onQuoteConsumed,
}: ReadingAgentPanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const {
    displayMessages,
    loading,
    error,
    sending,
    input,
    setInput,
    handleSend,
  } = useConversationStream(conversationId);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 获取或创建本文的阅读会话
  useEffect(() => {
    let cancelled = false;
    setConversationId(null);
    setInitError(null);
    getOrCreateReadingConversation(articleId)
      .then((c) => {
        if (!cancelled) setConversationId(c.id);
      })
      .catch((err) => {
        if (!cancelled) setInitError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  // 划词引用预填输入框（"> 引用\n\n" 模板，后端据此定位选区上下文）
  useEffect(() => {
    if (!quote) return;
    setInput(`> ${quote}\n\n`);
    onQuoteConsumed();
  }, [quote, setInput, onQuoteConsumed]);

  // 流式期间自动滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (initError) {
    return (
      <div className={styles.panel}>
        <p className={styles.errorMsg}>{initError}</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>关于「{articleTitle}」的问答</span>
      </div>

      <div className={styles.messageList}>
        {loading && <p className={styles.statusMsg}>加载中...</p>}
        {!loading && displayMessages.length === 0 && (
          <p className={styles.emptyMsg}>
            阅读中有任何疑惑，直接问我。
            <br />
            我会结合这篇文章和你保存的知识来回答；也可以先选中一段原文再提问。
          </p>
        )}
        {displayMessages.map((msg) => (
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
        {sending && displayMessages[displayMessages.length - 1]?.role !== 'ASSISTANT' && (
          <div className={`${styles.message} ${styles.messageAssistant}`}>
            <div className={styles.bubble}>
              <span className={styles.typing}>思考中...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            className={styles.input}
            placeholder={conversationId ? '输入问题，Enter 发送...' : '初始化会话中...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || !conversationId}
            rows={3}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={sending || !input.trim() || !conversationId}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
