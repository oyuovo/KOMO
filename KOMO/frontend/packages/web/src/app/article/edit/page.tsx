'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getMe,
  getKnowledge,
  updateKnowledge,
  listKnowledgeBases,
  listCategories,
  type KnowledgeBaseData,
  type CategoryData,
} from '@komo/shared/api-client';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import { flattenCategoryTree } from '@/lib/categoryTree';
import styles from './page.module.css';

const ENTRY_TYPES = [
  { value: 'FACT', label: '事实' },
  { value: 'CONCEPT', label: '概念' },
  { value: 'INSIGHT', label: '洞察' },
  { value: 'METHOD', label: '方法论' },
  { value: 'QUESTION', label: '问题' },
];

function EditKnowledgeContent() {
  const router = useRouter();
  // 查询参数路由（桌面端静态导出兼容）：id 由 ?id= 提供
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [entryType, setEntryType] = useState('CONCEPT');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBaseData[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>('');
  const [version, setVersion] = useState<number | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadedId(null);
    setVersion(null);
    setError(null);
    const load = async () => {
      try {
        if (!id) throw new Error('未指定文章');
        const user = await getMe();
        if (cancelled) return;
        if (!user) { router.push('/login'); return; }
        const [article, list] = await Promise.all([getKnowledge(id), listKnowledgeBases()]);
        if (cancelled) return;
        if (article.version == null) throw new Error('文章缺少版本信息，请联网重新加载后再编辑');
        setKbs(list);
        setTitle(article.title);
        setContent(article.content);
        setEntryType(article.entryType || 'CONCEPT');
        setCategoryId(article.categoryId || '');
        setSelectedKbId(article.knowledgeBaseId || '');
        setVersion(article.version);
        setLoadedId(id);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setCategories([]);
    setCategoryError(null);
    setCategoriesLoading(Boolean(selectedKbId));
    if (!selectedKbId) return;
    listCategories(selectedKbId)
      .then(data => { if (!cancelled) setCategories(data); })
      .catch(() => { if (!cancelled) setCategoryError('分类加载失败，请重新选择知识库重试'); })
      .finally(() => { if (!cancelled) setCategoriesLoading(false); });
    return () => { cancelled = true; };
  }, [selectedKbId]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || version === null || loadedId !== id || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateKnowledge(id, {
        version,
        title: title.trim(),
        content: content.trim(),
        entryType,
        knowledgeBaseId: selectedKbId || undefined,
        categoryId: categoryId || null,
      });
      router.push(`/article?id=${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.page}><p className={styles.status}>加载中...</p></div>;
  if (loadedId !== id) return <div className={styles.page}><p className={styles.status}>{error || '加载中...'}</p></div>;

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
            disabled={saving || version === null || !title.trim() || !content.trim()}
          >
            {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
      </div>

      {error && <p className={styles.status} role="alert">{error}。当前编辑内容已保留在下方。</p>}

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
            onChange={(e) => { setSelectedKbId(e.target.value); setCategoryId(''); setCategories([]); }}
          >
            {!selectedKbId && <option value="">未分配知识库</option>}
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
            disabled={categoriesLoading || !selectedKbId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">无分类</option>
            {flattenCategoryTree(categories).map(({ category: cat, depth }) => {
                const prefix = '  '.repeat(depth);
                return (
                  <option key={cat.id} value={cat.id}>
                    {prefix}{depth > 0 ? '└ ' : ''}{cat.name}
                  </option>
                );
              })}
          </select>
          {categoryError && <p className={styles.status} role="alert">{categoryError}</p>}
        </div>
      </div>

      <input className={styles.titleInput} type="text" placeholder="标题"
        value={title} onChange={(e) => setTitle(e.target.value)} />

      {showPreview ? (
        <div className={styles.previewArea}>
          <MarkdownRenderer content={content || '（暂无内容）'} />
        </div>
      ) : (
        <>
          <p className={styles.editorHint}>使用 [[文章标题]] 链接到你保存的文章，保存后可点击跳转</p>
          <textarea className={styles.contentInput} placeholder="Markdown 内容"
            value={content} onChange={(e) => setContent(e.target.value)} />
        </>
      )}
    </div>
  );
}

export default function EditKnowledgePage() {
  return (
    <Suspense fallback={<div />}>
      <EditKnowledgeContent />
    </Suspense>
  );
}
