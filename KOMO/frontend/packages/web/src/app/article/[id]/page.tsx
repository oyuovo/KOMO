'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getKnowledge,
  deleteKnowledge,
  getToken,
  listKnowledge,
  getLinks,
  addLink,
  removeLink,
  mergeInto,
  listKnowledgeBases,
  type KnowledgeItem,
  type KnowledgeLinkData,
} from '@komo/shared/api-client';
import MarkdownRenderer from '@/components/MarkdownRenderer/MarkdownRenderer';
import { slugifyHeading } from '@/lib/slugify';
import styles from './page.module.css';

interface TocItem {
  level: 2 | 3;
  text: string;
  id: string;
}

/** 从 markdown 提取 ## 和 ### 标题 */
function extractToc(content: string): TocItem[] {
  const re = /^(#{2,3})\s+(.+)$/gm;
  const items: TocItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const level = m[1].length === 2 ? 2 : 3;
    const text = m[2].trim();
    const id = slugifyHeading(text);
    items.push({ level, text, id });
  }
  return items;
}

export default function ArticlePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [article, setArticle] = useState<KnowledgeItem | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<KnowledgeItem[]>([]);
  const [links, setLinks] = useState<KnowledgeLinkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  // 嵌入搜索
  const [embedSearch, setEmbedSearch] = useState('');
  const [embedResults, setEmbedResults] = useState<KnowledgeItem[]>([]);
  const [embedding, setEmbedding] = useState(false);
  const [fragmentsKbId, setFragmentsKbId] = useState<string | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const articleBodyRef = useRef<HTMLDivElement>(null);

  const handleDelete = async () => {
    if (!confirm('确定要删除这篇文章吗？')) return;
    try {
      await deleteKnowledge(id);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // 加载碎片库 ID
  useEffect(() => {
    listKnowledgeBases().then((kbs) => {
      const frag = kbs.find((kb) => kb.type === 'SYSTEM_FRAGMENTS');
      if (frag) setFragmentsKbId(frag.id);
    }).catch(() => {});
  }, []);

  // 嵌入搜索（排除自身 + 排除碎片库文章）
  const handleEmbedSearch = async (q: string) => {
    setEmbedSearch(q);
    if (q.length < 2) { setEmbedResults([]); return; }
    try {
      const result = await listKnowledge({ q, size: 10 });
      setEmbedResults(result.content.filter(
        (item) => item.id !== id && item.knowledgeBaseId !== fragmentsKbId
      ));
    } catch { setEmbedResults([]); }
  };

  const handleEmbed = async (targetId: string) => {
    setEmbedding(true);
    try {
      await mergeInto(id, targetId);
      // 合并成功 → 跳转到目标文章（碎片已删除）
      router.push(`/article/${targetId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEmbedding(false);
    }
  };

  // 判断是否在碎片库中
  const isInFragmentsKb = article?.knowledgeBaseId && article?.source === 'AI_EXTRACT';

  const fetchLinks = async (entryId: string) => {
    try {
      const l = await getLinks(entryId);
      setLinks(l);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!id) return;
    if (!getToken()) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    getKnowledge(id)
      .then((articleData) => {
        if (!articleData) {
          setError('文章不存在或无权访问');
          return null;
        }
        setArticle(articleData);
        setTocItems(extractToc(articleData.content));
        fetchLinks(articleData.id);
        // 加载同知识库下的文章
        return listKnowledge({ kb: articleData.knowledgeBaseId ?? undefined, size: 10 });
      })
      .then((listData) => {
        if (listData) {
          setRelatedArticles(listData.content.filter((a: KnowledgeItem) => a.id !== id));
        }
      })
      .catch((err) => {
        if (!error) setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [id, needsAuth]);

  // IntersectionObserver: track visible headings
  useEffect(() => {
    if (tocItems.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the heading with highest intersection ratio
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (!best || entry.intersectionRatio > best.intersectionRatio) {
            best = entry;
          }
        }
        if (best && best.intersectionRatio > 0) {
          setActiveTocId(best.target.id);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    // Wait for render, then observe all h2/h3 in article body
    const timer = setTimeout(() => {
      const container = articleBodyRef.current;
      if (!container) return;
      const headings = container.querySelectorAll('h2[id], h3[id]');
      headings.forEach((h) => observer.observe(h));
    }, 100);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [tocItems]);

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

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

      {/* Floating TOC + Embed */}
      {(tocItems.length > 0 || isInFragmentsKb) && (
        <aside className={styles.tocFloat}>
          {tocItems.length > 0 && (
            <>
              <div className={styles.tocFloatTitle}>📑 在本页中</div>
              {tocItems.map((item) => (
                <button
                  key={item.id}
                  className={`${styles.tocFloatItem} ${
                    item.level === 3 ? styles.tocFloatItemH3 : ''
                  } ${activeTocId === item.id ? styles.tocFloatItemActive : ''}`}
                  onClick={() => scrollToHeading(item.id)}
                >
                  {item.text}
                </button>
              ))}
            </>
          )}

          {isInFragmentsKb && (
            <div className={styles.tocFloatEmbed}>
              <div className={styles.tocFloatTitle}>合并进文章</div>
              <input
                className={styles.tocFloatEmbedInput}
                type="text"
                placeholder="搜索目标文章..."
                value={embedSearch}
                onChange={(e) => handleEmbedSearch(e.target.value)}
              />
              {embedResults.length > 0 && (
                <div className={styles.tocFloatEmbedDropdown}>
                  {embedResults.map((item) => (
                    <button
                      key={item.id}
                      className={styles.tocFloatEmbedItem}
                      onClick={() => handleEmbed(item.id)}
                      disabled={embedding}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      )}

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
            <span>·</span>
            <button className={styles.deleteLink} onClick={handleDelete}>
              删除
            </button>
          </div>

          <h1 className={styles.articleTitle}>{article.title}</h1>

          <div className={styles.articleBody} ref={articleBodyRef}>
            <MarkdownRenderer content={article.content} />
          </div>

          {/* Article Footer — metadata */}
          <footer className={styles.articleFooter}>
            <div className={styles.footerTitle}>文章信息</div>

            <div className={styles.footerGrid}>
              <div className={styles.sourceCard}>
                <div className={styles.sourceLabel}>元数据</div>
                <p>类型: {article.entryType || '未分类'}</p>
                <p>状态: {article.status === 'PUBLISHED' ? '已发布' : article.status}</p>
                <p>来源: {article.source}</p>
                <p>创建: {new Date(article.createdAt).toLocaleDateString('zh-CN')}</p>
                <p>更新: {new Date(article.updatedAt).toLocaleDateString('zh-CN')}</p>
                {article.tags && (
                  <p>标签: {article.tags}</p>
                )}
              </div>

              {links.length > 0 && (
                <div className={styles.sourceCard}>
                  <div className={styles.sourceLabel}>知识关联 ({links.length})</div>
                  {links.map((link) => (
                    <p key={link.id} style={{ fontSize: 13 }}>
                      {link.relation === 'RELATED' ? '🔗' :
                       link.relation === 'EXTENDS' ? '📖' :
                       link.relation === 'CONTRADICTS' ? '⚠️' : '💡'}
                      {' '}{link.targetTitle || link.targetEntryId.slice(0, 8)}
                    </p>
                  ))}
                </div>
              )}

            </div>

          </footer>
        </article>
      </main>
    </div>
  );
}
