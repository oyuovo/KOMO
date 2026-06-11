'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import {
  getToken,
  listDrafts,
  confirmDraft,
  editAndConfirmDraft,
  rejectDraft,
  batchConfirmDrafts,
  batchRejectDrafts,
  type DraftData,
} from '@komo/shared/api-client';
import styles from './page.module.css';

export default function DraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.push('/');
      return;
    }
    fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    setLoading(true);
    try {
      const data = await listDrafts();
      setDrafts(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      await confirmDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleEditConfirm = async (id: string) => {
    try {
      await editAndConfirmDraft(id, editTitle, editContent);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      setEditingId(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleBatchConfirm = async () => {
    try {
      const ids = Array.from(selectedIds);
      await batchConfirmDrafts(ids);
      setDrafts((prev) => prev.filter((d) => !selectedIds.has(d.id)));
      setSelectedIds(new Set());
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleBatchReject = async () => {
    try {
      const ids = Array.from(selectedIds);
      await batchRejectDrafts(ids);
      setDrafts((prev) => prev.filter((d) => !selectedIds.has(d.id)));
      setSelectedIds(new Set());
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 关系类型标签（Vue 等价: v-if 条件渲染不同 badge）
  const relationLabel = (type: string | null) => {
    switch (type) {
      case 'NEW': return { text: '新知', cls: styles.badgeNew };
      case 'SUPPLEMENTS': return { text: '关联', cls: styles.badgeSupplement };
      case 'CONTRADICTS': return { text: '存疑', cls: styles.badgeContradict };
      default: return null;
    }
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>知识草稿</h1>
          <p className={styles.subtitle}>
            {drafts.length} 条待处理 · AI 对话中自动提取
          </p>
        </div>
        {selectedIds.size > 0 && (
          <div className={styles.batchActions}>
            <button className={styles.btnConfirm} onClick={handleBatchConfirm}>
              确认选中 ({selectedIds.size})
            </button>
            <button className={styles.btnReject} onClick={handleBatchReject}>
              驳回选中
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Draft List */}
      <div className={styles.list}>
        {loading && <p className={styles.statusMsg}>加载中...</p>}
        {!loading && drafts.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyIcon}>📝</p>
            <p className={styles.emptyTitle}>没有待处理的草稿</p>
            <p className={styles.emptyDesc}>
              开始一次 AI 对话，系统会自动从回复中提取知识点
            </p>
          </div>
        )}
        {drafts.map((draft) => {
          const rel = relationLabel(draft.relationType);
          return (
            <div
              key={draft.id}
              className={`${styles.card} ${editingId === draft.id ? styles.cardEditing : ''}`}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selectedIds.has(draft.id)}
                onChange={() => toggleSelect(draft.id)}
              />

              {/* Content */}
              {editingId === draft.id ? (
                <div className={styles.editForm}>
                  <input
                    className={styles.editTitle}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="标题"
                  />
                  <textarea
                    className={styles.editContent}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={6}
                    placeholder="Markdown 内容"
                  />
                  <div className={styles.editActions}>
                    <button
                      className={styles.btnConfirm}
                      onClick={() => handleEditConfirm(draft.id)}
                    >
                      保存并确认
                    </button>
                    <button
                      className={styles.btnCancel}
                      onClick={() => setEditingId(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.cardBody}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{draft.title}</h3>
                    <div className={styles.cardBadges}>
                      {rel && <span className={rel.cls}>{rel.text}</span>}
                      <span className={styles.badgeConfidence}>
                        置信度 {(draft.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <p className={styles.cardContent}>
                    {draft.content.slice(0, 200)}
                    {draft.content.length > 200 ? '...' : ''}
                  </p>
                  <div className={styles.cardActions}>
                    <button
                      className={styles.btnConfirm}
                      onClick={() => handleConfirm(draft.id)}
                    >
                      确认入库
                    </button>
                    <button
                      className={styles.btnEdit}
                      onClick={() => {
                        setEditingId(draft.id);
                        setEditTitle(draft.title);
                        setEditContent(draft.content);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      className={styles.btnRejectText}
                      onClick={() => handleReject(draft.id)}
                    >
                      驳回
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
