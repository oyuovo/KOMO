'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearToken, getToken, listDrafts, listKnowledge } from '@komo/shared/api-client';
import styles from './page.module.css';

export default function SettingsPage() {
  const router = useRouter();
  const [draftCount, setDraftCount] = useState(0);
  const [articleCount, setArticleCount] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      router.push('/');
      return;
    }
    Promise.all([
      listDrafts().then((d) => setDraftCount(d.length)).catch(() => {}),
      listKnowledge().then((r) => setArticleCount(r.totalElements)).catch(() => {}),
    ]);
  }, []);

  const handleLogout = () => {
    clearToken();
    router.push('/');
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>设置</h1>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>账户</h2>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.label}>邮箱</span>
            <span className={styles.value}>test@komo.dev</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>昵称</span>
            <span className={styles.value}>TestUser</span>
          </div>
          <div className={styles.divider} />
          <button className={styles.logoutBtn} onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>数据概览</h2>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.label}>知识文章</span>
            <span className={styles.value}>{articleCount} 篇</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>待处理草稿</span>
            <span className={styles.value}>{draftCount} 条</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>关于</h2>
        <div className={styles.card}>
          <p className={styles.aboutText}>
            KOMO (Knowledge On My Own) — AI 驱动的个人知识管理工具。
            核心能力：对话中自动提取和归纳知识要点，帮助你持续积累和发现知识。
          </p>
          <p className={styles.version}>v0.1.0 MVP</p>
        </div>
      </div>
    </div>
  );
}
