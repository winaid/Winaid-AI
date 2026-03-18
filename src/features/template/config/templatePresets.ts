/**
 * templatePresets — 템플릿 도메인 순수 상수/타입/프리셋
 *
 * TemplateGenerator.tsx에서 추출.
 * UI 카테고리 목록, 이미지 사이즈, 스케줄 그룹, 폼 기본값 등.
 */

// ── 타입 ──

export type DayMark = 'closed' | 'shortened' | 'vacation';
export type TemplateCategory = 'schedule' | 'event' | 'doctor' | 'notice' | 'greeting' | 'hiring' | 'caution' | 'pricing';
export type ScheduleLayout = 'full_calendar' | 'week' | 'highlight';

// ── 카테고리 목록 ──

export const CATEGORIES: { id: TemplateCategory; name: string; icon: string; desc: string }[] = [
  { id: 'schedule', name: '진료일정', icon: '📅', desc: '휴진/단축진료' },
  { id: 'event', name: '이벤트', icon: '🎉', desc: '시술 할인' },
  { id: 'doctor', name: '의사소개', icon: '🧑‍⚕️', desc: '전문의 부임' },
  { id: 'notice', name: '공지사항', icon: '📢', desc: '변경/이전' },
  { id: 'greeting', name: '명절 인사', icon: '🎊', desc: '설날/추석' },
  { id: 'hiring', name: '채용/공고', icon: '📋', desc: '직원 모집' },
  { id: 'caution', name: '주의사항', icon: '⚠️', desc: '시술/진료 후' },
  { id: 'pricing', name: '비급여 안내', icon: '💰', desc: '시술 가격표' },
];

// ── 이미지 사이즈 프리셋 ──

export const IMAGE_SIZES = [
  { id: 'square', label: '1080x1080', width: 1080, height: 1080, icon: '⬜', desc: '인스타 피드' },
  { id: 'landscape', label: '1920x1080', width: 1920, height: 1080, icon: '🖥️', desc: '가로형 배너' },
  { id: 'portrait34', label: '1080x1440', width: 1080, height: 1440, icon: '📋', desc: '3:4 세로' },
  { id: 'portrait', label: '1080x1920', width: 1080, height: 1920, icon: '📱', desc: '9:16 세로' },
  { id: 'auto', label: '자동', width: 0, height: 0, icon: '✨', desc: '콘텐츠 맞춤' },
] as const;

export type ImageSize = typeof IMAGE_SIZES[number]['id'];

// ── CSS 클래스 상수 ──

export const inputCls = 'w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white placeholder:text-slate-300';
export const textareaCls = `${inputCls} resize-none`;
export const labelCls = 'block text-xs font-bold text-slate-500 mb-1.5';

// ── 스케줄 그룹 ──

export const SCHEDULE_GROUPS: { label: string; desc: string; values: string[] }[] = [
  { label: '📋 실무 · 클린', desc: '실무형·격자·정보 중심', values: ['autumn', 'spring_kids', 'medical_notebook', 'autumn_spring_note'] },
  { label: '🎨 소프트 · SNS', desc: '부드러운·컬러풀·소셜 무드', values: ['cherry_blossom', 'autumn_holiday', 'lavender_sparkle'] },
  { label: '✨ 프리미엄 · 클래식', desc: '격조·고급·진중한 달력', values: ['korean_traditional', 'hanok_roof', 'winter', 'dark_green_clinic', 'dark_blue_modern'] },
];

// ── 명절 자동 기본값 ──

export const HOLIDAY_DEFAULTS: Record<string, { msg: string; closure: string; style?: string }> = {
  '설날': { msg: '새해 복 많이 받으세요\n건강하고 행복한 한 해 되시길 바랍니다', closure: '1/28(화) ~ 1/30(목)' },
  '추석': { msg: '풍성한 한가위 보내세요\n가족과 함께 행복한 추석 되세요', closure: '10/5(일) ~ 10/7(화)' },
  '새해': { msg: 'Happy New Year!\n새해에도 건강하시길 바랍니다', closure: '1/1(수)' },
  '어버이날': { msg: '감사합니다, 사랑합니다\n어버이날을 진심으로 축하드립니다', closure: '' },
  '크리스마스': { msg: 'Merry Christmas!\n따뜻하고 행복한 성탄절 보내세요', closure: '12/25(목)' },
};

// ── 주의사항 타입별 기본값 ──

export const CAUTION_DEFAULTS: Record<string, { title: string; items: string; emergency: string }> = {
  '시술 후': {
    title: '시술 후 주의사항',
    items: '시술 부위를 혀로 건드리지 마세요\n당일 음주 및 흡연은 피해주세요\n자극적이고 뜨거운 음식은 피해주세요\n딱딱한 음식은 3일간 피해주세요\n양치 시 시술 부위 주의해서 닦아주세요\n부기나 출혈은 2~3일 내 자연 소실됩니다',
    emergency: '이상 증상 시 연락: 02-1234-5678',
  },
  '진료 후': {
    title: '진료 후 안내사항',
    items: '마취가 풀릴 때까지 식사를 피해주세요\n마취 부위를 깨물지 않도록 주의해주세요\n처방된 약은 정해진 시간에 복용해주세요\n당일 과격한 운동은 피해주세요\n통증이 지속되면 내원해주세요',
    emergency: '이상 증상 시 연락: 02-1234-5678',
  },
  '수술 후': {
    title: '수술 후 주의사항',
    items: '거즈는 1~2시간 후 제거해주세요\n수술 당일 침을 뱉지 마세요\n냉찜질을 20분 간격으로 해주세요\n2~3일간 부드러운 음식만 드세요\n음주와 흡연은 최소 1주일 금지입니다\n격한 운동은 1주일간 삼가주세요\n처방약은 반드시 복용해주세요',
    emergency: '출혈·심한 통증 시 즉시 연락: 02-1234-5678',
  },
  '복약': {
    title: '복약 안내',
    items: '식후 30분에 복용해주세요\n정해진 용량을 지켜주세요\n항생제는 끝까지 복용하세요\n알레르기 반응 시 즉시 중단하세요\n두통·어지러움 시 안정을 취하세요',
    emergency: '부작용 발생 시 연락: 02-1234-5678',
  },
  '일반': {
    title: '주의사항 안내',
    items: '안내사항을 잘 읽어주세요\n궁금한 점은 문의해주세요',
    emergency: '',
  },
};

// ── 채용 페이지 타입 ──

export type HiringPageType = 'cover' | 'requirements' | 'benefits' | 'contact' | 'intro' | 'free';
export interface HiringPageData { type: HiringPageType; content: string; }

export const HIRING_PAGE_TYPES: { id: HiringPageType; label: string; placeholder: string }[] = [
  { id: 'cover', label: '표지', placeholder: '간호사 모집합니다\n함께 성장할 인재를 찾습니다' },
  { id: 'requirements', label: '자격요건', placeholder: '해당 면허 소지자\n경력 1년 이상 우대\n성실하고 책임감 있는 분' },
  { id: 'benefits', label: '복리후생', placeholder: '4대보험 가입\n중식 제공\n연차/월차 보장\n인센티브 지급' },
  { id: 'contact', label: '지원방법', placeholder: '이메일: recruit@hospital.com\n전화: 02-1234-5678\n마감: 채용시까지' },
  { id: 'intro', label: '병원소개', placeholder: '최신 장비와 쾌적한 환경\n서울 강남 위치\n직원 만족도 95%' },
  { id: 'free', label: '자유입력', placeholder: '원하는 내용을 자유롭게 입력하세요' },
];

export const defaultPageTypes: HiringPageType[] = ['cover', 'requirements', 'benefits', 'contact', 'intro'];

// ── 카테고리별 플레이스홀더 ──

export const CATEGORY_PLACEHOLDERS: Record<TemplateCategory, { icon: string; t: string; d: string }> = {
  schedule: { icon: '📅', t: '진료 일정 이미지', d: '정보를 입력하고 날짜를 클릭하세요' },
  event: { icon: '🎉', t: '이벤트 이미지', d: '이벤트 정보를 입력하세요' },
  doctor: { icon: '🧑‍⚕️', t: '의사 소개 이미지', d: '전문의 정보를 입력하세요' },
  notice: { icon: '📢', t: '공지사항 이미지', d: '공지 내용을 입력하세요' },
  greeting: { icon: '🎊', t: '명절 인사 이미지', d: '인사말을 입력하세요' },
  hiring: { icon: '📋', t: '채용/공고 이미지', d: '모집 정보를 입력하세요' },
  caution: { icon: '⚠️', t: '주의사항 이미지', d: '주의사항을 입력하세요' },
  pricing: { icon: '💰', t: '비급여 안내 이미지', d: '시술 항목과 가격을 입력하세요' },
};
