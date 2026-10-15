'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { slugifyHeading } from '@/lib/slugify';
import styles from './MarkdownRenderer.module.css';

interface Props {
  content: string;
  /** [[wiki 链接]] 标题 → 文章 ID 映射。命中的 [[标题]] 渲染为站内文章链接，未命中保持原文 */
  linkMap?: Record<string, string>;
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
 * 将 [[标题]] 替换为站内 markdown 链接（命中 linkMap 时；大小写不敏感匹配）。
 * 未命中的保持原文 — 与后端 WikiLinkService 的建链规则一致。
 */
function applyWikiLinks(text: string, linkMap?: Record<string, string>): string {
  if (!linkMap || Object.keys(linkMap).length === 0) return text;
  const lower: Record<string, string> = {};
  for (const [title, id] of Object.entries(linkMap)) {
    lower[title.toLowerCase()] = id;
  }
  return text.replace(/\[\[([^\[\]]+)\]\]/g, (match, title: string) => {
    const id = lower[title.trim().toLowerCase()];
    return id ? `[${title.trim()}](/article?id=${id})` : match;
  });
}

/**
 * Markdown 渲染组件。
 * 支持 GFM 扩展（表格、任务列表、删除线等），
 * 样式与 KOMO Design Tokens 对齐。
 */
export default function MarkdownRenderer({ content, linkMap }: Props) {
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
          // 链接 — 站内路径走客户端路由，外部链接新窗口打开
          a({ href, children, ...props }) {
            if (href && href.startsWith('/')) {
              return (
                <Link href={href} className={styles.link}>
                  {children}
                </Link>
              );
            }
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
        {applyWikiLinks(normalizeChineseMarkdown(content), linkMap)}
      </ReactMarkdown>
    </div>
  );
}
