/**
 * CategoryPreviews.tsx — 카테고리별 템플릿 프리뷰 컴포넌트
 *
 * 7개 카테고리 프리뷰: Event, Doctor, Notice, Greeting, Hiring, Caution, Pricing
 * TemplatePreviews.tsx에서 분리.
 *
 * 소비자: TemplatePreviews.tsx (dispatcher)
 */
import React from 'react';
import type { CategoryTemplate } from '../lib/categoryTemplates';

export function EventPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  if (h === 'price' || h === 'table') {
    // 가격 강조형 — 큰 할인율 + 취소선 원가
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(160deg, ${t.bg} 0%, white 70%)` }}>
        <div className="px-3 pt-3 pb-1">
          <div className="text-[6px] font-bold tracking-wider uppercase" style={{ color: t.accent }}>SPECIAL EVENT</div>
          <div className="text-[10px] font-extrabold mt-0.5" style={{ color: t.accent }}>봄맞이 할인</div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-3">
          <div className="text-[18px] font-black" style={{ color: t.color }}>30%</div>
          <div className="text-[7px] text-slate-400 line-through">500,000원</div>
          <div className="text-[10px] font-extrabold mt-0.5" style={{ color: t.accent }}>350,000원</div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[6px] py-1 px-2 rounded text-center font-bold text-white" style={{ background: t.color }}>예약 문의</div>
          <div className="text-[5px] text-center mt-1" style={{ color: t.accent + '99' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'elegant' || h === 'luxury') {
    // 럭셔리 프리미엄 캠페인
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, ${t.accent} 0%, ${t.color} 100%)` }}>
        <div className="flex-1 flex flex-col justify-center items-center px-3 text-center">
          <div className="text-[5px] tracking-[0.25em] font-medium text-white/60 uppercase mb-1">Premium Event</div>
          <div className="w-8 h-[0.5px] bg-white/30 mb-2" />
          <div className="text-[11px] font-extrabold text-white leading-tight">프리미엄<br/>시술 이벤트</div>
          <div className="w-8 h-[0.5px] bg-white/30 mt-2 mb-1" />
          <div className="text-[7px] text-white/80 font-medium">첫 방문 고객 특별가</div>
        </div>
        <div className="px-3 pb-3">
          <div className="text-[5px] text-white/50 text-center">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'pop' || h === 'cute') {
    // 활기찬 SNS 피드형
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-2.5 pt-2.5">
          <div className="rounded-lg px-2 py-0.5 inline-block text-[6px] font-extrabold text-white" style={{ background: t.color }}>EVENT</div>
        </div>
        <div className="flex-1 flex flex-col justify-center px-3">
          <div className="text-[11px] font-black leading-tight" style={{ color: t.accent }}>임플란트<br/>특가 이벤트!</div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-[14px] font-black" style={{ color: t.color }}>50%</span>
            <span className="text-[6px] font-bold" style={{ color: t.accent }}>할인</span>
          </div>
          <div className="text-[6px] mt-1" style={{ color: t.accent + 'aa' }}>3/1 ~ 3/31</div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[5px] font-medium" style={{ color: t.accent + '80' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'minimal') {
    // 미니멀 타이포 중심
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="flex-1 flex flex-col justify-center px-4">
          <div className="text-[5px] font-medium text-slate-400 tracking-widest mb-1">EVENT</div>
          <div className="text-[11px] font-extrabold text-slate-800 leading-tight">스케일링<br/>이벤트</div>
          <div className="w-6 h-[1px] mt-2 mb-1.5" style={{ background: t.color }} />
          <div className="text-[7px] font-bold" style={{ color: t.color }}>₩ 30,000</div>
          <div className="text-[5px] text-slate-400 mt-0.5">3/1(금) ~ 3/31(일)</div>
        </div>
        <div className="px-4 pb-2.5 flex justify-between items-end">
          <div className="text-[5px] text-slate-300">{name}</div>
          <div className="text-[5px] font-bold" style={{ color: t.color }}>자세히 →</div>
        </div>
      </div>
    );
  }
  if (h === 'wave' || h === 'gradient') {
    // 그라데이션 웨이브
    return (
      <div className="w-full h-full flex flex-col relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${t.color} 0%, ${t.accent} 100%)` }}>
        <div className="absolute bottom-0 left-0 right-0 h-[40%]" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.15) 100%)' }} />
        <div className="flex-1 flex flex-col justify-center items-center px-3 text-center relative z-10">
          <div className="text-[5px] tracking-[0.2em] text-white/60 font-medium mb-1">SPECIAL OFFER</div>
          <div className="text-[11px] font-extrabold text-white leading-tight">봄맞이<br/>특별 이벤트</div>
          <div className="mt-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-0.5">
            <span className="text-[8px] font-black text-white">UP TO 40% OFF</span>
          </div>
        </div>
        <div className="px-3 pb-2 relative z-10">
          <div className="text-[5px] text-white/50 text-center">{name}</div>
        </div>
      </div>
    );
  }
  // season / nature — 시즌 일러스트 느낌
  return (
    <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(170deg, ${t.bg} 30%, white 100%)` }}>
      <div className="px-3 pt-3">
        <div className="text-[5px] font-bold" style={{ color: t.color }}>SEASONAL EVENT</div>
      </div>
      <div className="flex-1 flex flex-col justify-center px-3">
        <div className="text-[10px] font-extrabold leading-tight" style={{ color: t.accent }}>시즌 한정<br/>특별 프로모션</div>
        <div className="flex items-center gap-1 mt-1.5">
          <div className="text-[6px] line-through text-slate-400">450,000원</div>
          <div className="text-[8px] font-black" style={{ color: t.color }}>299,000원</div>
        </div>
        <div className="text-[5px] mt-1" style={{ color: t.accent + 'aa' }}>기간: 3월 1일 ~ 31일</div>
      </div>
      <div className="px-3 pb-2 flex items-center justify-between">
        <div className="text-[5px]" style={{ color: t.accent + '80' }}>{name}</div>
        <div className="text-[5px] font-bold px-1.5 py-0.5 rounded" style={{ background: t.color + '20', color: t.color }}>문의하기</div>
      </div>
    </div>
  );
}

// ─── 의사 소개 프리뷰 ───
export function DoctorPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  if (h === 'portrait' || h === 'curve') {
    // 프로필 중심 — 원형/곡선 마스크
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="flex-1 flex flex-col items-center justify-center px-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1.5" style={{ background: `linear-gradient(135deg, ${t.color}30, ${t.accent}20)`, border: `2px solid ${t.color}40` }}>
            <svg className="w-6 h-6" style={{ color: t.color + '80' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div className="text-[10px] font-extrabold" style={{ color: t.accent }}>김철수 원장</div>
          <div className="text-[6px] font-medium mt-0.5" style={{ color: t.color }}>치과보철과 전문의</div>
          <div className="w-5 h-[0.5px] my-1.5" style={{ background: t.color + '40' }} />
          <div className="text-[5px] text-center leading-relaxed" style={{ color: t.accent + 'aa' }}>서울대 치의학 박사<br/>前 서울대치과병원</div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[5px] text-center" style={{ color: t.accent + '60' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'split' || h === 'grid') {
    // 좌우 분할 레이아웃
    return (
      <div className="w-full h-full flex flex-col" style={{ background: 'white' }}>
        <div className="flex flex-1">
          <div className="w-[40%] flex items-center justify-center" style={{ background: `linear-gradient(180deg, ${t.color} 0%, ${t.accent} 100%)` }}>
            <svg className="w-8 h-8 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div className="w-[60%] flex flex-col justify-center px-2.5 py-2">
            <div className="text-[9px] font-extrabold" style={{ color: t.accent }}>김철수 원장</div>
            <div className="text-[5px] font-medium mt-0.5" style={{ color: t.color }}>치과보철과 전문의</div>
            <div className="w-4 h-[0.5px] my-1" style={{ background: t.color + '40' }} />
            <div className="space-y-0.5">
              {['서울대 치의학 졸업','보철학회 정회원','경력 15년'].map((c, i) => (
                <div key={i} className="flex items-start gap-0.5">
                  <div className="w-1 h-1 rounded-full mt-[2px] flex-shrink-0" style={{ background: t.color + '60' }} />
                  <span className="text-[4.5px]" style={{ color: t.accent + 'bb' }}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-2 pb-1.5">
          <div className="text-[4px] text-right" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'story') {
    // 스토리 / 브로슈어형
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(180deg, ${t.accent} 0%, ${t.accent}ee 30%, ${t.bg} 100%)` }}>
        <div className="pt-3 px-3">
          <div className="text-[5px] text-white/50 tracking-widest">SPECIALIST</div>
          <div className="text-[10px] font-extrabold text-white mt-0.5">전문의 소개</div>
        </div>
        <div className="flex-1 flex flex-col justify-end px-3 pb-2">
          <div className="bg-white/95 rounded-lg p-2 backdrop-blur-sm" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div className="text-[8px] font-extrabold" style={{ color: t.accent }}>김철수 원장</div>
            <div className="text-[5px] mt-0.5" style={{ color: t.color }}>치과보철과 전문의</div>
            <div className="mt-1 space-y-0.5">
              {['서울대학교 치의학대학원','前 서울대치과병원 전공의'].map((c, i) => (
                <div key={i} className="text-[4.5px]" style={{ color: t.accent + 'aa' }}>• {c}</div>
              ))}
            </div>
          </div>
          <div className="text-[4px] text-center mt-1" style={{ color: t.accent + '60' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'luxury') {
    // 럭셔리 다크 카드
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(170deg, #1a1a2e 0%, ${t.accent} 100%)` }}>
        <div className="flex-1 flex flex-col items-center justify-center px-3">
          <div className="text-[5px] tracking-[0.3em] text-white/40 uppercase mb-2">Medical Director</div>
          <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div className="text-[10px] font-extrabold text-white">김철수 원장</div>
          <div className="text-[6px] mt-0.5" style={{ color: t.color }}>치과보철과 전문의</div>
          <div className="w-6 h-[0.5px] bg-white/20 my-1.5" />
          <div className="text-[5px] text-white/40 text-center leading-relaxed">서울대 치의학 박사<br/>경력 15년</div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px] text-center text-white/30">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'minimal') {
    // 미니멀 화이트
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="flex-1 flex flex-col justify-center px-3.5">
          <div className="text-[5px] text-slate-400 tracking-widest mb-1">DOCTOR</div>
          <div className="text-[11px] font-extrabold text-slate-800">김철수</div>
          <div className="text-[6px] font-medium mt-0.5" style={{ color: t.color }}>치과보철과 전문의</div>
          <div className="w-full h-[0.5px] bg-slate-200 my-2" />
          <div className="space-y-0.5">
            {['서울대 치의학 박사','前 서울대치과병원','보철학회 정회원'].map((c, i) => (
              <div key={i} className="text-[5px] text-slate-500">{c}</div>
            ))}
          </div>
        </div>
        <div className="px-3.5 pb-2 flex justify-between">
          <div className="text-[4px] text-slate-300">{name}</div>
          <div className="w-3 h-[0.5px] self-center" style={{ background: t.color }} />
        </div>
      </div>
    );
  }
  // grid 기본 — 카드형
  return (
    <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
      <div className="h-[35%] flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${t.color}20, ${t.accent}15)` }}>
        <svg className="w-8 h-8" style={{ color: t.color + '60' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
      </div>
      <div className="flex-1 px-2.5 py-2 flex flex-col justify-center">
        <div className="text-[9px] font-extrabold" style={{ color: t.accent }}>김철수 원장</div>
        <div className="text-[5px] font-medium" style={{ color: t.color }}>치과보철과 전문의</div>
        <div className="mt-1 space-y-0.5">
          {['서울대 치의학 졸업','보철학회 정회원'].map((c, i) => (
            <div key={i} className="text-[4.5px] flex items-center gap-0.5" style={{ color: t.accent + 'aa' }}>
              <div className="w-0.5 h-0.5 rounded-full flex-shrink-0" style={{ background: t.color }} />{c}
            </div>
          ))}
        </div>
      </div>
      <div className="px-2.5 pb-1.5">
        <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
      </div>
    </div>
  );
}

// ─── 공지사항 프리뷰 ───
export function NoticePreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  if (h === 'alert' || h === 'warning') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-2.5 pb-1 flex items-center gap-1" style={{ borderBottom: `2px solid ${t.color}` }}>
          <div className="w-3 h-3 rounded flex items-center justify-center" style={{ background: t.color }}>
            <span className="text-[6px] text-white font-black">!</span>
          </div>
          <div className="text-[8px] font-extrabold" style={{ color: t.accent }}>긴급 공지</div>
        </div>
        <div className="flex-1 px-3 py-2 flex flex-col justify-center">
          <div className="text-[9px] font-extrabold leading-tight" style={{ color: t.accent }}>진료시간<br/>변경 안내</div>
          <div className="mt-1.5 space-y-0.5">
            {['변경일: 4월 1일부터','평일: 09:00~19:00','토요일: 09:00~14:00'].map((l, i) => (
              <div key={i} className="text-[5px]" style={{ color: t.accent + 'aa' }}>{l}</div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'soft' || h === 'popup') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center" style={{ background: t.bg }}>
        <div className="bg-white rounded-lg p-3 mx-2 text-center" style={{ boxShadow: `0 4px 16px ${t.color}20` }}>
          <div className="text-[5px] font-bold tracking-wider mb-1" style={{ color: t.color }}>NOTICE</div>
          <div className="text-[9px] font-extrabold leading-tight" style={{ color: t.accent }}>휴진 안내</div>
          <div className="w-5 h-[0.5px] mx-auto my-1.5" style={{ background: t.color + '40' }} />
          <div className="text-[5px] leading-relaxed" style={{ color: t.accent + 'aa' }}>3월 15일(토)<br/>정기 휴진입니다</div>
          <div className="text-[4px] mt-1.5" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'formal') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-3 pb-1">
          <div className="text-[5px] text-slate-400 tracking-widest">공 지 사 항</div>
          <div className="h-[0.5px] bg-slate-800 mt-1" />
          <div className="h-[0.5px] bg-slate-300 mt-[1px]" />
        </div>
        <div className="flex-1 px-3 py-2 flex flex-col justify-center">
          <div className="text-[10px] font-extrabold text-slate-800 leading-tight">진료시간<br/>변경 안내</div>
          <div className="mt-2 space-y-0.5">
            {['적용일: 2026년 4월 1일','평일 진료: 09:00~19:00','토요일 진료: 09:00~14:00'].map((l, i) => (
              <div key={i} className="text-[5px] text-slate-600">{l}</div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="h-[0.5px] bg-slate-300 mb-1" />
          <div className="text-[4px] text-center text-slate-400">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'timeline') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-3 pt-2.5">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>공지사항</div>
          <div className="text-[5px] mt-0.5" style={{ color: t.color }}>업데이트 안내</div>
        </div>
        <div className="flex-1 px-3 py-2">
          <div className="border-l-[1.5px] pl-2 space-y-2" style={{ borderColor: t.color + '60' }}>
            {[{ d: '4/1', t: '진료시간 변경' }, { d: '3/15', t: '정기 휴진일' }, { d: '3/1', t: '시스템 점검' }].map((item, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[9px] top-0.5 w-2 h-2 rounded-full border" style={{ background: i === 0 ? t.color : 'white', borderColor: t.color }} />
                <div className="text-[4.5px] font-bold" style={{ color: t.accent }}>{item.d}</div>
                <div className="text-[5px]" style={{ color: t.accent + 'aa' }}>{item.t}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'bulletin') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, ${t.color} 0%, ${t.accent} 40%, ${t.bg} 100%)` }}>
        <div className="px-3 pt-3">
          <div className="text-[5px] text-white/60 tracking-wider">ANNOUNCEMENT</div>
          <div className="text-[10px] font-extrabold text-white mt-0.5">진료 안내</div>
        </div>
        <div className="flex-1 flex flex-col justify-end px-3 pb-2">
          <div className="bg-white rounded-lg p-2">
            <div className="space-y-1">
              {['평일: 09:00~18:00','토요일: 09:00~13:00','일요일/공휴일: 휴진'].map((l, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full" style={{ background: t.color }} />
                  <span className="text-[5px]" style={{ color: t.accent }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[4px] text-center mt-1" style={{ color: t.accent + '60' }}>{name}</div>
        </div>
      </div>
    );
  }
  // minimal 기본
  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="px-3 pt-3">
        <div className="inline-block px-1.5 py-0.5 rounded text-[5px] font-bold text-white" style={{ background: t.color }}>공지</div>
      </div>
      <div className="flex-1 px-3 py-2 flex flex-col justify-center">
        <div className="text-[10px] font-extrabold" style={{ color: t.accent }}>진료시간<br/>변경 안내</div>
        <div className="w-5 h-[0.5px] my-1.5" style={{ background: t.color + '40' }} />
        <div className="space-y-0.5">
          {['4월 1일부터 적용','평일 09:00~19:00'].map((l, i) => (
            <div key={i} className="text-[5px]" style={{ color: t.accent + 'aa' }}>{l}</div>
          ))}
        </div>
      </div>
      <div className="px-3 pb-2">
        <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
      </div>
    </div>
  );
}

// ─── 명절 인사 프리뷰 ───
export function GreetingPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  // 명절 키워드 추출 (id에서)
  const id = t.id || '';
  const isSeollal = id.includes('seollal') || id.includes('lunar');
  const isChuseok = id.includes('chuseok');
  const isNewYear = id.includes('newyear') || id.includes('new_year');
  const isParents = id.includes('parent');
  const isXmas = id.includes('christmas') || id.includes('xmas');

  const holidayEmoji = isSeollal ? '🧧' : isChuseok ? '🌕' : isNewYear ? '✨' : isParents ? '🌸' : isXmas ? '🎄' : '🎊';
  const greetingText = isSeollal ? '새해 복\n많이 받으세요' : isChuseok ? '풍성한\n한가위 되세요' : isNewYear ? 'Happy\nNew Year' : isParents ? '감사합니다\n사랑합니다' : isXmas ? 'Merry\nChristmas' : '행복한\n하루 되세요';

  if (h === 'traditional') {
    return (
      <div className="w-full h-full flex flex-col relative overflow-hidden" style={{ background: `linear-gradient(170deg, ${t.bg} 0%, #fffbeb 100%)` }}>
        <div className="absolute top-0 left-0 right-0 h-3 opacity-30" style={{ background: `repeating-linear-gradient(90deg, ${t.color}40, ${t.color}40 4px, transparent 4px, transparent 8px)` }} />
        <div className="flex-1 flex flex-col items-center justify-center px-3 text-center">
          <div className="text-lg mb-1">{holidayEmoji}</div>
          <div className="text-[10px] font-extrabold leading-tight whitespace-pre-line" style={{ color: t.accent }}>{greetingText}</div>
          <div className="w-6 h-[0.5px] my-1.5" style={{ background: t.color + '60' }} />
          <div className="text-[5px]" style={{ color: t.accent + 'aa' }}>건강하고 행복한<br/>시간 되시길 바랍니다</div>
        </div>
        <div className="px-3 pb-2 text-center">
          <div className="text-[5px] font-medium" style={{ color: t.accent + '80' }}>{name} 임직원 일동</div>
        </div>
      </div>
    );
  }
  if (h === 'warm') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, ${t.bg} 0%, white 100%)` }}>
        <div className="flex-1 flex flex-col justify-center px-3">
          <div className="text-base mb-1">{holidayEmoji}</div>
          <div className="text-[10px] font-extrabold leading-tight whitespace-pre-line" style={{ color: t.accent }}>{greetingText}</div>
          <div className="mt-1.5 text-[5px] leading-relaxed" style={{ color: t.accent + 'aa' }}>늘 건강하시고<br/>행복하시길 바랍니다</div>
        </div>
        <div className="px-3 pb-2">
          <div className="h-[0.5px] mb-1.5" style={{ background: t.color + '30' }} />
          <div className="flex justify-between items-center">
            <div className="text-[5px]" style={{ color: t.accent + '70' }}>{name}</div>
            <div className="text-[4px]" style={{ color: t.accent + '50' }}>임직원 일동</div>
          </div>
        </div>
      </div>
    );
  }
  if (h === 'minimal') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <div className="text-[5px] tracking-[0.3em] mb-2" style={{ color: t.color }}>GREETING</div>
          <div className="text-[11px] font-extrabold leading-tight whitespace-pre-line" style={{ color: t.accent }}>{greetingText}</div>
          <div className="w-4 h-[0.5px] my-2" style={{ background: t.color }} />
          <div className="text-[5px]" style={{ color: t.accent + '99' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'cute' || h === 'nature') {
    return (
      <div className="w-full h-full flex flex-col relative overflow-hidden" style={{ background: t.bg }}>
        <div className="absolute top-1 right-1 text-xl opacity-20">{holidayEmoji}</div>
        <div className="absolute bottom-1 left-1 text-base opacity-15">{holidayEmoji}</div>
        <div className="flex-1 flex flex-col justify-center px-3 relative z-10">
          <div className="text-sm mb-1">{holidayEmoji}</div>
          <div className="text-[10px] font-extrabold leading-tight whitespace-pre-line" style={{ color: t.accent }}>{greetingText}</div>
          <div className="mt-1.5 rounded-md px-1.5 py-1 inline-block" style={{ background: t.color + '15' }}>
            <div className="text-[5px]" style={{ color: t.accent }}>건강하고 행복한 하루 되세요</div>
          </div>
        </div>
        <div className="px-3 pb-2 relative z-10">
          <div className="text-[5px]" style={{ color: t.accent + '70' }}>{name}</div>
        </div>
      </div>
    );
  }
  // luxury
  return (
    <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(170deg, ${t.accent} 0%, ${t.color} 100%)` }}>
      <div className="flex-1 flex flex-col items-center justify-center px-3 text-center">
        <div className="text-[5px] tracking-[0.3em] text-white/40 uppercase mb-2">Season's Greetings</div>
        <div className="text-base mb-1.5 opacity-90">{holidayEmoji}</div>
        <div className="text-[10px] font-extrabold text-white leading-tight whitespace-pre-line">{greetingText}</div>
        <div className="w-8 h-[0.5px] bg-white/25 my-2" />
        <div className="text-[5px] text-white/60">건강하고 행복한<br/>시간 되시길 바랍니다</div>
      </div>
      <div className="px-3 pb-2">
        <div className="text-[4px] text-center text-white/40">{name} 임직원 일동</div>
      </div>
    </div>
  );
}

// ─── 채용 프리뷰 ───
export function HiringPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  if (h === 'corporate') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="h-[25%] flex items-center px-3" style={{ background: t.color }}>
          <div className="text-[9px] font-extrabold text-white">직원 모집</div>
        </div>
        <div className="flex-1 px-3 py-2 flex flex-col justify-center">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>간호사 모집</div>
          <div className="mt-1.5 space-y-0.5">
            {['정규직 / 경력 우대','4대보험 / 중식 제공','연차·월차 보장'].map((l, i) => (
              <div key={i} className="text-[5px] flex items-center gap-0.5" style={{ color: t.accent + 'aa' }}>
                <span style={{ color: t.color }}>•</span> {l}
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2 flex justify-between items-end">
          <div className="text-[4px]" style={{ color: t.accent + '60' }}>{name}</div>
          <div className="text-[5px] font-bold" style={{ color: t.color }}>지원하기 →</div>
        </div>
      </div>
    );
  }
  if (h === 'team') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-3 pt-3">
          <div className="text-[5px] tracking-wider font-bold" style={{ color: t.color }}>WE'RE HIRING</div>
          <div className="text-[9px] font-extrabold mt-0.5" style={{ color: t.accent }}>함께 성장할<br/>인재를 찾습니다</div>
        </div>
        <div className="flex-1 px-3 py-2 flex items-center">
          <div className="flex gap-1">
            {[t.color, t.accent, t.color + 'aa'].map((c, i) => (
              <div key={i} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: c + '20', border: `1px solid ${c}40` }}>
                <svg className="w-3 h-3" style={{ color: c }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'modern') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(160deg, ${t.accent} 0%, ${t.color} 100%)` }}>
        <div className="flex-1 flex flex-col justify-center px-3">
          <div className="text-[5px] text-white/50 tracking-wider">RECRUITMENT</div>
          <div className="text-[10px] font-extrabold text-white mt-0.5 leading-tight">간호사<br/>모집합니다</div>
          <div className="w-6 h-[0.5px] bg-white/30 my-1.5" />
          <div className="space-y-0.5">
            {['정규직 채용','경력 우대'].map((l, i) => (
              <div key={i} className="text-[5px] text-white/70">{l}</div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="bg-white/15 rounded px-2 py-1 text-center">
            <div className="text-[5px] font-bold text-white">지원 문의</div>
          </div>
          <div className="text-[4px] text-center text-white/40 mt-1">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'benefits') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-2.5">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>복리후생</div>
        </div>
        <div className="flex-1 px-2.5 py-1.5">
          <div className="grid grid-cols-2 gap-1">
            {[{ icon: '🏥', l: '4대보험' }, { icon: '🍽️', l: '중식 제공' }, { icon: '📅', l: '연차 보장' }, { icon: '💰', l: '인센티브' }].map((b, i) => (
              <div key={i} className="rounded-md p-1.5 flex flex-col items-center" style={{ background: t.color + '10' }}>
                <div className="text-[8px]">{b.icon}</div>
                <div className="text-[5px] font-bold mt-0.5" style={{ color: t.accent }}>{b.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'urgent') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-3 pt-2.5 flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: t.color }} />
          <div className="text-[6px] font-extrabold" style={{ color: t.color }}>급구</div>
        </div>
        <div className="flex-1 px-3 py-2 flex flex-col justify-center">
          <div className="text-[10px] font-black leading-tight" style={{ color: t.accent }}>간호사<br/>급히 모집</div>
          <div className="mt-1.5 text-[5px]" style={{ color: t.accent + 'aa' }}>채용시까지</div>
        </div>
        <div className="px-3 pb-2">
          <div className="rounded py-1 text-center text-[5px] font-bold text-white" style={{ background: t.color }}>지원하기</div>
          <div className="text-[4px] text-center mt-1" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  // brand
  return (
    <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, ${t.bg} 0%, white 100%)` }}>
      <div className="px-3 pt-3">
        <div className="text-[5px] font-bold tracking-wider" style={{ color: t.color }}>JOIN OUR TEAM</div>
      </div>
      <div className="flex-1 px-3 py-2 flex flex-col justify-center">
        <div className="text-[9px] font-extrabold leading-tight" style={{ color: t.accent }}>함께할<br/>동료를 찾습니다</div>
        <div className="w-5 h-[0.5px] my-1.5" style={{ background: t.color + '40' }} />
        <div className="text-[5px]" style={{ color: t.accent + 'aa' }}>간호사 / 치위생사</div>
        <div className="text-[5px] mt-0.5" style={{ color: t.accent + 'aa' }}>정규직 채용</div>
      </div>
      <div className="px-3 pb-2">
        <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
      </div>
    </div>
  );
}

// ─── 주의사항 프리뷰 ───
export function CautionPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  if (h === 'checklist') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-2.5 pb-1" style={{ borderBottom: `1.5px solid ${t.color}30` }}>
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>시술 후 주의사항</div>
        </div>
        <div className="flex-1 px-3 py-2 space-y-1">
          {['음주/흡연 금지','자극적 음식 피하기','시술부위 접촉 금지','처방약 복용'].map((item, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm border flex items-center justify-center flex-shrink-0" style={{ borderColor: t.color + '60' }}>
                {i < 2 && <div className="w-1.5 h-1.5 rounded-sm" style={{ background: t.color }} />}
              </div>
              <span className="text-[5px]" style={{ color: t.accent + (i < 2 ? '' : 'aa') }}>{item}</span>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: '#ef4444' }}>이상 시 즉시 연락</div>
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'warning') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(170deg, ${t.color} 0%, ${t.accent} 100%)` }}>
        <div className="flex-1 flex flex-col items-center justify-center px-3 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-white/30 flex items-center justify-center mb-1.5">
            <span className="text-sm text-white font-black">!</span>
          </div>
          <div className="text-[9px] font-extrabold text-white">주의사항</div>
          <div className="w-6 h-[0.5px] bg-white/30 my-1.5" />
          <div className="text-[5px] text-white/70 leading-relaxed">시술 후 반드시<br/>확인해주세요</div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px] text-center text-white/40">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'guide') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-3 pt-2.5">
          <div className="text-[5px] font-bold" style={{ color: t.color }}>CARE GUIDE</div>
          <div className="text-[8px] font-extrabold mt-0.5" style={{ color: t.accent }}>시술 후 가이드</div>
        </div>
        <div className="flex-1 px-3 py-2 space-y-1.5">
          {[{ n: '01', t: '당일', d: '냉찜질 20분' }, { n: '02', t: '1~3일', d: '부드러운 음식' }, { n: '03', t: '1주일', d: '운동 금지' }].map((s, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <div className="text-[6px] font-black" style={{ color: t.color }}>{s.n}</div>
              <div>
                <div className="text-[5px] font-bold" style={{ color: t.accent }}>{s.t}</div>
                <div className="text-[4.5px]" style={{ color: t.accent + 'aa' }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'timeline') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-2.5">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>회복 타임라인</div>
        </div>
        <div className="flex-1 px-3 py-1.5">
          <div className="relative">
            <div className="absolute left-[5px] top-1 bottom-1 w-[1px]" style={{ background: t.color + '40' }} />
            {[{ t: '직후', d: '냉찜질', c: t.color }, { t: '1~3일', d: '부드러운 음식', c: t.color + 'cc' }, { t: '1주', d: '운동 금지', c: t.color + '99' }, { t: '2주', d: '정상 식사', c: t.color + '66' }].map((s, i) => (
              <div key={i} className="flex items-center gap-2 mb-1 relative">
                <div className="w-2.5 h-2.5 rounded-full border-2 z-10 flex-shrink-0" style={{ borderColor: s.c, background: 'white' }} />
                <div className="flex-1">
                  <div className="text-[4.5px] font-bold" style={{ color: t.accent }}>{s.t}</div>
                  <div className="text-[4px]" style={{ color: t.accent + 'aa' }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: '#ef4444' }}>이상 시 연락: 02-000-0000</div>
        </div>
      </div>
    );
  }
  if (h === 'infographic') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, ${t.bg} 0%, white 100%)` }}>
        <div className="px-3 pt-2.5 text-center">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>주의사항</div>
        </div>
        <div className="flex-1 px-2 py-1.5 grid grid-cols-2 gap-1">
          {[{ icon: '🚫', l: '음주 금지' }, { icon: '🚭', l: '흡연 금지' }, { icon: '🧊', l: '냉찜질' }, { icon: '💊', l: '약 복용' }].map((item, i) => (
            <div key={i} className="rounded-md p-1 flex flex-col items-center justify-center" style={{ background: 'white', border: `1px solid ${t.color}20` }}>
              <div className="text-[8px]">{item.icon}</div>
              <div className="text-[4.5px] font-bold mt-0.5" style={{ color: t.accent }}>{item.l}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px] text-center" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  // card
  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="px-3 pt-2.5 flex items-center gap-1">
        <div className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: t.color + '20' }}>
          <span className="text-[6px]" style={{ color: t.color }}>⚠</span>
        </div>
        <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>주의사항</div>
      </div>
      <div className="flex-1 px-3 py-1.5 space-y-1">
        {['시술부위 접촉 금지','음주·흡연 삼가','자극적 음식 피하기'].map((item, i) => (
          <div key={i} className="flex items-start gap-1">
            <div className="text-[5px] font-black mt-0.5" style={{ color: t.color }}>{i + 1}</div>
            <span className="text-[5px]" style={{ color: t.accent + 'bb' }}>{item}</span>
          </div>
        ))}
      </div>
      <div className="px-3 pb-2">
        <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
      </div>
    </div>
  );
}

// ─── 가격표 프리뷰 ───
export function PricingPreview({ t, name }: { t: CategoryTemplate; name: string }) {
  const h = t.layoutHint;
  const items = [{ n: '임플란트', p: '1,200,000원' }, { n: '레진 충전', p: '150,000원' }, { n: '치아 미백', p: '300,000원' }];

  if (h === 'table') {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        <div className="px-3 pt-2.5">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>비급여 진료비</div>
        </div>
        <div className="flex-1 px-2.5 py-1.5">
          <div className="border rounded" style={{ borderColor: t.color + '30' }}>
            <div className="flex px-2 py-1" style={{ background: t.color, borderRadius: '3px 3px 0 0' }}>
              <div className="text-[5px] font-bold text-white flex-1">항목</div>
              <div className="text-[5px] font-bold text-white text-right">가격</div>
            </div>
            {items.map((item, i) => (
              <div key={i} className="flex px-2 py-1 items-center" style={{ background: i % 2 === 0 ? t.color + '08' : 'white', borderTop: `0.5px solid ${t.color}15` }}>
                <div className="text-[5px] flex-1" style={{ color: t.accent }}>{item.n}</div>
                <div className="text-[5px] font-bold text-right" style={{ color: t.accent }}>{item.p}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '60' }}>* 환자 상태에 따라 달라질 수 있습니다</div>
          <div className="text-[4px]" style={{ color: t.accent + '40' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'cards') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: t.bg }}>
        <div className="px-3 pt-2.5">
          <div className="text-[7px] font-extrabold" style={{ color: t.accent }}>시술 안내</div>
        </div>
        <div className="flex-1 px-2.5 py-1.5 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="bg-white rounded-md px-2 py-1.5 flex justify-between items-center" style={{ border: `0.5px solid ${t.color}20` }}>
              <div className="text-[5px] font-medium" style={{ color: t.accent }}>{item.n}</div>
              <div className="text-[5px] font-bold" style={{ color: t.color }}>{item.p}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'dark') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(170deg, ${t.accent} 0%, #1a1a2e 100%)` }}>
        <div className="px-3 pt-3">
          <div className="text-[5px] tracking-widest text-white/40">PRICE LIST</div>
          <div className="text-[8px] font-extrabold text-white mt-0.5">비급여 안내</div>
        </div>
        <div className="flex-1 px-3 py-2 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between items-center py-0.5" style={{ borderBottom: '0.5px solid rgba(255,255,255,0.1)' }}>
              <div className="text-[5px] text-white/70">{item.n}</div>
              <div className="text-[5px] font-bold" style={{ color: t.color }}>{item.p}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px] text-white/30">{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'wood') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(175deg, #f5ebe0 0%, #faf7f4 100%)` }}>
        <div className="px-3 pt-2.5 text-center">
          <div className="text-[8px] font-extrabold" style={{ color: t.accent }}>MENU</div>
          <div className="w-8 h-[0.5px] mx-auto mt-1" style={{ background: t.color + '60' }} />
        </div>
        <div className="flex-1 px-3 py-1.5 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="text-[5px]" style={{ color: t.accent }}>{item.n}</div>
              <div className="flex-1 mx-1 border-b border-dotted" style={{ borderColor: t.color + '30' }} />
              <div className="text-[5px] font-bold" style={{ color: t.accent }}>{item.p}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2 text-center">
          <div className="text-[4px]" style={{ color: t.accent + '50' }}>{name}</div>
        </div>
      </div>
    );
  }
  if (h === 'gradient') {
    return (
      <div className="w-full h-full flex flex-col" style={{ background: `linear-gradient(135deg, ${t.color} 0%, ${t.accent} 100%)` }}>
        <div className="px-3 pt-3">
          <div className="text-[5px] text-white/50 tracking-wider">PRICE</div>
          <div className="text-[8px] font-extrabold text-white">비급여 안내</div>
        </div>
        <div className="flex-1 px-3 py-2 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="bg-white/10 backdrop-blur-sm rounded px-2 py-1 flex justify-between items-center">
              <div className="text-[5px] text-white/80">{item.n}</div>
              <div className="text-[5px] font-bold text-white">{item.p}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-2">
          <div className="text-[4px] text-white/40 text-center">{name}</div>
        </div>
      </div>
    );
  }
  // minimal
  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="px-3 pt-3">
        <div className="text-[5px] text-slate-400 tracking-widest">PRICE</div>
        <div className="text-[8px] font-extrabold text-slate-800">비급여 진료비</div>
      </div>
      <div className="flex-1 px-3 py-2 space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between items-center py-0.5" style={{ borderBottom: `0.5px solid #f1f5f9` }}>
            <div className="text-[5px] text-slate-600">{item.n}</div>
            <div className="text-[5px] font-bold" style={{ color: t.color }}>{item.p}</div>
          </div>
        ))}
      </div>
      <div className="px-3 pb-2">
        <div className="w-4 h-[0.5px]" style={{ background: t.color }} />
        <div className="text-[4px] text-slate-400 mt-0.5">{name}</div>
      </div>
    </div>
  );
}
