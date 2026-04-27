'use client';

import { useMemo } from 'react';
import type { DiagnosticResponse } from '../../lib/diagnostic/types';
import { buildSnippetsForResult } from '../../lib/diagnostic/snippets';
import HtmlSnippetCard from './HtmlSnippetCard';

interface Props {
  result: DiagnosticResponse;
}

/**
 * fail/warning 항목 중 코드 스니펫이 정의된 것만 모아서 렌더.
 * 진단에서 fail 0건이면 빈 안내 메시지.
 */
export default function SnippetsPanel({ result }: Props) {
  const snippets = useMemo(() => buildSnippetsForResult(result), [result]);

  if (snippets.length === 0) {
    return (
      <div className="max-w-4xl mx-auto rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-emerald-700 font-bold text-base">🎉 코드로 고칠 항목이 없습니다!</p>
        <p className="mt-2 text-[12px] text-emerald-600 leading-relaxed">
          기본 메타·헤더·구조화 데이터는 모두 적용되어 있습니다. 다른 우선 조치 항목은 콘텐츠
          작성·외부 채널 등록 등 사람 작업이 필요합니다.
        </p>
      </div>
    );
  }

  // 타입별 그룹핑 — html / jsonld / header
  const html = snippets.filter((s) => s.type === 'html');
  const jsonld = snippets.filter((s) => s.type === 'jsonld');
  const header = snippets.filter((s) => s.type === 'header');

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-sm font-bold text-indigo-800">🛠 제작사에 그대로 전달하세요</p>
        <p className="mt-1 text-[12px] text-indigo-700 leading-relaxed">
          진단에서 누락 감지된 항목 중 코드로 고칠 수 있는 것을 자동 생성했습니다. 각 카드의 &ldquo;복사&rdquo;
          버튼으로 코드를 복사한 뒤 카카오톡·이메일로 제작사에 전달하면 됩니다.
        </p>
      </div>

      {html.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[13px] font-bold text-slate-600 px-1">🏷️ HTML 메타 태그 ({html.length}개)</h3>
          {html.map((s) => <HtmlSnippetCard key={s.label} snippet={s} />)}
        </section>
      )}

      {jsonld.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[13px] font-bold text-slate-600 px-1">📋 JSON-LD 구조화 데이터 ({jsonld.length}개)</h3>
          {jsonld.map((s) => <HtmlSnippetCard key={s.label} snippet={s} />)}
        </section>
      )}

      {header.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[13px] font-bold text-slate-600 px-1">🛡️ HTTP 응답 헤더 ({header.length}개)</h3>
          {header.map((s) => <HtmlSnippetCard key={s.label} snippet={s} />)}
        </section>
      )}
    </div>
  );
}
