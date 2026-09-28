'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { listDrafts, getMe, resetOnboarding, type UserInfo } from '@komo/shared/api-client';
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
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // 每次路由切换时刷新用户信息和草稿数量
  useEffect(() => {
    getMe()
      .then((u) => {
        setUser(u);
        if (u) {
          listDrafts()
            .then((drafts) => setDraftCount(drafts.length))
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, [pathname]);

  const handleHelpReset = async () => {
    try {
      await resetOnboarding();
      window.location.href = '/';
    } catch {
      // ignore
    }
  };

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.logo}>
        <span className={styles.logoDot} />
        KOMO
      </Link>

      {user && navItems.map((item) => {
        const isActive = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href);

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

      {user && (
        <div className={styles.right}>
          <button
            className={styles.helpBtn}
            onClick={handleHelpReset}
            title="重新显示新手指引"
          >
            ?
          </button>
          <span className={styles.email}>{user.email}</span>
          <div className={styles.avatar}>
            {user.nickname ? user.nickname[0].toUpperCase() : 'U'}
          </div>
        </div>
      )}

      {!user && authChecked && (
        <div className={styles.right}>
          <Link href="/login" className={styles.loginBtn}>
            登录
          </Link>
        </div>
      )}
    </nav>
  );
}
