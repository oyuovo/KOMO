'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownRenderer.module.css';

interface Props {
  content: string;
}

/** 将标题文本转换为 URL 友好的 id */
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[（(]([^)）]+)[)）]/g, '')  // 移除中文/英文括号内容
    .replace(/[^\w一-鿿\s-]/g, '') // 移除特殊符号，保留中文
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * 提取 React children 中的纯文本
 */
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractText((children as { props: { children?: React.ReactNode } }).props.children);
  }
  return '';
}

/**
 * 预处理中文 markdown，修复 CommonMark 对标点相邻的格式化标记拒识问题。
 * 在 ** 等标记与相邻标点（引号、冒号等）之间插入零宽空格，使其通过 CommonMark 定界符检测。
 */
function normalizeChineseMarkdown(text: string): string {
  // 常见中文标点 + ASCII 引号
  const PUNCT = '"' +
    '“”‘’' +  // 弯引号
    '、。，：；' +  // 、。，：；
    '—…';  // —— …
  const markers = ['**', '__', '~~'];
  for (const m of markers) {
    const esc = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(esc + '([' + PUNCT + '])', 'g'), m + '​$1');
    text = text.replace(new RegExp('([' + PUNCT + '])' + esc, 'g'), '$1​' + m);
  }
  return text;
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
          h2({ children, ...props }) {
            const text = extractText(children);
            const id = slugifyHeading(text);
            return <h2 id={id} {...props}>{children}</h2>;
          },
          h3({ children, ...props }) {
            const text = extractText(children);
            const id = slugifyHeading(text);
            return <h3 id={id} {...props}>{children}</h3>;
          },
        }}
      >
        {normalizeChineseMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}
