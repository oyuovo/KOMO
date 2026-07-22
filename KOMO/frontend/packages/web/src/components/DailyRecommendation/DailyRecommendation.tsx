'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getTodayRecommendation,
  dismissRecommendation,
  converseRecommendation,
  generateRecommendation,
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

  useEffect(() => {
    if (!userDailyRecommendationEnabled) {
      setLoading(false);
      return;
    }
    fetchAndGenerate();
  }, [userDailyRecommendationEnabled]);

  const fetchAndGenerate = async () => {
    try {
      const rec = await getTodayRecommendation();
      if (rec) {
        setRecommendation(rec);
      } else {
        // 今天还没有推荐，自动生成
        setGenerating(true);
        const newRec = await generateRecommendation();
        if (newRec) {
          setRecommendation(newRec);
        }
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };

  const handleDismiss = async () => {
    setDismissed(true);
    if (recommendation) {
      try {
        await dismissRecommendation(recommendation.id);
      } catch {
        // 静默
      }
    }
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

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const rec = await generateRecommendation();
      if (rec) {
        setRecommendation(rec);
        setDismissed(false);
      }
    } catch {
      // 静默
    } finally {
      setGenerating(false);
    }
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

  if (dismissed || !recommendation) {
    return null;
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

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.icon}>💡</span>
        <span className={styles.label}>今日自查</span>
        <span className={`${styles.dimensionBadge} ${dimensionBadgeCls()}`}>
          {dimensionLabel(recommendation.dimension)}
        </span>
        <button className={styles.closeBtn} onClick={handleDismiss} title="关闭">
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

      <div className={styles.actions}>
        <button className={styles.btnSecondary} onClick={handleDismiss}>
          不感兴趣
        </button>
        <button className={styles.btnSecondary} onClick={handleDismiss}>
          稍后提醒
        </button>
        <button className={styles.btnPrimary} onClick={handleConverse}>
          与 AI 探讨 →
        </button>
      </div>
    </div>
  );
}
