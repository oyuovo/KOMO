'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  listConversations,
  listKnowledgeBases,
  createConversation,
  deleteConversation,
  type ConversationData,
  type KnowledgeBaseData,
} from '@komo/shared/api-client';
import styles from './ConversationSidebar.module.css';

interface Props {
  activeConversationId?: string;
  onConversationChange?: () => void;
}

export default function ConversationSidebar({ activeConversationId, onConversationChange }: Props) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedKbs, setCollapsedKbs] = useState<Set<string>>(new Set());
  const [showNewMenu, setShowNewMenu] = useState(false);

  useEffect(() => {
    Promise.all([
      listConversations(),
      listKnowledgeBases(),
    ]).then(([convs, kbs]) => {
      setConversations(convs);
      setKnowledgeBases(kbs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = () => {
      listConversations().then(setConversations).catch(() => {});
    };
    window.addEventListener('conversation-sidebar-refresh', handler);
    return () => window.removeEventListener('conversation-sidebar-refresh', handler);
  }, []);

  const toggleKb = (kbId: string) => {
    setCollapsedKbs(prev => {
      const next = new Set(prev);
      if (next.has(kbId)) next.delete(kbId);
      else next.add(kbId);
      return next;
    });
  };

  const handleNewConversation = async (kbId?: string) => {
    setShowNewMenu(false);
    try {
      const conv = await createConversation(undefined, kbId ?? null);
      setConversations(prev => [conv, ...prev]);
      router.push(`/conversations/${conv.id}`);
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这个对话吗？')) return;
    try {
      await deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversationId === id && onConversationChange) {
        onConversationChange();
      }
    } catch {
      // ignore
    }
  };

  // Group conversations by KB
  const kbGroups = new Map<string | null, ConversationData[]>();
  for (const kb of knowledgeBases) {
    kbGroups.set(kb.id, []);
  }
  kbGroups.set(null, []);

  for (const conv of conversations) {
    const kbId = conv.knowledgeBaseId ?? null;
    if (!kbGroups.has(kbId)) {
      kbGroups.set(kbId, []);
    }
    kbGroups.get(kbId)!.push(conv);
  }

  if (loading) {
    return <aside className={styles.sidebar}><div className={styles.loading}>加载中...</div></aside>;
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <span className={styles.title}>对话</span>
        <div className={styles.newBtnWrap}>
          <button
            className={styles.newBtn}
            onClick={() => setShowNewMenu(!showNewMenu)}
          >
            + 新对话
          </button>
          {showNewMenu && (
            <div className={styles.newMenu}>
              {knowledgeBases.map(kb => (
                <button
                  key={kb.id}
                  className={styles.newMenuItem}
                  onClick={() => handleNewConversation(kb.id)}
                >
                  📁 {kb.name}
                </button>
              ))}
              <div className={styles.newMenuDivider} />
              <button
                className={styles.newMenuItem}
                onClick={() => handleNewConversation(undefined)}
              >
                📄 无知识库
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {/* KB groups */}
        {knowledgeBases.map(kb => {
          const convs = kbGroups.get(kb.id) || [];
          const isCollapsed = collapsedKbs.has(kb.id);
          return (
            <div key={kb.id} className={styles.kbGroup}>
              <div className={styles.kbHeader} onClick={() => toggleKb(kb.id)}>
                <span className={styles.kbCaret}>{isCollapsed ? '▶' : '▼'}</span>
                <span className={styles.kbIcon}>📁</span>
                <span className={styles.kbName}>{kb.name}</span>
                <button
                  className={styles.kbAddBtn}
                  onClick={(e) => { e.stopPropagation(); handleNewConversation(kb.id); }}
                  title="在此知识库新建对话"
                >
                  +
                </button>
              </div>
              {!isCollapsed && convs.map(conv => (
                <div key={conv.id} className={styles.convRow}>
                  <Link
                    href={`/conversations/${conv.id}`}
                    className={`${styles.convItem} ${
                      activeConversationId === conv.id ? styles.convActive : ''
                    }`}
                  >
                    <span className={styles.convIcon}>💬</span>
                    <span className={styles.convTitle}>{conv.title}</span>
                  </Link>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => handleDelete(conv.id, e)}
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          );
        })}

        {/* No-KB section */}
        <div className={styles.divider} />
        <div className={styles.kbGroup}>
          <div className={styles.kbHeader} onClick={() => toggleKb('__nokb__')}>
            <span className={styles.kbCaret}>
              {collapsedKbs.has('__nokb__') ? '▶' : '▼'}
            </span>
            <span className={styles.kbIcon}>📄</span>
            <span className={styles.noKbLabel}>无知识库对话</span>
            <button
              className={styles.kbAddBtn}
              onClick={(e) => { e.stopPropagation(); handleNewConversation(undefined); }}
              title="新建无知识库对话"
            >
              +
            </button>
          </div>
          {!collapsedKbs.has('__nokb__') && (kbGroups.get(null) || []).map(conv => (
            <div key={conv.id} className={styles.convRow}>
              <Link
                href={`/conversations/${conv.id}`}
                className={`${styles.convItem} ${
                  activeConversationId === conv.id ? styles.convActive : ''
                }`}
              >
                <span className={styles.convIcon}>💬</span>
                <span className={styles.convTitle}>{conv.title}</span>
              </Link>
              <button
                className={styles.deleteBtn}
                onClick={(e) => handleDelete(conv.id, e)}
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
