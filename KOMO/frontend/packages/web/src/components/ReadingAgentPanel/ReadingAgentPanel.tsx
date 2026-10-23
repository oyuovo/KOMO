'use client';

/**
 * 文章侧边栏阅读问答面板。
 *
 * 每篇文章对应一个 READING 类型会话（后端 getOrCreateReadingConversation），
 * Python选择本文证据；答案保留来源快照，由用户决定如何编辑文档。
 * 流式输出复用模块级 conversationStreamStore：切换页面/收起面板不中断流。
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { parseReadingContext } from '@/lib/readingContext';
import {
  getOrCreateReadingConversation,
} from '@komo/shared/api-client';
import { useConversationStream } from '@/lib/useConversationStream';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import styles from './ReadingAgentPanel.module.css';

interface ReadingAgentPanelProps {
  articleId: string;
  articleTitle: string;
  articleContent: string;
  /** 划词引用（来自文章页右键菜单），非空时预填输入框后回调清空 */
  quote: string | null;
  onQuoteConsumed: () => void;
}

export default function ReadingAgentPanel({
  articleId,
  articleTitle,
  articleContent,
  quote,
  onQuoteConsumed,
}: ReadingAgentPanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  const [documentHash, setDocumentHash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDocumentHash(null);
    if (globalThis.crypto?.subtle) {
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(articleContent)).then((hash) => {
        if (!cancelled) setDocumentHash(Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''));
      }).catch(() => { if (!cancelled) setDocumentHash(null); });
    }
    return () => { cancelled = true; };
  }, [articleContent]);

  const {
    displayMessages,
    loading,
    canSend,
    reload,
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
  }, [articleId, initAttempt]);

  // 划词引用预填输入框（"> 引用\n\n" 模板，后端据此定位选区上下文）
  useEffect(() => {
    if (!quote) return;
    setInput(`${quote.split('\n').map(line => `> ${line}`).join('\n')}\n\n`);
    onQuoteConsumed();
  }, [quote, setInput, onQuoteConsumed]);

  // 流式期间自动滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (initError) {
    return (
      <div className={styles.panel}>
        <p className={styles.errorMsg}>{initError}</p>
        <button className={styles.sendBtn} onClick={() => setInitAttempt(value => value + 1)}>重试加载</button>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>关于「{articleTitle}」的问答</span>
        <Link href={`/article/edit?id=${encodeURIComponent(articleId)}`} className={styles.editLink}>编辑文档</Link>
      </div>

      <div className={styles.messageList}>
        {loading && <p className={styles.statusMsg}>加载中...</p>}
        {!loading && displayMessages.length === 0 && (
          <p className={styles.emptyMsg}>
            阅读中有任何疑惑，直接问我。
            <br />
            可以先选中原文再提问。回答下方可核对参考片段，理解后由你决定如何完善文档。
          </p>
        )}
        {displayMessages.map((msg) => {
          const context = parseReadingContext(msg.readingContext);
          return (
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
                <>
                  <MarkdownRenderer content={msg.content} />
                  {context && context.document_id === articleId && (
                    <div className={styles.evidence}>
                      <p className={styles.evidenceNote}>
                        {context.mode === 'full_document' ? '本轮参考了全文。' : '本轮参考了部分段落，未覆盖全文。'}
                        {documentHash && documentHash !== context.document_hash && '文档已修改，下面保留的是回答时的原文快照。'}
                      </p>
                      {context.warnings.includes('no_lexical_match') && <p className={styles.evidenceNote}>没有找到直接匹配的问题依据，以下仅提供文章开头供参考。</p>}
                      {context.warnings.some(w => w.startsWith('selection_')) && <p className={styles.evidenceNote}>选区未能完整或唯一定位，请核对下面的片段。</p>}
                      {context.citations?.status === 'invalid' && <p className={styles.errorMsg}>回答包含不存在的引用编号，请勿将其当作原文依据。</p>}
                      {context.citations?.status === 'missing' && <p className={styles.evidenceNote}>回答没有标注原文引用，以下是提供给模型的参考片段。</p>}
                      {context.sources.map(source => (
                        <details key={source.id} className={styles.source}>
                          <summary>[{source.id}] {source.heading} · 第{source.start_line}–{source.end_line}行</summary>
                          <pre>{source.text}</pre>
                        </details>
                      ))}
                      <p className={styles.evidenceNote}>可展开原文，核对解释是否符合作者的前提。</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          );
        })}
        {sending && displayMessages[displayMessages.length - 1]?.role !== 'ASSISTANT' && (
          <div className={`${styles.message} ${styles.messageAssistant}`}>
            <div className={styles.bubble}>
              <span className={styles.typing}>思考中...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div><p className={styles.errorMsg}>{error}</p>
        <button className={styles.sendBtn} disabled={loading || sending} onClick={() => void reload()}>重新加载会话</button>
      </div>}

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            className={styles.input}
            placeholder={conversationId ? '输入问题，Enter 发送...' : '初始化会话中...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || loading || !conversationId}
            rows={3}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!canSend || !input.trim() || !conversationId}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
