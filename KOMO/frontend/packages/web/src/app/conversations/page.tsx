'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getMe,
  createConversation,
  type ConversationData,
} from '@komo/shared/api-client';
import ConversationSidebar from '@/components/ConversationSidebar/ConversationSidebar';
import styles from './page.module.css';

function ConversationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const autoCreated = useRef(false);

  useEffect(() => {
    getMe().then((u) => {
      if (!u) { router.push('/'); return; }
      setAuthed(true);
      setLoading(false);
    });
  }, []);

  // Auto-create conversation from daily recommendation question
  useEffect(() => {
    if (!authed || autoCreated.current) return;
    const question = searchParams.get('question');
    const kbId = searchParams.get('kb');
    if (question) {
      autoCreated.current = true;
      createConversation(undefined, kbId || null)
        .then((conv: ConversationData) => {
          router.replace(`/conversations/${conv.id}?question=${encodeURIComponent(question)}`);
        })
        .catch(() => {});
    }
  }, [authed, searchParams]);

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

export default function ConversationsPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.placeholder}>加载中...</div></div>}>
      <ConversationsContent />
    </Suspense>
  );
}
