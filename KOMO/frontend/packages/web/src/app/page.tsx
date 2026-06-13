'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  login,
  getToken,
  getUser,
  clearTokens,
  listKnowledge,
  deleteKnowledge,
  ApiError,
  type KnowledgeItem,
  type UserInfo,
  type PageData,
} from '@komo/shared/api-client';
import styles from './page.module.css';

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [articles, setArticles] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // On mount, check localStorage for existing session
  useEffect(() => {
    const existingToken = getToken();
    const existingUser = getUser();
    if (existingToken && existingUser) {
      setUser(existingUser);
    }
    setAuthChecked(true);
  }, []);

  // Fetch articles when user is authenticated
  useEffect(() => {
    if (user) {
      setLoading(true);
      const timer = setTimeout(() => {
        listKnowledge({ q: searchQuery || undefined })
          .then((data: PageData<KnowledgeItem>) => {
            setArticles(data.content);
          })
          .catch((err: Error) => {
            if ((err as ApiError).code === 401) {
              setUser(null); // session expired
            } else {
              setError(err.message);
            }
          })
          .finally(() => setLoading(false));
      }, searchQuery ? 300 : 0);
      return () => clearTimeout(timer);
    }
  }, [user, searchQuery]);

  const handleLogin = async () => {
    setLoggingIn(true);
    setError(null);
    try {
      const auth = await login({ email, password });
      setUser(auth.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearTokens();
    setUser(null);
    setArticles([]);
  };

  const handleDeleteArticle = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这篇文章吗？')) return;
    try {
      await deleteKnowledge(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
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
            {error && (
              <p style={{ color: 'var(--komo-danger)', fontSize: 13 }}>{error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const latestDate =
    articles.length > 0
      ? new Date(
          Math.max(...articles.map((a) => new Date(a.updatedAt).getTime()))
        ).toLocaleDateString('zh-CN')
      : null;

  return (
    <div className={styles.page}>
      {/* Welcome Row */}
      <div className={styles.welcomeRow}>
        <div>
          <h1 className={styles.greeting}>知识库</h1>
          <p className={styles.greetingSub}>
            {articles.length} 篇文章
            {latestDate && ` · 最近更新 ${latestDate}`}
          </p>
        </div>
        <div className={styles.quickActions}>
          <button className={styles.btnSecondary} disabled title="功能开发中">
            导入
          </button>
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

      {/* Article List Header */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>全部文章</span>
      </div>

      {/* Article List — Real API Data */}
      <div className={styles.articleList}>
        {loading && (
          <p style={{ color: 'var(--komo-text-tertiary)', padding: 24, textAlign: 'center' }}>
            加载中...
          </p>
        )}
        {error && (
          <p style={{ color: 'var(--komo-danger)', padding: 24 }}>加载失败: {error}</p>
        )}
        {!loading && articles.length === 0 && (
          <p style={{ color: 'var(--komo-text-tertiary)', padding: 24, textAlign: 'center' }}>
            还没有文章。开始一次 AI 对话来创建你的第一条知识。
          </p>
        )}
        {articles.map((article) => (
          <div key={article.id} className={styles.articleRow}>
            <Link
              href={`/article/${article.id}`}
              className={styles.articleLink}
            >
              <span
                className={`${styles.badge} ${
                  article.status === 'PUBLISHED'
                    ? styles.badgePublished
                    : styles.badgeDraft
                }`}
              >
                {article.status === 'PUBLISHED' ? '已发布' : '草稿'}
              </span>
              <span className={styles.articleTitle}>{article.title}</span>
              <span className={styles.articleReadingTime}>{article.entryType}</span>
              <span className={styles.articleMeta}>
                {new Date(article.createdAt).toLocaleDateString('zh-CN')}
              </span>
            </Link>
            <button
              className={styles.articleDelete}
              onClick={(e) => handleDeleteArticle(article.id, e)}
              title="删除文章"
            >
              删除
            </button>
          </div>
        ))}
      </div>

      {/* Draft Hint — only shown when drafts API is ready */}
      <div className={styles.draftHint}>
        <span className={styles.draftHintMsg}>
          💡 草稿功能开发中。AI 对话完成后知识点会自动提取到草稿。
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
  );
}
