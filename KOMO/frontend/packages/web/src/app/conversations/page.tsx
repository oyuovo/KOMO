'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  listConversations,
  createConversation,
  deleteConversation,
  getToken,
  type ConversationData,
} from '@komo/shared/api-client';
import BatchDeleteOverlay, {
  type BatchDeleteState,
} from '@/components/BatchDeleteOverlay/BatchDeleteOverlay';
import styles from './page.module.css';

export default function ConversationsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/');
      return;
    }
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const data = await listConversations();
      setConversations(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const conv = await createConversation();
      setConversations((prev) => [conv, ...prev]);
      router.push(`/conversations/${conv.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这个对话吗？消息记录将被永久删除。')) return;
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // 选择模式
  const toggleSelectAll = () => {
    if (selectedIds.size === conversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(conversations.map((c) => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`确定要删除选中的 ${ids.length} 个对话吗？消息记录将被永久删除。`)) return;

    setBatchState({
      phase: 'deleting',
      total: ids.length,
      current: 0,
      deleted: 0,
      failed: 0,
    });

    let deleted = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await deleteConversation(ids[i]);
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
    fetchConversations();
  };

  return (
    <div className={styles.page}>
      {/* 批量删除遮罩 */}
      <BatchDeleteOverlay state={batchState} onClose={handleBatchClose} />

      {/* Header Row */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>对话</h1>
          <p className={styles.subtitle}>
            {conversations.length} 个对话
          </p>
        </div>
        <div className={styles.headerActions}>
          {!selectMode ? (
            <>
              <button
                className={styles.btnSelect}
                onClick={() => setSelectMode(true)}
                disabled={conversations.length === 0}
              >
                选择
              </button>
              <button
                className={styles.btnNew}
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? '创建中...' : '+ 新对话'}
              </button>
            </>
          ) : (
            <>
              <button
                className={styles.btnCancelSelect}
                onClick={exitSelectMode}
              >
                取消
              </button>
              <button
                className={styles.btnBatchDelete}
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
              >
                批量删除
              </button>
            </>
          )}
        </div>
      </div>

      {/* 全选栏（选择模式） */}
      {selectMode && (
        <div className={styles.selectBar}>
          <label className={styles.selectAllLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={
                conversations.length > 0 && selectedIds.size === conversations.length
              }
              onChange={toggleSelectAll}
            />
            <span>全选 · 已选 {selectedIds.size} 项</span>
          </label>
        </div>
      )}

      {/* Conversation List */}
      <div className={styles.list}>
        {loading && (
          <p className={styles.statusMsg}>加载中...</p>
        )}
        {error && (
          <p className={styles.errorMsg}>加载失败: {error}</p>
        )}
        {!loading && conversations.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyIcon}>💬</p>
            <p className={styles.emptyTitle}>还没有对话</p>
            <p className={styles.emptyDesc}>
              开始一次 AI 对话，探索知识、解答疑惑
            </p>
            <button
              className={styles.btnNew}
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? '创建中...' : '开始第一次对话'}
            </button>
          </div>
        )}
        {conversations.map((conv) => (
          <div key={conv.id} className={styles.convRow}>
            {selectMode && (
              <label className={styles.checkboxCell}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={selectedIds.has(conv.id)}
                  onChange={() => toggleSelect(conv.id)}
                />
              </label>
            )}
            <Link
              href={`/conversations/${conv.id}`}
              className={`${styles.convContent} ${
                selectMode ? styles.convContentSelect : ''
              }`}
              onClick={(e) => {
                if (selectMode) e.preventDefault();
              }}
            >
              <span className={styles.convIcon}>💬</span>
              <span className={styles.convTitle}>{conv.title}</span>
              <span className={styles.convTime}>
                {new Date(conv.updatedAt).toLocaleDateString('zh-CN')}
              </span>
            </Link>
            {!selectMode && (
              <button
                className={styles.deleteBtn}
                onClick={(e) => handleDelete(conv.id, e)}
                title="删除对话"
              >
                删除
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
