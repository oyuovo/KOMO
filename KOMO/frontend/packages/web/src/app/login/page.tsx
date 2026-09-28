'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, getMe } from '@komo/shared/api-client';
import IcpFooter from '@/components/IcpFooter/IcpFooter';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // 已登录用户直接进入知识库
  useEffect(() => {
    getMe()
      .then((u) => { if (u) router.replace('/'); })
      .catch(() => {});
  }, [router]);

  const handleLogin = async () => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      await login({ email, password });
      router.push('/');
    } catch (err) {
      setLoginError((err as Error).message || '登录失败');
      setLoggingIn(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>登录 KOMO</h1>
        <p className={styles.desc}>使用已有账号登录</p>
        <div className={styles.form}>
          <input
            className={styles.input}
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !loggingIn) handleLogin(); }}
          />
          <input
            className={styles.input}
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !loggingIn) handleLogin(); }}
          />
          <button
            className={styles.submitBtn}
            onClick={handleLogin}
            disabled={loggingIn || !email.trim() || !password}
          >
            {loggingIn ? '登录中...' : '登录'}
          </button>
          {loginError && <p className={styles.error}>{loginError}</p>}
        </div>
      </div>
      <div className={styles.footer}>
        <IcpFooter />
      </div>
    </div>
  );
}
