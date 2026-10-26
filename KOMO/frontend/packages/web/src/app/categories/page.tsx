'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getMe,
  listKnowledgeBases,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type KnowledgeBaseData,
  type CategoryData,
} from '@komo/shared/api-client';
import styles from './page.module.css';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { flattenCategoryTree } from '@/lib/categoryTree';

export default function CategoriesPage() {
  const [needsAuth, setNeedsAuth] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBaseData[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [categoryData, setCategories] = useState<CategoryData[]>([]);
  const [categoryKb, setCategoryKb] = useState<string | null>(null);
  const categories = categoryKb === selectedKbId ? categoryData : [];
  const beginRequest = useLatestRequest(selectedKbId);
  const [error, setError] = useState<string | null>(null);

  // Create state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string>('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMe().then((u) => {
      if (cancelled) return;
      if (!u) { setNeedsAuth(true); return; }
      listKnowledgeBases()
        .then((list) => {
          if (cancelled) return;
          setKbs(list);
          const defaultKb = list.find((kb) => kb.type === 'DEFAULT') || list[0];
          if (defaultKb) setSelectedKbId(defaultKb.id);
        })
        .catch(() => {});
    }).catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Load categories when KB changes
  useEffect(() => {
    setError(null);
    fetchCategories();
  }, [selectedKbId]);

  const fetchCategories = async () => {
    const isCurrent = beginRequest();
    if (!selectedKbId) return;
    try {
      const data = await listCategories(selectedKbId);
      if (!isCurrent()) return;
      setCategoryKb(selectedKbId); setCategories(data);
    } catch (err) {
      if (isCurrent()) setError((err as Error).message);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !selectedKbId) return;
    const isCurrent = beginRequest();
    try {
      await createCategory({
        name: newName.trim(),
        knowledgeBaseId: selectedKbId,
        parentId: newParentId || undefined,
      });
      if (!isCurrent()) return;
      setNewName('');
      setNewParentId('');
      setCreating(false);
      setError(null);
      fetchCategories();
    } catch (err) {
      if (isCurrent()) setError((err as Error).message);
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    const isCurrent = beginRequest();
    try {
      await updateCategory(id, editName.trim());
      if (!isCurrent()) return;
      setEditingId(null);
      setError(null);
      fetchCategories();
    } catch (err) {
      if (isCurrent()) setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除分类「${name}」？文章将保留并移到“无分类”；有子分类时不可删除。`)) return;
    const isCurrent = beginRequest();
    try {
      await deleteCategory(id);
      if (!isCurrent()) return;
      setError(null);
      fetchCategories();
    } catch (err) {
      if (isCurrent()) setError((err as Error).message);
    }
  };

  if (needsAuth) {
    return (
      <div className={styles.page}>
        <p style={{ textAlign: 'center', padding: 60, color: 'var(--komo-text-secondary)' }}>
          请先登录
        </p>
        <div style={{ textAlign: 'center' }}>
          <Link href="/login" style={{ color: 'var(--komo-link)', fontWeight: 600 }}>
            前往登录 →
          </Link>
        </div>
      </div>
    );
  }

  const rows = flattenCategoryTree(categories);

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.backLink}>&larr; 返回知识库</Link>
      <h1 className={styles.heading}>分类管理</h1>

      {/* KB Selector */}
      <div className={styles.kbSelector}>
        <label className={styles.kbLabel}>选择知识库</label>
        <select
          className={styles.kbSelect}
          value={selectedKbId}
          onChange={(e) => {
            setSelectedKbId(e.target.value);
            setCreating(false);
            setEditingId(null);
            setNewName('');
            setNewParentId('');
          }}
        >
          {kbs.map((kb) => (
            <option key={kb.id} value={kb.id}>{kb.name}</option>
          ))}
        </select>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {/* Category tree */}
      <div className={styles.treeSection}>
        <div className={styles.treeHeader}>
          <span className={styles.treeTitle}>分类列表</span>
          <button
            className={styles.addBtn}
            onClick={() => { setCreating(true); setNewName(''); setNewParentId(''); }}
          >
            + 新建分类
          </button>
        </div>

        {/* Create input */}
        {creating && (
          <div className={styles.editRow}>
            <input
              className={styles.editInput}
              type="text"
              placeholder="分类名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
              autoFocus
            />
            <select
              className={styles.parentSelect}
              value={newParentId}
              onChange={(e) => setNewParentId(e.target.value)}
            >
              <option value="">根级</option>
              {rows.map(({ category: c, depth }) => {
                const prefix = '  '.repeat(depth);
                return (
                  <option key={c.id} value={c.id}>
                    {prefix}{depth > 0 ? '└ ' : ''}{c.name}
                  </option>
                );
              })}
            </select>
            <button className={styles.editConfirm} onClick={handleCreate}>创建</button>
            <button className={styles.editCancel} onClick={() => setCreating(false)}>取消</button>
          </div>
        )}

        {/* Tree nodes */}
        {rows.length === 0 && !creating ? (
          <p className={styles.emptyTree}>暂无分类，点击上方按钮创建</p>
        ) : (
          rows.map(({ category: cat, depth }) => {
            const indent = depth * 24;
            return (
              <div key={cat.id} className={styles.treeNode}>
                <span className={styles.treeIndent} style={{ width: indent, minWidth: indent }} />
                <span style={{ fontSize: 12, flexShrink: 0 }}>
                  {depth > 0 ? '└' : '📁'}
                </span>
                {editingId === cat.id ? (
                  <>
                    <input
                      className={styles.editInput}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(cat.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button className={styles.editConfirm} onClick={() => handleRename(cat.id)}>确定</button>
                    <button className={styles.editCancel} onClick={() => setEditingId(null)}>取消</button>
                  </>
                ) : (
                  <>
                    <span className={styles.treeName}>{cat.name}</span>
                    <div className={styles.treeActions}>
                      <button
                        className={styles.treeActionBtn}
                        onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}
                        title="重命名"
                      >
                        &#9998;
                      </button>
                      <button
                        className={`${styles.treeActionBtn} ${styles.treeActionBtnDanger}`}
                        onClick={() => handleDelete(cat.id, cat.name)}
                        title="删除"
                      >
                        &times;
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
