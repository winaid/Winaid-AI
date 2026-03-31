'use client';

import { useAuthGuard } from '../../../hooks/useAuthGuard';
import InternalFeedback from '../../../components/InternalFeedback';

export default function FeedbackPage() {
  const { user, userName } = useAuthGuard();

  return (
    <div className="min-h-full flex flex-col items-center px-6 pt-16 pb-20 bg-[#f7f7f8]">
      <div className="w-full max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">내부 피드백</h1>
          <p className="text-sm text-slate-500 mb-4">버그 제보, 불편한 점, 개선 요청을 남겨주세요.</p>
          <InternalFeedback
            page="dashboard"
            userId={user?.id}
            userName={userName}
            writeOnly
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">💡 아이디어 제안</h1>
          <p className="text-sm text-slate-500 mb-4">새로운 기능, 콘텐츠, 디자인 등 아이디어를 자유롭게 남겨주세요.</p>
          <InternalFeedback
            page="idea"
            userId={user?.id}
            userName={userName}
            writeOnly
          />
        </div>
      </div>
    </div>
  );
}
