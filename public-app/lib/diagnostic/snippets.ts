/**
 * 진단 결과의 fail 항목 → 제작사에 그대로 전달 가능한 코드 스니펫 생성.
 *
 * 3가지 타입:
 *  - 'html'   : <head> 안에 붙여넣는 메타/링크 태그 (자동 채움)
 *  - 'header' : 서버(웹서버/CDN) 응답 헤더 설정 — 코드는 참고용. nginx/apache/Vercel 별 예시 동봉.
 *  - 'jsonld' : <script type="application/ld+json"> — 사용자 입력 폼 기반 (Organization)
 *
 * label 은 scoring.ts LABELS 의 한국어 문자열을 그대로 사용 — 진단 결과의 CategoryItem.label 과 매칭.
 */

import { LABELS } from './scoring';
import type { DiagnosticResponse } from './types';

export type SnippetType = 'html' | 'header' | 'jsonld';

export interface SnippetSpec {
  /** scoring.ts LABELS 값 (한국어). CategoryItem.label 과 매칭되는 키. */
  label: string;
  type: SnippetType;
  /** 카드에 표시할 짧은 설명 — 어디에 붙여넣는지. */
  where: string;
  /** 추가 안내 (선택). nginx/Vercel 등 환경별 차이 등. */
  note?: string;
  /** 자동 생성된 스니펫 본문. */
  code: string;
  /** form 입력이 필요하면 폼 필드 정의 (jsonld 전용). */
  formFields?: Array<{ key: string; label: string; placeholder: string; required?: boolean }>;
}

// ── 헬퍼 ───────────────────────────────────────────────────

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeJsonString(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

// ── 1) HTML <head> 스니펫 — 자동 채움 ─────────────────────────

function snippetViewport(): SnippetSpec {
  return {
    label: LABELS.viewport,
    type: 'html',
    where: '<head> 태그 안 (한 줄)',
    code: '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  };
}

function snippetCharset(): SnippetSpec {
  return {
    label: LABELS.charset_utf8,
    type: 'html',
    where: '<head> 태그의 첫 줄 (다른 메타보다 위)',
    code: '<meta charset="UTF-8">',
  };
}

function snippetDoctype(): SnippetSpec {
  return {
    label: LABELS.doctype,
    type: 'html',
    where: 'HTML 파일의 첫 줄 (<html> 태그보다 위)',
    code: '<!DOCTYPE html>',
  };
}

function snippetCanonical(result: DiagnosticResponse): SnippetSpec {
  const url = escapeHtmlAttr(result.url);
  return {
    label: LABELS.canonical,
    type: 'html',
    where: '<head> 태그 안 — 각 페이지마다 그 페이지 정식 URL 로 변경',
    note: '예시는 메인 페이지 기준입니다. 진료 안내·의료진 등 하위 페이지는 각 페이지 URL 로 바꿔서 사용.',
    code: `<link rel="canonical" href="${url}">`,
  };
}

function snippetFavicon(): SnippetSpec {
  return {
    label: LABELS.favicon,
    type: 'html',
    where: '<head> 태그 안. favicon.ico 는 사이트 루트(/favicon.ico)에 업로드 필요',
    note: '병원 로고를 32×32 PNG/ICO 로 변환 (favicon.io 무료 도구 활용).',
    code: [
      '<link rel="icon" type="image/x-icon" href="/favicon.ico">',
      '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    ].join('\n'),
  };
}

function snippetOgBundle(result: DiagnosticResponse): SnippetSpec {
  const url = escapeHtmlAttr(result.url);
  const title = escapeHtmlAttr(result.siteName || '병원 이름');
  const desc = escapeHtmlAttr(
    result.heroSummary?.slice(0, 150) ?? `${result.siteName || '병원'} 공식 홈페이지입니다.`,
  );
  const imageHint = escapeHtmlAttr(`${result.url.replace(/\/$/, '')}/og-image.png`);
  return {
    label: LABELS.og_bundle,
    type: 'html',
    where: '<head> 태그 안. og:image 는 1200×630px 이상 권장 (카카오·페이스북 미리보기용)',
    note: 'og:image 경로는 실제 이미지 파일 위치에 맞춰 수정하세요.',
    code: [
      `<meta property="og:title" content="${title}">`,
      `<meta property="og:description" content="${desc}">`,
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:image" content="${imageHint}">`,
    ].join('\n'),
  };
}

function snippetTwitterCard(result: DiagnosticResponse): SnippetSpec {
  const title = escapeHtmlAttr(result.siteName || '병원 이름');
  const desc = escapeHtmlAttr(
    result.heroSummary?.slice(0, 150) ?? `${result.siteName || '병원'} 공식 홈페이지입니다.`,
  );
  const imageHint = escapeHtmlAttr(`${result.url.replace(/\/$/, '')}/og-image.png`);
  return {
    label: LABELS.twitter_card,
    type: 'html',
    where: '<head> 태그 안 — OG 태그 다음에 추가',
    note: 'OG 태그가 이미 있으면 Twitter 가 그걸 fallback 으로 사용합니다. 둘 다 두면 더 완벽합니다.',
    code: [
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${title}">`,
      `<meta name="twitter:description" content="${desc}">`,
      `<meta name="twitter:image" content="${imageHint}">`,
    ].join('\n'),
  };
}

// ── 2) HTTP 응답 헤더 — 서버 환경별 설정 안내 ─────────────────

function snippetCspHeader(): SnippetSpec {
  return {
    label: LABELS.csp_header,
    type: 'header',
    where: '웹 서버 응답 헤더 (nginx/Apache/Vercel 등)',
    note: '처음에는 default-src self 로 시작 후 점진 강화. 잘못 설정하면 사이트가 깨질 수 있어 단계적 적용 필수. observatory.mozilla.org 로 검증.',
    code: [
      '# nginx (server 블록 안)',
      'add_header Content-Security-Policy "default-src \'self\'; script-src \'self\' \'unsafe-inline\'; img-src \'self\' data: https:; style-src \'self\' \'unsafe-inline\';" always;',
      '',
      '# Vercel (vercel.json)',
      '{ "headers": [ { "source": "/(.*)", "headers": [ { "key": "Content-Security-Policy", "value": "default-src \'self\'" } ] } ] }',
    ].join('\n'),
  };
}

function snippetHstsHeader(): SnippetSpec {
  return {
    label: LABELS.hsts_header,
    type: 'header',
    where: '웹 서버 응답 헤더',
    note: 'HTTPS 가 정상 동작하는 상태에서만 적용. HTTPS 없이 HSTS 만 켜면 사이트 접속 불가.',
    code: [
      '# nginx',
      'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
      '',
      '# Apache (.htaccess)',
      'Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"',
    ].join('\n'),
  };
}

function snippetXFrameHeader(): SnippetSpec {
  return {
    label: LABELS.x_frame_header,
    type: 'header',
    where: '웹 서버 응답 헤더',
    note: '외부 iframe 임베드 허용 안 한다면 DENY 도 가능. SAMEORIGIN 은 같은 도메인만 허용.',
    code: [
      '# nginx',
      'add_header X-Frame-Options "SAMEORIGIN" always;',
      '',
      '# Apache (.htaccess)',
      'Header always set X-Frame-Options "SAMEORIGIN"',
    ].join('\n'),
  };
}

function snippetXContentTypeHeader(): SnippetSpec {
  return {
    label: LABELS.x_content_type_header,
    type: 'header',
    where: '웹 서버 응답 헤더',
    note: '가장 쉽고 빠른 보안 헤더. 거의 모든 사이트에 적용해도 부작용 없음.',
    code: [
      '# nginx',
      'add_header X-Content-Type-Options "nosniff" always;',
      '',
      '# Apache (.htaccess)',
      'Header always set X-Content-Type-Options "nosniff"',
    ].join('\n'),
  };
}

function snippetReferrerPolicyHeader(): SnippetSpec {
  return {
    label: LABELS.referrer_policy_header,
    type: 'header',
    where: '웹 서버 응답 헤더',
    code: [
      '# nginx',
      'add_header Referrer-Policy "no-referrer-when-downgrade" always;',
      '',
      '# Apache (.htaccess)',
      'Header always set Referrer-Policy "no-referrer-when-downgrade"',
    ].join('\n'),
  };
}

// ── 3) JSON-LD — 폼 입력 기반 ────────────────────────────────

export interface OrganizationFormInput {
  name: string;
  url: string;
  logo?: string;
  telephone?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  sameAs?: string; // 줄바꿈 구분
}

export function generateOrganizationSchema(input: OrganizationFormInput): string {
  const sameAsList = (input.sameAs || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));

  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    url: input.url,
  };
  if (input.logo) obj.logo = input.logo;
  if (input.telephone) obj.telephone = input.telephone;
  const hasAddress =
    input.streetAddress || input.addressLocality || input.addressRegion || input.postalCode;
  if (hasAddress) {
    obj.address = {
      '@type': 'PostalAddress',
      ...(input.streetAddress ? { streetAddress: input.streetAddress } : {}),
      ...(input.addressLocality ? { addressLocality: input.addressLocality } : {}),
      ...(input.addressRegion ? { addressRegion: input.addressRegion } : {}),
      ...(input.postalCode ? { postalCode: input.postalCode } : {}),
      addressCountry: 'KR',
    };
  }
  if (sameAsList.length > 0) obj.sameAs = sameAsList;

  const json = JSON.stringify(obj, null, 2);
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function snippetOrganizationSchema(result: DiagnosticResponse): SnippetSpec {
  // 초기값 — DiagnosticResponse 에서 채울 수 있는 만큼 자동 채움.
  const initial: OrganizationFormInput = {
    name: result.siteName || '',
    url: result.url || '',
  };
  return {
    label: LABELS.organization_schema,
    type: 'jsonld',
    where: '<head> 또는 <body> 안 (전체 사이트에 한 번)',
    note: '필수: 상호·홈페이지 URL. sameAs 에 네이버 플레이스·구글 비즈니스·카카오 채널·인스타·유튜브 URL 을 줄바꿈으로 모두 추가하면 AI 가 "같은 병원" 으로 인식합니다.',
    code: generateOrganizationSchema(initial),
    formFields: [
      { key: 'name', label: '병원 상호', placeholder: '예: 미소치과의원', required: true },
      { key: 'url', label: '홈페이지 URL', placeholder: 'https://example.co.kr', required: true },
      { key: 'logo', label: '로고 URL', placeholder: 'https://example.co.kr/logo.png' },
      { key: 'telephone', label: '대표 전화', placeholder: '02-123-4567' },
      { key: 'streetAddress', label: '도로명 주소', placeholder: '강남대로 123' },
      { key: 'addressLocality', label: '시·구', placeholder: '서울특별시 강남구' },
      { key: 'addressRegion', label: '시·도', placeholder: '서울특별시' },
      { key: 'postalCode', label: '우편번호', placeholder: '06000' },
      { key: 'sameAs', label: 'sameAs URL (줄바꿈 구분)', placeholder: 'https://m.place.naver.com/...\nhttps://www.instagram.com/...' },
    ],
  };
}

// ── 통합 빌더 ──────────────────────────────────────────────

/**
 * fail 또는 warning 상태인 항목 중 스니펫이 정의된 것만 수집.
 * unknown 은 측정 불가 → 스니펫 무의미 (이미 적용 가능성 있음).
 */
export function buildSnippetsForResult(result: DiagnosticResponse): SnippetSpec[] {
  // 모든 카테고리 아이템에서 fail/warning 라벨 모음
  const failingLabels = new Set<string>();
  for (const cat of result.categories) {
    for (const item of cat.items) {
      if (item.status === 'fail' || item.status === 'warning') {
        failingLabels.add(item.label);
      }
    }
  }

  const all: SnippetSpec[] = [];

  // HTML head 스니펫
  if (failingLabels.has(LABELS.viewport)) all.push(snippetViewport());
  if (failingLabels.has(LABELS.charset_utf8)) all.push(snippetCharset());
  if (failingLabels.has(LABELS.doctype)) all.push(snippetDoctype());
  if (failingLabels.has(LABELS.canonical)) all.push(snippetCanonical(result));
  if (failingLabels.has(LABELS.favicon)) all.push(snippetFavicon());
  if (failingLabels.has(LABELS.og_bundle)) all.push(snippetOgBundle(result));
  if (failingLabels.has(LABELS.twitter_card)) all.push(snippetTwitterCard(result));

  // HTTP 헤더
  if (failingLabels.has(LABELS.csp_header)) all.push(snippetCspHeader());
  if (failingLabels.has(LABELS.hsts_header)) all.push(snippetHstsHeader());
  if (failingLabels.has(LABELS.x_frame_header)) all.push(snippetXFrameHeader());
  if (failingLabels.has(LABELS.x_content_type_header)) all.push(snippetXContentTypeHeader());
  if (failingLabels.has(LABELS.referrer_policy_header)) all.push(snippetReferrerPolicyHeader());

  // JSON-LD (폼 입력)
  if (failingLabels.has(LABELS.organization_schema)) all.push(snippetOrganizationSchema(result));

  return all;
}

// 외부에서 escape 헬퍼 재사용 필요 시
export const _escapeJsonString = escapeJsonString;
