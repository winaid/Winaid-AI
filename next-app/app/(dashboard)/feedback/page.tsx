'use client';

import { useAuthGuard } from '../../../hooks/useAuthGuard';
import InternalFeedback from '../../../components/InternalFeedback';

export default function FeedbackPage() {
  const { user, userName } = useAuthGuard();

  return (
    <div className="min-h-full flex flex-col items-center px-6 pt-16 pb-20 bg-[#f7f7f8]">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">내부 피드백</h1>
        <InternalFeedback
          page="dashboard"
          userId={user?.id}
          userName={userName}
          writeOnly
        />
      </div>
    </div>
  );
}
