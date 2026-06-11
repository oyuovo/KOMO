import Link from 'next/link';

interface ComingSoonProps {
  title: string;
  description?: string;
}

export default function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: 48,
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 40,
        marginBottom: 16,
        opacity: 0.6,
      }}>
        🚧
      </div>
      <h1 style={{
        fontSize: 22,
        fontWeight: 700,
        color: 'var(--komo-text)',
        marginBottom: 8,
        letterSpacing: '-0.02em',
      }}>
        {title}
      </h1>
      <p style={{
        fontSize: 15,
        color: 'var(--komo-text-secondary)',
        marginBottom: 24,
        maxWidth: 400,
      }}>
        {description || '功能正在开发中，即将上线。'}
      </p>
      <Link
        href="/"
        style={{
          color: 'var(--komo-link)',
          fontSize: 14,
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        ← 返回知识库
      </Link>
    </div>
  );
}
