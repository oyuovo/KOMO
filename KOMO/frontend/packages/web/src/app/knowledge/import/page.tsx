'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getMe,
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
    getMe().then((u) => {
      if (!u) {
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
    });
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
