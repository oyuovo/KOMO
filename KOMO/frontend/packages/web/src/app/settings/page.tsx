'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearTokens, getToken, getUser, listDrafts, listKnowledge, reindexKnowledge, exportKnowledge, type UserInfo } from '@komo/shared/api-client';
import styles from './page.module.css';

export default function SettingsPage() {
  const router = useRouter();
  const [draftCount, setDraftCount] = useState(0);
  const [articleCount, setArticleCount] = useState(0);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [reindexState, setReindexState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [reindexCount, setReindexCount] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push('/');
      return;
    }
    setUser(getUser());
    Promise.all([
      listDrafts().then((d) => setDraftCount(d.length)).catch(() => {}),
      listKnowledge().then((r) => setArticleCount(r.totalElements)).catch(() => {}),
    ]);
  }, []);

  const handleLogout = () => {
    clearTokens();
    router.push('/');
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportKnowledge();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `komo-export-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  const handleReindex = async () => {
    setReindexState('loading');
    try {
      const result = await reindexKnowledge();
      setReindexCount(result.indexed);
      setReindexState('success');
      setTimeout(() => setReindexState('idle'), 3000);
    } catch {
      setReindexState('error');
      setTimeout(() => setReindexState('idle'), 3000);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>设置</h1>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>账户</h2>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.label}>邮箱</span>
            <span className={styles.value}>{user?.email || '-'}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>昵称</span>
            <span className={styles.value}>{user?.nickname || '-'}</span>
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
          <div className={styles.divider} />
          <div className={styles.row}>
            <div>
              <span className={styles.label}>导出知识库</span>
              <span className={styles.hint}>将所有知识导出为 JSON 文件</span>
            </div>
            <button
              className={styles.exportBtn}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? '导出中...' : '导出 JSON'}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>维护</h2>
        <div className={styles.card}>
          <div className={styles.row}>
            <div>
              <span className={styles.label}>重建搜索索引</span>
              <span className={styles.hint}>搜索不到最新内容时可重建</span>
            </div>
            <button
              className={styles.reindexBtn}
              onClick={handleReindex}
              disabled={reindexState === 'loading'}
            >
              {reindexState === 'loading' ? '重建中...' : '重建索引'}
            </button>
          </div>
          {reindexState === 'success' && (
            <p className={styles.reindexSuccess}>已重建 {reindexCount} 条索引</p>
          )}
          {reindexState === 'error' && (
            <p className={styles.reindexError}>重建失败，请检查后端服务</p>
          )}
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
