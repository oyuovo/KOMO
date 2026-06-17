'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getToken,
  getKnowledge,
  updateKnowledge,
  type KnowledgeItem,
} from '@komo/shared/api-client';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import styles from './page.module.css';

const ENTRY_TYPES = [
  { value: 'FACT', label: '事实' },
  { value: 'CONCEPT', label: '概念' },
  { value: 'INSIGHT', label: '洞察' },
  { value: 'METHOD', label: '方法论' },
  { value: 'QUESTION', label: '问题' },
];

export default function EditKnowledgePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [entryType, setEntryType] = useState('CONCEPT');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.push('/'); return; }
    getKnowledge(id)
      .then((article) => {
        setTitle(article.title);
        setContent(article.content);
        setEntryType(article.entryType || 'CONCEPT');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateKnowledge(id, { title: title.trim(), content: content.trim(), entryType });
      router.push(`/article/${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.page}><p className={styles.status}>加载中...</p></div>;
  if (error) return <div className={styles.page}><p className={styles.status}>{error}</p></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>编辑知识</h1>
        <div className={styles.headerActions}>
          <button className={styles.previewToggle} onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? '编辑' : '预览'}
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving || !title.trim() || !content.trim()}
          >
            {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
      </div>

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

      <input className={styles.titleInput} type="text" placeholder="标题"
        value={title} onChange={(e) => setTitle(e.target.value)} />

      {showPreview ? (
        <div className={styles.previewArea}>
          <MarkdownRenderer content={content || '（暂无内容）'} />
        </div>
      ) : (
        <textarea className={styles.contentInput} placeholder="Markdown 内容"
          value={content} onChange={(e) => setContent(e.target.value)} />
      )}
    </div>
  );
}
