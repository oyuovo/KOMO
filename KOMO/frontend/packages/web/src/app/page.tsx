'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getMe,
  type UserInfo,
  type KnowledgeBaseData,
} from '@komo/shared/api-client';
import KnowledgeList from '@/components/KnowledgeList/KnowledgeList';
import KnowledgeBaseSidebar from '@/components/KnowledgeBaseSidebar/KnowledgeBaseSidebar';
import DailyRecommendation from '@/components/DailyRecommendation/DailyRecommendation';
import OnboardingGuide from '@/components/OnboardingGuide/OnboardingGuide';
import IcpFooter from '@/components/IcpFooter/IcpFooter';
import styles from './page.module.css';

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKb, setSelectedKb] = useState<KnowledgeBaseData | null>(null);
  const [stats, setStats] = useState({ count: 0, latestDate: null as string | null });

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // 检查会话；连接失败不等于未登录。
  useEffect(() => {
    getMe()
      .then((u) => { if (u) setUser(u); })
      .catch((err) => setAuthError(err.message))
      .finally(() => setAuthChecked(true));
  }, []);

  // Show landing page if not authenticated

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

  if (authError) {
    return (
      <div className={styles.landing}>
        <div className={styles.landingHero}>
          <p className={styles.landingDesc} role="alert">{authError}</p>
          <button className={styles.landingCta} onClick={() => window.location.reload()}>重新连接</button>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return (
      <div className={styles.landing}>
        <div className={styles.landingHero}>
          <span className={styles.landingBadge}>Knowledge On My Own</span>
          <h1 className={styles.landingTitle}>
            读懂文档
            <br />
            写下自己的理解
          </h1>
          <p className={styles.landingDesc}>
            导入你的文档，围绕原文与AI讨论，核对依据后用自己的理解完善笔记。
          </p>
          <Link href="/login" className={styles.landingCta}>
            登录体验
          </Link>
          <p className={styles.landingNote}>Beta 内测阶段</p>
        </div>
        <div className={styles.landingFooter}>
          <IcpFooter />
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

        {/* Onboarding Guide */}
        <OnboardingGuide user={user} />

        {/* Daily Recommendation */}
        <DailyRecommendation
          userDailyRecommendationEnabled={user?.dailyRecommendationEnabled ?? true}
        />

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

        {/* Start Conversation */}
        <div className={styles.startConvo}>
          <h3 className={styles.startConvoTitle}>从一篇文档开始理解</h3>
          <p className={styles.startConvoDesc}>
            打开文章，在阅读问答中解释概念、追问前提、核对原文，再自行编辑完善。
          </p>
          <Link href="/knowledge/import" className={styles.btnPrimary}>
            导入文档
          </Link>
        </div>

        <IcpFooter />
      </div>
    </div>
  );
}
