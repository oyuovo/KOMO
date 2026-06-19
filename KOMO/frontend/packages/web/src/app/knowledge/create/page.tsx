'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createKnowledge,
  getToken,
  listKnowledgeBases,
  listCategories,
  type KnowledgeBaseData,
  type CategoryData,
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

export default function CreateKnowledgePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [entryType, setEntryType] = useState('CONCEPT');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBaseData[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    if (!getToken()) { setNeedsAuth(true); return; }
    listKnowledgeBases()
      .then((list) => {
        setKbs(list);
        const defaultKb = list.find((kb) => kb.type === 'DEFAULT') || list[0];
        if (defaultKb) setSelectedKbId(defaultKb.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedKbId) { setCategories([]); return; }
    listCategories(selectedKbId)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [selectedKbId]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createKnowledge({
        title: title.trim(),
        content: content.trim(),
        entryType,
        knowledgeBaseId: selectedKbId || undefined,
        categoryId: categoryId || undefined,
      });
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (needsAuth) {
    return (
      <div className={styles.page}>
        <p style={{ textAlign: 'center', padding: 60, color: 'var(--komo-text-secondary)' }}>
          请先登录
        </p>
      </div>
    );
  }

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

      {/* KB + Category selectors */}
      <div className={styles.selectRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>知识库</label>
          <select
            className={styles.select}
            value={selectedKbId}
            onChange={(e) => { setSelectedKbId(e.target.value); setCategoryId(''); }}
          >
            {kbs.map((kb) => (
              <option key={kb.id} value={kb.id}>{kb.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>分类（可选）</label>
          <select
            className={styles.select}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">无分类</option>
            {[...categories]
              .sort((a, b) => a.path.localeCompare(b.path))
              .map((cat) => {
                const depth = cat.path === 'root' ? 0 : cat.path.split('.').length - 1;
                const prefix = '  '.repeat(depth);
                return (
                  <option key={cat.id} value={cat.id}>
                    {prefix}{depth > 0 ? '└ ' : ''}{cat.name}
                  </option>
                );
              })}
          </select>
        </div>
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
