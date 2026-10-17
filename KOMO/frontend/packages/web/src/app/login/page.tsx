'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, register, getMe } from '@komo/shared/api-client';
import { registrationError } from '@/lib/registration';
import IcpFooter from '@/components/IcpFooter/IcpFooter';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [nickname, setNickname] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  // 已登录用户直接进入知识库
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => { if (u && !cancelled) router.replace('/'); })
      .catch((error) => { if (!cancelled) setLoginError(error.message); })
      .finally(() => { if (!cancelled) setCheckingSession(false); });
    return () => { cancelled = true; };
  }, [router]);

  const handleLogin = async () => {
    if (checkingSession || loggingIn || !email.trim() || !password) return;
    if (registering) {
      const error = registrationError(password, confirmation);
      if (error) { setLoginError(error); return; }
    }
    setLoggingIn(true);
    setLoginError(null);
    try {
      if (registering) {
        await register({ email: email.trim(), password, nickname: nickname.trim() || undefined });
      } else {
        await login({ email: email.trim(), password });
      }
      router.replace('/');
    } catch (err) {
      setLoginError((err as Error).message || '登录失败');
      setLoggingIn(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{registering ? '注册 KOMO' : '登录 KOMO'}</h1>
        <p className={styles.desc}>{registering ? '创建账号后即可使用知识库和对话' : '使用已有账号登录'}</p>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void handleLogin(); }}>
          <input
            className={styles.input}
            type="email"
            autoComplete="email"
            aria-label="邮箱"
            required
            maxLength={255}
            disabled={loggingIn}
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={styles.input}
            type="password"
            autoComplete={registering ? 'new-password' : 'current-password'}
            aria-label="密码"
            required
            disabled={loggingIn}
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {registering && (
            <>
              <p className={styles.passwordHint}>密码需为 8–100 位，同时包含字母和数字。</p>
              <input className={styles.input} type="password" autoComplete="new-password" required
                aria-label="确认密码" placeholder="再次输入密码" value={confirmation} disabled={loggingIn}
                onChange={(event) => setConfirmation(event.target.value)} />
              <input className={styles.input} autoComplete="nickname" maxLength={100}
                aria-label="昵称（选填）" placeholder="昵称（选填）" value={nickname} disabled={loggingIn}
                onChange={(event) => setNickname(event.target.value)} />
            </>
          )}
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={checkingSession || loggingIn || !email.trim() || !password}
          >
            {checkingSession ? '检查登录状态...' : loggingIn ? '正在提交…' : registering ? '注册并进入' : '登录'}
          </button>
          {loginError && <p className={styles.error} role="alert">{loginError}</p>}
          <button type="button" className={styles.switchMode} disabled={loggingIn || checkingSession}
            onClick={() => { setRegistering(!registering); setPassword(''); setConfirmation(''); setLoginError(null); }}>
            {registering ? '已有账号？返回登录' : '没有账号？注册'}
          </button>
        </form>
      </div>
      <div className={styles.footer}>
        <IcpFooter />
      </div>
    </div>
  );
}
