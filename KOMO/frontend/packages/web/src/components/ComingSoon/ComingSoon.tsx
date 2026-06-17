import Link from 'next/link';

interface NotFoundProps {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}

export default function NotFound({
  title = '页面不存在',
  description = '你访问的页面不存在或已被移除。',
  backHref = '/',
  backLabel = '← 返回知识库',
}: NotFoundProps) {
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
        {description}
      </p>
      <Link
        href={backHref}
        style={{
          color: 'var(--komo-link)',
          fontSize: 14,
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        {backLabel}
      </Link>
    </div>
  );
}
