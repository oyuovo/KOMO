'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { listDrafts, getToken } from '@komo/shared/api-client';
import styles from './TopNav.module.css';

const navItems = [
  { href: '/', label: '知识库' },
  { href: '/conversations', label: '对话' },
  { href: '/drafts', label: '草稿' },
  { href: '/settings', label: '设置' },
];

export default function TopNav() {
  const pathname = usePathname();
  const [draftCount, setDraftCount] = useState(0);

  // 每次路由切换时刷新草稿数量
  useEffect(() => {
    if (!getToken()) return;
    listDrafts()
      .then((drafts) => setDraftCount(drafts.length))
      .catch(() => { /* 忽略错误 */ });
  }, [pathname]);

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.logo}>
        <span className={styles.logoDot} />
        KOMO
      </Link>

      {navItems.map((item) => {
        const isActive = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href);

        // 草稿数量 badge
        const badge = item.href === '/drafts' && draftCount > 0
          ? draftCount
          : undefined;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
          >
            {item.label}
            {badge && <span className={styles.badge}>{badge}</span>}
          </Link>
        );
      })}

      <div className={styles.right}>
        <span className={styles.email}>KOMO</span>
        <div className={styles.avatar}>T</div>
      </div>
    </nav>
  );
}
