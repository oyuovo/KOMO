'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  listKnowledge,
  listCategories,
  deleteKnowledge,
  updateKnowledge,
  ApiError,
  type KnowledgeItem,
  type PageData,
  type CategoryData,
} from '@komo/shared/api-client';
import BatchDeleteOverlay, {
  type BatchDeleteState,
} from '@/components/BatchDeleteOverlay/BatchDeleteOverlay';
import CategoryPickerModal from '@/components/CategoryPickerModal/CategoryPickerModal';
import styles from './KnowledgeList.module.css';

// ---- Types ----

export interface KnowledgeStats {
  count: number;
  latestDate: string | null;
}

interface Props {
  searchQuery: string;
  knowledgeBaseId: string | null;
  categoryId: string | null;
  onStatsChange?: (stats: KnowledgeStats) => void;
}

type FlatRow =
  | { kind: 'category'; category: CategoryData; depth: number; articleCount: number; hasChildren: boolean }
  | { kind: 'article'; article: KnowledgeItem; depth: number };

// ---- ltree helpers ----

function sanitizeLtreeLabel(uuid: string): string {
  return uuid.replace(/-/g, '_');
}

/** ltree path depth: "root" = 0, "root.xxx" = 1, etc. */
function getDepth(cat: CategoryData): number {
  if (!cat.path || cat.path === 'root') return 0;
  return cat.path.split('.').length;
}

/**
 * Given a root category ID and the full category list,
 * return the set of all category IDs in that subtree.
 */
function getSubtreeCategoryIds(rootId: string, allCategories: CategoryData[]): Set<string> {
  const root = allCategories.find((c) => c.id === rootId);
  if (!root) return new Set([rootId]);
  const prefix = root.path + '.' + sanitizeLtreeLabel(rootId);
  const ids = new Set<string>();
  ids.add(rootId);
  for (const cat of allCategories) {
    if (cat.path === prefix || cat.path.startsWith(prefix + '.')) {
      ids.add(cat.id);
    }
  }
  return ids;
}

/**
 * Build a flat render list mixing categories and articles.
 * Categories are sorted by ltree path; expanded categories reveal
 * their direct articles indented underneath.
 */
function buildFlatRows(
  categories: CategoryData[],
  articles: KnowledgeItem[],
  expandedSet: Set<string>
): FlatRow[] {
  const rows: FlatRow[] = [];
  const sorted = [...categories].sort((a, b) => a.path.localeCompare(b.path));

  // Map: categoryId → articles
  const articlesByCategory = new Map<string, KnowledgeItem[]>();
  for (const a of articles) {
    if (a.categoryId) {
      const list = articlesByCategory.get(a.categoryId);
      if (list) list.push(a);
      else articlesByCategory.set(a.categoryId, [a]);
    }
  }

  for (const cat of sorted) {
    const depth = getDepth(cat);
    const directArticles = articlesByCategory.get(cat.id) ?? [];
    const catPathPrefix = cat.path + '.' + sanitizeLtreeLabel(cat.id);
    const hasChildren = sorted.some((c) => c.path.startsWith(catPathPrefix));

    rows.push({
      kind: 'category',
      category: cat,
      depth,
      articleCount: directArticles.length,
      hasChildren,
    });

    if (expandedSet.has(cat.id)) {
      for (const article of directArticles) {
        rows.push({ kind: 'article', article, depth: depth + 1 });
      }
    }
  }

  // Uncategorized articles at the bottom
  const uncategorized = articles.filter((a) => !a.categoryId);
  for (const article of uncategorized) {
    rows.push({ kind: 'article', article, depth: 0 });
  }

  return rows;
}

// ---- Component ----

export default function KnowledgeList({ searchQuery, knowledgeBaseId, categoryId, onStatsChange }: Props) {
  const [articles, setArticles] = useState<KnowledgeItem[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Selection mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch delete state
  const [batchState, setBatchState] = useState<BatchDeleteState>({
    phase: 'idle', total: 0, current: 0, deleted: 0, failed: 0,
  });

  // Move-to-category state
  const [movePickerOpen, setMovePickerOpen] = useState(false);

  // ---- Data fetching ----

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [articlePage, catData] = await Promise.all([
        listKnowledge({
          kb: knowledgeBaseId || undefined,
          q: searchQuery || undefined,
          size: 500,
        }) as Promise<PageData<KnowledgeItem>>,
        knowledgeBaseId
          ? listCategories(knowledgeBaseId)
          : (Promise.resolve([]) as Promise<CategoryData[]>),
      ]);
      setArticles(articlePage.content);
      setCategories(catData);

      if (onStatsChange) {
        const latestDate = articlePage.content.length > 0
          ? new Date(Math.max(...articlePage.content.map((a) => new Date(a.updatedAt).getTime())))
              .toLocaleDateString('zh-CN')
          : null;
        onStatsChange({ count: articlePage.totalElements, latestDate });
      }
    } catch (err) {
      if ((err as ApiError).code === 401) return;
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, knowledgeBaseId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset expanded when KB changes
  useEffect(() => {
    setExpandedCategories(new Set());
  }, [knowledgeBaseId]);

  // Auto-expand ancestors when sidebar category filter is active
  useEffect(() => {
    if (categoryId && categories.length > 0) {
      const target = categories.find((c) => c.id === categoryId);
      if (target) {
        const newExpanded = new Set(expandedCategories);
        for (const cat of categories) {
          const catPrefix = cat.path + '.' + sanitizeLtreeLabel(cat.id);
          if (target.path.startsWith(catPrefix) || target.id === cat.id) {
            newExpanded.add(cat.id);
          }
        }
        setExpandedCategories(newExpanded);
      }
    }
  }, [categoryId, categories]);

  // ---- Derived state ----

  const filteredArticles = useMemo(() => {
    if (!categoryId || categories.length === 0) return articles;
    const subtreeIds = getSubtreeCategoryIds(categoryId, categories);
    return articles.filter((a) => a.categoryId && subtreeIds.has(a.categoryId));
  }, [articles, categoryId, categories]);

  const flatRows = useMemo(() => {
    if (categories.length === 0) {
      // No categories — flat list
      return filteredArticles.map((article): FlatRow => ({
        kind: 'article',
        article,
        depth: 0,
      }));
    }
    return buildFlatRows(categories, filteredArticles, expandedCategories);
  }, [categories, filteredArticles, expandedCategories]);

  // Article-ONLY IDs for select-all
  const articleIds = useMemo(() => {
    const set = new Set<string>();
    for (const row of flatRows) {
      if (row.kind === 'article') set.add(row.article.id);
    }
    return set;
  }, [flatRows]);

  // ---- Handlers ----

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这篇文章吗？')) return;
    try {
      await deleteKnowledge(id);
      fetchData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleExpand = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === articleIds.size) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(articleIds));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // ---- Batch operations ----

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`确定要删除选中的 ${ids.length} 篇文章吗？此操作不可撤销。`)) return;

    setBatchState({ phase: 'deleting', total: ids.length, current: 0, deleted: 0, failed: 0 });

    let deleted = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try { await deleteKnowledge(ids[i]); deleted++; }
      catch { failed++; }
      setBatchState((prev) => ({ ...prev, current: i + 1, deleted, failed }));
    }
    setBatchState((prev) => ({ ...prev, phase: 'done', deleted, failed }));
  };

  const handleBatchClose = () => {
    setBatchState({ phase: 'idle', total: 0, current: 0, deleted: 0, failed: 0 });
    exitSelectMode();
    fetchData();
  };

  const handleMoveToCategory = async (targetCategoryId: string | null) => {
    setMovePickerOpen(false);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    let moved = 0;
    let failed = 0;
    for (const id of ids) {
      const article = articles.find((a) => a.id === id);
      if (!article) { failed++; continue; }
      try {
        await updateKnowledge(id, {
          title: article.title,
          content: article.content,
          entryType: article.entryType,
          categoryId: targetCategoryId || undefined,
        });
        moved++;
      } catch { failed++; }
    }

    exitSelectMode();
    fetchData();
    if (failed > 0) {
      setError(`移动完成: ${moved} 成功, ${failed} 失败`);
    }
  };

  // ---- Render helpers ----

  const renderedCount = articleIds.size;

  return (
    <>
      <BatchDeleteOverlay state={batchState} onClose={handleBatchClose} />

      {movePickerOpen && (
        <CategoryPickerModal
          categories={categories}
          onConfirm={handleMoveToCategory}
          onCancel={() => setMovePickerOpen(false)}
        />
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        {!selectMode ? (
          <button
            className={styles.btnSelectMode}
            onClick={() => setSelectMode(true)}
            disabled={flatRows.length === 0}
          >
            选择
          </button>
        ) : (
          <>
            <div className={styles.toolbarLeft}>
              <label className={styles.selectAllLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={articleIds.size > 0 && selectedIds.size === articleIds.size}
                  onChange={toggleSelectAll}
                />
                <span>全选</span>
              </label>
              <span className={styles.selectedCount}>
                已选 {selectedIds.size} 项
              </span>
            </div>
            <div className={styles.toolbarRight}>
              <button
                className={styles.btnMoveToCategory}
                onClick={() => setMovePickerOpen(true)}
                disabled={selectedIds.size === 0}
              >
                移动到分类
              </button>
              <button
                className={styles.btnBatchDelete}
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
              >
                批量删除
              </button>
              <button className={styles.btnCancelSelect} onClick={exitSelectMode}>
                取消选择
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tree / List */}
      <div className={styles.treeList}>
        {loading && <p className={styles.statusMsg}>加载中...</p>}
        {error && <p className={styles.errorMsg}>{error}</p>}
        {!loading && flatRows.length === 0 && (
          <p className={styles.statusMsg}>
            还没有文章。开始一次 AI 对话来创建你的第一条知识。
          </p>
        )}

        {flatRows.map((row) => {
          if (row.kind === 'category') {
            const cat = row.category;
            const isExpanded = expandedCategories.has(cat.id);
            return (
              <div
                key={cat.id}
                className={styles.categoryRow}
                style={{ paddingLeft: 8 + row.depth * 24 }}
              >
                {selectMode && (
                  <label className={styles.checkboxCell}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selectedIds.has(cat.id)}
                      onChange={() => toggleSelect(cat.id)}
                    />
                  </label>
                )}
                <button
                  className={styles.categoryToggle}
                  onClick={() => toggleExpand(cat.id)}
                  aria-label={isExpanded ? '折叠' : '展开'}
                >
                  <span className={styles.categoryIcon}>
                    {row.hasChildren ? (isExpanded ? '📂' : '📁') : '📁'}
                  </span>
                  <span className={styles.categoryName}>{cat.name}</span>
                  <span className={styles.categoryCount}>({row.articleCount})</span>
                </button>
              </div>
            );
          }

          // Article row
          const article = row.article;
          return (
            <div
              key={article.id}
              className={styles.articleRow}
              style={{ paddingLeft: 8 + row.depth * 24 }}
            >
              {selectMode && (
                <label className={styles.checkboxCell}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selectedIds.has(article.id)}
                    onChange={() => toggleSelect(article.id)}
                  />
                </label>
              )}
              <Link
                href={`/article/${article.id}`}
                className={`${styles.articleLink} ${selectMode ? styles.articleLinkSelect : ''}`}
              >
                <span
                  className={`${styles.badge} ${
                    article.status === 'PUBLISHED' ? styles.badgePublished : styles.badgeDraft
                  }`}
                >
                  {article.status === 'PUBLISHED' ? '已发布' : '草稿'}
                </span>
                <span className={styles.articleIcon}>📄</span>
                <span className={styles.articleTitle}>{article.title}</span>
                <span className={styles.articleType}>{article.entryType}</span>
                <span className={styles.articleMeta}>
                  {new Date(article.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </Link>
              {!selectMode && (
                <button
                  className={styles.articleDelete}
                  onClick={(e) => handleDelete(article.id, e)}
                  title="删除文章"
                >
                  删除
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
