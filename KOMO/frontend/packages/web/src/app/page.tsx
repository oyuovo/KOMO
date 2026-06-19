'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  login,
  getToken,
  getUser,
  clearTokens,
  type UserInfo,
  type KnowledgeBaseData,
} from '@komo/shared/api-client';
import KnowledgeList from '@/components/KnowledgeList/KnowledgeList';
import KnowledgeBaseSidebar from '@/components/KnowledgeBaseSidebar/KnowledgeBaseSidebar';
import styles from './page.module.css';

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKb, setSelectedKb] = useState<KnowledgeBaseData | null>(null);
  const [stats, setStats] = useState({ count: 0, latestDate: null as string | null });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // On mount, check localStorage for existing session
  useEffect(() => {
    const existingToken = getToken();
    const existingUser = getUser();
    if (existingToken && existingUser) {
      setUser(existingUser);
    }
    setAuthChecked(true);
  }, []);

  const handleLogin = async () => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const auth = await login({ email, password });
      setUser(auth.user);
    } catch (err) {
      setLoginError((err as Error).message || '登录失败');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearTokens();
    setUser(null);
  };

  // Auth check loading state
  if (!authChecked) {
    return (
      <div className={styles.page}>
        <p style={{ textAlign: 'center', padding: 80, color: 'var(--komo-text-tertiary)' }}>
          验证登录状态...
        </p>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return (
      <div className={styles.page}>
        <div className={styles.startConvo} style={{ maxWidth: 420, margin: '60px auto' }}>
          <h3 className={styles.startConvoTitle}>登录 KOMO</h3>
          <p className={styles.startConvoDesc} style={{ marginBottom: 20 }}>
            使用已有账号登录，或输入新邮箱自动注册
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <input
              className={styles.startConvoInput}
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className={styles.startConvoInput}
              type="password"
              placeholder="密码（至少6位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className={styles.btnPrimary}
              onClick={handleLogin}
              disabled={loggingIn}
              style={{ width: '100%', maxWidth: 520, justifyContent: 'center', padding: '12px 18px' }}
            >
              {loggingIn ? '登录中...' : '登录 / 注册'}
            </button>
            {loginError && (
              <p style={{ color: 'var(--komo-danger)', fontSize: 13 }}>{loginError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* KB Sidebar */}
      <KnowledgeBaseSidebar
        selectedId={selectedKb?.id ?? null}
        selectedCategoryId={selectedCategoryId}
        onSelect={(kb) => {
          setSelectedKb(kb);
          setSelectedCategoryId(null);
        }}
        onCategorySelect={setSelectedCategoryId}
      />

      {/* Main Content */}
      <div className={styles.page}>
        {/* Welcome Row */}
        <div className={styles.welcomeRow}>
          <div>
            <h1 className={styles.greeting}>
              {selectedKb ? selectedKb.name : '全部文章'}
            </h1>
            <p className={styles.greetingSub}>
              {stats.count} 篇文章
              {stats.latestDate && ` · 最近更新 ${stats.latestDate}`}
            </p>
          </div>
          <div className={styles.quickActions}>
            <Link href="/knowledge/import" className={styles.btnSecondary}>
              导入
            </Link>
            <Link href="/knowledge/create" className={styles.btnPrimary}>
              + 新建文章
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <div className={styles.searchBar}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            type="text"
            placeholder="搜索文章标题或内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Article List — filtered by selected KB */}
        <KnowledgeList
          searchQuery={searchQuery}
          knowledgeBaseId={selectedKb?.id ?? null}
          categoryId={selectedCategoryId}
          onStatsChange={setStats}
        />

        {/* Draft Hint */}
        <div className={styles.draftHint}>
          <span className={styles.draftHintMsg}>
            💡 AI 对话完成后知识点会自动提取到草稿，前往审核。
          </span>
          <div className={styles.draftHintActions}>
            <Link href="/drafts" className={styles.draftHintLink}>
              查看草稿
            </Link>
          </div>
        </div>

        {/* Start Conversation */}
        <div className={styles.startConvo}>
          <h3 className={styles.startConvoTitle}>通过对话发现知识</h3>
          <p className={styles.startConvoDesc}>
            与 DeepSeek AI 对话，系统会自动从回复中提取知识要点。
          </p>
          <Link href="/conversations" className={styles.btnPrimary}>
            开始对话
          </Link>
        </div>
      </div>
    </div>
  );
}
