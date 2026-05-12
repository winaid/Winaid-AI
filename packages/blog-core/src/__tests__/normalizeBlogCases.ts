/**
 * normalizeBlog leak filter 회귀 테스트 케이스 (양 앱 공유).
 *
 * 사용처:
 *   next-app/__tests__/normalizeBlog.test.ts
 *   public-app/__tests__/normalizeBlog.test.ts
 *
 * 각 케이스는 source PR 코멘트로 출처 추적 가능.
 * 새 누수 보고 발견 시 본 파일에 케이스만 추가하면 양 앱이 자동 검증.
 *
 * 출처 분류 (총 45 unique):
 *   PR #154 — 본문 누수 필터 초기 (블로그 본문 누수 차단)
 *   PR #156 — 헤딩 누수 회귀 차단 (22 케이스, "+ 소제목을" 사용자 보고)
 *   PR #157 — IMG_N false-positive (25 케이스, [IMG_1~15] 정상 마커 보존)
 *   PR #159 — dead pattern 3 제거 (47/47 직접 증명, 케이스 추가 없음)
 *
 * Dedupe: "<h3>출장 진료 안내</h3>" 와 "<h3>META 분석 보고서</h3>" 가 PR #156·#157
 *         양쪽에 동일 등장 → 한 번만 보관, source 에 두 PR 모두 표기.
 */

export interface LeakTestCase {
  /** 짧은 케이스 ID — fail 메시지에 표시. */
  id: string;
  /** 입력 HTML (보통 <p> 또는 <h3>). */
  input: string;
  /** true = 차단(strip)되어야 함, false = 보존되어야 함. */
  shouldStrip: boolean;
  /** 한 줄 라벨 (fail 메시지에 표시). */
  label: string;
  /** 출처 PR 번호 — 디버깅용. */
  source: string;
}

export const NORMAL_HEADING_CASES: LeakTestCase[] = [
  // ── PR #156 정상 헤딩 11건 ──
  { id: 'H-N-01', input: '<h3>스케일링은 얼마나 자주 받나요?</h3>', shouldStrip: false, label: '정상 헤딩: 질문형', source: 'PR #156' },
  { id: 'H-N-02', input: '<h3>임플란트 후 회복 기간</h3>', shouldStrip: false, label: '정상 헤딩: 임플란트 후 회복', source: 'PR #156' },
  { id: 'H-N-03', input: '<h3>치아 미백 시술 비교</h3>', shouldStrip: false, label: '정상 헤딩: 미백 비교', source: 'PR #156' },
  { id: 'H-N-04', input: '<h3>치주염 증상은 어떻게 나타날까요</h3>', shouldStrip: false, label: '정상 헤딩: 치주염 증상', source: 'PR #156' },
  { id: 'H-N-05', input: '<h3>어린이 치과 가는 법</h3>', shouldStrip: false, label: '정상 헤딩: 어린이 치과', source: 'PR #156' },
  { id: 'H-N-06', input: '<h3>출장 진료 안내</h3>', shouldStrip: false, label: '정상 헤딩 (출장 vs 출력 단어 경계)', source: 'PR #156, PR #157 (dedup)' },
  { id: 'H-N-07', input: '<h3>JSON 데이터 분석 결과</h3>', shouldStrip: false, label: '정상 헤딩 (JSON 단어 비-메타)', source: 'PR #156' },
  { id: 'H-N-08', input: '<h3>META 분석 보고서</h3>', shouldStrip: false, label: '정상 헤딩 (META 단어 비-메타)', source: 'PR #156, PR #157 (dedup)' },
  { id: 'H-N-09', input: '<h3>SECTION 검진 흐름</h3>', shouldStrip: false, label: '정상 헤딩 (SECTION 단독 → 패턴 강화 결과)', source: 'PR #156' },
  { id: 'H-N-10', input: '<h3>충치 치료 비용</h3>', shouldStrip: false, label: '정상 헤딩: 충치 비용', source: 'PR #156' },
  { id: 'H-N-11', input: '<h3>Format-A 임플란트</h3>', shouldStrip: false, label: '정상 헤딩 (Format 비-compound)', source: 'PR #156' },
  // ── PR #157 정상 헤딩 추가 (dedup 후 4건만) ──
  { id: 'H-N-12', input: '<h3>치아 관리</h3>', shouldStrip: false, label: '정상 헤딩: 치아 관리', source: 'PR #157' },
  { id: 'H-N-13', input: '<h3>임플란트 가격</h3>', shouldStrip: false, label: '정상 헤딩: 임플란트 가격', source: 'PR #157' },
  { id: 'H-N-14', input: '<h3>스케일링 받는 시기</h3>', shouldStrip: false, label: '정상 헤딩: 스케일링 시기', source: 'PR #157' },
  { id: 'H-N-15', input: '<h3>본문 보기 [IMG_1]</h3>', shouldStrip: false, label: '정상 헤딩 (헤딩 안 IMG_1 가상 케이스)', source: 'PR #157' },
];

export const LEAK_HEADING_CASES: LeakTestCase[] = [
  // ── PR #156 누수 헤딩 11건 ──
  { id: 'H-L-01', input: '<h3>소제목을</h3>', shouldStrip: true, label: '누수: "소제목을" 단독 (사용자 보고)', source: 'PR #156' },
  { id: 'H-L-02', input: '<h3>로 감싸 구조 명확화</h3>', shouldStrip: true, label: '누수: "로 감싸 구조 명확화" (사용자 보고)', source: 'PR #156' },
  { id: 'H-L-03', input: '<h3>[META] Output format</h3>', shouldStrip: true, label: '누수: [META] 라벨 헤딩', source: 'PR #156' },
  { id: 'H-L-04', input: '<h3>[CRITICAL] Subheading rule</h3>', shouldStrip: true, label: '누수: [CRITICAL] 라벨 헤딩', source: 'PR #156' },
  { id: 'H-L-05', input: '<h3>Subheading rule</h3>', shouldStrip: true, label: '누수: Subheading 단어', source: 'PR #156' },
  { id: 'H-L-06', input: '<h3>Output format</h3>', shouldStrip: true, label: '누수: Output format 단독', source: 'PR #156' },
  { id: 'H-L-07', input: '<h3>Section heading</h3>', shouldStrip: true, label: '누수: Section heading compound', source: 'PR #156' },
  { id: 'H-L-08', input: '<h3>h3 태그로 감싸</h3>', shouldStrip: true, label: '누수: "h3 태그로 감싸" 직설', source: 'PR #156' },
  { id: 'H-L-09', input: '<h3>사용 가능 태그</h3>', shouldStrip: true, label: '누수: "사용 가능 태그" 메타 어휘', source: 'PR #156' },
  { id: 'H-L-10', input: '<h3>meta</h3>', shouldStrip: true, label: '누수: meta 단독 영문 메타', source: 'PR #156' },
  { id: 'H-L-11', input: '<h3>[IMG_N alt</h3>', shouldStrip: true, label: '누수: [IMG_N alt 헤딩', source: 'PR #156' },
  // ── PR #157 누수 헤딩 추가 (다른 [IMG_N alt 변형) ──
  { id: 'H-L-12', input: '<h3>[IMG_N alt 사용]</h3>', shouldStrip: true, label: '누수: [IMG_N alt 사용] 변형', source: 'PR #157' },
  { id: 'H-L-13', input: '<h3>이미지 마커 안내</h3>', shouldStrip: true, label: '누수: 이미지 마커 메타 헤딩', source: 'PR #157' },
];

export const NORMAL_PARAGRAPH_CASES: LeakTestCase[] = [
  // ── PR #157 정상 본문 (IMG 마커 inline) ──
  { id: 'P-N-01', input: '<p>치아 관리 설명. [IMG_1 alt="치아"] 다음 설명.</p>', shouldStrip: false, label: '정상 IMG_1 inline', source: 'PR #157' },
  { id: 'P-N-02', input: '<p>[IMG_2 alt="dental chair"]</p>', shouldStrip: false, label: '정상 IMG_2 standalone', source: 'PR #157' },
  { id: 'P-N-03', input: '<p>임플란트 절차. [IMG_3] 본문.</p>', shouldStrip: false, label: '정상 IMG_3 alt 없음', source: 'PR #157' },
  { id: 'P-N-04', input: '<p>스케일링. [IMG_9 alt="..."] 마무리.</p>', shouldStrip: false, label: '정상 IMG_9 단일자리', source: 'PR #157' },
  { id: 'P-N-05', input: '<p>다단계. [IMG_10 alt="..."] 본문.</p>', shouldStrip: false, label: '정상 IMG_10 multi-digit', source: 'PR #157' },
  { id: 'P-N-06', input: '<p>풍부한 본문. [IMG_15 alt="..."] 본문.</p>', shouldStrip: false, label: '정상 IMG_15 multi-digit', source: 'PR #157' },
  { id: 'P-N-07', input: '<p>중간에 [IMG_5 alt="x"] 그리고 [IMG_6 alt="y"] 두 마커.</p>', shouldStrip: false, label: '정상 IMG 2개 같은 p', source: 'PR #157' },
  { id: 'P-N-08', input: '<p>마커 [IMG_4 alt="..."]가 끝에 위치.</p>', shouldStrip: false, label: '정상 IMG 끝쪽 위치', source: 'PR #157' },
];

export const LEAK_PARAGRAPH_CASES: LeakTestCase[] = [
  // ── PR #157 누수 본문 (IMG placeholder + 한국어 메타) ──
  { id: 'P-L-01', input: '<p>이미지 위치는 [IMG_N alt="..."] 마커.</p>', shouldStrip: true, label: '누수: literal [IMG_N placeholder', source: 'PR #157' },
  { id: 'P-L-02', input: '<p>[IMG_X alt="..."] 형태로 배치.</p>', shouldStrip: true, label: '누수: literal [IMG_X placeholder', source: 'PR #157' },
  { id: 'P-L-03', input: '<p>이미지 마커 [IMG_N] 사용.</p>', shouldStrip: true, label: '누수: [IMG_N + 한국어 메타', source: 'PR #157' },
  { id: 'P-L-04', input: '<p>IMG 마커 위치 표시.</p>', shouldStrip: true, label: '누수: IMG 마커 메타 어휘', source: 'PR #157' },
  { id: 'P-L-05', input: '<p>이미지 마커는 본문에.</p>', shouldStrip: true, label: '누수: 이미지 마커 메타 어휘', source: 'PR #157' },
  { id: 'P-L-06', input: '<p>[IMG_n alt="..."] lowercase placeholder.</p>', shouldStrip: true, label: '누수: [IMG_n 소문자', source: 'PR #157' },
  { id: 'P-L-07', input: '<p>[IMG_x alt="..."] lowercase placeholder.</p>', shouldStrip: true, label: '누수: [IMG_x 소문자', source: 'PR #157' },
  { id: 'P-L-08', input: '<p>다음에 [IMG_N\n marker placeholder.</p>', shouldStrip: true, label: '누수: [IMG_N\\n 개행 포함', source: 'PR #157' },
  // ── PR #154 본문 누수 (초기 차단 케이스) ──
  { id: 'P-L-09', input: '<p>소제목을 [태그명] 태그로 감싸 구조와 SEO 가독성을 확보</p>', shouldStrip: true, label: '누수: 사용자 보고 초기 누수 (PR #154)', source: 'PR #154' },
];

export const ALL_CASES: LeakTestCase[] = [
  ...NORMAL_HEADING_CASES,
  ...LEAK_HEADING_CASES,
  ...NORMAL_PARAGRAPH_CASES,
  ...LEAK_PARAGRAPH_CASES,
];

/**
 * 정규화 결과를 가지고 케이스가 strip 됐는지 판정.
 *
 * 정의:
 *   - input <h3>X</h3> → output 에 동일 X 가 사라졌으면 strip 된 것
 *   - input <p>X</p> → 동일
 *   - normalizeBlog 가 본문에 0~다른 변환을 가할 수 있으므로 input 의 inner text 가
 *     output 에 그대로 남아있는지로 판정.
 */
export function wasStripped(input: string, output: string): boolean {
  const innerMatch = input.match(/^<(p|h[23])[^>]*>([\s\S]*?)<\/(?:p|h[23])>$/i);
  if (!innerMatch) return false;
  const innerText = innerMatch[2].replace(/<[^>]*>/g, '').trim();
  if (!innerText) return false;
  return !output.includes(innerText);
}
