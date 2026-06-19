'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  const [categories, setCategories] = useState<CategoryData[]>([]);

  useEffect(() => {
    fetchKBs();
  }, []);

  const fetchCategories = async (kbId: string) => {
    try {
      const data = await listCategories(kbId);
      setCategories(data);
    } catch {
      setCategories([]);
    }
  };

  useEffect(() => {
    if (selectedId) {
      fetchCategories(selectedId);
    } else {
      setCategories([]);
    }
  }, [selectedId]);

  const fetchKBs = async () => {
    try {
      const data = await listKnowledgeBases();
      setKbs(data);
      // 自动选中第一个（默认知识库）
      if (data.length > 0 && !selectedId) {
        const defaultKb = data.find((kb) => kb.type === 'DEFAULT') || data[0];
        onSelect(defaultKb);
      }
    } catch {
      // ignore
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const kb = await createKnowledgeBase(newName.trim());
      setKbs((prev) => [...prev, kb]);
      setNewName('');
      setCreating(false);
      onSelect(kb);
    } catch {
      // ignore
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const updated = await renameKnowledgeBase(id, editName.trim());
      setKbs((prev) => prev.map((kb) => (kb.id === id ? updated : kb)));
      setEditingId(null);
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此知识库？其中的知识条目不会被删除。')) return;
    try {
      await deleteKnowledgeBase(id);
      setKbs((prev) => prev.filter((kb) => kb.id !== id));
      if (selectedId === id) {
        const remaining = kbs.filter((kb) => kb.id !== id);
        onSelect(remaining.length > 0 ? remaining[0] : null);
      }
    } catch {
      // ignore
    }
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
      <div className={styles.header}>
        <span className={styles.title}>知识库</span>
        <button
          className={styles.addBtn}
          onClick={() => setCreating(!creating)}
          title="新建知识库"
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
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
            autoFocus
          />
          <button className={styles.createConfirm} onClick={handleCreate}>
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
                >
                  ×
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {kbs.length === 0 && (
        <p className={styles.empty}>加载中...</p>
      )}

      {/* Category Tree — only when a KB is selected */}
      {selectedId && (
        <div className={styles.catSection}>
          <div className={styles.catHeader}>
            <span className={styles.catTitle}>分类</span>
            <Link href="/categories" className={styles.catManageLink}>管理</Link>
          </div>
          {categories.length === 0 ? (
            <p className={styles.catEmpty}>暂无分类</p>
          ) : (
            <div className={styles.catList}>
              {/* "全部" 选项 */}
              <button
                className={`${styles.catItem} ${selectedCategoryId === null ? styles.catItemActive : ''}`}
                onClick={() => onCategorySelect(null)}
              >
                全部
              </button>
              {[...categories]
                .sort((a, b) => a.path.localeCompare(b.path))
                .map((cat) => {
                  const depth = cat.path === 'root' ? 0 : cat.path.split('.').length - 1;
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
