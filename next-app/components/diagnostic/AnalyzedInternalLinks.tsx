'use client';

import { useState } from 'react';

export interface AnalyzedInternalLinksProps {
  links: Array<{ href: string; text: string }> | undefined;
}

const SAFE_URL_RE = /^https?:\/\//i;
const DEFAULT_LIMIT = 20;

/**
 * 크롤러가 메인 페이지 HTML 에서 추출한 internal link list. 사용자 자기 디버깅용:
 *   - 진료/가격 등 페이지 미감지 시 footer dynamic 렌더링 의심 → 여기 list 에 없으면 JS 로 삽입된 footer
 *   - footer 가 외부 origin (cdn / 별도 도메인) 으로 분리되면 internalLinks 미분류 → list 에서 누락
 *   - fragment-only href ("#service") 는 cheerio 파싱 후 origin 매치 실패 가능
 *
 * 보안: SAFE_URL_RE 로 http(s) 만 통과 (javascript:/data:/file: 차단), text 는 React 자동 escape.
 * UX: 너무 많은 link 는 접기 (default 20개, 펼치기 버튼).
 */
export default function AnalyzedInternalLinks({ links }: AnalyzedInternalLinksProps) {
  const [expanded, setExpanded] = useState(false);
  const validLinks = (links ?? []).filter((l) => SAFE_URL_RE.test(l.href));
  if (validLinks.length === 0) return null;

  const visible = expanded ? validLinks : validLinks.slice(0, DEFAULT_LIMIT);
  const remaining = validLinks.length - visible.length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[13px] font-bold text-slate-700">
          🔗 감지된 내부 링크 {validLinks.length}개
        </h3>
        <span className="text-[10px] text-slate-400">자기 디버깅용</span>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
        진단이 footer·메뉴 등에서 잡은 모든 내부 링크입니다. 여기 없는 페이지는 footer 가 JS 로 동적 렌더링되거나, 외부 도메인으로 분리되어 있을 가능성이 있어요.
      </p>
      <ul className="space-y-1.5">
        {visible.map((l, i) => (
          <li key={`${l.href}-${i}`} className="flex items-start gap-2 text-[12px]">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold mt-0.5 shrink-0">
              LINK
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-slate-700 truncate">{l.text || '(텍스트 없음)'}</div>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline break-all"
              >
                {l.href}
              </a>
            </div>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline bg-transparent border-0 p-0 cursor-pointer"
        >
          + {remaining}개 더 보기
        </button>
      )}
      {expanded && validLinks.length > DEFAULT_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:underline bg-transparent border-0 p-0 cursor-pointer"
        >
          접기
        </button>
      )}
    </div>
  );
}
