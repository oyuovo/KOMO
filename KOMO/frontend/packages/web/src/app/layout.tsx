import type { Metadata } from 'next';
import TopNav from '@/components/TopNav/TopNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'KOMO — Knowledge On My Own',
  description: 'AI 驱动的个人知识管理工具',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
