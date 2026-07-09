'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe } from '@komo/shared/api-client';
import ConversationSidebar from '@/components/ConversationSidebar/ConversationSidebar';
import styles from './page.module.css';

export default function ConversationsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then((u) => {
      if (!u) { router.push('/'); return; }
      setAuthed(true);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className={styles.page}><div className={styles.placeholder}>加载中...</div></div>;
  }

  if (!authed) return null;

  return (
    <div className={styles.page}>
      <ConversationSidebar />
      <main className={styles.main}>
        <div className={styles.placeholder}>
          <p className={styles.placeholderIcon}>💬</p>
          <p className={styles.placeholderTitle}>选择或创建一个对话</p>
          <p className={styles.placeholderDesc}>
            选择知识库创建对话，AI 将基于知识库内容回答并自动提取知识
          </p>
        </div>
      </main>
    </div>
  );
}
