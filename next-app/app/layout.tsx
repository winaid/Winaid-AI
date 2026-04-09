import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WINAI - 병원 AI 콘텐츠 생성',
  description: '병원 마케팅을 위한 AI 콘텐츠 생성 플랫폼',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
