/**
 * E-E-A-T 점수 계산기 (GEO-7 — 14 기능 7번).
 *
 * Experience / Expertise / Authoritativeness / Trust — Google + AI 모델 (ChatGPT/
 * Gemini/Claude) 신뢰도 평가의 핵심 4축. 진단 결과 (HTML / internalLinks / schema /
 * 본문 textContent) 에서 medical-specific 신호를 detect 해서 4축 각 0~100 점수 →
 * 종합 점수 + 강점/약점 + 권고.
 *
 * 순수 함수. 네트워크 X / DB X / throw X.
 *
 * 데이터 가용성:
 *   - DiagnosticResponse 만 → 일부 axes 만 평가 가능 (textContent 미노출 → Experience/
 *     Expertise 의 텍스트 기반 신호는 미평가, 'awaiting_data' signal 로 표시)
 *   - 풀 CrawlResult (textContent 포함) → 모든 신호 평가 가능
 */

// ── 입력 ───────────────────────────────────────────────────────

export interface EEATCategoryItemMin {
  label: string;
  status: 'pass' | 'fail' | 'warning' | 'unknown';
  earnedPoints?: number;
  maxPoints?: number;
}

export interface EEATInput {
  /** 진단 URL — HTTPS 검출용 (필수). */
  url: string;
  /** 본문 텍스트 — doctor names / 학회 / 후기 등 텍스트 신호 (옵션). DiagnosticResponse 미노출. */
  textContent?: string;
  /** internalLinks — path 기반 신호 (case/privacy/doctor). */
  internalLinks?: Array<{ href: string; text: string }>;
  /** externalLinks — Authority (외부 미디어) / sameAs 보조. */
  externalLinks?: Array<{ href: string; text: string }>;
  /** 진단 categories 의 모든 items flatten (HTTPS / contact / FAQ / schema 신호 활용). */
  categoryItems?: EEATCategoryItemMin[];
  /** schema.org @type list — Authority 시그널. */
  schemaTypes?: string[];
  /** detectedServices — Expertise 다양성 신호. */
  detectedServices?: string[];
  /** images 의 alt text list — Experience (Before/After) 신호. */
  imageAlts?: string[];
}

// ── 출력 ───────────────────────────────────────────────────────

export type EEATAxis = 'experience' | 'expertise' | 'authority' | 'trust';

export interface EEATSignal {
  axis: EEATAxis;
  /** 짧은 라벨 — UI chip 표시. */
  label: string;
  /** 신호 점수 기여 (>0 강점, =0 약점). */
  points: number;
  /** 만점 가중치 (UI 비율 계산). */
  weight: number;
  /** 미평가 사유 (예: 'awaiting_data — textContent 미제공'). 정상 평가 시 omit. */
  awaitingData?: boolean;
}

export interface EEATAxisResult {
  /** 0~100. 합계 / maxScore * 100. */
  score: number;
  /** 평가 신호 list — 강점 + 약점 + awaiting 통합. */
  signals: EEATSignal[];
}

export interface EEATResult {
  /** 종합 점수 0~100 (4축 단순 평균). */
  overall: number;
  axes: {
    experience: EEATAxisResult;
    expertise: EEATAxisResult;
    authority: EEATAxisResult;
    trust: EEATAxisResult;
  };
  /** 강점 (points > 0) signal label list — UI chip. */
  strengths: string[];
  /** 약점 (points == 0 + awaitingData=false) — UI chip + 권고. */
  weaknesses: Array<{ label: string; recommendation: string }>;
}

// ── 헬퍼 ──────────────────────────────────────────────────────

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function findCategoryItem(items: EEATCategoryItemMin[] | undefined, label: string): EEATCategoryItemMin | undefined {
  if (!items) return undefined;
  return items.find(i => i.label === label);
}

function hasInternalPath(input: EEATInput, re: RegExp): boolean {
  if (!input.internalLinks) return false;
  return input.internalLinks.some(l => {
    try {
      const path = new URL(l.href).pathname.toLowerCase();
      return re.test(path);
    } catch {
      return false;
    }
  });
}

function sumAxis(signals: EEATSignal[]): EEATAxisResult {
  let earned = 0;
  let max = 0;
  for (const s of signals) {
    max += s.weight;
    if (!s.awaitingData) earned += Math.min(s.points, s.weight);
  }
  // awaiting 만 있는 경우 max=총weight 지만 earned=0 → score 0 노출. 호출자가 결정.
  const score = max > 0 ? clamp100((earned / max) * 100) : 0;
  return { score, signals };
}

// ── 신호 정규식 (medical-specific) ────────────────────────────

/** PR #235 의 DOCTOR_NAME_PATTERN 과 동일 — global flag 만 추가. */
const DOCTOR_NAME_PATTERN_G = /(원장|부원장|대표원장|진료원장)\s+(?!인사말|소개|안내|정보|진료|메시지|사진|동영상|약력|이력|경력|학력|자격|프로필|인터뷰|일정|휴진|출근|영상|말씀|글)[가-힣]{2,4}/g;

const BEFORE_AFTER_TEXT = /(전후|Before\s*\/\s*After|치료\s*전|치료\s*후)/gi;
const BEFORE_AFTER_ALT = /(사례|case|전후|before|after)/i;
const REVIEW_KEYWORDS = /(후기|환자\s*review|체험기|이용\s*후기)/g;
const COUNT_MARKERS = /(\d+\s*(?:건|회|례)\s*(?:시술|치료|수술|진료))/g;
const ACADEMIC_DEGREE = /(대학교\s*(?:졸업|수료|학위)|박사|석사)/g;
const CAREER_KEYWORDS = /(임상\s*\d+년|\d+년\s*경력|前\s*[가-힣]+병원|現\s*[가-힣]+병원)/g;
const SPECIALIST_TITLE = /(전문의|구강외과\s*전문의|치주과\s*전문의|보존과\s*전문의|교정과\s*전문의|소아치과\s*전문의|피부과\s*전문의|성형외과\s*전문의|정형외과\s*전문의|내과\s*전문의)/g;
const ACADEMY_KEYWORDS = /(학회|정회원|이사|학술|위원|conference|society)/gi;
const PAPER_MARKERS = /(논문|publication|DOI|학술지)/gi;
const EXTERNAL_MEDIA = /(KBS|MBC|YTN|SBS|JTBC|조선일보|동아일보|중앙일보|한겨레|매일경제|뉴스1|연합뉴스)/g;
const SIDE_EFFECT_KEYWORDS = /(부작용|주의사항|위험성|합병증|회복기간)/g;
const SOURCE_CITATION = /(출처\s*[:：]|참고\s*[:：]|Source\s*[:：]|Ref\.|\[\d+\])/g;
const PHONE_REGEX = /(?:tel:[\d\-+\s]{6,})|((?:T\.\s*|전화\s*[:：]?\s*)?\d{2,4}[-\s]\d{3,4}[-\s]\d{4})/g;
const DOCTOR_PAGE_PATH = /\/(doctor|physician|medical[-_]?staff|staff|의료진|진료진|닥터)(\/|$|\?)/i;
const CASE_PAGE_PATH = /\/(case|cases|사례|treatment[-_]?record|진료기록|전후)(\/|$|\?)/i;
const PRIVACY_PAGE_PATH = /\/(privacy|개인정보|policy)(\/|$|\?)/i;

// ── Axis 1: Experience (사례·후기·경험) ──────────────────────

export function scoreExperience(input: EEATInput): EEATAxisResult {
  const signals: EEATSignal[] = [];
  const text = input.textContent || '';
  const hasText = text.length > 0;

  // 1) 사례/case 페이지 path
  signals.push({
    axis: 'experience',
    label: '사례 dedicated 페이지',
    weight: 25,
    points: hasInternalPath(input, CASE_PAGE_PATH) ? 25 : 0,
  });

  // 2) 전후 사진 alt 매칭 (≥ 2 → 만점)
  const altHits = (input.imageAlts || []).filter(a => BEFORE_AFTER_ALT.test(a)).length;
  signals.push({
    axis: 'experience',
    label: '전후 사진 alt 태그',
    weight: 25,
    points: altHits >= 2 ? 25 : altHits === 1 ? 12 : 0,
  });

  // 3) 본문 전후/Before·After 마커
  signals.push({
    axis: 'experience',
    label: '본문 전후/Before·After 마커',
    weight: 20,
    points: hasText ? Math.min(countMatches(text, BEFORE_AFTER_TEXT) * 5, 20) : 0,
    awaitingData: !hasText,
  });

  // 4) 후기 키워드 (≥ 5 → 만점)
  signals.push({
    axis: 'experience',
    label: '환자 후기 키워드',
    weight: 15,
    points: hasText ? Math.min(countMatches(text, REVIEW_KEYWORDS) * 3, 15) : 0,
    awaitingData: !hasText,
  });

  // 5) 시술 건수 명시 (예: "1,000건 시술")
  signals.push({
    axis: 'experience',
    label: '시술 횟수 명시',
    weight: 15,
    points: hasText ? Math.min(countMatches(text, COUNT_MARKERS) * 8, 15) : 0,
    awaitingData: !hasText,
  });

  return sumAxis(signals);
}

// ── Axis 2: Expertise (전문성) ───────────────────────────────

export function scoreExpertise(input: EEATInput): EEATAxisResult {
  const signals: EEATSignal[] = [];
  const text = input.textContent || '';
  const hasText = text.length > 0;

  // 1) 의료진 페이지 path
  const docPage = findCategoryItem(input.categoryItems, '의료진 소개 페이지');
  signals.push({
    axis: 'expertise',
    label: '의료진 dedicated 페이지',
    weight: 25,
    points: hasInternalPath(input, DOCTOR_PAGE_PATH) || docPage?.status === 'pass' ? 25 : 0,
  });

  // 2) 본문 의료진 이름 패턴 (PR #235 재활용)
  const nameHits = hasText ? countMatches(text, DOCTOR_NAME_PATTERN_G) : 0;
  signals.push({
    axis: 'expertise',
    label: '의료진 이름 명시 (3명 이상)',
    weight: 25,
    points: nameHits >= 3 ? 25 : nameHits === 2 ? 15 : nameHits === 1 ? 8 : 0,
    awaitingData: !hasText,
  });

  // 3) 학력 키워드
  signals.push({
    axis: 'expertise',
    label: '학력 명시 (대학교/박사 등)',
    weight: 15,
    points: hasText ? Math.min(countMatches(text, ACADEMIC_DEGREE) * 5, 15) : 0,
    awaitingData: !hasText,
  });

  // 4) 경력 키워드
  signals.push({
    axis: 'expertise',
    label: '경력 명시 (임상연도·前/現 병원)',
    weight: 15,
    points: hasText ? Math.min(countMatches(text, CAREER_KEYWORDS) * 5, 15) : 0,
    awaitingData: !hasText,
  });

  // 5) 전문의 자격 명시
  signals.push({
    axis: 'expertise',
    label: '전문의 자격 표기',
    weight: 10,
    points: hasText ? Math.min(countMatches(text, SPECIALIST_TITLE) * 5, 10) : 0,
    awaitingData: !hasText,
  });

  // 6) 진료과목 다양성 (detectedServices ≥ 3)
  const svcCount = (input.detectedServices || []).length;
  signals.push({
    axis: 'expertise',
    label: '진료과목 다양성',
    weight: 10,
    points: svcCount >= 3 ? 10 : svcCount === 2 ? 6 : svcCount === 1 ? 3 : 0,
  });

  return sumAxis(signals);
}

// ── Axis 3: Authoritativeness (권위) ─────────────────────────

export function scoreAuthority(input: EEATInput): EEATAxisResult {
  const signals: EEATSignal[] = [];
  const text = input.textContent || '';
  const hasText = text.length > 0;

  // 1) 학회 인용
  signals.push({
    axis: 'authority',
    label: '학회/정회원 명시',
    weight: 20,
    points: hasText ? Math.min(countMatches(text, ACADEMY_KEYWORDS) * 7, 20) : 0,
    awaitingData: !hasText,
  });

  // 2) 논문/publication
  signals.push({
    axis: 'authority',
    label: '논문/publication 마커',
    weight: 15,
    points: hasText ? Math.min(countMatches(text, PAPER_MARKERS) * 7, 15) : 0,
    awaitingData: !hasText,
  });

  // 3) 외부 미디어 노출
  let mediaHits = hasText ? countMatches(text, EXTERNAL_MEDIA) : 0;
  // externalLinks 의 hostname 으로도 보강
  if (input.externalLinks) {
    for (const l of input.externalLinks) {
      try {
        const host = new URL(l.href).hostname.toLowerCase();
        if (/news\.naver|news\.daum|chosun|donga|joongang|hani|mk\.co\.kr|fnnews|yonhapnews|kbs|mbc|sbs|jtbc|ytn/.test(host)) {
          mediaHits++;
        }
      } catch { /* skip */ }
    }
  }
  signals.push({
    axis: 'authority',
    label: '외부 미디어 노출',
    weight: 20,
    points: mediaHits >= 2 ? 20 : mediaHits === 1 ? 10 : 0,
  });

  // 4) schema.org 구조화 데이터 (Organization / MedicalOrganization / Person 등)
  const types = (input.schemaTypes || []).map(t => t.toLowerCase());
  const hasMedSchema = types.some(t => /medical|dentist|physician|localbusiness|organization/.test(t));
  signals.push({
    axis: 'authority',
    label: '의료기관 schema.org JSON-LD',
    weight: 25,
    points: hasMedSchema ? 25 : 0,
  });

  // 5) Organization sameAs (PR #235 외부 채널 검출 활용)
  const sameAsItem = findCategoryItem(input.categoryItems, '구조화 데이터 sameAs');
  signals.push({
    axis: 'authority',
    label: 'Organization sameAs (네이버·구글·인스타 등)',
    weight: 20,
    points: sameAsItem?.status === 'pass' ? 20 : 0,
  });

  return sumAxis(signals);
}

// ── Axis 4: Trust (신뢰) ─────────────────────────────────────

export function scoreTrust(input: EEATInput): EEATAxisResult {
  const signals: EEATSignal[] = [];
  const text = input.textContent || '';
  const hasText = text.length > 0;

  // 1) HTTPS — url 시작 + categoryItems 의 'HTTPS 적용' status 이중 확인
  const httpsItem = findCategoryItem(input.categoryItems, 'HTTPS 적용');
  const httpsFromUrl = /^https:\/\//i.test(input.url);
  const httpsPass = httpsItem ? httpsItem.status === 'pass' : httpsFromUrl;
  signals.push({
    axis: 'trust',
    label: 'HTTPS 적용',
    weight: 20,
    points: httpsPass ? 20 : 0,
  });

  // 2) 부작용/주의사항 명시
  signals.push({
    axis: 'trust',
    label: '부작용/주의사항 명시',
    weight: 20,
    points: hasText ? Math.min(countMatches(text, SIDE_EFFECT_KEYWORDS) * 7, 20) : 0,
    awaitingData: !hasText,
  });

  // 3) 출처/citation 표기
  signals.push({
    axis: 'trust',
    label: '출처/인용 표기',
    weight: 15,
    points: hasText ? Math.min(countMatches(text, SOURCE_CITATION) * 7, 15) : 0,
    awaitingData: !hasText,
  });

  // 4) 연락처 (tel link / 전화번호 regex / category item)
  const contactItem = findCategoryItem(input.categoryItems, '연락처 노출');
  const hasTelLink = (input.internalLinks || []).some(l => /^tel:/i.test(l.href));
  const phoneInText = hasText ? countMatches(text, PHONE_REGEX) >= 1 : false;
  const contactPass = contactItem?.status === 'pass' || hasTelLink || phoneInText;
  signals.push({
    axis: 'trust',
    label: '연락처/전화번호 노출',
    weight: 15,
    points: contactPass ? 15 : 0,
  });

  // 5) 개인정보 처리방침 link
  signals.push({
    axis: 'trust',
    label: '개인정보 처리방침 페이지',
    weight: 15,
    points: hasInternalPath(input, PRIVACY_PAGE_PATH) ? 15 : 0,
  });

  // 6) 의료광고법 준수 (categoryItems 에서 'medical_law_compliance' label 매칭)
  const lawItem = findCategoryItem(input.categoryItems, '의료광고법 준수');
  signals.push({
    axis: 'trust',
    label: '의료광고법 준수 (위반 표현 미검출)',
    weight: 15,
    points: lawItem?.status === 'pass' ? 15 : lawItem?.status === 'warning' ? 7 : 0,
  });

  return sumAxis(signals);
}

// ── 종합 ─────────────────────────────────────────────────────

const RECOMMENDATION_MAP: Record<string, string> = {
  '사례 dedicated 페이지': '치료 사례 페이지 (/case 또는 /사례) 신설 — 전후 사진 + 환자 동의 + 시술 요약.',
  '전후 사진 alt 태그': '전후 사진의 alt 태그에 "사례" 또는 "before/after" 명시.',
  '본문 전후/Before·After 마커': '본문에 "치료 전/후" 표기를 사례 설명과 함께 추가.',
  '환자 후기 키워드': '후기 페이지 + 동의 받은 환자 review 게시.',
  '시술 횟수 명시': '"수년간 OOO건 시술" 같은 누적 실적 명시.',
  '의료진 dedicated 페이지': '의료진 소개 페이지 (/doctor 또는 /의료진) 신설 + 이름·사진·약력.',
  '의료진 이름 명시 (3명 이상)': '본문에 "원장 OOO", "부원장 OOO" 등 의료진 이름 명시.',
  '학력 명시 (대학교/박사 등)': '의료진 약력에 대학교 / 박사·석사 학위 명시.',
  '경력 명시 (임상연도·前/現 병원)': '"임상 N년", "前 OOO병원" 같은 경력 timeline 명시.',
  '전문의 자격 표기': '"OOO과 전문의" 자격 명시.',
  '진료과목 다양성': '진료과목 페이지 3개 이상 추가 + 메뉴에 노출.',
  '학회/정회원 명시': '"OOO학회 정회원" 같은 학회 활동 명시.',
  '논문/publication 마커': '의료진 약력에 논문 list / DOI 링크 추가.',
  '외부 미디어 노출': '언론 인터뷰 / 칼럼 link + 본문 출처 표기.',
  '의료기관 schema.org JSON-LD': 'MedicalOrganization / Dentist schema 마크업 추가 (GEO-6 도구 활용).',
  'Organization sameAs (네이버·구글·인스타 등)': 'Organization JSON-LD 에 sameAs 배열로 네이버/구글/인스타 URL 포함.',
  'HTTPS 적용': '전체 페이지 HTTPS 리다이렉트 + SSL 인증서 발급.',
  '부작용/주의사항 명시': '각 시술 페이지에 "부작용·주의사항" 섹션 추가 (의료법 권고).',
  '출처/인용 표기': '본문 통계/주장에 "출처:" 또는 [1] 식 citation 표기.',
  '연락처/전화번호 노출': '헤더/푸터에 tel: 링크 + "T. 02-OOO-OOOO" 텍스트 동시 노출.',
  '개인정보 처리방침 페이지': '/privacy 또는 /개인정보 페이지 신설 + footer link.',
  '의료광고법 준수 (위반 표현 미검출)': '"최고", "100%", "유일한" 같은 절대 표현 → "주력 시술", "환자 만족도 높은" 으로 교체.',
};

/**
 * 4축 평가 + 종합 점수 + 강점/약점 추출.
 *
 * overall = 4축 단순 평균 (awaiting 신호 비중 따라 점수 낮을 수 있음 — 그대로 의미 있음).
 */
export function scoreEEAT(input: EEATInput): EEATResult {
  const experience = scoreExperience(input);
  const expertise = scoreExpertise(input);
  const authority = scoreAuthority(input);
  const trust = scoreTrust(input);

  const overall = clamp100((experience.score + expertise.score + authority.score + trust.score) / 4);

  const allSignals = [
    ...experience.signals,
    ...expertise.signals,
    ...authority.signals,
    ...trust.signals,
  ];
  const strengths = allSignals
    .filter(s => !s.awaitingData && s.points > 0)
    .sort((a, b) => (b.points / b.weight) - (a.points / a.weight))
    .map(s => s.label);

  const weaknesses = allSignals
    .filter(s => !s.awaitingData && s.points === 0)
    .map(s => ({ label: s.label, recommendation: RECOMMENDATION_MAP[s.label] || '관련 정보를 보강하세요.' }));

  return {
    overall,
    axes: { experience, expertise, authority, trust },
    strengths,
    weaknesses,
  };
}

