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

type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3';
type DayMark = 'closed' | 'shortened' | 'vacation';
type ScheduleLayout = 'full_calendar' | 'week' | 'highlight';

const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: string }[] = [
  { value: '1:1', label: '정사각형', icon: '⬜' },
  { value: '16:9', label: '가로형', icon: '🖥️' },
  { value: '9:16', label: '세로형', icon: '📱' },
  { value: '4:3', label: '4:3', icon: '🖼️' },
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
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 로고 관련
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [hospitalName, setHospitalName] = useState('');
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [logoPosition, setLogoPosition] = useState<'top' | 'bottom'>('bottom');
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  // ── schedule/event 전용 프롬프트 빌더 ──
  const buildSchedulePrompt = useCallback((): string => {
    const title = schTitle || `${schMonth}월 휴진 안내`;
    const closedDays = [...dayMarks].filter(([, m]) => m === 'closed').map(([d]) => d).sort((a, b) => a - b);
    const shortened = [...dayMarks].filter(([, m]) => m === 'shortened').map(([d]) => `${d}일(${shortenedHours.get(d) || '단축진료'})`).sort();
    const vacations = [...dayMarks].filter(([, m]) => m === 'vacation').map(([d]) => `${d}일(${vacationReasons.get(d) || '휴가'})`).sort();
    const noticeLines = schNotices.split('\n').filter(Boolean);
    const layoutLabel = schLayout === 'full_calendar' ? '전체 달력(월간 캘린더)' : schLayout === 'week' ? '한 주(주간 캘린더)' : '강조형(날짜 강조)';

    let p = `${schYear}년 ${schMonth}월 병원 진료 일정 안내 포스터.\n제목: "${title}"\n레이아웃: ${layoutLabel} 스타일.\n`;
    if (closedDays.length > 0) p += `휴진일: ${closedDays.map(d => `${d}일`).join(', ')} — 빨간색으로 눈에 띄게 표시.\n`;
    if (shortened.length > 0) p += `단축진료: ${shortened.join(', ')} — 주황색으로 표시.\n`;
    if (vacations.length > 0) p += `휴가: ${vacations.join(', ')} — 보라색으로 표시.\n`;
    if (noticeLines.length > 0) p += `안내 문구: ${noticeLines.join(' / ')}\n`;
    p += '깔끔하고 전문적인 의료 디자인, 한국어 텍스트, 모바일에서도 읽기 쉬운 크기.';
    if (customMessage) p += `\n추가 문구: "${customMessage}"`;
    if (extraPrompt) p += `\n${extraPrompt}`;
    return p;
  }, [schYear, schMonth, schTitle, schLayout, dayMarks, shortenedHours, vacationReasons, schNotices, customMessage, extraPrompt]);

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

  // 전용 폼 모드 여부 (렌더용)
  const hasFormMode = mode === 'template' && (selectedTemplate === 'schedule' || selectedTemplate === 'event' || selectedTemplate === 'doctor' || selectedTemplate === 'notice');

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
    } catch { /* ignore */ }
  }, []);

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
    const hasForm = isScheduleMode || isEventMode || isDoctorMode || isNoticeMode;
    const effectivePrompt = isScheduleMode ? buildSchedulePrompt()
      : isEventMode ? buildEventPrompt()
      : isDoctorMode ? buildDoctorPrompt()
      : isNoticeMode ? buildNoticePrompt()
      : prompt.trim();

    if (!effectivePrompt || generating) return;

    setGenerating(true);
    setError(null);
    setResult(null);
    setProgress('이미지 생성 중...');

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
          referenceImage: isDoctorMode && docPhotoBase64 ? docPhotoBase64 : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `서버 오류 (${res.status})`);
      }

      if (data.imageDataUrl) {
        setResult(data.imageDataUrl);
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
      setGenerating(false);
    }
  }, [prompt, aspectRatio, generating, logoEnabled, logoDataUrl, hospitalName, logoPosition, clinicPhone, clinicHours, clinicAddress, brandColor, brandAccent, detectCalendar, getKoreanHolidays2, generateCalendarImage, mode, selectedTemplate, buildSchedulePrompt, buildEventPrompt, buildDoctorPrompt, buildNoticePrompt, schYear, schMonth, docPhotoBase64]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = result;
    link.download = `hospital-image-${Date.now()}.png`;
    link.click();
  }, [result]);

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start w-full">
      {/* 좌측: 입력 폼 */}
      <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
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
                        // 전용 폼 카테고리는 placeholder 주입 안 함
                        if (newSel && newSel !== 'schedule' && newSel !== 'event' && newSel !== 'doctor' && newSel !== 'notice') setPrompt(cat.placeholder);
                      }}
                      className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border transition-all text-center ${
                        selectedTemplate === cat.id
                          ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}>
                      <span className="text-lg">{cat.icon}</span>
                      <span className="text-[10px] font-semibold leading-tight">{cat.name}</span>
                      <span className="text-[8px] text-slate-400 leading-tight">{cat.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

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

            {/* ── 공통: 추가 문구 + 추가 프롬프트 (전용 폼 모드) ── */}
            {mode === 'template' && (selectedTemplate === 'schedule' || selectedTemplate === 'event' || selectedTemplate === 'doctor' || selectedTemplate === 'notice') && (
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
              </div>
            )}

            {/* 프롬프트 (전용 폼이 아닌 경우에만 표시) */}
            {!(mode === 'template' && (selectedTemplate === 'schedule' || selectedTemplate === 'event' || selectedTemplate === 'doctor' || selectedTemplate === 'notice')) && (<>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">이미지 설명</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="예: 임플란트 시술 과정 인포그래픽, 밝고 신뢰감 있는 치과 분위기..."
                rows={4}
                className={`${inputCls} resize-none`}
                disabled={generating}
              />
              <div className="text-right text-[10px] text-slate-400 mt-0.5">
                {prompt.length}자
              </div>
            </div>

            {/* AI 프롬프트 채팅 (OLD parity: PromptGenerator) */}
            <PromptChat onApplyPrompt={(p) => setPrompt(p)} disabled={generating} />
            </>)}

            {/* 비율 선택 */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">이미지 비율</label>
              <div className="flex gap-1.5">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setAspectRatio(r.value)}
                    disabled={generating}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                      aspectRatio === r.value
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span>{r.icon}</span>
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 로고 설정 */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600">병원 로고</label>
                <button
                  onClick={() => setLogoEnabled(!logoEnabled)}
                  className={`relative rounded-full transition-colors ${logoEnabled && logoDataUrl ? 'bg-blue-500' : 'bg-slate-300'}`}
                  style={{ width: 36, height: 20 }}
                >
                  <span className={`absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full shadow transition-transform ${logoEnabled && logoDataUrl ? 'translate-x-[16px]' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {logoDataUrl ? (
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                      <img src={logoDataUrl} alt="로고" className="max-w-full max-h-full object-contain" />
                    </div>
                    <button onClick={removeLogo} className="text-[11px] text-red-500 hover:text-red-700">삭제</button>
                  </div>
                ) : (
                  <button onClick={() => logoInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-all bg-white"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    로고 업로드
                  </button>
                )}
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </div>

              {logoDataUrl && (
                <div className="flex gap-2">
                  <input type="text" value={hospitalName} onChange={(e) => handleHospitalNameChange(e.target.value)} placeholder="병원명 (선택)" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white" />
                  <div className="flex bg-white rounded-lg p-0.5 border border-slate-200">
                    <button type="button" onClick={() => setLogoPosition('top')} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${logoPosition === 'top' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500'}`}>상단</button>
                    <button type="button" onClick={() => setLogoPosition('bottom')} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${logoPosition === 'bottom' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500'}`}>하단</button>
                  </div>
                </div>
              )}
            </div>

            {/* 상세 설정 토글 */}
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-500 transition-all border border-slate-100">
              <span>상세 설정</span>
              <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>

            {showAdvanced && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <input type="text" value={clinicPhone} onChange={e => setClinicPhone(e.target.value)} onBlur={saveHospitalInfo} placeholder="전화번호: 02-1234-5678" className={inputCls} />
                <input type="text" value={clinicHours} onChange={e => setClinicHours(e.target.value)} onBlur={saveHospitalInfo} placeholder="진료시간: 평일 09:00~18:00" className={inputCls} />
                <input type="text" value={clinicAddress} onChange={e => setClinicAddress(e.target.value)} onBlur={saveHospitalInfo} placeholder="주소: 서울시 강남구 테헤란로 123" className={inputCls} />
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-1.5">
                    <label className="text-[10px] text-slate-500 whitespace-nowrap">메인</label>
                    <input type="color" value={brandColor || '#4F46E5'} onChange={e => setBrandColor(e.target.value)} onBlur={saveHospitalInfo} className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0.5" />
                    <input type="text" value={brandColor} onChange={e => setBrandColor(e.target.value)} onBlur={saveHospitalInfo} placeholder="#4F46E5" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-mono outline-none focus:border-blue-400 bg-white" />
                  </div>
                  <div className="flex-1 flex items-center gap-1.5">
                    <label className="text-[10px] text-slate-500 whitespace-nowrap">포인트</label>
                    <input type="color" value={brandAccent || '#F59E0B'} onChange={e => setBrandAccent(e.target.value)} onBlur={saveHospitalInfo} className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0.5" />
                    <input type="text" value={brandAccent} onChange={e => setBrandAccent(e.target.value)} onBlur={saveHospitalInfo} placeholder="#F59E0B" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-mono outline-none focus:border-blue-400 bg-white" />
                  </div>
                </div>
                {(brandColor || brandAccent) && (
                  <div className="flex gap-2 items-center">
                    <div className="h-3 flex-1 rounded-md" style={{ background: `linear-gradient(135deg, ${brandColor || '#4F46E5'}, ${brandAccent || '#F59E0B'})` }} />
                    <button type="button" onClick={() => { setBrandColor(''); setBrandAccent(''); saveHospitalInfo(); }} className="text-[10px] text-slate-400 hover:text-red-500">초기화</button>
                  </div>
                )}
              </div>
            )}

            {/* 생성 버튼 */}
            <button
              onClick={handleGenerate}
              disabled={generating || (!hasFormMode && !prompt.trim())}
              className={`w-full py-3 rounded-xl text-white font-semibold text-sm transition-all ${
                generating || (!hasFormMode && !prompt.trim())
                  ? 'bg-slate-200 cursor-not-allowed text-slate-400'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25'
              }`}
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {progress || '생성 중...'}
                </span>
              ) : '이미지 생성하기'}
            </button>
          </div>
        </div>
      </div>

      {/* 우측: 결과 영역 */}
      <div className="flex flex-col min-h-[480px] lg:flex-1 min-w-0">
        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <span className="text-red-400 text-lg mt-0.5">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-red-700 mb-1">이미지 생성 실패</p>
                <p className="text-sm text-red-600">{error}</p>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim()}
                  className="mt-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-medium transition-all"
                >
                  다시 시도
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 로딩 */}
        {generating ? (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex-1 min-h-[480px] flex flex-col items-center justify-center">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
              <div className="absolute inset-3 rounded-full border-4 border-transparent border-t-teal-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl animate-pulse">🎨</span>
              </div>
            </div>
            <p className="text-base font-bold text-gray-700 mb-1">{progress || 'AI가 이미지 만드는 중...'}</p>
            <p className="text-xs text-gray-400">최대 2분 정도 걸릴 수 있습니다</p>
            <div className="flex gap-1.5 mt-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : result ? (
          /* 결과 표시 */
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-4">
              <img
                src={result}
                alt="생성된 이미지"
                className="w-full h-auto rounded-lg"
                style={{ imageRendering: 'auto' }}
                draggable={false}
              />
            </div>
            <div className="flex gap-3 p-4 pt-0">
              <button
                onClick={handleDownload}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md"
              >
                다운로드
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-all"
              >
                다시 생성
              </button>
            </div>
          </div>
        ) : (
          /* 대기 상태 */
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex-1 min-h-[480px] flex flex-col items-center justify-center text-center p-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
              <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
            <div className="max-w-sm">
              <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
                AI가 만드는<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600 underline decoration-emerald-200 underline-offset-4">
                  의료 이미지
                </span>
              </h2>
              <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                프롬프트 하나로 병원 SNS, 안내물,<br />인포그래픽을 자동 생성합니다
              </p>
            </div>
            <div className="space-y-3 text-left max-w-xs">
              {[
                '자유 프롬프트 이미지 생성',
                '병원 로고 자동 배치',
                '브랜드 컬러 반영',
              ].map((text, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-emerald-500 text-sm">✦</span>
                  <span className="text-sm text-slate-500">{text}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-50 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-slate-500">AI 대기 중</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
