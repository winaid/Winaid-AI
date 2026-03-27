/**
 * Image Generator — "/image" 경로
 *
 * 핵심 플로우: 프롬프트 입력 → 비율 선택 → 로고/병원정보 → 이미지 생성 → 결과/다운로드
 */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { savePost } from '../../../lib/postStorage';
import { supabase } from '../../../lib/supabase';
import { PromptChat } from '../../../components/PromptChat';
import type { CategoryTemplate } from '../../../lib/categoryTemplateTypes';
import { TemplateSVGPreview } from '../../../components/TemplatePreviews';
import { CalendarThemePreview } from '../../../components/CalendarPreviews';

type AspectRatio = '1:1' | '16:9' | '3:4' | '9:16' | 'auto';
type DayMark = 'closed' | 'shortened' | 'vacation';
type ScheduleLayout = 'full_calendar' | 'week' | 'highlight';

const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: string; desc: string }[] = [
  { value: '1:1', label: '1080x1080', icon: '⬜', desc: '인스타 피드' },
  { value: '16:9', label: '1920x1080', icon: '🖥️', desc: '가로형 배너' },
  { value: '3:4', label: '1080x1440', icon: '📋', desc: '3:4 세로' },
  { value: '9:16', label: '1080x1920', icon: '📱', desc: '9:16 세로' },
  { value: 'auto', label: '자동', icon: '✨', desc: '콘텐츠 맞춤' },
];

const LOGO_STORAGE_KEY = 'hospital-logo-dataurl';
const HOSPITAL_NAME_KEY = 'hospital-logo-name';

const TEMPLATE_CATEGORIES = [
  { id: 'schedule', name: '진료일정', icon: '📅', desc: '휴진/단축진료', placeholder: '4월 휴진 안내 포스터, 달력 형태, 휴진일 빨간색 표시, 깔끔한 의료 디자인' },
  { id: 'event', name: '이벤트', icon: '🎉', desc: '시술 할인', placeholder: '임플란트 할인 이벤트 포스터, 가격 강조, 기간 표시, 밝고 신뢰감 있는 디자인' },
  { id: 'doctor', name: '의사소개', icon: '🧑‍⚕️', desc: '전문의 부임', placeholder: '새로 부임한 전문의 소개 카드, 이름/전문분야/경력, 전문적이고 신뢰감 있는 디자인' },
  { id: 'notice', name: '공지사항', icon: '📢', desc: '변경/이전', placeholder: '병원 이전 안내 공지, 새 주소와 약도, 깔끔한 정보 전달형 디자인' },
  { id: 'greeting', name: '명절 인사', icon: '🎊', desc: '설날/추석', placeholder: '설날 인사 포스터, 따뜻한 한국적 분위기, 병원명과 휴진 안내 포함' },
  { id: 'hiring', name: '채용/공고', icon: '📋', desc: '직원 모집', placeholder: '치과위생사 모집 공고, 지원자격/근무조건, 깔끔하고 전문적인 디자인' },
  { id: 'caution', name: '주의사항', icon: '⚠️', desc: '시술/진료 후', placeholder: '임플란트 시술 후 주의사항 안내, 항목별 아이콘, 읽기 쉬운 리스트 형태' },
  { id: 'pricing', name: '비급여 안내', icon: '💰', desc: '시술 가격표', placeholder: '비급여 진료비 안내표, 시술명/가격 표 형태, 깔끔하고 투명한 디자인' },
] as const;

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all placeholder:text-slate-300 placeholder:font-normal';

export default function ImagePage() {
  const [mode, setMode] = useState<'template' | 'free'>('template');
  const [prompt, setPrompt] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>('schedule');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generatingStep, setGeneratingStep] = useState(0);
  const [showRegenMenu, setShowRegenMenu] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState('');
  const [showRegenPromptInput, setShowRegenPromptInput] = useState(false);

  // 카테고리 템플릿 데이터 — 동적 import (204KB 번들 최적화)
  const [catTemplateData, setCatTemplateData] = useState<Record<string, CategoryTemplate[]> | null>(null);
  useEffect(() => {
    import('../../../lib/categoryTemplates').then(m => setCatTemplateData(m.CATEGORY_TEMPLATES));
  }, []);

  // 로고 관련
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [hospitalName, setHospitalName] = useState('');
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [logoPosition, setLogoPosition] = useState<'top' | 'bottom'>('bottom');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const resultAreaRef = useRef<HTMLDivElement>(null);

  // 병원 기본 정보 / 브랜드 컬러
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicHours, setClinicHours] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [brandColor, setBrandColor] = useState('');
  const [brandAccent, setBrandAccent] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── schedule 전용 상태 (OLD parity) ──
  const now = new Date();
  const [schYear, setSchYear] = useState(now.getFullYear());
  const [schMonth, setSchMonth] = useState(now.getMonth() + 1);
  const [schTitle, setSchTitle] = useState('');
  const [schLayout, setSchLayout] = useState<ScheduleLayout>('full_calendar');
  const [schNotices, setSchNotices] = useState('');
  const [dayMarks, setDayMarks] = useState<Map<number, DayMark>>(new Map());
  const [shortenedHours, setShortenedHours] = useState<Map<number, string>>(new Map());
  const [vacationReasons, setVacationReasons] = useState<Map<number, string>>(new Map());
  const [markMode, setMarkMode] = useState<DayMark>('closed');
  const [calendarTheme, setCalendarTheme] = useState<string>('autumn');

  // ── 달력 테마 옵션 (OLD parity: CALENDAR_THEME_OPTIONS 12종) ──
  const CALENDAR_THEME_OPTIONS: { value: string; label: string; emoji: string; desc: string; group: string; groupColor: string }[] = [
    { value: 'autumn', label: '실무 스프레드시트', emoji: '📊', desc: 'zebra 격자 + 슬레이트 헤더', group: '실무', groupColor: '#334155' },
    { value: 'korean_traditional', label: '한방 전통', emoji: '🏛️', desc: '기와 문양 + 한지 프레임', group: '전통', groupColor: '#92400e' },
    { value: 'winter', label: '딥블루 프로스트', emoji: '❄️', desc: '딥블루 그라데이션 + 프로스트', group: '프리미엄', groupColor: '#0c4a6e' },
    { value: 'cherry_blossom', label: '블러시 로즈', emoji: '🌸', desc: '로즈 헤더 + 파스텔 핑크', group: '소프트', groupColor: '#be7e8a' },
    { value: 'spring_kids', label: '차콜 프레임', emoji: '🏥', desc: '차콜 헤더/풋터 + 풀레드 휴진', group: '실무', groupColor: '#292524' },
    { value: 'medical_notebook', label: '모던 미니멀', emoji: '📐', desc: '2단 라인 + 모노톤 도트', group: '실무', groupColor: '#1e293b' },
    { value: 'autumn_spring_note', label: '야간진료', emoji: '🌙', desc: '다크 배너 + 앰버 컬럼 강조', group: '실무', groupColor: '#d97706' },
    { value: 'autumn_holiday', label: 'SNS 볼드', emoji: '📱', desc: '코랄 히어로 + 라운드 뱃지', group: '소프트', groupColor: '#f97316' },
    { value: 'hanok_roof', label: '골드 클래식', emoji: '✨', desc: '골드 밴드 + 세리프 + 점선', group: '프리미엄', groupColor: '#78350f' },
    { value: 'dark_green_clinic', label: '프리미엄 그린', emoji: '🌲', desc: '다크그린 헤더 + 에메랄드', group: '프리미엄', groupColor: '#14532d' },
    { value: 'dark_blue_modern', label: '네이비 모던', emoji: '🔷', desc: '네이비 헤더 + 블루 마커', group: '프리미엄', groupColor: '#1e3a5f' },
    { value: 'lavender_sparkle', label: '라벤더 소프트', emoji: '💜', desc: '라벤더 헤더 + 라운드 셀', group: '소프트', groupColor: '#7c3aed' },
  ];

  const SCHEDULE_GROUPS: { label: string; desc: string; values: string[] }[] = [
    { label: '📋 실무 · 클린', desc: '실무형·격자·정보 중심', values: ['autumn', 'spring_kids', 'medical_notebook', 'autumn_spring_note'] },
    { label: '🎨 소프트 · SNS', desc: '부드러운·컬러풀·소셜', values: ['cherry_blossom', 'autumn_holiday', 'lavender_sparkle'] },
    { label: '✨ 프리미엄 · 클래식', desc: '격조·고급·진중한 달력', values: ['korean_traditional', 'hanok_roof', 'winter', 'dark_green_clinic', 'dark_blue_modern'] },
  ];

  const [customMessage, setCustomMessage] = useState('');
  const [extraPrompt, setExtraPrompt] = useState('');

  // ── event 전용 상태 (OLD parity) ──
  const [evTitle, setEvTitle] = useState('');
  const [evSubtitle, setEvSubtitle] = useState('');
  const [evPriceRaw, setEvPriceRaw] = useState('');
  const [evOrigPriceRaw, setEvOrigPriceRaw] = useState('');
  const [evDiscount, setEvDiscount] = useState('');
  const [evPeriod, setEvPeriod] = useState('');
  const [evDesc, setEvDesc] = useState('');

  // ── doctor 전용 상태 (OLD parity) ──
  const [docName, setDocName] = useState('');
  const [docSpecialty, setDocSpecialty] = useState('');
  const [docCareer, setDocCareer] = useState('');
  const [docGreeting, setDocGreeting] = useState('');
  const [docPhotoBase64, setDocPhotoBase64] = useState<string | null>(null);
  const docPhotoRef = useRef<HTMLInputElement>(null);

  // ── notice 전용 상태 (OLD parity) ──
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeDate, setNoticeDate] = useState('');

  // ── greeting 전용 상태 (OLD parity) ──
  const [greetHoliday, setGreetHoliday] = useState('설날');
  const [greetMsg, setGreetMsg] = useState('');
  const [greetClosure, setGreetClosure] = useState('');

  const HOLIDAY_DEFAULTS: Record<string, { msg: string; closure: string }> = {
    '설날': { msg: '새해 복 많이 받으세요\n건강하고 행복한 한 해 되시길 바랍니다', closure: '1/28(화) ~ 1/30(목)' },
    '추석': { msg: '풍성한 한가위 보내세요\n가족과 함께 행복한 추석 되세요', closure: '10/5(일) ~ 10/7(화)' },
    '새해': { msg: 'Happy New Year!\n새해에도 건강하시길 바랍니다', closure: '1/1(수)' },
    '어버이날': { msg: '감사합니다, 사랑합니다\n어버이날을 진심으로 축하드립니다', closure: '' },
    '크리스마스': { msg: 'Merry Christmas!\n따뜻하고 행복한 성탄절 보내세요', closure: '12/25(목)' },
  };

  // ── hiring 전용 상태 (OLD parity) ──
  type HiringPageType = 'cover' | 'requirements' | 'benefits' | 'contact' | 'intro' | 'free';
  interface HiringPageData { type: HiringPageType; content: string; }

  const HIRING_PAGE_TYPES: { id: HiringPageType; label: string; placeholder: string }[] = [
    { id: 'cover', label: '표지', placeholder: '간호사 모집합니다\n함께 성장할 인재를 찾습니다' },
    { id: 'requirements', label: '자격요건', placeholder: '해당 면허 소지자\n경력 1년 이상 우대\n성실하고 책임감 있는 분' },
    { id: 'benefits', label: '복리후생', placeholder: '4대보험 가입\n중식 제공\n연차/월차 보장\n인센티브 지급' },
    { id: 'contact', label: '지원방법', placeholder: '이메일: recruit@hospital.com\n전화: 02-1234-5678\n마감: 채용시까지' },
    { id: 'intro', label: '병원소개', placeholder: '최신 장비와 쾌적한 환경\n서울 강남 위치\n직원 만족도 95%' },
    { id: 'free', label: '자유입력', placeholder: '원하는 내용을 자유롭게 입력하세요' },
  ];
  const defaultPageTypes: HiringPageType[] = ['cover', 'requirements', 'benefits', 'contact', 'intro'];

  const [hiringPageCount, setHiringPageCount] = useState(1);
  const [hiringPageData, setHiringPageData] = useState<HiringPageData[]>([{ type: 'cover', content: '' }]);
  const [hiringPhotos, setHiringPhotos] = useState<string[]>([]);

  const updatePageType = (index: number, type: HiringPageType) => {
    const data = [...hiringPageData]; data[index] = { ...data[index], type }; setHiringPageData(data);
  };
  const updatePageContent = (index: number, content: string) => {
    const data = [...hiringPageData]; data[index] = { ...data[index], content }; setHiringPageData(data);
  };
  const handleHiringPhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => setHiringPhotos(prev => [...prev, reader.result as string].slice(0, 5));
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  // ── caution 전용 상태 (OLD parity) ──
  const [cautionType, setCautionType] = useState('시술 후');
  const [cautionTitle, setCautionTitle] = useState('');
  const [cautionItems, setCautionItems] = useState('');
  const [cautionEmergency, setCautionEmergency] = useState('');

  const CAUTION_DEFAULTS: Record<string, { title: string; items: string; emergency: string }> = {
    '시술 후': { title: '시술 후 주의사항', items: '시술 부위를 혀로 건드리지 마세요\n당일 음주 및 흡연은 피해주세요\n자극적이고 뜨거운 음식은 피해주세요\n딱딱한 음식은 3일간 피해주세요\n양치 시 시술 부위 주의해서 닦아주세요\n부기나 출혈은 2~3일 내 자연 소실됩니다', emergency: '이상 증상 시 연락: 02-1234-5678' },
    '진료 후': { title: '진료 후 안내사항', items: '마취가 풀릴 때까지 식사를 피해주세요\n마취 부위를 깨물지 않도록 주의해주세요\n처방된 약은 정해진 시간에 복용해주세요\n당일 과격한 운동은 피해주세요\n통증이 지속되면 내원해주세요', emergency: '이상 증상 시 연락: 02-1234-5678' },
    '수술 후': { title: '수술 후 주의사항', items: '거즈는 1~2시간 후 제거해주세요\n수술 당일 침을 뱉지 마세요\n냉찜질을 20분 간격으로 해주세요\n2~3일간 부드러운 음식만 드세요\n음주와 흡연은 최소 1주일 금지입니다\n격한 운동은 1주일간 삼가주세요\n처방약은 반드시 복용해주세요', emergency: '출혈·심한 통증 시 즉시 연락: 02-1234-5678' },
    '복약': { title: '복약 안내', items: '식후 30분에 복용해주세요\n정해진 용량을 지켜주세요\n항생제는 끝까지 복용하세요\n알레르기 반응 시 즉시 중단하세요\n두통·어지러움 시 안정을 취하세요', emergency: '부작용 발생 시 연락: 02-1234-5678' },
    '일반': { title: '주의사항 안내', items: '안내사항을 잘 읽어주세요\n궁금한 점은 문의해주세요', emergency: '' },
  };

  const handleCautionTypeChange = (type: string) => {
    setCautionType(type);
    const defaults = CAUTION_DEFAULTS[type];
    if (defaults) {
      if (!cautionItems) setCautionItems(defaults.items);
      if (!cautionTitle) setCautionTitle(defaults.title);
      if (!cautionEmergency) setCautionEmergency(defaults.emergency);
    }
  };

  // ── pricing 전용 상태 (OLD parity) ──
  const [pricingTitle, setPricingTitle] = useState('비급여 진료비 안내');
  const [pricingItems, setPricingItems] = useState('임플란트 (1개): 1,200,000원\n레진 충전: 150,000원\n치아 미백: 300,000원\n교정 상담: 무료');
  const [pricingNotice, setPricingNotice] = useState('상기 금액은 부가세 포함 금액이며, 환자 상태에 따라 달라질 수 있습니다.');

  // ── 공통 템플릿 옵션 (OLD parity) ──
  const [templateAppMode, setTemplateAppMode] = useState<'strict' | 'inspired'>('inspired');

  // ── AI_STYLE_PRESETS (OLD parity — 12개 내장 스타일) ──
  interface StylePreset { id: string; name: string; color: string; accent: string; bg: string; desc: string; mood: string; aiPrompt: string; }

  const AI_STYLE_PRESETS: StylePreset[] = [
    { id: 'fresh_start', name: '상쾌한 새출발', color: '#dc2626', accent: '#b91c1c', bg: '#fef2f2', desc: '희망 · 새로움', mood: '새해 첫날 아침같은 상쾌한 희망의 느낌', aiPrompt: 'Fresh new beginning design, soft champagne gold and warm coral accents, confetti and streamer decorations, crisp morning atmosphere, festive yet elegant, gentle sparkle effects, hopeful and bright mood, clean white space with pastel color pops, no radial rays or sunburst patterns' },
    { id: 'romantic_blossom', name: '로맨틱 블로썸', color: '#e11d48', accent: '#be123c', bg: '#fff1f2', desc: '설렘 · 로맨틱', mood: '이른 봄 설렘이 피어나는 로맨틱한 느낌', aiPrompt: 'Early spring romantic design, soft rose pink and warm red accents, delicate heart shapes, cherry blossom buds about to bloom, gentle watercolor washes, romantic yet professional mood, subtle floral borders, warm cozy atmosphere' },
    { id: 'petal_breeze', name: '꽃잎 바람', color: '#f472b6', accent: '#ec4899', bg: '#fdf2f8', desc: '벚꽃 · 산뜻', mood: '꽃잎이 흩날리는 화사하고 산뜻한 느낌', aiPrompt: 'Cherry blossom petal design, soft pink petals floating in the air, pastel pink and white gradient background, sakura branch illustrations, light and airy mood, gentle breeze atmosphere, fresh spring colors, delicate floral patterns' },
    { id: 'sprout_green', name: '새싹 그린', color: '#22c55e', accent: '#16a34a', bg: '#f0fdf4', desc: '생명력 · 치유', mood: '초록 새싹이 돋아나는 싱그러운 느낌', aiPrompt: 'Fresh sprout nature design, vibrant young green and lime accents, sprouting leaves and seedling illustrations, morning dew drops, clean fresh air mood, bright natural sunlight, growth and vitality energy, botanical elements, eco-friendly aesthetic' },
    { id: 'warm_gratitude', name: '따뜻한 감사', color: '#f59e0b', accent: '#d97706', bg: '#fffbeb', desc: '카네이션 · 감성', mood: '카네이션 향기같은 따뜻한 감사의 느낌', aiPrompt: 'Warm gratitude design, carnation flower illustrations in red and pink, warm golden yellow background, heartfelt and thankful mood, soft hand-drawn floral elements, cozy family atmosphere, gentle warm lighting, watercolor texture accents' },
    { id: 'rain_droplet', name: '청량 빗방울', color: '#6366f1', accent: '#4f46e5', bg: '#eef2ff', desc: '빗방울 · 청량', mood: '빗방울이 떨어지는 청량하고 시원한 느낌', aiPrompt: 'Rainy season design, soft indigo and cool blue tones, gentle raindrops and water ripple patterns, transparent umbrella motifs, calm reflective puddle aesthetic, refreshing and cool mood, misty atmosphere with clarity, clean water-inspired gradients' },
    { id: 'ocean_breeze', name: '바다 물결', color: '#0ea5e9', accent: '#0284c7', bg: '#f0f9ff', desc: '시원한 · 파도', mood: '한여름 바다의 시원하고 청량한 느낌', aiPrompt: 'Summer ocean design, bright sky blue and turquoise gradients, ocean waves and seashell motifs, tropical vibes, cool refreshing mood, sunlight sparkling on water, beach sand textures, clear blue sky, vacation energy' },
    { id: 'sunflower_energy', name: '해바라기 에너지', color: '#eab308', accent: '#ca8a04', bg: '#fefce8', desc: '강렬 · 활력', mood: '해바라기처럼 강렬하고 뜨거운 에너지 느낌', aiPrompt: 'Midsummer sunflower design, bold golden yellow and warm orange, large sunflower illustrations, bright blazing sunshine, high energy and vibrant mood, clear summer sky, bold dynamic composition, warm saturated colors, powerful and lively atmosphere' },
    { id: 'maple_romance', name: '단풍 낭만', color: '#ea580c', accent: '#c2410c', bg: '#fff7ed', desc: '단풍 · 낭만', mood: '단풍이 물들기 시작하는 낭만적인 느낌', aiPrompt: 'Early autumn design, warm orange and amber tones, maple leaves turning red and gold, soft warm sunset lighting, romantic and nostalgic mood, cozy sweater weather atmosphere, gentle falling leaves, warm gradient from orange to deep red' },
    { id: 'harvest_gold', name: '풍요로운 수확', color: '#a16207', accent: '#854d0e', bg: '#fefce8', desc: '풍성 · 따뜻한', mood: '풍성한 수확의 따뜻하고 풍요로운 느낌', aiPrompt: 'Autumn harvest design, rich brown and burnt orange palette, pumpkin and wheat illustrations, rustic warmth, abundance and gratitude mood, golden hour lighting, cozy thanksgiving atmosphere, grain texture accents, deep earthy warm tones' },
    { id: 'quiet_fog', name: '고즈넉한 안개', color: '#78716c', accent: '#57534e', bg: '#fafaf9', desc: '차분 · 고즈넉', mood: '낙엽이 쌓인 고즈넉한 늦가을 느낌', aiPrompt: 'Late autumn serene design, muted warm gray and soft brown tones, dry fallen leaves scattered softly, bare tree branch silhouettes, quiet contemplative mood, gentle fog atmosphere, warm tea and book aesthetic, calm and peaceful, subtle vintage texture' },
    { id: 'snowflake_glow', name: '눈꽃 조명', color: '#b91c1c', accent: '#d4a017', bg: '#fef9f0', desc: '눈꽃 · 포근한', mood: '눈꽃과 따뜻한 조명이 어우러진 포근한 느낌', aiPrompt: 'Winter holiday design, warm crimson red and shimmering gold accents, delicate white snowflake patterns on warm background, cozy Christmas fairy lights glow, rich red and gold color palette, festive ornament decorations, warm candlelight ambiance, soft falling snow, elegant holiday atmosphere with warmth' },
  ];

  const [selectedPreset, setSelectedPreset] = useState<StylePreset>(AI_STYLE_PRESETS[0]);

  // ── 스타일 히스토리 (OLD parity — localStorage 기반, 업로드 스타일) ──
  interface StyleHistoryItem { id: string; name: string; stylePrompt: string; thumbnailDataUrl: string; referenceImageUrl: string; }
  const STYLE_HISTORY_KEY = 'winaid-style-history';

  const [styleHistory, setStyleHistory] = useState<StyleHistoryItem[]>([]);
  const [selectedUploadedStyle, setSelectedUploadedStyle] = useState<StyleHistoryItem | null>(null);
  const [selectedCatTemplate, setSelectedCatTemplate] = useState<CategoryTemplate | null>(null);

  // OLD 우선순위: uploadedStyle > catTemplate > preset
  // schedule 카테고리에서 calendarTheme 선택 시 → 테마 전용 스타일 프롬프트 사용
  const CALENDAR_THEME_AI_STYLE: Record<string, string> = {
    autumn: `[CALENDAR THEME: Autumn Maple] Background: warm cream (#FFF8E7) with FALLING MAPLE LEAVES in orange/red/golden. Calendar in white rounded card with shadow. Warm brown header. Golden yellow pill badges. Cozy, warm, autumnal. Color: orange, brown, golden, cream.`,
    korean_traditional: `[CALENDAR THEME: Korean Traditional] Background: beige parchment (#F5EDD5). CRANE silhouettes in gray. Mountain/landscape at bottom in ink-painting style. Serif typography. Navy calendar header. Deep red markers. Dignified, classical, refined. Color: beige, navy, deep red, gold.`,
    winter: `[CALENDAR THEME: Winter / Deep Blue Frost] Background: deep navy gradient (#1A2A4A → #2C3E6B). SNOWFLAKES in blue-white, varying sizes. Pine tree silhouettes at bottom. Calendar in white card. Elegant winter typography. Serene, magical winter night. Color: deep navy, white, soft blue, silver.`,
    cherry_blossom: `[CALENDAR THEME: Cherry Blossom] Background: soft pink gradient (#FFF0F5 → #FFE4EC). Large CHERRY BLOSSOM PETALS scattered. Falling petals effect. Pink calendar header. Elegant serif title in dark pink. Romantic, feminine, soft spring. Color: pink, white, dark rose, purple.`,
    spring_kids: `[CALENDAR THEME: Charcoal Frame] Dark charcoal frame (#292524) enclosing white canvas. Bold white title on charcoal. Calendar inside white area. Closed days in FULL RED cells. Clean grid with stone borders. Professional, bold, high-contrast. Color: charcoal, white, red, stone.`,
    medical_notebook: `[CALENDAR THEME: Modern Minimal] Clean white background. Large bold month number typography. Double-line dividers (thick+thin). Dot markers for closed, line markers for shortened. Monochrome minimalist. Typography-driven. Color: black, white, slate, red dot, amber line.`,
    autumn_spring_note: `[CALENDAR THEME: Night Clinic] Dark header (#1c1917) with AMBER STRIPE BAND ("야간진료 화·목 ~21시"). Tuesday/Thursday columns highlighted yellow. Warm amber accents. Closed days in red pill badges. Color: charcoal, amber/gold, yellow, white, red.`,
    autumn_holiday: `[CALENDAR THEME: SNS Bold] White background with CORAL LEFT BAR accent. Bold large typography. Rounded badge cells. Coral (#f97316) line divider. Closed days with orange border + orange pill badge. Modern SNS post style. Color: white, coral/orange, charcoal, warm gray.`,
    hanok_roof: `[CALENDAR THEME: Gold Classic] Warm ivory background (#faf7f2). GOLD BAND top+bottom. Diamond decoration + serif typography. Dotted grid lines. Elegant serif numbers. Gold accents throughout. Luxurious, classical, premium. Color: ivory, gold, brown, deep red.`,
    dark_green_clinic: `[CALENDAR THEME: Premium Green] Sage/mint background (#f0f7f2). Emerald gradient accent lines. Dark green (#2d6a4f) header. Left border markers for closed days. Clean medical aesthetic. Wellness/healing mood. Color: sage, dark green, emerald, white, red.`,
    dark_blue_modern: `[CALENDAR THEME: Navy Modern] Pure white background. Navy (#1e3a5f) text only — no background color blocks. 2.5px navy divider lines. Left navy border for closed days. Clean slate grid. Business document style. Color: white, navy, slate, amber, red.`,
    lavender_sparkle: `[CALENDAR THEME: Lavender Soft] Soft lavender gradient (#f3eff8 → #fefcff). SPARKLE stars in purple shades. Lavender gradient header band. Rounded pill day badges. Rounded cells. Playful, magical, feminine. Color: lavender, deep purple, violet, white, pink.`,
  };

  const calendarThemeActive = selectedTemplate === 'schedule' && calendarTheme;
  const calendarThemeStylePrompt = calendarThemeActive ? (CALENDAR_THEME_AI_STYLE[calendarTheme] || '') : '';
  const activeStylePrompt = selectedUploadedStyle?.stylePrompt || selectedCatTemplate?.aiPrompt || calendarThemeStylePrompt || selectedPreset.aiPrompt;
  const activeStyleName = selectedUploadedStyle?.name || selectedCatTemplate?.name || (calendarThemeActive ? CALENDAR_THEME_OPTIONS.find(t => t.value === calendarTheme)?.label || calendarTheme : selectedPreset.name);

  // 현재 카테고리에 맞는 디자인 템플릿 목록 (OLD parity: greeting은 명절별 서브키)
  const currentCatTemplates: CategoryTemplate[] = (() => {
    if (!selectedTemplate || !catTemplateData) return [];
    if (selectedTemplate === 'greeting') {
      const subKey = `greeting_${greetHoliday}`;
      return catTemplateData[subKey] || catTemplateData['greeting'] || [];
    }
    return catTemplateData[selectedTemplate] || [];
  })();

  const loadStyleHistory = useCallback((): StyleHistoryItem[] => {
    try { return JSON.parse(localStorage.getItem(STYLE_HISTORY_KEY) || '[]'); } catch { return []; }
  }, []);
  const saveStyleHistory = useCallback((items: StyleHistoryItem[]) => {
    try { localStorage.setItem(STYLE_HISTORY_KEY, JSON.stringify(items.slice(0, 20))); } catch { /* ignore */ }
  }, []);

  // 스타일 업로드 (참조 이미지 → 히스토리에 저장)
  const handleStyleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const item: StyleHistoryItem = {
        id: `style-${Date.now()}`,
        name: '업로드 스타일',
        stylePrompt: 'Copy the exact visual style from the reference image. Match illustration style, colors, layout, typography, and all decorative elements as closely as possible.',
        thumbnailDataUrl: dataUrl,
        referenceImageUrl: dataUrl,
      };
      const updated = [item, ...styleHistory].slice(0, 20);
      setStyleHistory(updated);
      saveStyleHistory(updated);
      setSelectedUploadedStyle(item);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [styleHistory, saveStyleHistory]);

  const deleteStyleItem = useCallback((id: string) => {
    const updated = styleHistory.filter(h => h.id !== id);
    setStyleHistory(updated);
    saveStyleHistory(updated);
    if (selectedUploadedStyle?.id === id) setSelectedUploadedStyle(null);
  }, [styleHistory, saveStyleHistory, selectedUploadedStyle]);

  // ── 가격 헬퍼 (OLD parity) ──
  const parseNum = (s: string) => Number(s.replace(/[^0-9]/g, '')) || 0;
  const fmtWon = (s: string) => { const n = parseNum(s); return n > 0 ? n.toLocaleString() + '원' : ''; };
  const evPrice = fmtWon(evPriceRaw);
  const evOrigPrice = fmtWon(evOrigPriceRaw);
  const autoDiscountPct = (() => {
    const price = parseNum(evPriceRaw), orig = parseNum(evOrigPriceRaw);
    if (orig > 0 && price > 0 && price < orig) return `${Math.round((1 - price / orig) * 100)}% OFF`;
    return '';
  })();

  // ── 달력 그리드 계산 (OLD parity) ──
  const schFirstDay = new Date(schYear, schMonth - 1, 1).getDay();
  const schLastDate = new Date(schYear, schMonth, 0).getDate();
  const schWeeks: (number | null)[][] = [];
  {
    let week: (number | null)[] = new Array(schFirstDay).fill(null);
    for (let d = 1; d <= schLastDate; d++) { week.push(d); if (week.length === 7) { schWeeks.push(week); week = []; } }
    if (week.length > 0) { while (week.length < 7) week.push(null); schWeeks.push(week); }
  }

  const getFixedHolidays = (month: number): Map<number, string> => {
    const fixed: Record<string, string> = { '1-1': '신정', '3-1': '삼일절', '5-5': '어린이날', '6-6': '현충일', '8-15': '광복절', '10-3': '개천절', '10-9': '한글날', '12-25': '성탄절' };
    const result = new Map<number, string>();
    for (const [key, name] of Object.entries(fixed)) { const [m, d] = key.split('-').map(Number); if (m === month) result.set(d, name); }
    return result;
  };
  const schHolidays = getFixedHolidays(schMonth);

  const handleDayClick = (day: number) => {
    const m = new Map(dayMarks);
    if (m.get(day) === markMode) {
      m.delete(day);
      const sh = new Map(shortenedHours); sh.delete(day); setShortenedHours(sh);
      const vr = new Map(vacationReasons); vr.delete(day); setVacationReasons(vr);
    } else { m.set(day, markMode); }
    setDayMarks(m);
  };

  const closedCount = [...dayMarks.values()].filter(v => v === 'closed').length;
  const shortenedCount = [...dayMarks.values()].filter(v => v === 'shortened').length;
  const vacationCount = [...dayMarks.values()].filter(v => v === 'vacation').length;

  // 월/년 변경 시 마킹 초기화
  useEffect(() => { setDayMarks(new Map()); setShortenedHours(new Map()); setVacationReasons(new Map()); }, [schMonth, schYear]);

  // greeting 기본값 (OLD parity: 명절 선택 시 자동 기본값)
  useEffect(() => {
    if (selectedTemplate === 'greeting') {
      const d = HOLIDAY_DEFAULTS[greetHoliday];
      if (d && !greetMsg) setGreetMsg(d.msg);
      if (d && !greetClosure) setGreetClosure(d.closure);
    }
  }, [selectedTemplate]);

  // 카테고리/명절 변경 시 카테고리 템플릿 선택 초기화
  useEffect(() => { setSelectedCatTemplate(null); }, [selectedTemplate, greetHoliday]);

  // ── schedule/event 전용 프롬프트 빌더 ──
  const buildSchedulePrompt = useCallback((): string => {
    const title = schTitle || `${schMonth}월 휴진 안내`;
    const closedDays = [...dayMarks].filter(([, m]) => m === 'closed').map(([d]) => d).sort((a, b) => a - b);
    const shortened = [...dayMarks].filter(([, m]) => m === 'shortened').map(([d]) => `${d}일(${shortenedHours.get(d) || '단축진료'})`).sort();
    const vacations = [...dayMarks].filter(([, m]) => m === 'vacation').map(([d]) => `${d}일(${vacationReasons.get(d) || '휴가'})`).sort();
    const noticeLines = schNotices.split('\n').filter(Boolean);
    const layoutLabel = schLayout === 'full_calendar' ? '전체 달력(월간 캘린더)' : schLayout === 'week' ? '한 주(주간 캘린더)' : '강조형(날짜 강조)';

    // 달력 테마 정보
    const themeOption = CALENDAR_THEME_OPTIONS.find(t => t.value === calendarTheme);
    const themeName = themeOption?.label || calendarTheme;
    const themeDesc = themeOption?.desc || '';

    let p = `Korean hospital ${schMonth}월 monthly schedule poster — PREMIUM DESIGN.
제목: "${title}"

[CRITICAL LAYOUT RULES]
- 비율: 정사각형(1:1) 또는 4:5 세로형. 절대 세로로 길쭉하게 만들지 마세요.
- 구조: 상단 헤더(병원명+제목) → 달력 그리드 → 하단(사용자가 입력한 안내 문구만)
- 달력은 콤팩트하게! 7열 그리드, 셀 간격 최소화, 날짜 숫자는 14-18pt
- 전체가 하나의 세련된 카드 안에 담겨야 합니다
- ⛔ 사용자가 입력하지 않은 진료시간, 점심시간, 전화번호를 절대 넣지 마세요! 하단에 아무 정보도 입력되지 않았으면 하단을 비워두세요.

[CALENDAR DATA]
월: ${schYear}년 ${schMonth}월
레이아웃: ${layoutLabel}
디자인 테마: "${themeName}" — ${themeDesc}
`;
    if (closedDays.length > 0) p += `휴진일: ${closedDays.map(d => `${d}일`).join(', ')} — 빨간색 배경 또는 빨간 동그라미로 강조.\n`;
    if (shortened.length > 0) p += `단축진료: ${shortened.join(', ')} — 주황/앰버 표시.\n`;
    if (vacations.length > 0) p += `휴가: ${vacations.join(', ')} — 보라색 표시.\n`;
    if (noticeLines.length > 0) p += `하단 안내: ${noticeLines.join(' / ')}\n`;
    p += `\n[DESIGN QUALITY]
- 프리미엄 병원 인스타그램 피드 수준
- 깔끔한 sans-serif 타이포, 세련된 색상 팔레트
- 요일 헤더: 일(빨강) 월 화 수 목 금 토(파랑)
- 충분한 여백, 정돈된 그리드, 고급스러운 느낌
- 절대 엑셀/스프레드시트처럼 보이면 안 됨`;
    if (customMessage) p += `\n추가 문구: "${customMessage}"`;
    if (extraPrompt) p += `\n${extraPrompt}`;
    return p;
  }, [schYear, schMonth, schTitle, schLayout, dayMarks, shortenedHours, vacationReasons, schNotices, customMessage, extraPrompt, calendarTheme]);

  const buildEventPrompt = useCallback((): string => {
    const title = evTitle || '이벤트';
    let p = `병원 이벤트 홍보 포스터.\n이벤트 제목: "${title}"\n`;
    if (evSubtitle) p += `부제목: "${evSubtitle}"\n`;
    if (evPrice) p += `이벤트 가격: ${evPrice} — 크고 굵게 강조.\n`;
    if (evOrigPrice) p += `정가: ${evOrigPrice} — 취소선으로 표시.\n`;
    const disc = evDiscount || autoDiscountPct;
    if (disc) p += `할인율: ${disc} — 눈에 띄는 뱃지/라벨로 표시.\n`;
    if (evPeriod) p += `이벤트 기간: ${evPeriod}\n`;
    if (evDesc) p += `상세 설명: ${evDesc}\n`;
    p += '밝고 신뢰감 있는 의료 디자인, 가격과 혜택이 한눈에 보이는 레이아웃, 한국어 텍스트.';
    if (customMessage) p += `\n추가 문구: "${customMessage}"`;
    if (extraPrompt) p += `\n${extraPrompt}`;
    return p;
  }, [evTitle, evSubtitle, evPrice, evOrigPrice, evDiscount, autoDiscountPct, evPeriod, evDesc, customMessage, extraPrompt]);

  // ── doctor 전용 프롬프트 빌더 ──
  const buildDoctorPrompt = useCallback((): string => {
    const name = docName || '전문의';
    let p = `병원 의사 소개 카드 이미지.\n의사 이름: "${name}"\n`;
    if (docSpecialty) p += `전문 분야: ${docSpecialty}\n`;
    if (docCareer) {
      const careers = docCareer.split('\n').filter(Boolean);
      if (careers.length > 0) p += `주요 경력/학력:\n${careers.map(c => `- ${c}`).join('\n')}\n`;
    }
    if (docGreeting) p += `인사말: "${docGreeting}"\n`;
    if (docPhotoBase64) p += '첨부된 의사 사진을 이미지 좌측 또는 상단에 자연스럽게 배치해주세요.\n';
    p += '전문적이고 신뢰감 있는 의료 디자인, 깔끔한 정보 레이아웃, 한국어 텍스트.';
    if (customMessage) p += `\n추가 문구: "${customMessage}"`;
    if (extraPrompt) p += `\n${extraPrompt}`;
    return p;
  }, [docName, docSpecialty, docCareer, docGreeting, docPhotoBase64, customMessage, extraPrompt]);

  // ── notice 전용 프롬프트 빌더 ──
  const buildNoticePrompt = useCallback((): string => {
    const title = noticeTitle || '공지사항';
    let p = `병원 공지사항 안내 이미지.\n공지 제목: "${title}"\n`;
    if (noticeContent) {
      const lines = noticeContent.split('\n').filter(Boolean);
      if (lines.length > 0) p += `공지 내용:\n${lines.map(l => `- ${l}`).join('\n')}\n`;
    }
    if (noticeDate) p += `적용일: ${noticeDate}\n`;
    p += '깔끔하고 공식적인 의료 공지 디자인, 정보 전달에 최적화된 레이아웃, 한국어 텍스트.';
    if (customMessage) p += `\n추가 문구: "${customMessage}"`;
    if (extraPrompt) p += `\n${extraPrompt}`;
    return p;
  }, [noticeTitle, noticeContent, noticeDate, customMessage, extraPrompt]);

  // ── greeting 전용 프롬프트 빌더 ──
  const buildGreetingPrompt = useCallback((): string => {
    let p = `병원 ${greetHoliday} 인사 이미지.\n명절: ${greetHoliday}\n`;
    if (greetMsg) p += `인사말: "${greetMsg.replace(/\n/g, ' ')}"\n`;
    if (greetClosure) p += `휴진 기간: ${greetClosure}\n`;
    p += `따뜻하고 한국적인 ${greetHoliday} 분위기, 병원명과 휴진 안내 포함, 한국어 텍스트.`;
    if (customMessage) p += `\n추가 문구: "${customMessage}"`;
    if (extraPrompt) p += `\n${extraPrompt}`;
    return p;
  }, [greetHoliday, greetMsg, greetClosure, customMessage, extraPrompt]);

  // ── hiring 전용 프롬프트 빌더 ──
  const buildHiringPrompt = useCallback((): string => {
    const pages = hiringPageData.slice(0, hiringPageCount);
    const typeLabels: Record<HiringPageType, string> = { cover: '표지', requirements: '자격요건', benefits: '복리후생', contact: '지원방법', intro: '병원소개', free: '자유입력' };
    let p = `병원 채용/직원 모집 공고 이미지.\n`;
    if (hiringPageCount === 1) {
      const page = pages[0];
      const label = typeLabels[page.type];
      p += `유형: ${label}\n`;
      if (page.content) p += `내용:\n${page.content}\n`;
    } else {
      p += `총 ${hiringPageCount}페이지 구성:\n`;
      pages.forEach((page, i) => {
        const label = typeLabels[page.type];
        p += `[${i + 1}페이지 - ${label}] ${page.content || '(내용 없음)'}\n`;
      });
    }
    if (hiringPhotos.length > 0) p += `병원 사진 ${hiringPhotos.length}장 첨부 — 디자인에 자연스럽게 활용.\n`;
    p += '깔끔하고 전문적인 채용 공고 디자인, 한국어 텍스트, 신뢰감 있는 레이아웃.';
    if (customMessage) p += `\n추가 문구: "${customMessage}"`;
    if (extraPrompt) p += `\n${extraPrompt}`;
    return p;
  }, [hiringPageCount, hiringPageData, hiringPhotos, customMessage, extraPrompt]);

  // ── caution 전용 프롬프트 빌더 ──
  const buildCautionPrompt = useCallback((): string => {
    const title = cautionTitle || `${cautionType} 주의사항`;
    let p = `병원 ${cautionType} 주의사항 안내 이미지.\n제목: "${title}"\n`;
    if (cautionItems) {
      const items = cautionItems.split('\n').filter(Boolean);
      if (items.length > 0) p += `주의사항 항목:\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n`;
    }
    if (cautionEmergency) p += `응급 연락처: ${cautionEmergency}\n`;
    p += '항목별 아이콘, 읽기 쉬운 리스트 형태, 깔끔한 의료 안내 디자인, 한국어 텍스트.';
    if (customMessage) p += `\n추가 문구: "${customMessage}"`;
    if (extraPrompt) p += `\n${extraPrompt}`;
    return p;
  }, [cautionType, cautionTitle, cautionItems, cautionEmergency, customMessage, extraPrompt]);

  // ── pricing 전용 프롬프트 빌더 ──
  const buildPricingPrompt = useCallback((): string => {
    const title = pricingTitle || '비급여 진료비 안내';
    let p = `병원 비급여 진료비 안내 이미지.\n제목: "${title}"\n`;
    if (pricingItems) {
      const items = pricingItems.split('\n').filter(Boolean);
      if (items.length > 0) p += `가격 항목 (표 형태로 배치):\n${items.map(item => `- ${item}`).join('\n')}\n`;
    }
    if (pricingNotice) p += `하단 안내: "${pricingNotice}"\n`;
    p += '깔끔하고 투명한 가격표 디자인, 시술명과 가격이 한눈에 보이는 표 레이아웃, 한국어 텍스트.';
    if (customMessage) p += `\n추가 문구: "${customMessage}"`;
    if (extraPrompt) p += `\n${extraPrompt}`;
    return p;
  }, [pricingTitle, pricingItems, pricingNotice, customMessage, extraPrompt]);

  // 전용 폼 모드 여부 (렌더용) — 모든 8개 카테고리
  const hasFormMode = mode === 'template' && selectedTemplate !== null;

  const handleDocPhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setDocPhotoBase64(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // localStorage 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOGO_STORAGE_KEY);
      const savedName = localStorage.getItem(HOSPITAL_NAME_KEY);
      if (saved) { setLogoDataUrl(saved); setLogoEnabled(true); }
      if (savedName) setHospitalName(savedName);
      const info = localStorage.getItem('hospital_info');
      if (info) {
        const p = JSON.parse(info);
        if (p.phone) setClinicPhone(p.phone);
        if (p.hours) setClinicHours(p.hours);
        if (p.address) setClinicAddress(p.address);
        if (p.brandColor) setBrandColor(p.brandColor);
        if (p.brandAccent) setBrandAccent(p.brandAccent);
      }
      // 스타일 히스토리 복원
      setStyleHistory(loadStyleHistory());
    } catch { /* ignore */ }
  }, [loadStyleHistory]);

  const saveHospitalInfo = useCallback(() => {
    localStorage.setItem('hospital_info', JSON.stringify({
      phone: clinicPhone, hours: clinicHours, address: clinicAddress,
      brandColor, brandAccent,
    }));
  }, [clinicPhone, clinicHours, clinicAddress, brandColor, brandAccent]);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoDataUrl(dataUrl);
      setLogoEnabled(true);
      try { localStorage.setItem(LOGO_STORAGE_KEY, dataUrl); } catch { /* ignore */ }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleHospitalNameChange = useCallback((name: string) => {
    setHospitalName(name);
    try { localStorage.setItem(HOSPITAL_NAME_KEY, name); } catch { /* ignore */ }
  }, []);

  const removeLogo = useCallback(() => {
    setLogoDataUrl(null);
    setLogoEnabled(false);
    try { localStorage.removeItem(LOGO_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  // ── 달력 Canvas 참조 이미지 생성 (old app과 동일) ──

  const generateCalendarImage = useCallback((year: number, month: number, holidays: string[]): string | null => {
    try {
      const canvas = document.createElement('canvas');
      const scale = 4;
      const cellW = 100 * scale, cellH = 70 * scale;
      const cols = 7;
      const headerH = 80 * scale;
      const dayHeaderH = 40 * scale;
      const firstDay = new Date(year, month - 1, 1).getDay();
      const lastDate = new Date(year, month, 0).getDate();
      const rows = Math.ceil((firstDay + lastDate) / 7);

      canvas.width = cols * cellW;
      canvas.height = headerH + dayHeaderH + rows * cellH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#222222';
      ctx.font = `bold ${32 * scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${month}월`, canvas.width / 2, 50 * scale);

      const holidayDays = new Set<number>();
      for (const h of holidays) {
        const m = h.match(/^\d+-(\d+)/);
        if (m) holidayDays.add(parseInt(m[1], 10));
      }

      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      ctx.font = `bold ${18 * scale}px sans-serif`;
      for (let i = 0; i < 7; i++) {
        const x = i * cellW + cellW / 2;
        const y = headerH + 25 * scale;
        ctx.fillStyle = i === 0 ? '#e53e3e' : i === 6 ? '#3182ce' : '#555555';
        ctx.fillText(dayNames[i], x, y);
      }

      ctx.strokeStyle = '#dddddd';
      ctx.lineWidth = scale;
      ctx.beginPath();
      ctx.moveTo(0, headerH + dayHeaderH);
      ctx.lineTo(canvas.width, headerH + dayHeaderH);
      ctx.stroke();

      for (let d = 1; d <= lastDate; d++) {
        const idx = firstDay + d - 1;
        const col = idx % 7;
        const row = Math.floor(idx / 7);
        const x = col * cellW + cellW / 2;
        const y = headerH + dayHeaderH + row * cellH + 35 * scale;

        ctx.font = `bold ${20 * scale}px sans-serif`;
        ctx.fillStyle = col === 0 || holidayDays.has(d) ? '#e53e3e' : col === 6 ? '#3182ce' : '#333333';
        ctx.fillText(String(d), x, y);
      }

      for (let r = 1; r < rows; r++) {
        const y = headerH + dayHeaderH + r * cellH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      for (let c = 1; c < cols; c++) {
        const x = c * cellW;
        ctx.beginPath();
        ctx.moveTo(x, headerH + dayHeaderH);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }, []);

  const detectCalendar = useCallback((text: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const keywords = /달력|캘린더|calendar|일정|스케줄|진료\s*안내|휴진|휴무|공휴일|진료\s*시간/i;
    const needsCalendar = keywords.test(text);
    const months: number[] = [];
    const monthMatches = text.matchAll(/(\d{1,2})\s*월/g);
    for (const m of monthMatches) {
      const num = parseInt(m[1], 10);
      if (num >= 1 && num <= 12) months.push(num);
    }
    if (months.length === 0 && needsCalendar) months.push(now.getMonth() + 1);
    return { needsCalendar, months, year };
  }, []);

  const getKoreanHolidays2 = useCallback((month: number): string[] => {
    const holidays: Record<string, string> = {
      '1-1': '신정', '3-1': '삼일절', '5-5': '어린이날',
      '6-6': '현충일', '8-15': '광복절', '10-3': '개천절',
      '10-9': '한글날', '12-25': '성탄절',
    };
    const result: string[] = [];
    for (const [key, name] of Object.entries(holidays)) {
      const [m] = key.split('-').map(Number);
      if (m === month) result.push(`${key} ${name}`);
    }
    return result;
  }, []);

  // ── 프롬프트 조립 + API 호출 ──

  const handleGenerate = useCallback(async () => {
    // 전용 폼 모드에서는 구조화 프롬프트 사용
    const isScheduleMode = mode === 'template' && selectedTemplate === 'schedule';
    const isEventMode = mode === 'template' && selectedTemplate === 'event';
    const isDoctorMode = mode === 'template' && selectedTemplate === 'doctor';
    const isNoticeMode = mode === 'template' && selectedTemplate === 'notice';
    const isGreetingMode = mode === 'template' && selectedTemplate === 'greeting';
    const isHiringMode = mode === 'template' && selectedTemplate === 'hiring';
    const isCautionMode = mode === 'template' && selectedTemplate === 'caution';
    const isPricingMode = mode === 'template' && selectedTemplate === 'pricing';
    const hasForm = isScheduleMode || isEventMode || isDoctorMode || isNoticeMode || isGreetingMode || isHiringMode || isCautionMode || isPricingMode;
    let effectivePrompt = isScheduleMode ? buildSchedulePrompt()
      : isEventMode ? buildEventPrompt()
      : isDoctorMode ? buildDoctorPrompt()
      : isNoticeMode ? buildNoticePrompt()
      : isGreetingMode ? buildGreetingPrompt()
      : isHiringMode ? buildHiringPrompt()
      : isCautionMode ? buildCautionPrompt()
      : isPricingMode ? buildPricingPrompt()
      : prompt.trim();

    // 스타일 프롬프트 추가 (OLD parity: DESIGN_SYSTEM_V2 + 카테고리 가이드 + strict/inspired)
    if (hasForm && activeStylePrompt) {
      const DESIGN_SYSTEM = `[DESIGN SYSTEM — Korean Medical SNS Standard]
FORMAT: Vertical ratio recommended. Important content within center safe zone with generous side margins.
TYPOGRAPHY: Sans-serif only. Headings bold and large, body clean and readable, captions small. Sufficient line-height for Korean text.
COLOR: Maximum three colors per design. Medical trust palette: soft blue, navy, teal, mint, clean white. No neon.
SURFACES: Clean card layouts with rounded corners, subtle shadows, rounded badges, subtle dividers.
KOREAN MEDICAL LAW: No superlatives. No guarantees of treatment outcome.
FORBIDDEN: starburst, confetti, multiple fonts, tiny text, clip-art, metallic text, handwritten style.
PRACTICAL: Must look like a real Korean hospital Instagram post.
⛔ NEVER render CSS code, pixel values, technical specs, or design tokens as visible text.`;

      const categoryGuides: Record<string, string> = {
        schedule: 'hospital monthly schedule — clean grid layout, clear day headers (일월화수목금토), Sunday=red, Saturday=blue, closed days clearly marked. ONLY include text that appears in quotes in the prompt. Do NOT invent operating hours, lunch breaks, or phone numbers.',
        event: 'hospital promotion — eye-catching yet professional. Discount number must be largest element. Original price strikethrough + discounted price prominent. Period dates visible.',
        doctor: 'doctor introduction — professional portrait-style. Only verifiable credentials. No superlatives.',
        notice: 'hospital notice — clean, authoritative, easy to read. Centered card layout. Structured info rows.',
        greeting: 'holiday greeting — warm, heartfelt, culturally appropriate Korean design. Traditional motifs. Hospital branding subtle at bottom.',
        hiring: 'job posting — premium Instagram recruiting post. Clean icons for benefits/requirements. Minimal: icons + text only.',
        caution: 'patient care instructions — clean medical handout. Highly readable 16pt+. Numbered list with generous spacing. Calming colors.',
        pricing: 'fee schedule — premium price list. Clean table/list layout. Treatment LEFT, price RIGHT. Bold prices in accent color.',
      };
      const catGuide = categoryGuides[selectedTemplate || ''] || '';

      const strictBlock = templateAppMode === 'strict'
        ? `[APPLICATION MODE: STRICT — EXACT REPRODUCTION]
COPY the template design EXACTLY. Match these elements precisely:
- EXACT color palette, gradient angles, and opacity values
- EXACT layout structure, zone proportions (header/body/footer ratios)
- EXACT typography hierarchy (size, weight, spacing, alignment)
- EXACT decorative elements (lines, shapes, icons, borders, badges)
- EXACT spacing rhythm, padding, margins, card radius
- EXACT marker/badge style for special items (closed days, prices, etc.)
DO NOT reinterpret, simplify, or "improve" any element. The output must be visually indistinguishable from the template reference.
ONLY replace placeholder text with the user's actual content.`
        : `[APPLICATION MODE: INSPIRED — PREMIUM REINTERPRETATION]
Use the template as MOOD INSPIRATION, not a strict blueprint.
MUST PRESERVE from template: overall color family, general mood/atmosphere, level of formality, information hierarchy pattern.
FREE TO REINTERPRET: exact layout proportions, decorative element placement, typography choices, spacing details, card shapes.
CRITICAL: The result must feel PREMIUM and SOPHISTICATED — like a top-tier Korean hospital's official post.
Reference quality bar: 똑닥/미리캔버스 premium hospital templates.
Add subtle professional touches: refined gradients, elegant typography, clean whitespace, polished surfaces.`;

      effectivePrompt += `\n\n${DESIGN_SYSTEM}\n\n[CATEGORY: ${catGuide}]\n\n${strictBlock}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n[DESIGN STYLE — Template Layout]\n${activeStylePrompt}`;
    }

    if (!effectivePrompt || generating) return;

    setGenerating(true);
    setError(null);
    setProgress('이미지 생성 중...');
    setGeneratingStep(0);
    setTimeout(() => resultAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    setShowRegenMenu(false);
    setShowRegenPromptInput(false);
    const stepTimer = setInterval(() => setGeneratingStep(s => s + 1), 3000);

    // 달력 참조 이미지 (Canvas) — schedule 모드에서는 항상 생성
    let calendarImage: string | undefined;
    if (isScheduleMode) {
      const hMap = getFixedHolidays(schMonth);
      const holidays = [...hMap.entries()].map(([d, name]) => `${schMonth}-${d} ${name}`);
      const img = generateCalendarImage(schYear, schMonth, holidays);
      if (img) calendarImage = img;
      setProgress('달력 데이터 준비 완료, 이미지 생성 중...');
    } else {
      const dateCtx = detectCalendar(effectivePrompt);
      if (dateCtx.needsCalendar && dateCtx.months.length > 0) {
        const holidays = getKoreanHolidays2(dateCtx.months[0]);
        const img = generateCalendarImage(dateCtx.year, dateCtx.months[0], holidays);
        if (img) calendarImage = img;
        setProgress('달력 데이터 준비 완료, 이미지 생성 중...');
      }
    }

    // 로고 지시문
    let logoInstruction = '';
    if (logoEnabled && hospitalName.trim()) {
      const posLabel = logoPosition === 'top' ? '상단' : '하단';
      logoInstruction = `[로고+병원명 배치 규칙 - 반드시 준수!]
첨부된 로고 이미지와 "${hospitalName}" 병원명 텍스트를 반드시 하나의 세트로 묶어서 디자인의 ${posLabel}에 배치해주세요.
- 로고 이미지 바로 옆에 "${hospitalName}" 텍스트를 나란히 배치
- 로고와 병원명은 절대 떨어뜨리지 말고, 항상 함께 붙어있어야 합니다
- 이미지 전체에서 로고+병원명은 딱 한 번만 표시 (중복 금지!)
- ${posLabel} 한 곳에만 배치하고, 다른 위치에 또 넣지 마세요`;
    } else if (logoEnabled && logoDataUrl) {
      const posLabel = logoPosition === 'top' ? '상단' : '하단';
      logoInstruction = `첨부된 로고 이미지를 디자인의 ${posLabel}에 자연스럽게 한 번만 배치해주세요. 다른 위치에 중복으로 넣지 마세요.`;
    }

    // 병원 기본 정보
    const infoLines = [clinicPhone, clinicHours, clinicAddress].filter(Boolean);
    const hospitalInfo = infoLines.length > 0
      ? `[병원 기본 정보 - 이미지 하단에 작지만 읽을 수 있는 크기로 표시]\n${infoLines.map(l => `"${l}"`).join('\n')}`
      : '';

    // 브랜드 컬러
    let brandColors = '';
    if (brandColor || brandAccent) {
      brandColors = '[브랜드 컬러 - 디자인의 메인 컬러로 사용]';
      if (brandColor) brandColors += `\nMain color: ${brandColor}`;
      if (brandAccent) brandColors += `\nAccent color: ${brandAccent}`;
      brandColors += '\n이 색상을 헤딩, 배경, 강조 요소에 우선 적용해주세요.';
    }

    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectivePrompt,
          aspectRatio,
          logoInstruction: logoInstruction || undefined,
          hospitalInfo: hospitalInfo || undefined,
          brandColors: brandColors || undefined,
          logoBase64: logoEnabled && logoDataUrl ? logoDataUrl : undefined,
          calendarImage: calendarImage || undefined,
          referenceImage: isDoctorMode && docPhotoBase64 ? docPhotoBase64
            : isHiringMode && hiringPhotos.length > 0 ? hiringPhotos[0]
            : selectedUploadedStyle?.referenceImageUrl
            ? selectedUploadedStyle.referenceImageUrl
            : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `서버 오류 (${res.status})`);
      }

      if (data.imageDataUrl) {
        setResultImages(prev => { const next = [...prev, data.imageDataUrl]; setCurrentPage(next.length - 1); return next; });
        setProgress('');

        // 이미지 생성 기록 저장 (generated_posts)
        try {
          let userId: string | null = null;
          let userEmail: string | null = null;
          if (supabase) {
            const { data: { user } } = await supabase.auth.getUser();
            userId = user?.id ?? null;
            userEmail = user?.email ?? null;
          }
          const titleText = effectivePrompt.length > 60
            ? effectivePrompt.substring(0, 60) + '...'
            : effectivePrompt;
          await savePost({
            userId,
            userEmail,
            hospitalName: hospitalName || undefined,
            postType: 'image',
            title: titleText || '이미지 생성',
            content: data.imageDataUrl,
            topic: effectivePrompt,
          });
        } catch {
          // 기록 저장 실패는 사용자 경험에 영향 주지 않음
          console.warn('[Image] 생성 기록 저장 실패');
        }
      } else {
        throw new Error('이미지 데이터를 받지 못했습니다.');
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || '이미지 생성에 실패했습니다.');
      setProgress('');
    } finally {
      clearInterval(stepTimer);
      setGenerating(false);
    }
  }, [prompt, aspectRatio, generating, logoEnabled, logoDataUrl, hospitalName, logoPosition, clinicPhone, clinicHours, clinicAddress, brandColor, brandAccent, detectCalendar, getKoreanHolidays2, generateCalendarImage, mode, selectedTemplate, buildSchedulePrompt, buildEventPrompt, buildDoctorPrompt, buildNoticePrompt, buildGreetingPrompt, buildHiringPrompt, buildCautionPrompt, buildPricingPrompt, schYear, schMonth, docPhotoBase64, hiringPhotos, activeStylePrompt, selectedUploadedStyle, templateAppMode]);

  const handleDownload = useCallback((pageIndex?: number) => {
    if (resultImages.length === 0) return;
    if (pageIndex !== undefined) {
      // 단일 다운로드
      const link = document.createElement('a');
      link.href = resultImages[pageIndex];
      link.download = `hospital-image-${pageIndex + 1}-${Date.now()}.png`;
      link.click();
    } else {
      // 전체 다운로드
      resultImages.forEach((img, i) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = img;
          link.download = `hospital-image-${i + 1}-${Date.now()}.png`;
          link.click();
        }, i * 300);
      });
    }
  }, [resultImages]);

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start w-full">
      {/* 좌측: 입력 폼 */}
      <div className="w-full lg:w-[400px] xl:w-[440px] lg:flex-none">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* 헤더 (OLD parity: 모드 토글 포함) */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-emerald-50 border-emerald-100">
            <span>🖼️</span>
            <span className="text-xs font-bold text-emerald-700">이미지 생성</span>
            <div className="ml-auto flex bg-white/80 rounded-lg p-0.5 border border-emerald-200/60">
              <button onClick={() => setMode('template')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${mode === 'template' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                템플릿
              </button>
              <button onClick={() => setMode('free')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${mode === 'free' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                자유 입력
              </button>
            </div>
          </div>

          {/* 입력 폼 */}
          <div className="p-4 space-y-3">
            {/* 템플릿 카테고리 선택 (OLD parity: 템플릿 모드) */}
            {mode === 'template' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">카테고리 선택</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {TEMPLATE_CATEGORIES.map(cat => (
                    <button key={cat.id} type="button"
                      onClick={() => {
                        const newSel = selectedTemplate === cat.id ? null : cat.id;
                        setSelectedTemplate(newSel);
                      }}
                      className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all duration-200 border ${
                        selectedTemplate === cat.id
                          ? 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-200/50'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-500 hover:shadow-sm'
                      }`}>
                      <span className="text-sm leading-none">{cat.icon}</span>
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 병원 브랜딩 (OLD 순서: 카테고리 탭 바로 아래) */}
            <div className="bg-slate-50/60 rounded-xl p-4 border border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-500">병원 브랜딩</label>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                  {(['top', 'bottom'] as const).map(pos => (
                    <button key={pos} type="button" onClick={() => setLogoPosition(pos)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${logoPosition === pos ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      {pos === 'top' ? '▲ 상단' : '▼ 하단'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <label className="flex-shrink-0 w-12 h-12 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors overflow-hidden bg-white">
                  {logoDataUrl ? (
                    <img src={logoDataUrl} alt="로고" className="w-full h-full object-contain" />
                  ) : (
                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                <input type="text" value={hospitalName} onChange={e => handleHospitalNameChange(e.target.value)} placeholder="병원명 입력 (선택)" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white" />
                {logoDataUrl && <button type="button" onClick={removeLogo} className="text-[10px] text-red-400 hover:text-red-600">삭제</button>}
              </div>
              {/* 병원 기본 정보 (접이식) */}
              <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between px-2 py-1.5 bg-white hover:bg-slate-50 rounded-lg text-[11px] font-medium text-slate-400 transition-all">
                <span>전화번호 · 진료시간 · 주소 · 브랜드컬러</span>
                <svg className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showAdvanced && (
                <div className="space-y-2">
                  <input type="text" value={clinicPhone} onChange={e => setClinicPhone(e.target.value)} onBlur={saveHospitalInfo} placeholder="전화번호: 02-1234-5678" className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400 bg-white" />
                  <input type="text" value={clinicHours} onChange={e => setClinicHours(e.target.value)} onBlur={saveHospitalInfo} placeholder="진료시간: 평일 09:00~18:00" className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400 bg-white" />
                  <input type="text" value={clinicAddress} onChange={e => setClinicAddress(e.target.value)} onBlur={saveHospitalInfo} placeholder="주소: 서울시 강남구 테헤란로 123" className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400 bg-white" />
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-1">
                      <label className="text-[10px] text-slate-400 whitespace-nowrap">메인</label>
                      <input type="color" value={brandColor || '#4F46E5'} onChange={e => setBrandColor(e.target.value)} onBlur={saveHospitalInfo} className="w-5 h-5 rounded border border-slate-200 cursor-pointer p-0.5" />
                      <input type="text" value={brandColor} onChange={e => setBrandColor(e.target.value)} onBlur={saveHospitalInfo} placeholder="#4F46E5" className="flex-1 px-2 py-1 border border-slate-200 rounded text-[10px] font-mono outline-none focus:border-blue-400 bg-white" />
                    </div>
                    <div className="flex-1 flex items-center gap-1">
                      <label className="text-[10px] text-slate-400 whitespace-nowrap">포인트</label>
                      <input type="color" value={brandAccent || '#F59E0B'} onChange={e => setBrandAccent(e.target.value)} onBlur={saveHospitalInfo} className="w-5 h-5 rounded border border-slate-200 cursor-pointer p-0.5" />
                      <input type="text" value={brandAccent} onChange={e => setBrandAccent(e.target.value)} onBlur={saveHospitalInfo} placeholder="#F59E0B" className="flex-1 px-2 py-1 border border-slate-200 rounded text-[10px] font-mono outline-none focus:border-blue-400 bg-white" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ══ schedule 전용 폼 (OLD parity) ══ */}
            {mode === 'template' && selectedTemplate === 'schedule' && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">연도</label>
                    <select value={schYear} onChange={e => setSchYear(Number(e.target.value))} className={inputCls}>
                      {[now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}년</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">월</label>
                    <select value={schMonth} onChange={e => setSchMonth(Number(e.target.value))} className={inputCls}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">제목</label>
                  <input type="text" value={schTitle} onChange={e => setSchTitle(e.target.value)} placeholder={`${schMonth}월 휴진 안내`} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">레이아웃 스타일</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'full_calendar' as ScheduleLayout, icon: '📅', name: '전체 달력', desc: '월간 캘린더' },
                      { id: 'week' as ScheduleLayout, icon: '📋', name: '한 주', desc: '주간 캘린더' },
                      { id: 'highlight' as ScheduleLayout, icon: '⭐', name: '강조형', desc: '날짜 강조' },
                    ]).map(lt => (
                      <button key={lt.id} type="button" onClick={() => setSchLayout(lt.id)}
                        className={`py-2.5 px-2 rounded-xl text-center transition-all border ${
                          schLayout === lt.id ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}>
                        <div className="text-lg">{lt.icon}</div>
                        <div className={`text-xs font-bold ${schLayout === lt.id ? 'text-blue-700' : 'text-slate-700'}`}>{lt.name}</div>
                        <div className="text-[10px] text-slate-400">{lt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {/* 마킹 모드 */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">마킹 모드 (선택 후 달력 클릭)</label>
                  <div className="flex gap-2">
                    {([
                      { m: 'closed' as DayMark, l: '휴진', bg: 'bg-red-500', r: 'ring-red-300' },
                      { m: 'shortened' as DayMark, l: '단축', bg: 'bg-amber-500', r: 'ring-amber-300' },
                      { m: 'vacation' as DayMark, l: '휴가', bg: 'bg-purple-500', r: 'ring-purple-300' },
                    ]).map(({ m: md, l, bg, r }) => (
                      <button key={md} type="button" onClick={() => setMarkMode(md)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all ${markMode === md ? `${bg} text-white ring-2 ${r} shadow-md` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 달력 그리드 */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 text-center text-sm font-bold text-slate-700">{schYear}년 {schMonth}월</div>
                  <table className="w-full border-collapse">
                    <thead><tr>{['일','월','화','수','목','금','토'].map((d, i) => (
                      <th key={d} className={`py-2 text-xs font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{d}</th>
                    ))}</tr></thead>
                    <tbody>{schWeeks.map((w, wi) => (
                      <tr key={wi}>{w.map((d, di) => {
                        if (d === null) return <td key={di} className="p-1" />;
                        const mark = dayMarks.get(d);
                        const isH = schHolidays.has(d);
                        const isSun = di === 0;
                        const isSat = di === 6;
                        let bg = 'bg-white hover:bg-slate-50', tx = 'text-slate-700', badge = '';
                        if (mark === 'closed') { bg = 'bg-red-50 ring-1 ring-red-300'; tx = 'text-red-600 font-bold'; badge = '휴진'; }
                        else if (mark === 'shortened') { bg = 'bg-amber-50 ring-1 ring-amber-300'; tx = 'text-amber-600 font-bold'; badge = '단축'; }
                        else if (mark === 'vacation') { bg = 'bg-purple-50 ring-1 ring-purple-300'; tx = 'text-purple-600 font-bold'; badge = '휴가'; }
                        else if (isSun || isH) tx = 'text-red-500';
                        else if (isSat) tx = 'text-blue-500';
                        return (
                          <td key={di} className="p-1">
                            <button type="button" onClick={() => handleDayClick(d)} className={`w-full rounded-lg py-1.5 text-center cursor-pointer transition-all ${bg} ${tx}`}>
                              <div className="text-sm">{d}</div>
                              {badge && <div className="text-[9px] font-bold -mt-0.5">{badge}</div>}
                              {isH && !badge && <div className="text-[9px] text-red-400">{schHolidays.get(d)}</div>}
                            </button>
                          </td>
                        );
                      })}</tr>
                    ))}</tbody>
                  </table>
                </div>
                {/* 마킹 요약 뱃지 */}
                {(closedCount > 0 || shortenedCount > 0 || vacationCount > 0) && (
                  <div className="flex gap-2 flex-wrap text-xs">
                    {closedCount > 0 && <span className="px-2 py-1 bg-red-50 text-red-600 rounded-full font-semibold">휴진 {closedCount}일</span>}
                    {shortenedCount > 0 && <span className="px-2 py-1 bg-amber-50 text-amber-600 rounded-full font-semibold">단축 {shortenedCount}일</span>}
                    {vacationCount > 0 && <span className="px-2 py-1 bg-purple-50 text-purple-600 rounded-full font-semibold">휴가 {vacationCount}일</span>}
                  </div>
                )}
                {/* 단축진료 시간 입력 */}
                {shortenedCount > 0 && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-500">단축진료 시간</label>
                    {[...dayMarks].filter(([, m]) => m === 'shortened').sort(([a], [b]) => a - b).map(([day]) => (
                      <div key={day} className="flex items-center gap-2">
                        <span className="text-sm font-medium text-amber-600 w-12">{day}일</span>
                        <input type="text" value={shortenedHours.get(day) || ''} onChange={e => { const m = new Map(shortenedHours); m.set(day, e.target.value); setShortenedHours(m); }} placeholder="예: 10:00~14:00" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400 bg-white" />
                      </div>
                    ))}
                  </div>
                )}
                {/* 휴가 사유 입력 */}
                {vacationCount > 0 && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-500">휴가 사유</label>
                    {[...dayMarks].filter(([, m]) => m === 'vacation').sort(([a], [b]) => a - b).map(([day]) => (
                      <div key={day} className="flex items-center gap-2">
                        <span className="text-sm font-medium text-purple-600 w-12">{day}일</span>
                        <input type="text" value={vacationReasons.get(day) || ''} onChange={e => { const m = new Map(vacationReasons); m.set(day, e.target.value); setVacationReasons(m); }} placeholder="예: 원장님 학회" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400 bg-white" />
                      </div>
                    ))}
                  </div>
                )}
                {/* 안내 문구 */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">안내 문구 (줄바꿈으로 구분)</label>
                  <textarea value={schNotices} onChange={e => setSchNotices(e.target.value)} placeholder={'진료시간: 평일 09:00~18:00\n점심시간: 13:00~14:00'} rows={3} className={`${inputCls} resize-none`} />
                </div>
              </div>
            )}

            {/* ══ event 전용 폼 (OLD parity) ══ */}
            {mode === 'template' && selectedTemplate === 'event' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">이벤트 제목</label>
                  <input type="text" value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="예: 임플란트 봄맞이 할인 이벤트" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">부제목 <span className="text-slate-400 font-normal">(선택)</span></label>
                  <input type="text" value={evSubtitle} onChange={e => setEvSubtitle(e.target.value)} placeholder="예: 봄맞이 특별 이벤트" className={inputCls} />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">이벤트 가격</label>
                    <input type="text" inputMode="numeric" value={evPriceRaw} onChange={e => setEvPriceRaw(e.target.value)} placeholder="300000" className={inputCls} />
                    {evPrice && <p className="text-xs text-blue-500 mt-0.5 font-medium">{evPrice}</p>}
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">정가 <span className="text-slate-400 font-normal">(취소선)</span></label>
                    <input type="text" inputMode="numeric" value={evOrigPriceRaw} onChange={e => setEvOrigPriceRaw(e.target.value)} placeholder="500000" className={inputCls} />
                    {evOrigPrice && <p className="text-xs text-slate-400 mt-0.5 line-through">{evOrigPrice}</p>}
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">할인율 <span className="text-slate-400 font-normal">(자동계산)</span></label>
                    <input type="text" value={evDiscount || autoDiscountPct} onChange={e => setEvDiscount(e.target.value)} placeholder={autoDiscountPct || '자동 계산됨'} className={inputCls} />
                    {autoDiscountPct && !evDiscount && <p className="text-xs text-emerald-500 mt-0.5 font-medium">자동: {autoDiscountPct}</p>}
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">이벤트 기간</label>
                    <input type="text" value={evPeriod} onChange={e => setEvPeriod(e.target.value)} placeholder="3/1 ~ 3/31" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">상세 설명 <span className="text-slate-400 font-normal">(선택)</span></label>
                  <textarea value={evDesc} onChange={e => setEvDesc(e.target.value)} placeholder={'임플란트+잇몸치료 패키지\n첫 방문 고객 한정'} rows={3} className={`${inputCls} resize-none`} />
                </div>
              </div>
            )}

            {/* ══ doctor 전용 폼 (OLD parity) ══ */}
            {mode === 'template' && selectedTemplate === 'doctor' && (
              <div className="space-y-3">
                <div className="flex gap-3 items-start">
                  {/* 의사 사진 업로드 */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <label className="block text-[11px] font-semibold text-slate-500">사진</label>
                    <label className="w-20 h-24 rounded-lg border-2 border-dashed border-slate-300 bg-white flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors overflow-hidden">
                      {docPhotoBase64 ? (
                        <img src={docPhotoBase64} alt="의사 사진" className="w-full h-full object-cover rounded-md" />
                      ) : (
                        <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      )}
                      <input ref={docPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleDocPhotoUpload} />
                    </label>
                    {docPhotoBase64 && <button type="button" onClick={() => setDocPhotoBase64(null)} className="text-[10px] text-red-400 hover:text-red-600">삭제</button>}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">의사 이름</label>
                      <input type="text" value={docName} onChange={e => setDocName(e.target.value)} placeholder="김철수" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">전문 분야</label>
                      <input type="text" value={docSpecialty} onChange={e => setDocSpecialty(e.target.value)} placeholder="치과보철과 전문의" className={inputCls} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">경력/학력 <span className="text-slate-400 font-normal">(줄바꿈으로 구분)</span></label>
                  <textarea value={docCareer} onChange={e => setDocCareer(e.target.value)} placeholder={'서울대학교 치의학대학원 졸업\n서울대치과병원 전공의\n대한치과보철학회 정회원'} rows={4} className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">인사말 <span className="text-slate-400 font-normal">(선택)</span></label>
                  <textarea value={docGreeting} onChange={e => setDocGreeting(e.target.value)} placeholder="환자분들의 건강한 삶을 위해 최선을 다하겠습니다." rows={2} className={`${inputCls} resize-none`} />
                </div>
              </div>
            )}

            {/* ══ notice 전용 폼 (OLD parity) ══ */}
            {mode === 'template' && selectedTemplate === 'notice' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">공지 제목</label>
                  <input type="text" value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)} placeholder="진료시간 변경 안내" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">공지 내용 <span className="text-slate-400 font-normal">(줄바꿈으로 구분)</span></label>
                  <textarea value={noticeContent} onChange={e => setNoticeContent(e.target.value)} placeholder={'평일 진료시간이 변경됩니다\n변경 전: 09:00~18:00\n변경 후: 09:00~19:00'} rows={5} className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">적용일 <span className="text-slate-400 font-normal">(선택)</span></label>
                  <input type="text" value={noticeDate} onChange={e => setNoticeDate(e.target.value)} placeholder="2026년 4월 1일부터" className={inputCls} />
                </div>
              </div>
            )}

            {/* ══ greeting 전용 폼 (OLD parity) ══ */}
            {mode === 'template' && selectedTemplate === 'greeting' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">명절 종류</label>
                  <div className="flex gap-1.5">
                    {(['설날', '추석', '새해', '어버이날', '크리스마스'] as const).map(h => (
                      <button key={h} type="button" onClick={() => {
                        setGreetHoliday(h);
                        const d = HOLIDAY_DEFAULTS[h];
                        if (d) { setGreetMsg(d.msg); setGreetClosure(d.closure); }
                      }} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${greetHoliday === h ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">인사말</label>
                  <textarea value={greetMsg} onChange={e => setGreetMsg(e.target.value)} placeholder={'풍성한 한가위 보내시고\n건강하고 행복한 추석 되세요'} rows={3} className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">휴진 기간 <span className="text-slate-400 font-normal">(선택)</span></label>
                  <input type="text" value={greetClosure} onChange={e => setGreetClosure(e.target.value)} placeholder="9/28(토) ~ 10/1(화)" className={inputCls} />
                </div>
              </div>
            )}

            {/* ══ hiring 전용 폼 (OLD parity) ══ */}
            {mode === 'template' && selectedTemplate === 'hiring' && (
              <div className="space-y-3">
                {/* 페이지 수 */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">페이지 수</label>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" onClick={() => {
                        setHiringPageCount(n);
                        setHiringPageData(prev => {
                          const data = [...prev];
                          while (data.length < n) data.push({ type: defaultPageTypes[data.length] || 'free', content: '' });
                          return data.slice(0, n);
                        });
                      }} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${hiringPageCount === n ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {n}장
                      </button>
                    ))}
                  </div>
                  {hiringPageCount > 1 && (
                    <p className="text-[10px] text-slate-400 mt-1">1장째 스타일 기준으로 나머지 페이지 톤이 통일됩니다</p>
                  )}
                </div>
                {/* 병원 사진 업로드 */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-600">병원 사진 <span className="text-slate-400 font-normal">(선택, 최대 5장)</span></label>
                    {hiringPhotos.length > 0 && <button type="button" onClick={() => setHiringPhotos([])} className="text-[10px] text-red-400 hover:text-red-600">전체 삭제</button>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {hiringPhotos.map((photo, i) => (
                      <div key={i} className="relative group">
                        <img src={photo} alt={`병원사진 ${i + 1}`} className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                        <button type="button" onClick={() => setHiringPhotos(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">x</button>
                      </div>
                    ))}
                    {hiringPhotos.length < 5 && (
                      <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        <span className="text-[8px] text-slate-400 mt-0.5">사진 추가</span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleHiringPhotoUpload} />
                      </label>
                    )}
                  </div>
                  <p className="text-[9px] text-slate-400">병원 외관, 내부, 장비 등 사진을 넣으면 AI가 디자인에 활용합니다</p>
                </div>
                {/* 페이지별 내용 */}
                {Array.from({ length: hiringPageCount }, (_, i) => {
                  const page = hiringPageData[i] || { type: 'free' as HiringPageType, content: '' };
                  const typeInfo = HIRING_PAGE_TYPES.find(t => t.id === page.type) || HIRING_PAGE_TYPES[5];
                  return (
                    <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600">{hiringPageCount > 1 ? `${i + 1}페이지` : '내용'}</span>
                        <div className="flex gap-1">
                          {HIRING_PAGE_TYPES.map(t => (
                            <button key={t.id} type="button" onClick={() => updatePageType(i, t.id)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${page.type === t.id ? 'bg-slate-700 text-white' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-200'}`}>
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        value={page.content}
                        onChange={e => updatePageContent(i, e.target.value)}
                        placeholder={typeInfo.placeholder}
                        rows={hiringPageCount === 1 ? 5 : 3}
                        className={`${inputCls} resize-none`}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* ══ caution 전용 폼 (OLD parity) ══ */}
            {mode === 'template' && selectedTemplate === 'caution' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">주의사항 유형</label>
                  <div className="flex gap-1.5">
                    {(['시술 후', '진료 후', '수술 후', '복약', '일반'] as const).map(t => (
                      <button key={t} type="button" onClick={() => handleCautionTypeChange(t)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${cautionType === t ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">제목 <span className="text-slate-400 font-normal">(자동 생성됨)</span></label>
                  <input type="text" value={cautionTitle} onChange={e => setCautionTitle(e.target.value)} placeholder={`${cautionType} 주의사항`} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">주의사항 항목 <span className="text-slate-400 font-normal">(줄바꿈으로 구분)</span></label>
                  <textarea value={cautionItems} onChange={e => setCautionItems(e.target.value)} placeholder={'시술 부위를 혀로 건드리지 마세요\n당일 음주 및 흡연은 피해주세요\n부기나 출혈은 2~3일 내 자연 소실됩니다\n딱딱한 음식은 일주일간 피해주세요'} rows={5} className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">응급 연락처 <span className="text-slate-400 font-normal">(선택)</span></label>
                  <input type="text" value={cautionEmergency} onChange={e => setCautionEmergency(e.target.value)} placeholder="이상 증상 시 연락: 02-1234-5678" className={inputCls} />
                </div>
              </div>
            )}

            {/* ══ pricing 전용 폼 (OLD parity) ══ */}
            {mode === 'template' && selectedTemplate === 'pricing' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">제목</label>
                  <input type="text" value={pricingTitle} onChange={e => setPricingTitle(e.target.value)} placeholder="비급여 진료비 안내" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">항목 <span className="text-slate-400 font-normal">(줄바꿈으로 구분, &quot;항목명: 가격&quot; 형식)</span></label>
                  <textarea value={pricingItems} onChange={e => setPricingItems(e.target.value)} placeholder={'임플란트 (1개): 1,200,000원\n레진 충전: 150,000원\n치아 미백: 300,000원\n교정 상담: 무료'} rows={6} className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">하단 안내 <span className="text-slate-400 font-normal">(선택)</span></label>
                  <input type="text" value={pricingNotice} onChange={e => setPricingNotice(e.target.value)} placeholder="상기 금액은 환자 상태에 따라 달라질 수 있습니다." className={inputCls} />
                </div>
              </div>
            )}

            {/* 프롬프트 (자유 입력 모드 — 카테고리 폼 대신 표시) */}
            {!hasFormMode && (<>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">이미지 설명</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="예: 임플란트 시술 과정 인포그래픽, 밝고 신뢰감 있는 치과 분위기..."
                rows={4} className={`${inputCls} resize-none`} disabled={generating} />
              <div className="text-right text-[10px] text-slate-400 mt-0.5">{prompt.length}자</div>
            </div>
            <PromptChat onApplyPrompt={(p) => setPrompt(p)} disabled={generating} />
            </>)}

            {/* ── 공통 영역 (OLD: 항상 표시) ── */}
            <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">추가 문구 <span className="text-slate-400 font-normal">(선택 — 하단 표시)</span></label>
                  <textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)} placeholder={'불편을 드려 죄송합니다.\n응급 시 ☎ 010-1234-5678'} rows={2} className={`${inputCls} resize-none`} />
                </div>
                <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                  <label className="block text-[11px] font-semibold text-indigo-700 mb-1">
                    추가 프롬프트 <span className="text-indigo-400 font-normal">(AI에게 자유롭게 지시)</span>
                  </label>
                  <textarea value={extraPrompt} onChange={e => setExtraPrompt(e.target.value)} placeholder={'예: 벚꽃 느낌으로 꾸며줘\n예: 하단에 전화번호 크게 넣어줘'} rows={2} className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm outline-none focus:border-indigo-400 resize-none bg-white placeholder:text-indigo-300" />
                </div>

                {/* 이미지 사이즈 (OLD 위치: 추가 프롬프트 아래, 내 스타일 위) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">이미지 사이즈</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {ASPECT_RATIOS.map((r) => (
                      <button key={r.value} type="button" onClick={() => setAspectRatio(r.value)} disabled={generating}
                        className={`py-2 px-1 rounded-xl text-center transition-all ${aspectRatio === r.value ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        <div className="text-sm leading-none">{r.icon}</div>
                        <div className="text-[10px] font-bold mt-1 leading-tight">{r.label}</div>
                        <div className={`text-[8px] mt-0.5 ${aspectRatio === r.value ? 'text-slate-300' : 'text-slate-400'}`}>{r.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 내 스타일 히스토리 (업로드 스타일 — 선택 시 내장 프리셋보다 우선) */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                    내 스타일 {styleHistory.length > 0 && <span className="text-slate-400 font-normal">({styleHistory.length}개)</span>}
                    {selectedUploadedStyle && <span className="text-violet-500 font-normal ml-1">(내장 프리셋보다 우선)</span>}
                  </label>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {/* 스타일 이미지 업로드 */}
                    <label className="relative flex-shrink-0 w-14 h-14 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 flex flex-col items-center justify-center cursor-pointer hover:border-violet-500 hover:bg-violet-100 transition-all">
                      <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      <span className="text-[7px] text-violet-500 font-bold mt-0.5">업로드</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleStyleUpload} />
                    </label>
                    {styleHistory.map(h => (
                      <button key={h.id} type="button" onClick={() => setSelectedUploadedStyle(selectedUploadedStyle?.id === h.id ? null : h)}
                        className={`relative flex-shrink-0 w-14 rounded-xl overflow-hidden border-2 transition-all group ${selectedUploadedStyle?.id === h.id ? 'border-violet-500 shadow-lg scale-105 ring-2 ring-violet-200' : 'border-slate-200 hover:border-slate-300'}`}>
                        <img src={h.thumbnailDataUrl} alt={h.name} className="w-14 h-14 object-cover" />
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
                          <div className="text-[7px] text-white font-medium truncate">{h.name}</div>
                        </div>
                        <span onClick={(e) => { e.stopPropagation(); deleteStyleItem(h.id); }} className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-500/80 text-white rounded-full text-[7px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">x</span>
                      </button>
                    ))}
                  </div>
                  {selectedUploadedStyle && (
                    <div className="mt-1.5 p-2 bg-violet-50 rounded-lg border border-violet-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-violet-700">업로드 스타일 적용 중: {selectedUploadedStyle.name}</span>
                        <button type="button" onClick={() => setSelectedUploadedStyle(null)} className="text-[10px] text-violet-400 hover:text-violet-600">해제</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* schedule 달력 테마 (OLD parity: "디자인 템플릿" 위치) */}
                {selectedTemplate === 'schedule' && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-bold text-slate-700">디자인 템플릿</label>
                      <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-0.5">
                        <button type="button" onClick={() => setTemplateAppMode('strict')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${templateAppMode === 'strict' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>그대로</button>
                        <button type="button" onClick={() => setTemplateAppMode('inspired')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${templateAppMode === 'inspired' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>참고</button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 -mt-1.5 mb-2">
                      {templateAppMode === 'strict' ? '📋 레이아웃·색상·구조를 그대로 복제 — 결과가 프리뷰와 거의 동일' : '🎨 분위기만 참고 — AI가 색상·배치·장식을 자유롭게 재해석'}
                    </p>
                    <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
                      {SCHEDULE_GROUPS.map(group => {
                        const groupThemes = CALENDAR_THEME_OPTIONS.filter(t => group.values.includes(t.value));
                        if (groupThemes.length === 0) return null;
                        return (
                          <div key={group.label}>
                            <div className="flex items-center gap-2 mb-2 px-1">
                              <span className="text-sm font-bold text-slate-700">{group.label}</span>
                              <span className="text-[10px] text-slate-400">{group.desc}</span>
                              <span className="text-[10px] text-slate-300 ml-auto">{groupThemes.length}종</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              {groupThemes.map(t => {
                                const isSelected = calendarTheme === t.value;
                                return (
                                  <button key={t.value} type="button" onClick={() => setCalendarTheme(t.value)}
                                    className={`group relative rounded-2xl overflow-hidden transition-all duration-200 ${isSelected ? 'shadow-xl ring-2 ring-offset-2' : 'shadow-sm hover:shadow-md border border-slate-200/80'}`}
                                    style={isSelected ? { '--tw-ring-color': t.groupColor } as React.CSSProperties : undefined}>
                                    <div className="relative" style={{ aspectRatio: '3/4' }}>
                                      <CalendarThemePreview themeValue={t.value} groupColor={t.groupColor} />
                                      {isSelected && (
                                        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: t.groupColor }}>
                                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                      )}
                                    </div>
                                    <div className="px-1.5 py-1.5 bg-white">
                                      <div className="font-bold text-[11px] text-slate-800 leading-tight truncate">{t.emoji} {t.label}</div>
                                      <div className="text-[9px] text-slate-500 mt-0.5 leading-tight truncate">{t.desc}</div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 카테고리별 디자인 템플릿 (schedule 제외) */}
                {selectedTemplate !== 'schedule' && currentCatTemplates.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-bold text-slate-700">
                        디자인 템플릿 {selectedUploadedStyle && <span className="text-violet-400 font-normal text-xs">(내 스타일 선택 시 무시됨)</span>}
                      </label>
                      <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-0.5">
                        <button type="button" onClick={() => setTemplateAppMode('strict')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${templateAppMode === 'strict' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          title="선택한 템플릿의 레이아웃·색상·구조를 그대로 복제합니다">그대로</button>
                        <button type="button" onClick={() => setTemplateAppMode('inspired')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${templateAppMode === 'inspired' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          title="템플릿의 분위기를 참고하되 AI가 자유롭게 재해석합니다">참고</button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 -mt-1.5 mb-2">
                      {templateAppMode === 'strict' ? '📋 레이아웃·색상·구조를 그대로 복제 — 결과가 프리뷰와 거의 동일' : '🎨 분위기만 참고 — AI가 색상·배치·장식을 자유롭게 재해석'}
                    </p>
                    <div className={`grid grid-cols-3 gap-2 max-h-[320px] overflow-y-auto pr-1 ${selectedUploadedStyle ? 'opacity-40 pointer-events-none' : ''}`}>
                      {currentCatTemplates.map(tmpl => {
                        const isSelected = !selectedUploadedStyle && selectedCatTemplate?.id === tmpl.id;
                        return (
                          <button key={tmpl.id} type="button"
                            onClick={() => { setSelectedCatTemplate(isSelected ? null : tmpl); setSelectedUploadedStyle(null); }}
                            className={`group relative rounded-2xl overflow-hidden transition-all duration-200 ${
                              isSelected
                                ? 'shadow-xl ring-2 ring-offset-2'
                                : 'shadow-sm hover:shadow-md border border-slate-200/80'
                            }`}
                            style={isSelected ? { '--tw-ring-color': tmpl.color } as React.CSSProperties : undefined}
                          >
                            {/* OLD parity: TemplateSVGPreview로 카테고리별 레이아웃 프리뷰 */}
                            <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/4', background: tmpl.previewImage ? '#f8fafc' : `linear-gradient(160deg, ${tmpl.bg} 0%, white 80%)` }}>
                              <TemplateSVGPreview template={tmpl} category={selectedTemplate || 'event'} hospitalName={hospitalName || 'OO병원'} />
                              {/* 스타일 태그 뱃지 */}
                              <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold shadow-sm" style={{ backgroundColor: tmpl.color, color: 'white' }}>
                                {tmpl.layoutHint === 'price' || tmpl.layoutHint === 'table' ? '가격형'
                                  : tmpl.layoutHint === 'elegant' || tmpl.layoutHint === 'luxury' ? '프리미엄'
                                  : tmpl.layoutHint === 'pop' || tmpl.layoutHint === 'cute' ? '활기찬'
                                  : tmpl.layoutHint === 'minimal' ? '미니멀'
                                  : tmpl.layoutHint === 'wave' || tmpl.layoutHint === 'gradient' ? '그라데이션'
                                  : tmpl.layoutHint === 'season' || tmpl.layoutHint === 'nature' ? '시즌'
                                  : tmpl.layoutHint === 'split' || tmpl.layoutHint === 'grid' ? '분할형'
                                  : tmpl.layoutHint === 'portrait' || tmpl.layoutHint === 'curve' ? '프로필'
                                  : tmpl.layoutHint === 'story' ? '스토리'
                                  : tmpl.layoutHint === 'alert' || tmpl.layoutHint === 'warning' ? '경고형'
                                  : tmpl.layoutHint === 'formal' ? '공문형'
                                  : tmpl.layoutHint === 'timeline' ? '타임라인'
                                  : tmpl.layoutHint === 'traditional' || tmpl.layoutHint === 'warm' ? '전통'
                                  : tmpl.layoutHint === 'corporate' ? '기업형'
                                  : tmpl.layoutHint === 'team' ? '팀워크'
                                  : tmpl.layoutHint === 'modern' ? '모던'
                                  : tmpl.layoutHint === 'checklist' ? '체크리스트'
                                  : tmpl.layoutHint === 'infographic' ? '인포'
                                  : tmpl.layoutHint === 'card' || tmpl.layoutHint === 'cards' ? '카드형'
                                  : tmpl.layoutHint === 'dark' ? '다크'
                                  : '스타일'}
                              </div>
                              {/* 선택 체크 */}
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: tmpl.color }}>
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                </div>
                              )}
                            </div>
                            {/* 카드 하단 name/desc */}
                            <div className="px-1.5 py-1.5 bg-white">
                              <div className="font-bold text-[10px] text-slate-800 leading-tight truncate">{tmpl.name}</div>
                              <div className="text-[8px] text-slate-500 mt-0.5 leading-tight truncate">{tmpl.desc}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {selectedCatTemplate && !selectedUploadedStyle && (
                      <div className="mt-1.5 p-2 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-blue-700">템플릿: {selectedCatTemplate.name}</span>
                          <button type="button" onClick={() => setSelectedCatTemplate(null)} className="text-[10px] text-blue-400 hover:text-blue-600">해제</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

            </div>

            {/* 생성 버튼 (OLD style: violet→indigo→blue) */}
            <button
              onClick={handleGenerate}
              disabled={generating || (!hasFormMode && !prompt.trim())}
              className={`w-full py-4 rounded-2xl text-white font-bold text-base transition-all duration-200 ${
                generating || (!hasFormMode && !prompt.trim())
                  ? 'bg-slate-400 cursor-not-allowed shadow-md'
                  : 'bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:via-indigo-700 hover:to-blue-700 active:scale-[0.97] shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40'
              }`}
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  AI 디자인 생성 중...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                  AI 디자인 생성
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 우측: 결과 영역 (OLD parity) */}
      <div ref={resultAreaRef} className="flex flex-col min-h-[480px] lg:flex-1 min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* 상단 툴바 (OLD parity: 장식 B/I/U + 정렬) */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200/80 bg-white">
          <div className="flex items-center gap-1">
            {(['B', 'I', 'U'] as const).map(btn => (
              <div key={btn} className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-slate-300 select-none">{btn}</div>
            ))}
          </div>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-1">
            {[
              <path key="a1" strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />,
              <path key="a2" strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h10.5m-10.5 5.25h16.5" />,
            ].map((icon, i) => (
              <div key={i} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>{icon}</svg>
              </div>
            ))}
          </div>
        </div>
        {/* 콘텐츠 영역 */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 w-full max-w-lg">{error}</div>}
        {generating ? (
          /* OLD-style 로딩: 이중 스피너 + 단계 메시지 + 진행 도트 */
          <div className="flex flex-col items-center justify-center gap-6 animate-fade-in">
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 rounded-full border-4 border-violet-100" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
              <div className="absolute inset-3 rounded-full border-4 border-transparent border-t-indigo-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl animate-pulse">{['🎨', '✨', '🖌️', '💫'][generatingStep % 4]}</span>
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-base font-bold text-slate-700">
                {['AI가 디자인 구상 중...', '레이아웃 배치하는 중...', '색감 입히는 중...', '마무리 터치 중...', '거의 다 됐어요!'][Math.min(generatingStep, 4)]}
              </p>
              <p className="text-xs text-slate-400">보통 10~30초 정도 걸려요</p>
              <div className="flex justify-center gap-1 mt-3">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-all duration-500 ${i <= generatingStep ? 'bg-violet-500 scale-110' : 'bg-slate-200'}`} />
                ))}
              </div>
            </div>
          </div>
        ) : resultImages.length > 0 ? (
          /* 결과 표시 (OLD parity: 다중 페이지 + 버튼 그룹 + 재생성 + 편집) */
          <div className="space-y-4 w-full flex flex-col items-center">
            {/* 다중 페이지 네비게이션 (OLD parity) */}
            {resultImages.length > 1 && (
              <div className="flex items-center gap-3">
                <button onClick={() => setCurrentPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0} className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 disabled:opacity-30 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex gap-1.5">
                  {resultImages.map((_, i) => (
                    <button key={i} onClick={() => setCurrentPage(i)} className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${currentPage === i ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{i + 1}</button>
                  ))}
                </div>
                <button onClick={() => setCurrentPage(Math.min(resultImages.length - 1, currentPage + 1))} disabled={currentPage === resultImages.length - 1} className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 disabled:opacity-30 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
            <img src={resultImages[currentPage]} alt={`생성된 이미지 ${currentPage + 1}`} className="max-w-full max-h-[65vh] rounded-2xl shadow-2xl" draggable={false} />
            {/* 버튼 그룹 (OLD parity) */}
            <div className="flex gap-3 flex-wrap justify-center">
              <button onClick={() => handleDownload(currentPage)} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors shadow-lg">
                {resultImages.length > 1 ? `${currentPage + 1}장 다운로드` : '다운로드'}
              </button>
              {resultImages.length > 1 && (
                <button onClick={() => handleDownload()} className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-colors">전체 다운로드</button>
              )}
              {/* 다시 생성 드롭다운 (OLD parity) */}
              <div className="relative">
                <button onClick={() => setShowRegenMenu(!showRegenMenu)} disabled={generating}
                  className="px-6 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-colors flex items-center gap-1.5">
                  다시 생성
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showRegenMenu && (
                  <div className="absolute bottom-full mb-2 right-0 w-56 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-10">
                    <button onClick={() => { setShowRegenMenu(false); handleGenerate(); }}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2">
                      <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      <div><div className="font-bold text-slate-700">자동 재생성</div><div className="text-xs text-slate-400">같은 설정으로 새로 생성</div></div>
                    </button>
                    <div className="border-t border-slate-100" />
                    <button onClick={() => { setShowRegenMenu(false); setShowRegenPromptInput(true); setRegenPrompt(''); }}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      <div><div className="font-bold text-slate-700">수정 후 재생성</div><div className="text-xs text-slate-400">변경 사항을 프롬프트로 지시</div></div>
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* 수정 프롬프트 입력 (OLD parity) */}
            {showRegenPromptInput && (
              <div className="w-full max-w-lg space-y-2 mt-2">
                <textarea value={regenPrompt} onChange={e => setRegenPrompt(e.target.value)}
                  placeholder="예: 배경색을 좀 더 따뜻하게, 글씨 크기를 키워줘, 여백을 줄여줘..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 resize-none bg-white" rows={3} autoFocus />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowRegenPromptInput(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors">취소</button>
                  <button onClick={() => { setShowRegenPromptInput(false); setExtraPrompt(prev => prev ? prev + '\n' + regenPrompt : regenPrompt); handleGenerate(); }}
                    disabled={!regenPrompt.trim()} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-lg text-sm font-bold transition-colors">수정 반영 재생성</button>
                </div>
              </div>
            )}
            {/* AI 이미지 편집 도구 (OLD parity: 접이식) */}
            <div className="w-full max-w-lg mt-4">
              <details className="group">
                <summary className="cursor-pointer flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors select-none">
                  <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  AI 이미지 편집 도구
                  <svg className="w-3 h-3 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1.5">스타일 변환</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: '플랫 일러스트', icon: '🎨', prompt: '플랫 일러스트 스타일로 변환' },
                        { label: '3D 클레이', icon: '🧱', prompt: '3D 클레이 스타일로 변환' },
                        { label: '수채화', icon: '🖌️', prompt: '수채화 스타일로 변환' },
                        { label: '미니멀', icon: '◻️', prompt: '미니멀 스타일로 변환' },
                        { label: '포토리얼', icon: '📷', prompt: '포토리얼리스틱 스타일로 변환' },
                        { label: '애니/만화', icon: '✨', prompt: '애니메이션/만화 스타일로 변환' },
                      ].map(s => (
                        <button key={s.label} disabled={generating}
                          onClick={() => { setExtraPrompt(s.prompt); handleGenerate(); }}
                          className="px-2 py-2 bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-300 rounded-lg text-xs font-medium text-slate-600 hover:text-violet-700 transition-all disabled:opacity-40">
                          {s.icon} {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1.5">AI 자유 편집</div>
                    <div className="flex gap-2">
                      <input type="text" placeholder="예: 배경을 파란색으로, 텍스트 색상 변경..."
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-violet-400"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !generating) {
                            setExtraPrompt(e.currentTarget.value);
                            handleGenerate();
                          }
                        }} />
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </div>
        ) : (
          /* 대기 상태 (OLD parity: 단순한 빈 상태) */
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
            <p className="text-sm text-slate-400">왼쪽에서 설정 후 생성 버튼을 눌러주세요</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
