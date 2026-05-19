'use client';

/**
 * SchemaOrgSection — schema.org JSON-LD 자동 생성 도구 (GEO-6 — 14 기능 6번)
 *
 * 진단 결과 (siteName + url + detectedServices + detectedRegion) →
 * MedicalOrganization / Physician / FAQPage / LocalBusiness JSON-LD 마크업.
 *
 * 운영자가 결과 코드를 홈페이지 `<head>` 에 paste → AI 모델 (ChatGPT/Gemini/Claude)
 * 이 구조화 데이터 인식 → 인용률 직접 ↑.
 *
 * 별도 페이지 신설 X — diagnostic 결과 화면 GeoCitationsSection 다음에 통합.
 * 양 앱 lockstep — public-app / next-app 같은 파일 (schemaOrg.test 가 diff=0 강제).
 */

import { useCallback, useMemo, useState } from 'react';
import {
  buildAllSchemas,
  serializeSchema,
  wrapAsScript,
  type BuildAllSchemasResult,
  type SchemaBuilderInput,
  type SchemaObject,
} from '@winaid/blog-core';

export interface SchemaOrgSectionProps {
  /** 진단 결과의 finalUrl — schema 의 url 필드 + LocalBusiness/MedicalOrg 의 base. */
  diagnosticUrl: string;
  /** 진단 결과의 siteName — schema 의 name 필드. */
  hospitalName: string;
  /** 진단 결과의 detectedRegion — schema 의 addressRegion 매핑. */
  region?: string;
  /** 진단 결과의 detectedServices — schema 의 medicalSpecialty 매핑. */
  specialties?: string[];
}

const RICH_RESULTS_TEST_URL = 'https://search.google.com/test/rich-results';

interface TabDef {
  key: 'medicalOrganization' | 'physicians' | 'faqPage' | 'localBusiness';
  label: string;
  emoji: string;
}

const TABS: TabDef[] = [
  { key: 'medicalOrganization', label: 'MedicalOrganization', emoji: '🏥' },
  { key: 'physicians', label: 'Physician', emoji: '👨‍⚕️' },
  { key: 'faqPage', label: 'FAQPage', emoji: '❓' },
  { key: 'localBusiness', label: 'LocalBusiness', emoji: '📍' },
];

function CopyButton({ text, label = '📋 복사' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard 권한 / iframe / insecure context 등 실패는 silent
    }
  }, [text]);
  return (
    <button
      type="button"
      onClick={onCopy}
      className="text-[11px] px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded cursor-pointer font-medium"
    >
      {copied ? '✓ 복사됨' : label}
    </button>
  );
}

function SchemaPreview({ schema }: { schema: SchemaObject }) {
  const json = useMemo(() => serializeSchema(schema), [schema]);
  const scriptTag = useMemo(() => wrapAsScript(schema), [schema]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <CopyButton text={scriptTag} label="📋 <script> 태그로 복사" />
        <CopyButton text={json} label="📋 JSON 만 복사" />
      </div>
      <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto max-h-[320px] leading-relaxed">
        {json}
      </pre>
    </div>
  );
}

function EmptyTab({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-4 border border-slate-200">
      <p className="font-medium text-slate-700 mb-1">{label} schema 생성 불가</p>
      <p className="leading-relaxed">{hint}</p>
    </div>
  );
}

export default function SchemaOrgSection({
  diagnosticUrl,
  hospitalName,
  region,
  specialties,
}: SchemaOrgSectionProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabDef['key']>('medicalOrganization');
  const [physicianIdx, setPhysicianIdx] = useState(0);

  // 진단 데이터 → schema input. 운영자 추가 정보 (전화/주소/FAQ) 는 후속 PR.
  const input: SchemaBuilderInput = useMemo(() => ({
    name: hospitalName,
    url: diagnosticUrl,
    specialties: specialties || [],
    region,
    // 진단에서 직접 추출 안 되는 필드들 — 미입력 → missingFields 안내로 표시
    doctors: [],
    faqs: [],
  }), [hospitalName, diagnosticUrl, region, specialties]);

  const built: BuildAllSchemasResult = useMemo(() => buildAllSchemas(input), [input]);

  const renderTab = () => {
    if (activeTab === 'medicalOrganization') {
      return built.medicalOrganization
        ? <SchemaPreview schema={built.medicalOrganization} />
        : <EmptyTab label="MedicalOrganization" hint="병원명 + 홈페이지 URL 이 필요합니다." />;
    }
    if (activeTab === 'localBusiness') {
      return built.localBusiness
        ? <SchemaPreview schema={built.localBusiness} />
        : <EmptyTab label="LocalBusiness" hint="병원명 + 홈페이지 URL 이 필요합니다." />;
    }
    if (activeTab === 'faqPage') {
      return built.faqPage
        ? <SchemaPreview schema={built.faqPage} />
        : <EmptyTab label="FAQPage" hint="FAQ 항목이 비어있어 schema 가 생성되지 않습니다. 운영자가 직접 입력 후 마크업 권장." />;
    }
    if (activeTab === 'physicians') {
      if (built.physicians.length === 0) {
        return <EmptyTab label="Physician" hint="의료진 이름이 비어있어 schema 가 생성되지 않습니다. 운영자가 직접 입력 후 마크업 권장." />;
      }
      const p = built.physicians[Math.min(physicianIdx, built.physicians.length - 1)];
      return (
        <div className="space-y-2">
          {built.physicians.length > 1 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {built.physicians.map((doc, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPhysicianIdx(i)}
                  className={
                    'text-[10px] px-2 py-0.5 rounded-full border cursor-pointer ' +
                    (i === physicianIdx
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
                  }
                >
                  {String((doc as { name?: string }).name) || `의료진 ${i + 1}`}
                </button>
              ))}
            </div>
          )}
          <SchemaPreview schema={p} />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between cursor-pointer bg-transparent border-0 p-0 text-left"
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-bold text-slate-700">
            🏷️ schema.org 구조화 데이터 — AI 인식률 ↑
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            아래 코드를 홈페이지 <code className="bg-slate-100 px-1 rounded">{'<head>'}</code> 에
            붙여넣으면 AI 모델이 병원 정보를 더 정확하게 인식합니다.
            <span className="text-slate-400 ml-1">{open ? '접기 ▲' : '펼치기 ▼'}</span>
          </p>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          {/* 탭 */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {TABS.map(t => {
              const count = t.key === 'physicians' ? built.physicians.length : (built[t.key] ? 1 : 0);
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={
                    'text-[11px] px-2.5 py-1 rounded-lg border font-medium cursor-pointer ' +
                    (active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
                  }
                >
                  {t.emoji} {t.label}
                  <span className={
                    'ml-1 text-[10px] ' + (active ? 'text-indigo-100' : 'text-slate-400')
                  }>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 현재 탭 본문 */}
          <div className="mb-4">{renderTab()}</div>

          {/* 종합 박스 */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[12px] font-bold text-slate-700">전체 schema 한 번에 복사</h4>
                {built.combinedScripts && <CopyButton text={built.combinedScripts} label="📋 4 schema 일괄 복사" />}
              </div>
              {built.combinedScripts ? (
                <p className="text-[11px] text-slate-500">
                  생성된 schema {(() => {
                    let n = 0;
                    if (built.medicalOrganization) n++;
                    if (built.localBusiness) n++;
                    if (built.faqPage) n++;
                    n += built.physicians.length;
                    return n;
                  })()}개를 한 번에 복사합니다.
                </p>
              ) : (
                <p className="text-[11px] text-rose-700">
                  필수 필드 (병원명 + URL) 누락으로 생성된 schema 가 없습니다.
                </p>
              )}
            </div>

            <div>
              <a
                href={RICH_RESULTS_TEST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                🔍 Google 구조화 데이터 검증기에서 확인 →
              </a>
            </div>

            {built.missingFields.length > 0 && (
              <div className="text-[11px] bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="font-medium text-amber-800 mb-1.5">💡 더 풍부한 schema 를 위해 추가하면 좋은 정보</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                  {built.missingFields.map(m => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-amber-600 mt-2">
                  현 버전은 진단에서 자동 추출 가능한 필드만 사용합니다. 추가 정보 입력은 후속 PR 에서 지원 예정.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
