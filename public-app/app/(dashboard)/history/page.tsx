'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** /history → /mypage 리다이렉트 (히스토리가 마이페이지에 통합됨) */
export default function HistoryRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/mypage'); }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}
