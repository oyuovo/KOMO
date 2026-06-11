'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createKnowledge, getToken } from '@komo/shared/api-client';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import styles from './page.module.css';

const ENTRY_TYPES = [
  { value: 'FACT', label: '事实' },
  { value: 'CONCEPT', label: '概念' },
  { value: 'INSIGHT', label: '洞察' },
  { value: 'METHOD', label: '方法论' },
  { value: 'QUESTION', label: '问题' },
];

export default function CreateKnowledgePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [entryType, setEntryType] = useState('CONCEPT');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  if (!getToken()) {
    return (
      <div className={styles.page}>
        <p style={{ textAlign: 'center', padding: 60, color: 'var(--komo-text-secondary)' }}>
          请先登录
        </p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createKnowledge({ title: title.trim(), content: content.trim(), entryType });
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>新建知识</h1>
        <div className={styles.headerActions}>
          <button
            className={styles.previewToggle}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? '编辑' : '预览'}
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving || !title.trim() || !content.trim()}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {/* 类型选择 */}
      <div className={styles.typeSelector}>
        {ENTRY_TYPES.map((t) => (
          <button
            key={t.value}
            className={`${styles.typeBtn} ${entryType === t.value ? styles.typeBtnActive : ''}`}
            onClick={() => setEntryType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 标题 */}
      <input
        className={styles.titleInput}
        type="text"
        placeholder="知识标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      {/* 内容 / 预览 */}
      {showPreview ? (
        <div className={styles.previewArea}>
          <MarkdownRenderer content={content || '（暂无内容）'} />
        </div>
      ) : (
        <textarea
          className={styles.contentInput}
          placeholder="Markdown 格式内容..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      )}
    </div>
  );
}
