'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  listKnowledge,
  listCategories,
  deleteKnowledge,
  moveKnowledgeToCategory,
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
import { useLatestRequest } from '@/hooks/useLatestRequest';

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

/** path 记录祖先节点；比较完整段，避免相似 ID 被误认成祖先。 */
function isDescendantOf(category: CategoryData, ancestor: CategoryData): boolean {
  const prefix = ancestor.path + '.' + sanitizeLtreeLabel(ancestor.id);
  return category.path === prefix || category.path.startsWith(prefix + '.');
}

/**
 * Given a root category ID and the full category list,
 * return the set of all category IDs in that subtree.
 */
function getSubtreeCategoryIds(rootId: string, allCategories: CategoryData[]): Set<string> {
  const root = allCategories.find((c) => c.id === rootId);
  if (!root) return new Set([rootId]);
  const ids = new Set<string>();
  ids.add(rootId);
  for (const cat of allCategories) {
    if (isDescendantOf(cat, root)) {
      ids.add(cat.id);
    }
  }
  return ids;
}

/**
 * Build a flat render list mixing categories and articles.
 * Walk each expanded subtree in order, with articles and children directly below their parent.
 */
function buildFlatRows(
  categories: CategoryData[],
  articles: KnowledgeItem[],
  expandedSet: Set<string>
): FlatRow[] {
  const rows: FlatRow[] = [];
  const sorted = [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const categoryPaths = new Set(categories.map(cat => cat.path + '.' + sanitizeLtreeLabel(cat.id)));
  const childrenByPath = new Map<string, CategoryData[]>();
  const roots: CategoryData[] = [];
  for (const cat of sorted) {
    if (!categoryPaths.has(cat.path)) {
      // 缺失父分类的历史节点也作为根展示，避免整支内容消失。
      roots.push(cat);
    } else {
      const siblings = childrenByPath.get(cat.path) ?? [];
      siblings.push(cat);
      childrenByPath.set(cat.path, siblings);
    }
  }

  // Map: categoryId → articles
  const articlesByCategory = new Map<string, KnowledgeItem[]>();
  for (const a of articles) {
    if (a.categoryId) {
      const list = articlesByCategory.get(a.categoryId);
      if (list) list.push(a);
      else articlesByCategory.set(a.categoryId, [a]);
    }
  }

  const appendCategory = (cat: CategoryData, depth: number) => {
    const directArticles = articlesByCategory.get(cat.id) ?? [];
    const catPathPrefix = cat.path + '.' + sanitizeLtreeLabel(cat.id);
    const children = childrenByPath.get(catPathPrefix) ?? [];

    rows.push({
      kind: 'category',
      category: cat,
      depth,
      articleCount: directArticles.length,
      hasChildren: children.length > 0,
    });

    if (expandedSet.has(cat.id)) {
      for (const article of directArticles) {
        rows.push({ kind: 'article', article, depth: depth + 1 });
      }
      for (const child of children) appendCategory(child, depth + 1);
    }
  };
  for (const root of roots) appendCategory(root, 0);

  // Uncategorized articles at the bottom
  const knownCategoryIds = new Set(categories.map((category) => category.id));
  // 兼容历史失效引用：分类不存在的文章仍显示在无分类区域，不能静默丢掉。
  const uncategorized = articles.filter((a) => !a.categoryId || !knownCategoryIds.has(a.categoryId));
  for (const article of uncategorized) {
    rows.push({ kind: 'article', article, depth: 0 });
  }

  return rows;
}

// ---- Component ----

export default function KnowledgeList({ searchQuery, knowledgeBaseId, categoryId, onStatsChange }: Props) {
  const scope = JSON.stringify([knowledgeBaseId, searchQuery]);
  const beginRequest = useLatestRequest(scope);
  const [dataScope, setDataScope] = useState<string | null>(null);
  const [loadedArticles, setArticles] = useState<KnowledgeItem[]>([]);
  const [loadedCategories, setCategories] = useState<CategoryData[]>([]);
  const articles = useMemo(() => dataScope === scope ? loadedArticles : [], [dataScope, scope, loadedArticles]);
  const categories = useMemo(() => dataScope === scope ? loadedCategories : [], [dataScope, scope, loadedCategories]);
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
    const isCurrent = beginRequest();
    if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      setDataScope(scope);
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
      if (!isCurrent()) return;
      if ((err as ApiError).code === 401) return;
      setError((err as Error).message);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [searchQuery, knowledgeBaseId, beginRequest, scope]);

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
        setExpandedCategories(prev => {
          const next = new Set(prev);
          for (const cat of categories) {
            if (isDescendantOf(target, cat) || target.id === cat.id) next.add(cat.id);
          }
          return next;
        });
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

  const visibleSelectedIds = useMemo(
    () => new Set([...selectedIds].filter(id => articleIds.has(id))),
    [selectedIds, articleIds]
  );
  // 折叠或筛选隐藏的文章取消勾选，防止批量操作触及不可见内容。
  useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id => articleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [articleIds]);

  useEffect(() => {
    setSelectedIds(new Set());
    setMovePickerOpen(false);
  }, [knowledgeBaseId, categoryId, searchQuery]);

  // ---- Handlers ----

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这篇文章吗？')) return;
    const isCurrent = beginRequest();
    try {
      await deleteKnowledge(id);
      if (isCurrent()) void fetchData();
    } catch (err) {
      if (isCurrent()) { setError((err as Error).message); setLoading(false); }
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
    if (visibleSelectedIds.size === articleIds.size) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(articleIds));
    }
  };

  const toggleSelect = (id: string) => {
    if (!articleIds.has(id)) return;
    const next = new Set(visibleSelectedIds);
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
    const ids = Array.from(visibleSelectedIds);
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
    const ids = Array.from(visibleSelectedIds);
    if (ids.length === 0) return;
    const isCurrent = beginRequest();

    let moved = 0;
    let failed = 0;
    for (const id of ids) {
      const article = articles.find((a) => a.id === id);
      if (!article) { failed++; continue; }
      try {
        await moveKnowledgeToCategory(id, targetCategoryId);
        moved++;
      } catch { failed++; }
    }

    if (!isCurrent()) return;
    exitSelectMode();
    void fetchData();
    if (failed > 0) {
      setError(`移动完成: ${moved} 成功, ${failed} 失败`);
    }
  };

  // ---- Render helpers ----

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
                  checked={articleIds.size > 0 && visibleSelectedIds.size === articleIds.size}
                  onChange={toggleSelectAll}
                />
                <span>全选可见文章</span>
              </label>
              <span className={styles.selectedCount}>
                已选 {visibleSelectedIds.size} 项
              </span>
            </div>
            <div className={styles.toolbarRight}>
              <button
                className={styles.btnMoveToCategory}
                onClick={() => setMovePickerOpen(true)}
                disabled={visibleSelectedIds.size === 0}
              >
                移动到分类
              </button>
              <button
                className={styles.btnBatchDelete}
                onClick={handleBatchDelete}
                disabled={visibleSelectedIds.size === 0}
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
                <button
                  className={styles.categoryToggle}
                  onClick={() => toggleExpand(cat.id)}
                  aria-label={isExpanded ? '折叠' : '展开'}
                  aria-expanded={isExpanded}
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
                    checked={visibleSelectedIds.has(article.id)}
                    onChange={() => toggleSelect(article.id)}
                  />
                </label>
              )}
              <Link
                href={`/article?id=${article.id}`}
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
