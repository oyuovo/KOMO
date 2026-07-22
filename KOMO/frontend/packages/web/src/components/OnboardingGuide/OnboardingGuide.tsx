'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listConversations,
  listDrafts,
  listKnowledge,
  completeOnboarding,
  type UserInfo,
} from '@komo/shared/api-client';
import styles from './OnboardingGuide.module.css';

interface Props {
  user: UserInfo | null;
}

type GuideStep = 1 | 2 | 3;

export default function OnboardingGuide({ user }: Props) {
  const [step, setStep] = useState<GuideStep | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || user.onboardingCompleted) {
      return;
    }
    checkStep();
  }, [user]);

  const checkStep = async () => {
    try {
      const [convs, drafts, knowledge] = await Promise.all([
        listConversations().catch(() => []),
        listDrafts().catch(() => []),
        listKnowledge().catch(() => ({ totalElements: 0 })),
      ]);

      if (!convs || convs.length === 0) {
        setStep(1);
      } else if (!drafts || drafts.length === 0) {
        setStep(2);
      } else if (!knowledge || knowledge.totalElements === 0) {
        setStep(3);
      } else {
        // All done — mark onboarding complete
        setStep(null);
        completeOnboarding().catch(() => {});
      }
    } catch {
      setStep(null);
    }
  };

  if (dismissed || step === null) {
    return null;
  }

  const steps: Record<GuideStep, { icon: string; title: string; desc: string; cta: string; href: string }> = {
    1: {
      icon: '💬',
      title: '开始你的第一次对话',
      desc: '与 AI 对话是 KOMO 的核心。AI 回复后会自动提取知识要点，帮你积累个人知识库。',
      cta: '开始对话',
      href: '/conversations',
    },
    2: {
      icon: '📝',
      title: '查看 AI 提取的知识草稿',
      desc: '你的对话中可能已经提取了知识点，前往草稿箱审核并确认入库。',
      cta: '查看草稿',
      href: '/drafts',
    },
    3: {
      icon: '✅',
      title: '确认知识入库',
      desc: '在草稿箱中确认、编辑或驳回每条草稿。确认后的知识将存入知识库，增强未来的 AI 对话。',
      cta: '去草稿箱',
      href: '/drafts',
    },
  };

  const current = steps[step];

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.icon}>{current.icon}</span>
        <span className={styles.title}>{current.title}</span>
        <span className={styles.stepBadge}>步骤 {step}/3</span>
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
      </div>
    </div>
  );
}
