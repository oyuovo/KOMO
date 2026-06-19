'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getToken,
  listKnowledgeBases,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type KnowledgeBaseData,
  type CategoryData,
} from '@komo/shared/api-client';
import styles from './page.module.css';

/** 从 flat category list 计算缩进层级（基于 ltree path 中的 . 数量） */
function getDepth(cat: CategoryData): number {
  // path 格式: "root" = 0, "root.xxx" = 1, "root.xxx.yyy" = 2
  if (!cat.path || cat.path === 'root') return 0;
  return cat.path.split('.').length - 1;
}

export default function CategoriesPage() {
  const [needsAuth, setNeedsAuth] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBaseData[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string>('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    if (!getToken()) { setNeedsAuth(true); return; }
    listKnowledgeBases()
      .then((list) => {
        setKbs(list);
        const defaultKb = list.find((kb) => kb.type === 'DEFAULT') || list[0];
        if (defaultKb) setSelectedKbId(defaultKb.id);
      })
      .catch(() => {});
  }, []);

  // Load categories when KB changes
  useEffect(() => {
    if (!selectedKbId) { setCategories([]); return; }
    listCategories(selectedKbId)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [selectedKbId]);

  const fetchCategories = () => {
    if (!selectedKbId) return;
    listCategories(selectedKbId).then(setCategories).catch(() => {});
  };

  const handleCreate = async () => {
    if (!newName.trim() || !selectedKbId) return;
    try {
      await createCategory({
        name: newName.trim(),
        knowledgeBaseId: selectedKbId,
        parentId: newParentId || undefined,
      });
      setNewName('');
      setNewParentId('');
      setCreating(false);
      setError(null);
      fetchCategories();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await updateCategory(id, editName.trim());
      setEditingId(null);
      setError(null);
      fetchCategories();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除分类「${name}」？`)) return;
    try {
      await deleteCategory(id);
      setError(null);
      fetchCategories();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (needsAuth) {
    return (
      <div className={styles.page}>
        <p style={{ textAlign: 'center', padding: 60, color: 'var(--komo-text-secondary)' }}>
          请先登录
        </p>
      </div>
    );
  }

  // Sort by path for tree order
  const sorted = [...categories].sort((a, b) => a.path.localeCompare(b.path));

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
          onChange={(e) => setSelectedKbId(e.target.value)}
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
              {sorted.map((c) => {
                const depth = getDepth(c);
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
        {sorted.length === 0 && !creating ? (
          <p className={styles.emptyTree}>暂无分类，点击上方按钮创建</p>
        ) : (
          sorted.map((cat) => {
            const depth = getDepth(cat);
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
