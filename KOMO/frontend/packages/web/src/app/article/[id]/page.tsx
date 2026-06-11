'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getKnowledge,
  getToken,
  listKnowledge,
  type KnowledgeItem,
} from '@komo/shared/api-client';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import styles from './page.module.css';

export default function ArticlePage() {
  const params = useParams();
  const id = params.id as string;

  const [article, setArticle] = useState<KnowledgeItem | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(!getToken());

  useEffect(() => {
    if (!id) return;
    if (!getToken()) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      getKnowledge(id).catch(() => null),
      listKnowledge({ size: 10 }).catch(() => ({ content: [], page: 0, size: 0, totalElements: 0, totalPages: 0 })),
    ])
      .then(([articleData, listData]) => {
        if (!articleData) {
          setError('文章不存在或无权访问');
        } else {
          setArticle(articleData);
          setRelatedArticles(
            listData.content.filter((a) => a.id !== id)
          );
        }
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [id, needsAuth]);

  // Not authenticated
  if (needsAuth) {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <div style={{ textAlign: 'center', padding: 80 }}>
            <p style={{ fontSize: 17, color: 'var(--komo-text-secondary)', marginBottom: 16 }}>
              请先返回首页登录
            </p>
            <Link href="/" style={{ color: 'var(--komo-link)', fontWeight: 600 }}>
              ← 返回首页
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--komo-text-tertiary)' }}>
            加载中...
          </div>
        </main>
      </div>
    );
  }

  // Error / Not found
  if (error || !article) {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <div style={{ textAlign: 'center', padding: 80 }}>
            <p style={{ fontSize: 17, color: 'var(--komo-text-secondary)', marginBottom: 8 }}>
              {error || '文章不存在'}
            </p>
            <Link href="/" style={{ color: 'var(--komo-link)', fontWeight: 600 }}>
              ← 返回知识库
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Left: Article List */}
      <aside className={styles.sidebar}>
        <div className={styles.navSection}>
          <div className={styles.navLabel}>知识文章</div>

          {relatedArticles.map((a) => (
            <Link
              key={a.id}
              href={`/article/${a.id}`}
              className={styles.articleNavItem}
            >
              <span className={styles.icon}>📄</span>
              {a.title}
            </Link>
          ))}

          {relatedArticles.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--komo-text-tertiary)', padding: 8 }}>
              暂无其他文章
            </p>
          )}
        </div>

        <div className={styles.sidebarDivider} />

        <Link
          href="/"
          style={{
            display: 'block',
            padding: '8px 10px',
            fontSize: 13,
            color: 'var(--komo-link)',
            textDecoration: 'none',
          }}
        >
          ← 返回知识库
        </Link>
      </aside>

      {/* Center: Article Content */}
      <main className={styles.main}>
        <article className={styles.articleContainer}>
          <div className={styles.topMeta}>
            <span>{new Date(article.createdAt).toLocaleDateString('zh-CN')}</span>
            <span>·</span>
            <span className={`${styles.badge} ${styles.badgeAi}`}>
              {article.source === 'AI_EXTRACT' ? 'AI 提取' : '手动创建'}
            </span>
            <span>·</span>
            <Link href={`/article/${article.id}/edit`} className={styles.editLink}>
              编辑
            </Link>
          </div>

          <h1 className={styles.articleTitle}>{article.title}</h1>

          <div className={styles.articleBody}>
            <MarkdownRenderer content={article.content} />
          </div>
        </article>
      </main>

      {/* Right: Info */}
      <aside className={styles.tocPanel}>
        <div className={styles.tocTitle}>文章信息</div>

        <div className={styles.sourceCard}>
          <div className={styles.sourceLabel}>元数据</div>
          <p>类型: {article.entryType || '未分类'}</p>
          <p>状态: {article.status === 'PUBLISHED' ? '已发布' : article.status}</p>
          <p>来源: {article.source}</p>
          <p>创建: {new Date(article.createdAt).toLocaleDateString('zh-CN')}</p>
          <p>更新: {new Date(article.updatedAt).toLocaleDateString('zh-CN')}</p>
        </div>
      </aside>
    </div>
  );
}
