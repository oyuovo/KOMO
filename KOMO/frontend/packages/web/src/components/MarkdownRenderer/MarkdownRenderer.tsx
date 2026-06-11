'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownRenderer.module.css';

interface Props {
  content: string;
}

/**
 * Markdown 渲染组件。
 * 支持 GFM 扩展（表格、任务列表、删除线等），
 * 样式与 KOMO Design Tokens 对齐。
 */
export default function MarkdownRenderer({ content }: Props) {
  return (
    <div className={styles.root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 代码块 — 暗色背景等宽字体
          code({ className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              return (
                <code className={styles.inlineCode} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <pre className={styles.codeBlock}>
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          // 链接 — 新窗口打开
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
                {...props}
              >
                {children}
              </a>
            );
          },
          // 图片 — 自适应宽度
          img({ src, alt, ...props }) {
            return (
              <img
                src={src}
                alt={alt}
                className={styles.image}
                loading="lazy"
                {...props}
              />
            );
          },
          // 表格 — 可滚动容器
          table({ children }) {
            return (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>{children}</table>
              </div>
            );
          },
          // 引用块
          blockquote({ children }) {
            return <blockquote className={styles.blockquote}>{children}</blockquote>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
