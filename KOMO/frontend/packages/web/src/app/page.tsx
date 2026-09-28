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

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKb, setSelectedKb] = useState<KnowledgeBaseData | null>(null);
  const [stats, setStats] = useState({ count: 0, latestDate: null as string | null });

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // On mount, check httpOnly Cookie session via /api/auth/me
  useEffect(() => {
    getMe()
      .then((u) => { if (u) setUser(u); })
      .catch(() => {})
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

  // Show login if not authenticated
  if (!user) {
    return (
      <div className={styles.landing}>
        <div className={styles.landingHero}>
          <span className={styles.landingBadge}>Knowledge On My Own</span>
          <h1 className={styles.landingTitle}>
            把每一次对话
            <br />
            沉淀为自己的知识
          </h1>
          <p className={styles.landingDesc}>
            KOMO 是 AI 驱动的个人知识管理工具：与 AI 对话探索新知，系统自动提取要点、查重整合，形成属于你自己的知识库。
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

        <IcpFooter />
      </div>
    </div>
  );
}
