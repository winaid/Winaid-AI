'use client';

interface AnalyzedSubpagesProps {
  subpages: string[] | undefined;
  /** 메인 페이지 URL — 헤더 표기에 포함 (분석된 페이지 = 메인 + 서브). */
  mainUrl: string;
}

const SAFE_URL_RE = /^https?:\/\//i;

/**
 * 진단 시 실제 fetch 성공한 서브페이지 URL list. summary 탭 메타 영역에 노출.
 *
 * `javascript:` / `data:` / `file:` 등 위험 protocol 은 SAFE_URL_RE 로 사전 차단
 * (서버 크롤러가 정상 URL 만 emit 하지만 방어 깊이 — XSS 가드).
 * 서브페이지 0건이면 "메인 페이지만 분석됨" placeholder.
 */
export default function AnalyzedSubpages({ subpages, mainUrl }: AnalyzedSubpagesProps) {
  const validUrls = (subpages ?? []).filter((u) => SAFE_URL_RE.test(u));
  const totalPages = 1 + validUrls.length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[13px] font-bold text-slate-700">
          🔍 분석된 페이지 {totalPages}개
        </h3>
        <span className="text-[10px] text-slate-400">
          {validUrls.length === 0 ? '메인 페이지만 분석됨' : `메인 + 서브 ${validUrls.length}개`}
        </span>
      </div>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2 text-[12px]">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold">
            MAIN
          </span>
          <span className="text-slate-600 break-all">{mainUrl}</span>
        </li>
        {validUrls.map((url) => (
          <li key={url} className="flex items-center gap-2 text-[12px]">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
              SUB
            </span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-800 hover:underline break-all"
            >
              {url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
