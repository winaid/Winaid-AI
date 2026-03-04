import React, { useState, useEffect } from 'react';
import {
  buildCalendarHTML,
  renderCalendarToImage,
  type CalendarData,
  type ClosedDay,
  type ShortenedDay,
  type VacationDay,
} from '../services/calendarTemplateService';

// ── 날짜 마킹 타입 ──
type DayMark = 'closed' | 'shortened' | 'vacation';

// ── 스타일 프리셋 ──
const STYLE_PRESETS = [
  { id: 'blue', name: '클린 블루', color: '#2563eb', accent: '#1d4ed8', desc: '전문적·신뢰감' },
  { id: 'green', name: '프레시 그린', color: '#16a34a', accent: '#15803d', desc: '건강·자연' },
  { id: 'pink', name: '소프트 핑크', color: '#db2777', accent: '#be185d', desc: '따뜻한·부드러운' },
  { id: 'purple', name: '모던 퍼플', color: '#7c3aed', accent: '#6d28d9', desc: '세련된·트렌디' },
] as const;

type ColorTheme = typeof STYLE_PRESETS[number]['id'];

export default function TemplateGenerator() {
  const now = new Date();

  // ── 폼 상태 ──
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [hospitalName, setHospitalName] = useState('');
  const [title, setTitle] = useState('');
  const [notices, setNotices] = useState('');
  const [colorTheme, setColorTheme] = useState<ColorTheme>('blue');
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  // 날짜 마킹: Map<day, mark>
  const [dayMarks, setDayMarks] = useState<Map<number, DayMark>>(new Map());
  // 단축진료 시간
  const [shortenedHours, setShortenedHours] = useState<Map<number, string>>(new Map());
  // 휴가 사유
  const [vacationReasons, setVacationReasons] = useState<Map<number, string>>(new Map());

  // 현재 마킹 모드
  const [markMode, setMarkMode] = useState<DayMark>('closed');

  // 결과
  const [generating, setGenerating] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // localStorage에서 로고 로드
  useEffect(() => {
    const saved = localStorage.getItem('uploaded_logo');
    if (saved) setLogoBase64(saved);
  }, []);

  // 월 변경 시 마킹 초기화
  useEffect(() => {
    setDayMarks(new Map());
    setShortenedHours(new Map());
    setVacationReasons(new Map());
    setResultImage(null);
  }, [month, year]);

  // ── 달력 그리드 데이터 ──
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = new Array(firstDay).fill(null);
  for (let d = 1; d <= lastDate; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  // 공휴일
  const holidays = getFixedHolidays(month);

  // ── 날짜 클릭 핸들러 ──
  const handleDayClick = (day: number) => {
    const newMarks = new Map(dayMarks);
    const current = newMarks.get(day);

    if (current === markMode) {
      // 같은 모드로 다시 클릭 → 해제
      newMarks.delete(day);
      const newSH = new Map(shortenedHours); newSH.delete(day); setShortenedHours(newSH);
      const newVR = new Map(vacationReasons); newVR.delete(day); setVacationReasons(newVR);
    } else {
      newMarks.set(day, markMode);
    }
    setDayMarks(newMarks);
  };

  // ── 로고 업로드 ──
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setLogoBase64(base64);
      localStorage.setItem('uploaded_logo', base64);
    };
    reader.readAsDataURL(file);
  };

  // ── 이미지 생성 ──
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const closedDays: ClosedDay[] = [];
      const shortened: ShortenedDay[] = [];
      const vacation: VacationDay[] = [];

      dayMarks.forEach((mark, day) => {
        if (mark === 'closed') closedDays.push({ day });
        else if (mark === 'shortened') shortened.push({ day, hours: shortenedHours.get(day) });
        else if (mark === 'vacation') vacation.push({ day, reason: vacationReasons.get(day) });
      });

      const data: CalendarData = {
        month,
        year,
        title: title || `${month}월 휴진 안내`,
        closedDays,
        shortenedDays: shortened.length > 0 ? shortened : undefined,
        vacationDays: vacation.length > 0 ? vacation : undefined,
        hospitalName: hospitalName || undefined,
        notices: notices.split('\n').filter(Boolean),
        colorTheme,
        logoBase64: logoBase64 || undefined,
      };

      const html = buildCalendarHTML(data);
      const imageDataUrl = await renderCalendarToImage(html);
      setResultImage(imageDataUrl);
    } catch (err: any) {
      setError(err.message || '이미지 생성에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  // ── 다운로드 ──
  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `${hospitalName || '병원'}_${month}월_진료안내.png`;
    link.click();
  };

  // ── 마킹된 날짜 요약 ──
  const closedCount = [...dayMarks.values()].filter(v => v === 'closed').length;
  const shortenedCount = [...dayMarks.values()].filter(v => v === 'shortened').length;
  const vacationCount = [...dayMarks.values()].filter(v => v === 'vacation').length;

  return (
    <div className="h-full flex gap-6 overflow-hidden">
      {/* ── 왼쪽: 입력 폼 ── */}
      <div className="w-[420px] flex-shrink-0 overflow-y-auto space-y-5 pr-2">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span className="text-2xl">📋</span> 진료 일정 템플릿
        </h2>

        {/* 기본 정보 */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">연도</label>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              >
                {[now.getFullYear(), now.getFullYear() + 1].map(y => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">월</label>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">병원명</label>
            <input
              type="text"
              value={hospitalName}
              onChange={e => setHospitalName(e.target.value)}
              placeholder="예: 서울바른정형외과"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">제목</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`${month}월 휴진 안내`}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* 마킹 모드 선택 */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">날짜 마킹 모드 (선택 후 달력 클릭)</label>
          <div className="flex gap-2">
            {([
              { mode: 'closed' as DayMark, label: '휴진', color: 'bg-red-500', ring: 'ring-red-300' },
              { mode: 'shortened' as DayMark, label: '단축', color: 'bg-amber-500', ring: 'ring-amber-300' },
              { mode: 'vacation' as DayMark, label: '휴가', color: 'bg-purple-500', ring: 'ring-purple-300' },
            ]).map(({ mode, label, color, ring }) => (
              <button
                key={mode}
                onClick={() => setMarkMode(mode)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all ${
                  markMode === mode
                    ? `${color} text-white ring-2 ${ring} shadow-md`
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 달력 그리드 (클릭 선택) */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 text-center text-sm font-bold text-slate-700">
            {year}년 {month}월 — 날짜를 클릭하세요
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                  <th key={d} className={`py-2 text-xs font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-500'}`}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, wi) => (
                <tr key={wi}>
                  {w.map((d, di) => {
                    if (d === null) return <td key={di} className="p-1" />;
                    const mark = dayMarks.get(d);
                    const isHoliday = holidays.has(d);
                    const isSunday = di === 0;
                    const isSaturday = di === 6;

                    let cellBg = 'bg-white hover:bg-slate-50';
                    let cellText = 'text-slate-700';
                    let badge = '';

                    if (mark === 'closed') {
                      cellBg = 'bg-red-50 ring-1 ring-red-300';
                      cellText = 'text-red-600 font-bold';
                      badge = '휴진';
                    } else if (mark === 'shortened') {
                      cellBg = 'bg-amber-50 ring-1 ring-amber-300';
                      cellText = 'text-amber-600 font-bold';
                      badge = '단축';
                    } else if (mark === 'vacation') {
                      cellBg = 'bg-purple-50 ring-1 ring-purple-300';
                      cellText = 'text-purple-600 font-bold';
                      badge = '휴가';
                    } else if (isSunday || isHoliday) {
                      cellText = 'text-red-500';
                    } else if (isSaturday) {
                      cellText = 'text-blue-500';
                    }

                    return (
                      <td key={di} className="p-1">
                        <button
                          onClick={() => handleDayClick(d)}
                          className={`w-full rounded-lg py-1.5 text-center cursor-pointer transition-all ${cellBg} ${cellText}`}
                        >
                          <div className="text-sm">{d}</div>
                          {badge && <div className="text-[9px] font-bold -mt-0.5">{badge}</div>}
                          {isHoliday && !badge && <div className="text-[9px] text-red-400">{holidays.get(d)}</div>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 선택 요약 */}
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
            <label className="block text-xs font-semibold text-slate-600">단축진료 시간</label>
            {[...dayMarks].filter(([, m]) => m === 'shortened').sort(([a], [b]) => a - b).map(([day]) => (
              <div key={day} className="flex items-center gap-2">
                <span className="text-sm font-medium text-amber-600 w-12">{day}일</span>
                <input
                  type="text"
                  value={shortenedHours.get(day) || ''}
                  onChange={e => {
                    const newMap = new Map(shortenedHours);
                    newMap.set(day, e.target.value);
                    setShortenedHours(newMap);
                  }}
                  placeholder="예: 10:00~14:00"
                  className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-amber-400"
                />
              </div>
            ))}
          </div>
        )}

        {/* 휴가 사유 입력 */}
        {vacationCount > 0 && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600">휴가 사유</label>
            {[...dayMarks].filter(([, m]) => m === 'vacation').sort(([a], [b]) => a - b).map(([day]) => (
              <div key={day} className="flex items-center gap-2">
                <span className="text-sm font-medium text-purple-600 w-12">{day}일</span>
                <input
                  type="text"
                  value={vacationReasons.get(day) || ''}
                  onChange={e => {
                    const newMap = new Map(vacationReasons);
                    newMap.set(day, e.target.value);
                    setVacationReasons(newMap);
                  }}
                  placeholder="예: 원장님 학회"
                  className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-purple-400"
                />
              </div>
            ))}
          </div>
        )}

        {/* 안내 문구 */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">안내 문구 (줄바꿈으로 구분)</label>
          <textarea
            value={notices}
            onChange={e => setNotices(e.target.value)}
            placeholder={"진료시간: 평일 09:00~18:00\n점심시간: 13:00~14:00\n토요일: 09:00~13:00"}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none"
          />
        </div>

        {/* 로고 업로드 */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">로고 (선택)</label>
          <div className="flex items-center gap-3">
            {logoBase64 && (
              <img src={logoBase64} alt="로고" className="h-8 object-contain" />
            )}
            <label className="cursor-pointer px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-600 transition-colors">
              {logoBase64 ? '변경' : '업로드'}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </label>
            {logoBase64 && (
              <button
                onClick={() => { setLogoBase64(null); localStorage.removeItem('uploaded_logo'); }}
                className="text-xs text-red-400 hover:text-red-600"
              >
                삭제
              </button>
            )}
          </div>
        </div>

        {/* 스타일 프리셋 */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">스타일</label>
          <div className="grid grid-cols-2 gap-2">
            {STYLE_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => setColorTheme(preset.id)}
                className={`p-3 rounded-xl border-2 transition-all text-left ${
                  colorTheme === preset.id
                    ? 'border-slate-800 shadow-md'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-5 h-5 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${preset.color}, ${preset.accent})` }}
                  />
                  <span className="text-sm font-bold text-slate-700">{preset.name}</span>
                </div>
                <span className="text-[10px] text-slate-400">{preset.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 생성 버튼 */}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className={`w-full py-3 rounded-xl text-white font-bold text-base transition-all shadow-lg ${
            generating
              ? 'bg-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98]'
          }`}
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
              생성 중...
            </span>
          ) : '이미지 생성하기'}
        </button>
      </div>

      {/* ── 오른쪽: 미리보기 ── */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {resultImage ? (
          <div className="space-y-4 w-full flex flex-col items-center">
            <img
              src={resultImage}
              alt="생성된 달력"
              className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl"
            />
            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors shadow-lg"
              >
                다운로드
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-6 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-colors"
              >
                다시 생성
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="text-6xl">📅</div>
            <div>
              <h3 className="text-lg font-bold text-slate-700">진료 일정 이미지 생성</h3>
              <p className="text-sm text-slate-400 mt-1">
                왼쪽에서 정보를 입력하고 날짜를 클릭하세요
              </p>
            </div>
            <div className="flex justify-center gap-6 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-red-100 border border-red-300 rounded" />
                휴진
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-amber-100 border border-amber-300 rounded" />
                단축진료
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-purple-100 border border-purple-300 rounded" />
                휴가
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 한국 공휴일 (고정) ──
function getFixedHolidays(month: number): Map<number, string> {
  const fixed: Record<string, string> = {
    '1-1': '신정', '3-1': '삼일절', '5-5': '어린이날',
    '6-6': '현충일', '8-15': '광복절', '10-3': '개천절',
    '10-9': '한글날', '12-25': '성탄절',
  };
  const result = new Map<number, string>();
  for (const [key, name] of Object.entries(fixed)) {
    const [m, d] = key.split('-').map(Number);
    if (m === month) result.set(d, name);
  }
  return result;
}
