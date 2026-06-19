'use client';

import { useState } from 'react';
import type { CategoryData } from '@komo/shared/api-client';
import styles from './CategoryPickerModal.module.css';

interface Props {
  categories: CategoryData[];
  onConfirm: (categoryId: string | null) => void;
  onCancel: () => void;
}

function getDepth(cat: CategoryData): number {
  if (!cat.path || cat.path === 'root') return 0;
  return cat.path.split('.').length;
}

export default function CategoryPickerModal({ categories, onConfirm, onCancel }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = [...categories].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>移动到分类</h3>
        <p className={styles.subtitle}>选择目标分类，或选择"无分类"移除分类归属</p>

        <div className={styles.list}>
          <button
            className={`${styles.option} ${selectedId === null ? styles.optionActive : ''}`}
            onClick={() => setSelectedId(null)}
          >
            <span className={styles.optionIcon}>📄</span>
            <span className={styles.optionName}>无分类</span>
          </button>

          {sorted.map((cat) => {
            const depth = getDepth(cat);
            return (
              <button
                key={cat.id}
                className={`${styles.option} ${selectedId === cat.id ? styles.optionActive : ''}`}
                style={{ paddingLeft: 20 + depth * 20 }}
                onClick={() => setSelectedId(cat.id)}
              >
                <span className={styles.optionIcon}>
                  {depth === 0 ? '📁' : '└'}
                </span>
                <span className={styles.optionName}>{cat.name}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.actions}>
          <button className={styles.btnCancel} onClick={onCancel}>
            取消
          </button>
          <button className={styles.btnConfirm} onClick={() => onConfirm(selectedId)}>
            确认移动
          </button>
        </div>
      </div>
    </div>
  );
}
