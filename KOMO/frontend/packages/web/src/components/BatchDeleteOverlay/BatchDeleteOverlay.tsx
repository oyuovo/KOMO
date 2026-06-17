'use client';

import { useEffect, useState } from 'react';
import styles from './BatchDeleteOverlay.module.css';

export interface BatchDeleteState {
  phase: 'idle' | 'deleting' | 'done';
  total: number;
  current: number;
  deleted: number;
  failed: number;
}

interface Props {
  state: BatchDeleteState;
  onClose: () => void;
}

export default function BatchDeleteOverlay({ state, onClose }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state.phase === 'deleting') {
      setVisible(true);
    } else if (state.phase === 'done') {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [state.phase, onClose]);

  if (!visible) return null;

  const progress = state.total > 0
    ? Math.round((state.current / state.total) * 100)
    : 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        {state.phase === 'deleting' && (
          <>
            <div className={styles.spinner} />
            <p className={styles.title}>正在删除...</p>
            <p className={styles.progress}>
              {state.current} / {state.total}
            </p>
            <div className={styles.track}>
              <div
                className={styles.bar}
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        )}
        {state.phase === 'done' && (
          <>
            <p className={styles.icon}>
              {state.failed === 0 ? '✅' : '⚠️'}
            </p>
            <p className={styles.title}>
              删除完成
            </p>
            <p className={styles.progress}>
              成功 {state.deleted} 项
              {state.failed > 0 && `，失败 ${state.failed} 项`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
