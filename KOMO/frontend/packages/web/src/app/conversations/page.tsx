'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  listConversations,
  createConversation,
  deleteConversation,
  getToken,
  type ConversationData,
} from '@komo/shared/api-client';
import styles from './page.module.css';

export default function ConversationsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 验证登录状态（相当于 Vue 的 beforeMount + watch）
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

  return (
    <div className={styles.page}>
      {/* Header Row */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>对话</h1>
          <p className={styles.subtitle}>
            {conversations.length} 个对话
          </p>
        </div>
        <button
          className={styles.btnNew}
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? '创建中...' : '+ 新对话'}
        </button>
      </div>

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
            <Link
              href={`/conversations/${conv.id}`}
              className={styles.convContent}
            >
              <span className={styles.convIcon}>💬</span>
              <span className={styles.convTitle}>{conv.title}</span>
              <span className={styles.convTime}>
                {new Date(conv.updatedAt).toLocaleDateString('zh-CN')}
              </span>
            </Link>
            <button
              className={styles.deleteBtn}
              onClick={(e) => handleDelete(conv.id, e)}
              title="删除对话"
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
