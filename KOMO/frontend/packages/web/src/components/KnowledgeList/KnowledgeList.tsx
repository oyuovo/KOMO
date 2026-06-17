'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  listKnowledge,
  deleteKnowledge,
  batchDeleteKnowledge,
  ApiError,
  type KnowledgeItem,
  type PageData,
  type BatchDeleteResult,
} from '@komo/shared/api-client';
import BatchDeleteOverlay, {
  type BatchDeleteState,
} from '@/components/BatchDeleteOverlay/BatchDeleteOverlay';
import styles from './KnowledgeList.module.css';

export interface KnowledgeStats {
  count: number;
  latestDate: string | null;
}

interface Props {
  searchQuery: string;
  knowledgeBaseId: string | null;
  onStatsChange?: (stats: KnowledgeStats) => void;
}

export default function KnowledgeList({ searchQuery, knowledgeBaseId, onStatsChange }: Props) {
  const [articles, setArticles] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 选择模式
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 批量删除状态
  const [batchState, setBatchState] = useState<BatchDeleteState>({
    phase: 'idle',
    total: 0,
    current: 0,
    deleted: 0,
    failed: 0,
  });

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: PageData<KnowledgeItem> = await listKnowledge({
        q: searchQuery || undefined,
        kb: knowledgeBaseId || undefined,
      });
      setArticles(data.content);
      if (onStatsChange) {
        const latestDate = data.content.length > 0
          ? new Date(Math.max(...data.content.map((a) => new Date(a.updatedAt).getTime())))
              .toLocaleDateString('zh-CN')
          : null;
        onStatsChange({ count: data.totalElements, latestDate });
      }
    } catch (err) {
      if ((err as ApiError).code === 401) return;
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, knowledgeBaseId]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // 单个删除
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这篇文章吗？')) return;
    try {
      await deleteKnowledge(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // 全选切换
  const toggleSelectAll = () => {
    if (selectedIds.size === articles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(articles.map((a) => a.id)));
    }
  };

  // 单项选择切换
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // 退出选择模式
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // 批量删除
  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`确定要删除选中的 ${ids.length} 篇文章吗？此操作不可撤销。`)) return;

    setBatchState({
      phase: 'deleting',
      total: ids.length,
      current: 0,
      deleted: 0,
      failed: 0,
    });

    // 逐条删除，更新进度
    let deleted = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await deleteKnowledge(ids[i]);
        deleted++;
      } catch {
        failed++;
      }
      setBatchState((prev) => ({
        ...prev,
        current: i + 1,
        deleted,
        failed,
      }));
    }

    setBatchState((prev) => ({
      ...prev,
      phase: 'done',
      deleted,
      failed,
    }));
  };

  const handleBatchClose = () => {
    setBatchState({ phase: 'idle', total: 0, current: 0, deleted: 0, failed: 0 });
    exitSelectMode();
    fetchArticles();
  };

  return (
    <>
      {/* 批量删除遮罩 */}
      <BatchDeleteOverlay state={batchState} onClose={handleBatchClose} />

      {/* 工具栏 */}
      <div className={styles.toolbar}>
        {!selectMode ? (
          <button
            className={styles.btnSelectMode}
            onClick={() => setSelectMode(true)}
            disabled={articles.length === 0}
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
                  checked={
                    articles.length > 0 && selectedIds.size === articles.length
                  }
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
                className={styles.btnBatchDelete}
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
              >
                批量删除
              </button>
              <button
                className={styles.btnCancelSelect}
                onClick={exitSelectMode}
              >
                取消选择
              </button>
            </div>
          </>
        )}
      </div>

      {/* 列表 */}
      <div className={styles.articleList}>
        {loading && (
          <p className={styles.statusMsg}>加载中...</p>
        )}
        {error && (
          <p className={styles.errorMsg}>加载失败: {error}</p>
        )}
        {!loading && articles.length === 0 && (
          <p className={styles.statusMsg}>
            还没有文章。开始一次 AI 对话来创建你的第一条知识。
          </p>
        )}
        {articles.map((article) => (
          <div key={article.id} className={styles.articleRow}>
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
              className={`${styles.articleLink} ${
                selectMode ? styles.articleLinkSelect : ''
              }`}
            >
              <span
                className={`${styles.badge} ${
                  article.status === 'PUBLISHED'
                    ? styles.badgePublished
                    : styles.badgeDraft
                }`}
              >
                {article.status === 'PUBLISHED' ? '已发布' : '草稿'}
              </span>
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
        ))}
      </div>
    </>
  );
}
