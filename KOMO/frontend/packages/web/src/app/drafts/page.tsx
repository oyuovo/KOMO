'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import {
  getMe,
  listDrafts,
  confirmDraft,
  editAndConfirmDraft,
  rejectDraft,
  listKnowledgeBases,
  listKnowledge,
  type DraftData,
  type KnowledgeBaseData,
  type KnowledgeItem,
} from '@komo/shared/api-client';
import { draftDestination, readDraftRelation, resolveDraftParent, processDraftSelection, type DraftParent } from '@/lib/draftRouting';
import styles from './page.module.css';

// ===== 日期工具 =====

interface DateGroup {
  label: string;
  drafts: DraftData[];
}

function formatDate(dateStr: string): { groupLabel: string; time: string } {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  if (target.getTime() === today.getTime()) {
    return { groupLabel: '今天', time };
  }
  if (target.getTime() === yesterday.getTime()) {
    return { groupLabel: '昨天', time };
  }
  // 同一年: "7月10日"
  if (d.getFullYear() === now.getFullYear()) {
    return {
      groupLabel: `${d.getMonth() + 1}月${d.getDate()}日`,
      time,
    };
  }
  return {
    groupLabel: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time,
  };
}

function groupDraftsByDate(drafts: DraftData[]): DateGroup[] {
  const groups = new Map<string, DraftData[]>();
  for (const draft of drafts) {
    const { groupLabel } = formatDate(draft.createdAt);
    if (!groups.has(groupLabel)) groups.set(groupLabel, []);
    groups.get(groupLabel)!.push(draft);
  }
  // 保持原顺序（后端已按时间倒序），只输出分组
  const seen = new Set<string>();
  const result: DateGroup[] = [];
  for (const draft of drafts) {
    const { groupLabel } = formatDate(draft.createdAt);
    if (!seen.has(groupLabel)) {
      seen.add(groupLabel);
      result.push({ label: groupLabel, drafts: groups.get(groupLabel)! });
    }
  }
  return result;
}

export default function DraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftData[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [kbs, setKbs] = useState<KnowledgeBaseData[]>([]);
  // 每个草稿的选中目标 KB（key=draftId, value=knowledgeBaseId）
  const [targetKb, setTargetKb] = useState<Record<string, string>>({});
  // undefined 采用关联建议，null 为用户取消关联
  const [searchParent, setSearchParent] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, KnowledgeItem[]>>({});
  const [selectedParent, setSelectedParent] = useState<Record<string, DraftParent | null>>({});

  useEffect(() => {
    getMe().then((u) => {
      if (!u) {
        router.push('/login');
        return;
      }
      fetchDrafts();
      listKnowledgeBases().then(setKbs).catch((err) => {
        console.warn('加载草稿目标知识库失败', err);
      });
    }).catch((err) => { setError(err.message); setLoading(false); });
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

  // 搜索可关联的文章
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

  const destinationFor = (draft: DraftData) => draftDestination(
    draft, selectedParent[draft.id], targetKb[draft.id] ?? getDefaultKbId(draft.extractType) ?? undefined,
  );

  const removeCompleted = (ids: Set<string>) => {
    setDrafts((prev) => prev.filter((draft) => !ids.has(draft.id)));
    setSelectedIds((prev) => new Set([...prev].filter((id) => !ids.has(id))));
  };

  const handleConfirm = async (draft: DraftData) => {
    setProcessing(true);
    setError(null);
    try {
      const target = destinationFor(draft);
      await confirmDraft(draft.id, target.knowledgeBaseId, target.parentEntryId);
      removeCompleted(new Set([draft.id]));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(true);
    setError(null);
    try {
      await rejectDraft(id);
      removeCompleted(new Set([id]));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const handleEditConfirm = async (draft: DraftData) => {
    setProcessing(true);
    setError(null);
    try {
      const target = destinationFor(draft);
      await editAndConfirmDraft(draft.id, editTitle, editContent, target.knowledgeBaseId, target.parentEntryId);
      removeCompleted(new Set([draft.id]));
      setEditingId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const handleBatch = async (action: 'confirm' | 'reject') => {
    setProcessing(true);
    setError(null);
    try {
      const selected = drafts.filter((draft) => selectedIds.has(draft.id));
      const result = await processDraftSelection(selected, (draft) => {
        if (action === 'reject') return rejectDraft(draft.id);
        const target = destinationFor(draft);
        return confirmDraft(draft.id, target.knowledgeBaseId, target.parentEntryId);
      });
      removeCompleted(result.succeeded);
      if (result.failed.length) {
        setError(`${result.succeeded.size} 条已处理，${result.failed.length} 条失败；失败草稿已保留，请检查目标或稍后重试。`);
      }
    } finally {
      setProcessing(false);
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
      case 'DUPLICATE': return { text: '疑似重复', cls: styles.badgeDuplicate };
      default: return null;
    }
  };

  const dateGroups = useMemo(() => groupDraftsByDate(drafts), [drafts]);

  return (
    <fieldset className={styles.page} disabled={processing} aria-busy={processing}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>历史草稿</h1>
          <p className={styles.subtitle}>
            {drafts.length} 条待处理 · 提取流程已暂停
          </p>
        </div>
        {selectedIds.size > 0 && (
          <div className={styles.batchActions}>
            <button className={styles.btnConfirm} onClick={() => handleBatch('confirm')} disabled={editingId !== null}>
              确认选中 ({selectedIds.size})
            </button>
            <button className={styles.btnReject} onClick={() => handleBatch('reject')} disabled={editingId !== null}>
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
              可以打开文档边读边问，理解后自行编辑完善
            </p>
          </div>
        )}
        {dateGroups.map((group) => (
          <div key={group.label} className={styles.dateGroup}>
            {/* Date Header */}
            <div className={styles.dateGroupHeader}>
              <span className={styles.dateGroupLabel}>{group.label}</span>
              <span className={styles.dateGroupCount}>{group.drafts.length} 条</span>
              <div className={styles.dateGroupLine} />
            </div>
            {/* Draft Cards */}
            {group.drafts.map((draft) => {
              const extType = extractTypeLabel(draft.extractType);
              const rel = relationLabel(draft.relationType);
              const { time } = formatDate(draft.createdAt);
              const { matchedEntryId, matchedDraftId } = readDraftRelation(draft);
              const parent = resolveDraftParent(draft, selectedParent[draft.id]);
              const matchedDraft = drafts.find((item) => item.id === matchedDraftId);
              return (
                <div
                  key={draft.id}
                  id={`draft-${draft.id}`}
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
                      <p className={styles.targetNote}>
                        {parent ? <>保存后关联到 <Link href={`/article?id=${encodeURIComponent(parent.id)}`}>{parent.title}</Link>，原文章正文保持不变。</>
                          : `保存到「${kbs.find((kb) => kb.id === destinationFor(draft).knowledgeBaseId)?.name ?? '默认知识库'}」，作为独立条目。`}
                      </p>
                      <div className={styles.editActions}>
                        <button
                          className={styles.btnConfirm}
                          onClick={() => handleEditConfirm(draft)}
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
                          <span className={styles.cardDate}>{time}</span>
                          {extType && <span className={extType.cls}>{extType.text}</span>}
                          {rel && <span className={rel.cls}>{rel.text}</span>}
                          <span className={styles.badgeConfidence}>
                            提取置信度 {(draft.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <p className={styles.cardContent}>
                        {draft.content.slice(0, 200)}
                        {draft.content.length > 200 ? '...' : ''}
                      </p>
                      {draft.relationType === 'DUPLICATE' && (
                        <div className={styles.reviewNotice}>
                          <p>这条内容可能与已有内容重复，草稿已保留。请比较后决定是否入库。</p>
                          {matchedEntryId ? (
                            <Link href={`/article?id=${encodeURIComponent(matchedEntryId)}`}>
                              查看相似知识条目
                            </Link>
                          ) : matchedDraft ? (
                            <a href={`#draft-${matchedDraft.id}`}>查看相似草稿：{matchedDraft.title}</a>
                          ) : (
                            <p>暂时没有可查看的匹配内容，你仍可以编辑或保留这条草稿。</p>
                          )}
                        </div>
                      )}
                      <details className={styles.fullContent}>
                        <summary>查看完整内容</summary>
                        <MarkdownRenderer content={draft.content} />
                      </details>
                      {/* 目标去向 */}
                      {parent ? (
                        <div className={styles.kbRow}>
                          <span className={styles.kbLabel}>📎 关联到</span>
                          <span className={styles.parentHint}>
                            <Link href={`/article?id=${encodeURIComponent(parent.id)}`}>{parent.title}</Link>
                            <button
                              className={styles.parentClear}
                              aria-label="取消关联，独立入库"
                              onClick={() => setSelectedParent((prev) => ({ ...prev, [draft.id]: null }))}
                            >
                              ×
                            </button>
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
                      {parent && <p className={styles.targetNote}>将保存为同一知识库中的独立补充条目，不会改写原文章正文。</p>}
                      {/* 手动选择关联文章 */}
                      {!parent && (
                        <div className={styles.embedRow}>
                          <input
                            className={styles.embedSearch}
                            type="text"
                            placeholder="或搜索要关联的文章..."
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
                          onClick={() => handleConfirm(draft)}
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
        ))}
      </div>
    </fieldset>
  );
}
