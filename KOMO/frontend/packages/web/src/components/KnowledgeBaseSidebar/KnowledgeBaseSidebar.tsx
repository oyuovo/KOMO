'use client';

import { useEffect, useState } from 'react';
import {
  listKnowledgeBases,
  createKnowledgeBase,
  renameKnowledgeBase,
  deleteKnowledgeBase,
  type KnowledgeBaseData,
} from '@komo/shared/api-client';
import styles from './KnowledgeBaseSidebar.module.css';

interface Props {
  selectedId: string | null;
  onSelect: (kb: KnowledgeBaseData | null) => void;
}

export default function KnowledgeBaseSidebar({ selectedId, onSelect }: Props) {
  const [kbs, setKbs] = useState<KnowledgeBaseData[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetchKBs();
  }, []);

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
