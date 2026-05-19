/**
 * schema.org JSON-LD 자동 생성기 (GEO-6 — 14 기능 6번)
 *
 * 진단 결과 (hospital_name / url / detectedServices / detectedRegion 등) →
 * MedicalOrganization / Physician / FAQPage / LocalBusiness JSON-LD 변환.
 *
 * 운영자가 결과 `<script type="application/ld+json">` 4개를 홈페이지 `<head>` 에
 * 그대로 paste → AI 모델 (ChatGPT, Gemini, Claude) 이 구조화 데이터 인식 →
 * 인용률 직접 ↑.
 *
 * 설계:
 * - 순수 함수 (네트워크/DB X). 어떤 입력도 throw 안 함.
 * - 필수 필드 (name, url) 누락 시 빈 schema 반환 (모든 schema 가 undefined 가능).
 * - 옵션 필드 누락 → omit (schema.org 가 부분 schema 허용).
 * - 한국어 우선, 영어 보조 (운영자 옵션). lang 기본 'ko'.
 * - 출력 JSON 들여쓰기 2 spaces (UI 가독성).
 */

// ── 입력 타입 ─────────────────────────────────────────────────

export interface SchemaBuilderInput {
  /** 병원명 (필수). */
  name: string;
  /** 병원 공식 URL (필수, http/https). */
  url: string;
  /** 진료과목 list — detectedServices 매핑. */
  specialties?: string[];
  /** 의료진 이름 list — DOCTOR_NAME_PATTERN 추출 결과 또는 운영자 입력. */
  doctors?: string[];
  /** FAQ list — { question, answer } 쌍. */
  faqs?: Array<{ question: string; answer: string }>;
  /** 주소 string (예: "서울 강남구 테헤란로 1"). 옵션. */
  address?: string;
  /** 지역 (예: "강남구") — detectedRegion 매핑. address 없을 때 addressRegion 후보. */
  region?: string;
  /** 전화번호 (예: "02-1234-5678"). 옵션. */
  telephone?: string;
  /** 영업시간 (예: "Mo-Fr 09:00-18:00"). schema.org openingHours 형식. */
  openingHours?: string;
  /** 가격대 (예: "₩₩", "₩₩₩"). 옵션. */
  priceRange?: string;
  /** 로고 URL. 옵션. */
  logoUrl?: string;
  /** 사업장 sameAs URL list (네이버 플레이스, 인스타 등). 옵션. */
  sameAs?: string[];
  /** 언어 — 기본 'ko'. */
  lang?: string;
}

// ── 출력 타입 ─────────────────────────────────────────────────

export type SchemaObject = Record<string, unknown>;

export interface BuildAllSchemasResult {
  medicalOrganization?: SchemaObject;
  physicians: SchemaObject[];
  faqPage?: SchemaObject;
  localBusiness?: SchemaObject;
  /** 전체 schema 가 들어간 4개 `<script type="application/ld+json">` 태그 join string. */
  combinedScripts: string;
  /** 입력 누락으로 생성되지 못한 옵션 필드 list — UI 안내용. */
  missingFields: string[];
}

// ── 헬퍼 ──────────────────────────────────────────────────────

const SAFE_URL_RE = /^https?:\/\//i;

function isSafeUrl(u: string | undefined): u is string {
  return typeof u === 'string' && u.length > 0 && SAFE_URL_RE.test(u);
}

function isNonEmptyString(s: string | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function trim(s: string): string {
  return s.trim();
}

/** schema.org JSON-LD 를 indent=2 로 직렬화. */
export function serializeSchema(schema: SchemaObject): string {
  return JSON.stringify(schema, null, 2);
}

/** 1개 schema 를 `<script type="application/ld+json">` 으로 감싸기. */
export function wrapAsScript(schema: SchemaObject): string {
  return `<script type="application/ld+json">\n${serializeSchema(schema)}\n</script>`;
}

// ── 개별 builder ───────────────────────────────────────────────

/**
 * MedicalOrganization schema — 병원 전체 정보.
 * https://schema.org/MedicalOrganization
 */
export function buildMedicalOrganizationSchema(input: SchemaBuilderInput): SchemaObject | undefined {
  if (!isNonEmptyString(input.name) || !isSafeUrl(input.url)) return undefined;
  const schema: SchemaObject = {
    '@context': 'https://schema.org',
    '@type': 'MedicalOrganization',
    name: trim(input.name),
    url: input.url,
  };
  if (input.specialties && input.specialties.length > 0) {
    schema.medicalSpecialty = input.specialties.filter(isNonEmptyString).map(trim);
  }
  if (isSafeUrl(input.logoUrl)) {
    schema.logo = input.logoUrl;
  }
  if (isNonEmptyString(input.telephone)) {
    schema.telephone = trim(input.telephone);
  }
  if (isNonEmptyString(input.address) || isNonEmptyString(input.region)) {
    const postalAddress: SchemaObject = { '@type': 'PostalAddress', addressCountry: 'KR' };
    if (isNonEmptyString(input.address)) postalAddress.streetAddress = trim(input.address);
    if (isNonEmptyString(input.region)) postalAddress.addressRegion = trim(input.region);
    schema.address = postalAddress;
  }
  if (input.sameAs && input.sameAs.length > 0) {
    const valid = input.sameAs.filter(isSafeUrl);
    if (valid.length > 0) schema.sameAs = valid;
  }
  return schema;
}

/**
 * Physician schema — 의료진 1명. doctors[] 안의 각 이름마다 1 schema.
 * https://schema.org/Physician
 */
export function buildPhysicianSchema(doctorName: string, parent: SchemaBuilderInput): SchemaObject | undefined {
  if (!isNonEmptyString(doctorName)) return undefined;
  const schema: SchemaObject = {
    '@context': 'https://schema.org',
    '@type': 'Physician',
    name: trim(doctorName),
  };
  if (parent.specialties && parent.specialties.length > 0) {
    schema.medicalSpecialty = parent.specialties.filter(isNonEmptyString).map(trim);
  }
  if (isSafeUrl(parent.url) && isNonEmptyString(parent.name)) {
    schema.worksFor = {
      '@type': 'MedicalOrganization',
      name: trim(parent.name),
      url: parent.url,
    };
  }
  return schema;
}

/**
 * FAQPage schema — Q&A list.
 * https://schema.org/FAQPage
 *
 * faqs 빈 배열 → undefined 반환 (FAQPage 는 mainEntity 1개 이상 필수).
 */
export function buildFAQPageSchema(faqs: Array<{ question: string; answer: string }> | undefined): SchemaObject | undefined {
  if (!faqs || faqs.length === 0) return undefined;
  const items = faqs
    .filter(f => isNonEmptyString(f.question) && isNonEmptyString(f.answer))
    .map(f => ({
      '@type': 'Question',
      name: trim(f.question),
      acceptedAnswer: {
        '@type': 'Answer',
        text: trim(f.answer),
      },
    }));
  if (items.length === 0) return undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items,
  };
}

/**
 * LocalBusiness schema — 사업장 정보 (지도/검색 노출).
 * https://schema.org/LocalBusiness
 *
 * 주소 / 영업시간 / 전화 / 위치 정보 부족 시도 name + url 만으로 생성 가능.
 */
export function buildLocalBusinessSchema(input: SchemaBuilderInput): SchemaObject | undefined {
  if (!isNonEmptyString(input.name) || !isSafeUrl(input.url)) return undefined;
  const schema: SchemaObject = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: trim(input.name),
    url: input.url,
  };
  if (isNonEmptyString(input.telephone)) {
    schema.telephone = trim(input.telephone);
  }
  if (isNonEmptyString(input.priceRange)) {
    schema.priceRange = trim(input.priceRange);
  }
  if (isNonEmptyString(input.openingHours)) {
    schema.openingHours = trim(input.openingHours);
  }
  if (isNonEmptyString(input.address) || isNonEmptyString(input.region)) {
    const postalAddress: SchemaObject = { '@type': 'PostalAddress', addressCountry: 'KR' };
    if (isNonEmptyString(input.address)) postalAddress.streetAddress = trim(input.address);
    if (isNonEmptyString(input.region)) postalAddress.addressRegion = trim(input.region);
    schema.address = postalAddress;
  }
  if (input.sameAs && input.sameAs.length > 0) {
    const valid = input.sameAs.filter(isSafeUrl);
    if (valid.length > 0) schema.sameAs = valid;
  }
  return schema;
}

// ── 종합 builder ──────────────────────────────────────────────

/**
 * 4 schema 일괄 생성 + 누락 필드 안내 + combined script string.
 *
 * 사용처: 양 앱 SchemaOrgSection 컴포넌트.
 */
export function buildAllSchemas(input: SchemaBuilderInput): BuildAllSchemasResult {
  const missingFields: string[] = [];

  // 필수 필드 누락 → 전부 undefined + 안내
  if (!isNonEmptyString(input.name)) missingFields.push('name (병원명)');
  if (!isSafeUrl(input.url)) missingFields.push('url (홈페이지 주소)');

  const medicalOrganization = buildMedicalOrganizationSchema(input);
  const localBusiness = buildLocalBusinessSchema(input);
  const faqPage = buildFAQPageSchema(input.faqs);

  const physicians: SchemaObject[] = [];
  for (const name of input.doctors || []) {
    const p = buildPhysicianSchema(name, input);
    if (p) physicians.push(p);
  }

  // 옵션 필드 누락 — 운영자 안내용
  if (!input.specialties || input.specialties.length === 0) missingFields.push('specialties (진료과목)');
  if (!input.doctors || input.doctors.length === 0) missingFields.push('doctors (의료진 이름)');
  if (!input.faqs || input.faqs.length === 0) missingFields.push('faqs (FAQ — 마크업 누락 시 FAQPage schema 생성 안 됨)');
  if (!isNonEmptyString(input.telephone)) missingFields.push('telephone (전화번호)');
  if (!isNonEmptyString(input.address) && !isNonEmptyString(input.region)) missingFields.push('address / region (주소)');
  if (!isNonEmptyString(input.openingHours)) missingFields.push('openingHours (영업시간, schema.org 형식 예: "Mo-Fr 09:00-18:00")');

  // combined script — 생성된 schema 만 join
  const parts: string[] = [];
  if (medicalOrganization) parts.push(wrapAsScript(medicalOrganization));
  for (const p of physicians) parts.push(wrapAsScript(p));
  if (faqPage) parts.push(wrapAsScript(faqPage));
  if (localBusiness) parts.push(wrapAsScript(localBusiness));
  const combinedScripts = parts.join('\n\n');

  return {
    medicalOrganization,
    physicians,
    faqPage,
    localBusiness,
    combinedScripts,
    missingFields,
  };
}
