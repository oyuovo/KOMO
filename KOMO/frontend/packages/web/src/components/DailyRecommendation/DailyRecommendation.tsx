'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getTodayRecommendation,
  dismissRecommendation,
  converseRecommendation,
  generateRecommendation,
  listKnowledge,
  type DailyRecommendationData,
} from '@komo/shared/api-client';
import styles from './DailyRecommendation.module.css';

interface Props {
  userDailyRecommendationEnabled: boolean;
}

export default function DailyRecommendation({ userDailyRecommendationEnabled }: Props) {
  const router = useRouter();
  const [recommendation, setRecommendation] = useState<DailyRecommendationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [generating, setGenerating] = useState(false);
  // 知识不足（<5 条）时的空状态引导卡片，设计稿的“知识发现”态。
  const [showEmptyState, setShowEmptyState] = useState(false);
  // 防抖：StrictMode 双挂载会并发触发两次生成，用 ref 保证只发一轮请求。
  const startedRef = useRef(false);

  useEffect(() => {
    if (!userDailyRecommendationEnabled) {
      setLoading(false);
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    fetchAndGenerate();
  }, [userDailyRecommendationEnabled]);

  const fetchAndGenerate = async () => {
    try {
      const rec = await getTodayRecommendation();
      if (rec) {
        setRecommendation(rec);
      } else {
        // 今天还没有推荐，自动生成（知识不足时后端返回 null）
        setGenerating(true);
        const newRec = await generateRecommendation();
        if (newRec) {
          setRecommendation(newRec);
        } else {
          // 后端未生成：若知识条目不足 5 条，展示“知识发现”空状态卡片。
          try {
            const page = await listKnowledge({ size: 1 });
            if (page.totalElements < 5) setShowEmptyState(true);
          } catch {
            // 静默
          }
        }
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };

  /** 不感兴趣 → 永久 DISMISSED，后端会把该话题记入 dismissed_topics 避免重复推荐。 */
  const handleDismissPermanent = async () => {
    setDismissed(true);
    if (recommendation) {
      try {
        await dismissRecommendation(recommendation.id);
      } catch {
        // 静默
      }
    }
  };

  /** 稍后提醒 / ✕ → 仅本次会话隐藏，不调后端，下次进入首页仍会出现。 */
  const handlePostpone = () => {
    setDismissed(true);
  };

  const handleConverse = async () => {
    if (!recommendation) return;
    try {
      await converseRecommendation(recommendation.id);
    } catch {
      // 静默
    }
    // 跳转到新对话，预填问题
    const question = recommendation.question;
    const kbId = recommendation.suggestedKbId;
    const params = new URLSearchParams();
    params.set('question', question);
    if (kbId) params.set('kb', kbId);
    router.push(`/conversations?${params.toString()}`);
  };

  if (!userDailyRecommendationEnabled) {
    return null;
  }

  if (loading || generating) {
    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.icon}>💡</span>
          <span className={styles.label}>
            {generating ? '生成今日问题中...' : '加载中...'}
          </span>
        </div>
      </div>
    );
  }

  if (dismissed) {
    return null;
  }

  if (!recommendation) {
    if (!showEmptyState) {
      return null;
    }
    // 知识不足空状态：引导用户先积累知识。
    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.icon}>💡</span>
          <span className={styles.label}>知识发现</span>
          <button className={styles.closeBtn} onClick={handlePostpone} title="关闭">
            ✕
          </button>
        </div>
        <p className={styles.question}>
          积累 5 条以上知识后，我会每天基于你的知识库生成一个自查问题，帮你深化思考。
        </p>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={() => router.push('/conversations')}>
            开始一次对话 →
          </button>
        </div>
      </div>
    );
  }

  const dimensionLabel = (dim: string) => {
    switch (dim) {
      case 'deepening': return '知识深化';
      case 'cross_domain': return '跨领域关联';
      case 'gap': return '知识缺口';
      default: return dim;
    }
  };

  const dimensionBadgeCls = () => {
    switch (recommendation.dimension) {
      case 'deepening': return styles.badgeDeepening;
      case 'cross_domain': return styles.badgeCrossDomain;
      case 'gap': return styles.badgeGap;
      default: return '';
    }
  };

  // relatedKnowledgeTitles 是后端存库的 JSON 字符串数组，容错解析。
  const relatedTitles: string[] = (() => {
    if (!recommendation.relatedKnowledgeTitles) return [];
    try {
      const parsed = JSON.parse(recommendation.relatedKnowledgeTitles);
      return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string' && t) : [];
    } catch {
      return [];
    }
  })();

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.icon}>💡</span>
        <span className={styles.label}>今日自查</span>
        <span className={`${styles.dimensionBadge} ${dimensionBadgeCls()}`}>
          {dimensionLabel(recommendation.dimension)}
        </span>
        <button className={styles.closeBtn} onClick={handlePostpone} title="稍后提醒">
          ✕
        </button>
      </div>

      <p className={styles.question}>{recommendation.question}</p>

      {recommendation.missingArea && (
        <p className={styles.missingArea}>
          <span className={styles.missingLabel}>缺失领域：</span>
          {recommendation.missingArea}
        </p>
      )}

      {relatedTitles.length > 0 && (
        <p className={styles.missingArea}>
          <span className={styles.missingLabel}>相关知识：</span>
          {relatedTitles.join('、')}
        </p>
      )}

      <div className={styles.actions}>
        <button className={styles.btnSecondary} onClick={handleDismissPermanent}>
          不感兴趣
        </button>
        <button className={styles.btnSecondary} onClick={handlePostpone}>
          稍后提醒
        </button>
        <button className={styles.btnPrimary} onClick={handleConverse}>
          与 AI 探讨 →
        </button>
      </div>
    </div>
  );
}
