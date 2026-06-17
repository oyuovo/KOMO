# MD Import & Article TOC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add .md file import page and left-floating article table of contents with heading jump navigation.

**Architecture:** Frontend-only changes. Import page reads .md via FileReader, auto-extracts title + detects local images, calls existing `createKnowledge()` API. TOC parses markdown headings in article page, renders floating nav with IntersectionObserver active tracking and smooth-scroll jump.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, CSS Modules, react-markdown (existing)

## Global Constraints

- CSS Modules only, no Tailwind
- All components `'use client'` when using hooks/state
- API calls only through `@komo/shared/api-client`
- SSR-safe auth checks: `getToken()` only in `useEffect` or guarded by `typeof window`
- File size limit: 2MB for .md import
- Only `.md` / `.markdown` extensions accepted

---

### Task 1: Enable import button on homepage

**Files:**
- Modify: `KOMO/frontend/packages/web/src/app/page.tsx`

**Interfaces:**
- Produces: `<Link href="/knowledge/import">` replaces disabled button

- [ ] **Step 1: Replace disabled button with working Link**

In `app/page.tsx`, find line ~131:
```tsx
<button className={styles.btnSecondary} disabled title="功能开发中">
  导入
</button>
```

Replace with:
```tsx
<Link href="/knowledge/import" className={styles.btnSecondary}>
  导入
</Link>
```

- [ ] **Step 2: Commit**

```bash
git add KOMO/frontend/packages/web/src/app/page.tsx
git commit -m "feat: enable import button linking to /knowledge/import"
```

---

### Task 2: Create import page (`/knowledge/import`)

**Files:**
- Create: `KOMO/frontend/packages/web/src/app/knowledge/import/page.tsx`
- Create: `KOMO/frontend/packages/web/src/app/knowledge/import/page.module.css`

**Interfaces:**
- Consumes: `createKnowledge`, `listKnowledgeBases`, `getToken` from `@komo/shared/api-client`
- Produces: Full import page at `/knowledge/import`

- [ ] **Step 1: Create CSS module**

File: `KOMO/frontend/packages/web/src/app/knowledge/import/page.module.css`

```css
.page {
  max-width: 680px;
  margin: 0 auto;
  padding: 48px 32px 96px;
}

.backLink {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--komo-text-sm);
  color: var(--komo-text-tertiary);
  text-decoration: none;
  margin-bottom: 24px;
  transition: color 0.15s;
}
.backLink:hover { color: var(--komo-text); }

.heading {
  font-family: var(--komo-font-serif);
  font-size: var(--komo-text-2xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 32px;
}

/* Drop Zone */
.dropZone {
  border: 2px dashed var(--komo-border);
  border-radius: var(--komo-radius-md);
  padding: 48px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--komo-surface);
  margin-bottom: 24px;
}
.dropZone:hover,
.dropZoneActive {
  border-color: var(--komo-accent);
  background: var(--komo-accent-soft);
}

.dropIcon { font-size: 40px; margin-bottom: 12px; display: block; }
.dropText { font-size: var(--komo-text-sm); color: var(--komo-text-secondary); }
.dropHint { font-size: 12px; color: var(--komo-text-tertiary); margin-top: 8px; }

.fileInput { display: none; }

/* File info bar */
.fileBar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--komo-surface);
  border: 1px solid var(--komo-border);
  border-radius: var(--komo-radius-sm);
  margin-bottom: 24px;
  font-size: var(--komo-text-sm);
}
.fileName { font-weight: 600; color: var(--komo-text); flex: 1; }
.fileSize { color: var(--komo-text-tertiary); font-size: 12px; }
.fileRemove {
  background: none;
  border: none;
  color: var(--komo-text-tertiary);
  cursor: pointer;
  font-size: 18px;
  padding: 0 4px;
}
.fileRemove:hover { color: var(--komo-danger); }

/* Form */
.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 24px;
}

.field {}
.fieldLabel {
  display: block;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--komo-text-tertiary);
  margin-bottom: 6px;
}

.titleInput,
.select,
.tagInput {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--komo-border);
  border-radius: var(--komo-radius-sm);
  font-size: var(--komo-text-sm);
  font-family: inherit;
  background: var(--komo-bg);
  color: var(--komo-text);
  outline: none;
  transition: border-color 0.15s;
}
.titleInput:focus,
.select:focus,
.tagInput:focus {
  border-color: var(--komo-accent);
}

.selectRow {
  display: flex;
  gap: 16px;
}
.selectRow .field { flex: 1; }

/* Warning */
.warning {
  background: #fef9e7;
  border: 1px solid #f4d03f;
  border-radius: var(--komo-radius-sm);
  padding: 14px 16px;
  margin-bottom: 24px;
  font-size: 13px;
  color: #7d6608;
}
.warningTitle { font-weight: 600; margin-bottom: 6px; }
.warningList {
  margin: 0;
  padding-left: 18px;
  font-family: var(--komo-font-mono);
  font-size: 12px;
  line-height: 1.8;
}

/* Preview */
.previewSection {
  margin-bottom: 32px;
}
.previewLabel {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--komo-text-tertiary);
  margin-bottom: 12px;
}
.previewBox {
  border: 1px solid var(--komo-border);
  border-radius: var(--komo-radius-md);
  padding: 24px 28px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--komo-bg);
  font-family: var(--komo-font-serif);
  font-size: var(--komo-text-sm);
  line-height: 1.8;
  color: var(--komo-text);
}
.previewBox h1 { font-size: 1.5em; margin-bottom: 0.5em; }
.previewBox h2 { font-size: 1.2em; margin: 1em 0 0.5em; }
.previewBox h3 { font-size: 1em; margin: 0.8em 0 0.4em; }
.previewBox p { margin-bottom: 0.8em; }
.previewBox code { background: var(--komo-surface-hover); padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
.previewBox pre { background: var(--komo-surface); padding: 14px 18px; border-radius: var(--komo-radius-sm); overflow-x: auto; font-size: 0.85em; }

/* Actions */
.actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.btnPrimary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  border: none;
  border-radius: var(--komo-radius-sm);
  background: var(--komo-accent);
  color: #fff;
  font-size: var(--komo-text-sm);
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
  text-decoration: none;
}
.btnPrimary:hover { opacity: 0.88; }
.btnPrimary:disabled { opacity: 0.5; cursor: not-allowed; }

.btnSecondary {
  display: inline-flex;
  align-items: center;
  padding: 12px 28px;
  border: 1px solid var(--komo-border);
  border-radius: var(--komo-radius-sm);
  background: var(--komo-surface);
  color: var(--komo-text-secondary);
  font-size: var(--komo-text-sm);
  font-family: inherit;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.15s;
}
.btnSecondary:hover { background: var(--komo-surface-hover); color: var(--komo-text); }

.error {
  color: var(--komo-danger);
  font-size: 13px;
  padding: 10px 14px;
  background: #fef0f0;
  border-radius: var(--komo-radius-sm);
}
```

- [ ] **Step 2: Create page component**

File: `KOMO/frontend/packages/web/src/app/knowledge/import/page.tsx`

```tsx
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getToken,
  createKnowledge,
  listKnowledgeBases,
  type KnowledgeBaseData,
} from '@komo/shared/api-client';
import styles from './page.module.css';

const ENTRY_TYPES = [
  { value: 'CONCEPT', label: '概念' },
  { value: 'FACT', label: '事实' },
  { value: 'INSIGHT', label: '洞察' },
  { value: 'METHOD', label: '方法论' },
  { value: 'QUESTION', label: '问题' },
];

/** 检测本地图片引用（不以 http/https 开头的图片路径） */
function findLocalImages(markdown: string): string[] {
  const re = /!\[.*?\]\(((?!https?:\/\/)[^)]+)\)/g;
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}

/** 从 markdown 中提取第一个 # 标题 */
function extractTitle(markdown: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [needsAuth, setNeedsAuth] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBaseData[]>([]);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [selectedKbId, setSelectedKbId] = useState('');
  const [entryType, setEntryType] = useState('CONCEPT');
  const [tags, setTags] = useState('');
  const [localImages, setLocalImages] = useState<string[]>([]);

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Auth + KBs
  useEffect(() => {
    if (!getToken()) {
      setNeedsAuth(true);
      return;
    }
    listKnowledgeBases()
      .then((list) => {
        setKbs(list);
        const defaultKb = list.find((kb) => kb.type === 'DEFAULT');
        if (defaultKb) setSelectedKbId(defaultKb.id);
      })
      .catch(() => {});
  }, []);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.md') && !f.name.endsWith('.markdown')) {
      setError('仅支持 .md 或 .markdown 文件');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setError('文件不能超过 2MB');
      return;
    }
    setError(null);
    setFile(f);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setContent(text);
      setTitle(extractTitle(text));
      setLocalImages(findLocalImages(text));
    };
    reader.onerror = () => setError('文件读取失败，请重试');
    reader.readAsText(f);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!title.trim() || !content.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const result = await createKnowledge({
        title: title.trim(),
        content: content.trim(),
        entryType,
        knowledgeBaseId: selectedKbId || undefined,
        tags: tags.trim() || undefined,
      });
      router.push(`/article/${result.id}`);
    } catch (err) {
      setError((err as Error).message || '导入失败');
      setImporting(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setContent('');
    setTitle('');
    setLocalImages([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (needsAuth) {
    return (
      <div className={styles.page}>
        <p style={{ textAlign: 'center', padding: 80, color: 'var(--komo-text-secondary)' }}>
          请先返回首页登录
        </p>
        <div style={{ textAlign: 'center' }}>
          <Link href="/" style={{ color: 'var(--komo-link)', fontWeight: 600 }}>
            ← 返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.backLink}>← 返回知识库</Link>
      <h1 className={styles.heading}>导入 Markdown 文档</h1>

      {/* Drop zone (only when no file selected) */}
      {!file && (
        <div
          className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <span className={styles.dropIcon}>📄</span>
          <p className={styles.dropText}>点击或拖拽 .md 文件到此处</p>
          <p className={styles.dropHint}>支持 .md / .markdown，最大 2MB</p>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown"
        className={styles.fileInput}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {/* File bar (when file loaded) */}
      {file && (
        <>
          <div className={styles.fileBar}>
            <span>📄</span>
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.fileSize}>{(file.size / 1024).toFixed(1)} KB</span>
            <button className={styles.fileRemove} onClick={clearFile} title="移除文件">
              ✕
            </button>
          </div>

          {/* Config form */}
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>标题</label>
              <input
                className={styles.titleInput}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="文章标题"
              />
            </div>

            <div className={styles.selectRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>目标知识库</label>
                <select
                  className={styles.select}
                  value={selectedKbId}
                  onChange={(e) => setSelectedKbId(e.target.value)}
                >
                  {kbs.map((kb) => (
                    <option key={kb.id} value={kb.id}>{kb.name}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>类型</label>
                <select
                  className={styles.select}
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value)}
                >
                  {ENTRY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>标签（可选，逗号分隔）</label>
              <input
                className={styles.tagInput}
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="例如：技术, Java, 笔记"
              />
            </div>
          </div>

          {/* Local image warning */}
          {localImages.length > 0 && (
            <div className={styles.warning}>
              <p className={styles.warningTitle}>
                ⚠️ 检测到 {localImages.length} 处本地图片引用，导入后无法显示
              </p>
              <ul className={styles.warningList}>
                {localImages.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview */}
          <div className={styles.previewSection}>
            <p className={styles.previewLabel}>内容预览</p>
            <div className={styles.previewBox}>
              {content ? (
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                  {content.slice(0, 3000)}
                  {content.length > 3000 && '\n\n… （内容过长，仅展示前 3000 字符）'}
                </pre>
              ) : (
                <p style={{ color: 'var(--komo-text-tertiary)' }}>（无内容）</p>
              )}
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          {/* Actions */}
          <div className={styles.actions}>
            <button
              className={styles.btnPrimary}
              onClick={handleImport}
              disabled={importing || !title.trim() || !content.trim()}
            >
              {importing ? '导入中...' : '确认导入'}
            </button>
            <button className={styles.btnSecondary} onClick={clearFile}>
              取消
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add KOMO/frontend/packages/web/src/app/knowledge/import/
git commit -m "feat: add markdown import page with local image detection"
```

---

### Task 3: Add heading IDs to MarkdownRenderer

**Files:**
- Modify: `KOMO/frontend/packages/web/src/components/MarkdownRenderer/MarkdownRenderer.tsx`

**Interfaces:**
- Produces: `h2`, `h3` elements with `id` attribute for TOC anchor linking

- [ ] **Step 1: Add slugify helper and custom h2/h3 components**

Add `slugifyHeading` function and custom `h2`/`h3` in `components` prop.

File: `KOMO/frontend/packages/web/src/components/MarkdownRenderer/MarkdownRenderer.tsx`

```tsx
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
    return extractText((children as React.ReactElement).props.children);
  }
  return '';
}

function normalizeChineseMarkdown(text: string): string {
  const PUNCT = '"' +
    '""‘’' +
    '、。，：；' +
    '—…';
  const markers = ['**', '__', '~~'];
  for (const m of markers) {
    const esc = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(esc + '([' + PUNCT + '])', 'g'), m + '​$1');
    text = text.replace(new RegExp('([' + PUNCT + '])' + esc, 'g'), '$1​' + m);
  }
  return text;
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <div className={styles.root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
          table({ children }) {
            return (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>{children}</table>
              </div>
            );
          },
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
```

- [ ] **Step 2: Commit**

```bash
git add KOMO/frontend/packages/web/src/components/MarkdownRenderer/MarkdownRenderer.tsx
git commit -m "feat: add id attributes to h2/h3 headings for TOC anchoring"
```

---

### Task 4: Add floating TOC to article page

**Files:**
- Modify: `KOMO/frontend/packages/web/src/app/article/[id]/page.tsx`
- Modify: `KOMO/frontend/packages/web/src/app/article/[id]/page.module.css`

**Interfaces:**
- Consumes: `slugifyHeading` logic (mirrored extraction) from article content
- Produces: Floating TOC nav between sidebar and main, IntersectionObserver highlight, click-to-scroll

- [ ] **Step 1: Add TOC CSS**

Append to `KOMO/frontend/packages/web/src/app/article/[id]/page.module.css`:

```css
/* Floating TOC — left side, between sidebar and content */
.tocFloat {
  position: fixed;
  left: calc(var(--komo-sidebar-width) + 28px);
  top: calc(var(--komo-topnav-height) + 32px);
  width: 180px;
  max-height: calc(100vh - var(--komo-topnav-height) - 80px);
  overflow-y: auto;
  z-index: 10;
  font-size: 13px;
}

.tocFloatTitle {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--komo-text-tertiary);
  margin-bottom: 12px;
}

.tocFloatItem {
  display: block;
  width: 100%;
  padding: 5px 12px;
  border: none;
  border-left: 2px solid transparent;
  border-radius: 0 4px 4px 0;
  background: none;
  color: var(--komo-text-tertiary);
  font-size: 13px;
  font-family: var(--komo-font-sans);
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tocFloatItem:hover {
  color: var(--komo-text);
  background: var(--komo-surface-hover);
}

.tocFloatItemH3 {
  padding-left: 26px;
  font-size: 12px;
}

.tocFloatItemActive {
  color: var(--komo-accent);
  border-left-color: var(--komo-accent);
  background: var(--komo-accent-soft);
}

/* Hide TOC on narrow screens */
@media (max-width: 1200px) {
  .tocFloat {
    display: none;
  }
}
```

- [ ] **Step 2: Add TOC extraction + IntersectionObserver logic to article page**

Modify `KOMO/frontend/packages/web/src/app/article/[id]/page.tsx`:

(Showing only what changes — add imports, hook, and TOC JSX)

**Imports** — add `useRef, useCallback` to React import:

```tsx
import { useEffect, useState, useRef, useCallback } from 'react';
```

**TOC type + extract function** — add after imports, before component:

```tsx
interface TocItem {
  level: 2 | 3;
  text: string;
  id: string;
}

/** 从 markdown 提取 ## 和 ### 标题 */
function extractToc(content: string): TocItem[] {
  const re = /^(#{2,3})\s+(.+)$/gm;
  const items: TocItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const level = m[1].length === 2 ? 2 : 3;
    const text = m[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[（(]([^)）]+)[)）]/g, '')
      .replace(/[^\w一-鿿\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    items.push({ level, text, id } as TocItem);
  }
  return items;
}
```

**TOC state** — add to component, after `fragmentsKbId` state:

```tsx
const [tocItems, setTocItems] = useState<TocItem[]>([]);
const [activeTocId, setActiveTocId] = useState<string | null>(null);
const articleBodyRef = useRef<HTMLDivElement>(null);
```

**Extract TOC when article loads** — add inside the data-fetching `useEffect`, after `setArticle(articleData)`:

```tsx
setArticle(articleData);
setTocItems(extractToc(articleData.content));
```

**IntersectionObserver** — add new `useEffect` after the data-fetching one:

```tsx
// IntersectionObserver: track visible headings
useEffect(() => {
  if (tocItems.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      // Find the heading with highest intersection ratio
      let best: IntersectionObserverEntry | null = null;
      for (const entry of entries) {
        if (!best || entry.intersectionRatio > best.intersectionRatio) {
          best = entry;
        }
      }
      if (best && best.intersectionRatio > 0) {
        setActiveTocId(best.target.id);
      }
    },
    { rootMargin: '-80px 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
  );

  // Wait for render, then observe all h2/h3 in article body
  const timer = setTimeout(() => {
    const container = articleBodyRef.current;
    if (!container) return;
    const headings = container.querySelectorAll('h2[id], h3[id]');
    headings.forEach((h) => observer.observe(h));
  }, 100);

  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}, [tocItems]);
```

**Scroll to heading** — helper function:

```tsx
const scrollToHeading = useCallback((id: string) => {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}, []);
```

**Add ref to articleBody** — change:

```tsx
<div className={styles.articleBody}>
  <MarkdownRenderer content={article.content} />
</div>
```

To:

```tsx
<div className={styles.articleBody} ref={articleBodyRef}>
  <MarkdownRenderer content={article.content} />
</div>
```

**Render TOC** — add between `sidebar` and `main` in the return JSX:

```tsx
{/* Floating TOC */}
{tocItems.length > 0 && (
  <nav className={styles.tocFloat}>
    <div className={styles.tocFloatTitle}>📑 在本页中</div>
    {tocItems.map((item) => (
      <button
        key={item.id}
        className={`${styles.tocFloatItem} ${
          item.level === 3 ? styles.tocFloatItemH3 : ''
        } ${activeTocId === item.id ? styles.tocFloatItemActive : ''}`}
        onClick={() => scrollToHeading(item.id)}
      >
        {item.text}
      </button>
    ))}
  </nav>
)}
```

- [ ] **Step 3: Commit**

```bash
git add KOMO/frontend/packages/web/src/app/article/[id]/page.tsx
git add KOMO/frontend/packages/web/src/app/article/[id]/page.module.css
git commit -m "feat: add floating TOC with heading navigation and active tracking"
```

---

### Task 5: Verify end-to-end

- [ ] **Step 1: Build check**

```bash
cd KOMO/frontend/packages/web && npx next build 2>&1 | tail -5
```
Expected: build succeeds, no errors.

- [ ] **Step 2: Manual test — TOC**

1. Start the app, navigate to an article with `##` / `###` headings
2. Verify floating TOC appears on left side
3. Click a heading → page scrolls to that heading
4. Scroll the article → active TOC item updates

- [ ] **Step 3: Manual test — Import**

1. Navigate to `/knowledge/import`
2. Drop a .md file with local images
3. Verify warning appears with image paths
4. Configure KB and type, confirm import
5. Verify redirect to new article page

- [ ] **Step 4: Final commit if any fixes needed**
