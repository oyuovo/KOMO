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
  listKnowledgeBases,
  listKnowledge,
  type DraftData,
  type KnowledgeBaseData,
  type KnowledgeItem,
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
  const [kbs, setKbs] = useState<KnowledgeBaseData[]>([]);
  // 每个草稿的选中目标 KB（key=draftId, value=knowledgeBaseId）
  const [targetKb, setTargetKb] = useState<Record<string, string>>({});
  // 手动选择嵌入文章
  const [searchParent, setSearchParent] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, KnowledgeItem[]>>({});
  const [selectedParent, setSelectedParent] = useState<Record<string, { id: string; title: string } | null>>({});

  useEffect(() => {
    if (!getToken()) {
      router.push('/');
      return;
    }
    fetchDrafts();
    listKnowledgeBases().then(setKbs).catch(() => {});
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

  // 根据 extractType 获取智能默认知识库 ID
  const getDefaultKbId = (extractType: string | null): string | null => {
    if (extractType === 'FRAGMENT') {
      const frag = kbs.find((kb) => kb.type === 'SYSTEM_FRAGMENTS');
      return frag?.id ?? null;
    }
    const def = kbs.find((kb) => kb.type === 'DEFAULT');
    return def?.id ?? kbs[0]?.id ?? null;
  };

  // 搜索文章（防抖）
  const handleArticleSearch = async (draftId: string, query: string) => {
    setSearchParent((prev) => ({ ...prev, [draftId]: query }));
    if (query.length < 2) {
      setSearchResults((prev) => ({ ...prev, [draftId]: [] }));
      return;
    }
    try {
      const result = await listKnowledge({ q: query, size: 5 });
      setSearchResults((prev) => ({ ...prev, [draftId]: result.content }));
    } catch {
      setSearchResults((prev) => ({ ...prev, [draftId]: [] }));
    }
  };

  const handleConfirm = async (id: string, draftExtractType: string | null) => {
    try {
      const kbId = targetKb[id] ?? getDefaultKbId(draftExtractType);
      const parent = selectedParent[id];
      await confirmDraft(id, parent ? undefined : (kbId ?? undefined), parent?.id);
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

  const handleEditConfirm = async (id: string, draftExtractType: string | null) => {
    try {
      const kbId = targetKb[id] ?? getDefaultKbId(draftExtractType);
      await editAndConfirmDraft(id, editTitle, editContent, kbId ?? undefined);
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

  // 提取类型标签
  const extractTypeLabel = (type: string | null) => {
    switch (type) {
      case 'ARTICLE': return { text: '📄 新知文章', cls: styles.badgeArticle };
      case 'FRAGMENT': return { text: '📦 知识碎片', cls: styles.badgeFragment };
      case 'SUPPLEMENT': return { text: '📎 补充已有', cls: styles.badgeExtSupplement };
      default: return null;
    }
  };

  // 关系类型标签
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
          const extType = extractTypeLabel(draft.extractType);
          const rel = relationLabel(draft.relationType);
          // 解析 relationDetail 中的父文章 ID
          let parentEntryId: string | null = null;
          try {
            if (draft.relationDetail) {
              const detail = JSON.parse(draft.relationDetail);
              parentEntryId = detail.parentEntryId || null;
            }
          } catch { /* ignore */ }
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
                      onClick={() => handleEditConfirm(draft.id, draft.extractType)}
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
                      {extType && <span className={extType.cls}>{extType.text}</span>}
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
                  {/* 目标去向 */}
                  {selectedParent[draft.id] ? (
                    <div className={styles.kbRow}>
                      <span className={styles.kbLabel}>📎 嵌入到</span>
                      <span className={styles.parentHint}>
                        {selectedParent[draft.id]!.title}
                        <button
                          className={styles.parentClear}
                          onClick={() => setSelectedParent((prev) => ({ ...prev, [draft.id]: null }))}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  ) : parentEntryId ? (
                    <div className={styles.kbRow}>
                      <span className={styles.kbLabel}>📎 嵌入到</span>
                      <span className={styles.parentHint}>
                        已有文章
                        <span className={styles.parentId}>{parentEntryId.slice(0, 8)}...</span>
                      </span>
                    </div>
                  ) : (
                    <div className={styles.kbRow}>
                      <span className={styles.kbLabel}>入库到</span>
                      <select
                        className={styles.kbSelect}
                        value={targetKb[draft.id] ?? getDefaultKbId(draft.extractType) ?? ''}
                        onChange={(e) =>
                          setTargetKb((prev) => ({ ...prev, [draft.id]: e.target.value }))
                        }
                      >
                        {kbs.map((kb) => (
                          <option key={kb.id} value={kb.id}>
                            {kb.type === 'SYSTEM_FRAGMENTS' ? '📦' : '📚'} {kb.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {/* 手动搜索文章嵌入 */}
                  {!selectedParent[draft.id] && (
                    <div className={styles.embedRow}>
                      <input
                        className={styles.embedSearch}
                        type="text"
                        placeholder="或搜索文章嵌入..."
                        value={searchParent[draft.id] || ''}
                        onChange={(e) => handleArticleSearch(draft.id, e.target.value)}
                      />
                      {(searchResults[draft.id]?.length ?? 0) > 0 && (
                        <div className={styles.embedResults}>
                          {searchResults[draft.id]!.map((item) => (
                            <button
                              key={item.id}
                              className={styles.embedResultItem}
                              onClick={() => {
                                setSelectedParent((prev) => ({
                                  ...prev,
                                  [draft.id]: { id: item.id, title: item.title },
                                }));
                                setSearchParent((prev) => ({ ...prev, [draft.id]: '' }));
                                setSearchResults((prev) => ({ ...prev, [draft.id]: [] }));
                              }}
                            >
                              {item.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={styles.cardActions}>
                    <button
                      className={styles.btnConfirm}
                      onClick={() => handleConfirm(draft.id, draft.extractType)}
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
