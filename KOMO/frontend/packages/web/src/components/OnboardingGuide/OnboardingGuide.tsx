'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listKnowledge,
  completeOnboarding,
  type UserInfo,
} from '@komo/shared/api-client';
import styles from './OnboardingGuide.module.css';
import { resolveOnboardingStep, type GuideStep } from '@/lib/onboarding';

interface Props {
  user: UserInfo | null;
}

export default function OnboardingGuide({ user }: Props) {
  const [step, setStep] = useState<GuideStep | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setStep(null);
    setDismissed(false);
    if (!user || user.onboardingCompleted) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const knowledge = await listKnowledge();
        if (cancelled) return;
        const next = resolveOnboardingStep(knowledge.totalElements);
        setStep(next);
      } catch (error) {
        // 请求失败不能伪装成“没有知识”，也不推进服务端的新手状态。
        if (!cancelled) setStep(null);
        console.warn('检查新手进度失败', error);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.onboardingCompleted]);

  if (dismissed || step === null) {
    return null;
  }

  const steps: Record<GuideStep, { icon: string; title: string; desc: string; cta: string; href: string }> = {
    1: {
      icon: '📄',
      title: '从你想读懂的文档开始',
      desc: '先导入一篇Markdown文档，或新建文章记录正在学习的内容。',
      cta: '导入文档',
      href: '/knowledge/import',
    },
    2: {
      icon: '📝',
      title: '边读边问，再写下自己的理解',
      desc: '打开下方文章，在阅读问答中提问或引用选区。展开参考原文核对，再点击编辑文档自行完善。',
      cta: '新建笔记',
      href: '/knowledge/create',
    },
  };

  const current = steps[step];

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.icon}>{current.icon}</span>
        <span className={styles.title}>{current.title}</span>
        <span className={styles.stepBadge}>步骤 {step}/2</span>
        <button
          className={styles.closeBtn}
          onClick={() => setDismissed(true)}
          title="稍后再说"
        >
          ✕
        </button>
      </div>
      <p className={styles.desc}>{current.desc}</p>
      <div className={styles.actions}>
        <Link href={current.href} className={styles.cta}>
          {current.cta} →
        </Link>
        {step === 2 && <button className={styles.closeBtn} onClick={async () => {
          try { await completeOnboarding(); setDismissed(true); }
          catch (error) { console.warn('保存阅读指引状态失败', error); }
        }}>我知道了</button>}
      </div>
    </div>
  );
}
