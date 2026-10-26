'use client';

import Link from 'next/link';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  listKnowledgeBases,
  createKnowledgeBase,
  renameKnowledgeBase,
  deleteKnowledgeBase,
  listCategories,
  type KnowledgeBaseData,
  type CategoryData,
} from '@komo/shared/api-client';
import styles from './KnowledgeBaseSidebar.module.css';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { flattenCategoryTree } from '@/lib/categoryTree';

interface Props {
  selectedId: string | null;
  selectedCategoryId: string | null;
  onSelect: (kb: KnowledgeBaseData | null) => void;
  onCategorySelect: (categoryId: string | null) => void;
}

export default function KnowledgeBaseSidebar({
  selectedId,
  selectedCategoryId,
  onSelect,
  onCategorySelect,
}: Props) {
  const [kbs, setKbs] = useState<KnowledgeBaseData[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [categoryData, setCategories] = useState<CategoryData[]>([]);
  const [categoryKb, setCategoryKb] = useState<string | null>(null);
  const categories = categoryKb === selectedId ? categoryData : [];
  const beginCategories = useLatestRequest(selectedId ?? '');
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const beginBases = useLatestRequest('knowledge-bases');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const fetchBases = useCallback(async () => {
    if (savingRef.current) return;
    const isCurrent = beginBases();
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listKnowledgeBases();
      if (!isCurrent()) return;
      setKbs(data);
      if (data.length > 0 && !selectedRef.current) onSelectRef.current(data.find(kb => kb.type === 'DEFAULT') || data[0]);
    } catch (err) {
      if (isCurrent()) setLoadError((err as Error).message || '知识库加载失败，请重试');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [beginBases]);

  useEffect(() => { void fetchBases(); }, [fetchBases]);

  const fetchCategories = async (kbId: string) => {
    const isCurrent = beginCategories();
    setCategoriesLoading(true);
    setCategoryError(null);
    try {
      const data = await listCategories(kbId);
      if (!isCurrent()) return;
      setCategoryKb(kbId);
      setCategories(data);
    } catch (err) {
      if (isCurrent()) setCategoryError((err as Error).message || '分类加载失败，请重试');
    } finally {
      if (isCurrent()) setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    if (selectedId) {
      fetchCategories(selectedId);
    } else {
      setCategories([]);
      setCategoryError(null);
      setCategoriesLoading(false);
    }
  }, [selectedId]);

  const runMutation = async <T,>(request: () => Promise<T>, onSuccess: (value: T) => void, fallback: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setActionError(null);
    const isCurrent = beginBases();
    try {
      const value = await request();
      if (isCurrent()) onSuccess(value);
    } catch (err) {
      if (isCurrent()) setActionError((err as Error).message || fallback);
    } finally {
      savingRef.current = false;
      if (isCurrent()) { setSaving(false); setLoading(false); }
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const selectedAtStart = selectedRef.current;
    await runMutation(() => createKnowledgeBase(newName.trim()), kb => {
      setKbs((prev) => [...prev, kb]);
      setNewName('');
      setCreating(false);
      if (selectedRef.current === selectedAtStart) onSelectRef.current(kb);
    }, '创建失败，请重试');
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await runMutation(() => renameKnowledgeBase(id, editName.trim()), updated => {
      setKbs((prev) => prev.map((kb) => (kb.id === id ? updated : kb)));
      setEditingId(null);
      if (selectedRef.current === id) onSelectRef.current(updated);
    }, '重命名失败，请重试');
  };

  const handleDelete = async (id: string) => {
    if (savingRef.current) return;
    if (!confirm('确定删除此知识库？仅可删除没有文章、分类和会话的空知识库。')) return;
    await runMutation(() => deleteKnowledgeBase(id), () => {
      setKbs((prev) => prev.filter((kb) => kb.id !== id));
      if (selectedRef.current === id) {
        const remaining = kbs.filter((kb) => kb.id !== id);
        onSelectRef.current(remaining.length > 0 ? remaining[0] : null);
      }
    }, '删除失败，请稍后重试');
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'SYSTEM_FRAGMENTS': return '📦';
      case 'DEFAULT': return '📚';
      default: return '📁';
    }
  };

  return (
    <div className={styles.sidebar}>
      {actionError && <p className={styles.errorMsg} role="alert">{actionError}</p>}
      {loadError && <div className={styles.errorMsg} role="alert">{loadError}
        <button className={styles.createConfirm} disabled={loading || saving} onClick={() => void fetchBases()}>重试知识库</button>
      </div>}
      <div className={styles.header}>
        <span className={styles.title}>知识库</span>
        <button
          className={styles.addBtn}
          onClick={() => setCreating(!creating)}
          title="新建知识库"
          disabled={saving || loading || !!loadError}
        >
          +
        </button>
      </div>

      {/* 新建输入框 */}
      {creating && (
        <div className={styles.createRow}>
          <input
            className={styles.createInput}
            type="text"
            placeholder="知识库名称"
            value={newName}
            disabled={saving}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
            autoFocus
          />
          <button className={styles.createConfirm} disabled={saving || !newName.trim()} onClick={handleCreate}>
            创建
          </button>
        </div>
      )}

      {/* KB 列表 */}
      <div className={styles.list}>
        {kbs.map((kb) => (
          <div
            key={kb.id}
            className={`${styles.item} ${
              selectedId === kb.id ? styles.itemActive : ''
            } ${!kb.isDeletable ? styles.itemSystem : ''}`}
          >
            {editingId === kb.id ? (
              <div className={styles.editRow}>
                <input
                  className={styles.editInput}
                  type="text"
                  value={editName}
                  disabled={saving}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(kb.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                />
              </div>
            ) : (
              <button
                className={styles.itemBtn}
                onClick={() => onSelect(kb)}
              >
                <span className={styles.itemIcon}>{getIcon(kb.type)}</span>
                <span className={styles.itemName}>{kb.name}</span>
                {!kb.isDeletable && (
                  <span className={styles.systemBadge}>系统</span>
                )}
              </button>
            )}

            {/* 操作菜单（仅用户创建的 KB） */}
            {kb.isDeletable && editingId !== kb.id && (
              <div className={styles.itemActions}>
                <button
                  className={styles.actionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(kb.id);
                    setEditName(kb.name);
                  }}
                  title="重命名"
                  disabled={saving}
                >
                  ✎
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(kb.id);
                  }}
                  title="删除"
                  disabled={saving}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {kbs.length === 0 && !loadError && (
        <p className={styles.empty}>{loading ? '加载中...' : '暂无知识库'}</p>
      )}

      {/* Category Tree — only when a KB is selected */}
      {selectedId && (
        <div className={styles.catSection}>
          <div className={styles.catHeader}>
            <span className={styles.catTitle}>分类</span>
            <Link href="/categories" className={styles.catManageLink}>管理</Link>
          </div>
          {categoryError && <div className={styles.errorMsg} role="alert">{categoryError}
            <button className={styles.createConfirm} disabled={categoriesLoading} onClick={() => void fetchCategories(selectedId)}>重试分类</button>
          </div>}
          {categoriesLoading && <p className={styles.catEmpty}>分类加载中...</p>}
          {categories.length === 0 && !categoriesLoading && !categoryError && <p className={styles.catEmpty}>暂无分类</p>}
          {categories.length > 0 && (
            <div className={styles.catList}>
              {/* "全部" 选项 */}
              <button
                className={`${styles.catItem} ${selectedCategoryId === null ? styles.catItemActive : ''}`}
                onClick={() => onCategorySelect(null)}
              >
                全部
              </button>
              {flattenCategoryTree(categories).map(({ category: cat, depth }) => {
                  return (
                    <button
                      key={cat.id}
                      className={`${styles.catItem} ${selectedCategoryId === cat.id ? styles.catItemActive : ''}`}
                      style={{ paddingLeft: 20 + depth * 16 }}
                      onClick={() => onCategorySelect(cat.id)}
                    >
                      {cat.name}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* 全部文章入口 */}
      <div className={styles.footer}>
        <button
          className={`${styles.itemBtn} ${selectedId === null ? styles.itemActive : ''}`}
          onClick={() => onSelect(null)}
        >
          <span className={styles.itemIcon}>📋</span>
          <span className={styles.itemName}>全部文章</span>
        </button>
      </div>
    </div>
  );
}
