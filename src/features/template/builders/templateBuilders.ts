/**
 * templateBuilders — 비달력 카테고리 HTML 빌더 모음
 *
 * calendarTemplateService.ts에서 추출.
 * 이벤트, 의사소개, 공지, 명절, 채용, 주의사항, 비급여 빌더.
 */

import { THEMES } from './calendarBuilders';

// ── 이벤트/프로모션 템플릿 ──

export interface EventTemplateData {
  title: string;
  subtitle?: string;
  description?: string;
  price?: string;
  originalPrice?: string;
  discount?: string;
  period?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildEventHTML(data: EventTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:40px;margin-bottom:12px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const priceSection = (data.price || data.discount) ? `
    <div style="margin:28px 0;text-align:center;padding:28px 24px;background:${theme.light};border-radius:20px;border:1px solid ${theme.border};position:relative;overflow:hidden;">
      <div style="position:absolute;top:-20px;right:-20px;width:80px;height:80px;background:${theme.primary}10;border-radius:50%;"></div>
      ${data.discount ? `<div style="display:inline-block;margin-bottom:12px;padding:6px 20px;background:${theme.primary};color:white;border-radius:24px;font-size:15px;font-weight:800;letter-spacing:1px;box-shadow:0 4px 12px ${theme.primary}40;">${esc(data.discount)}</div>` : ''}
      ${data.originalPrice ? `<div style="font-size:18px;color:#94a3b8;text-decoration:line-through;margin-bottom:6px;font-weight:500;">${esc(data.originalPrice)}</div>` : ''}
      ${data.price ? `<div style="font-size:42px;font-weight:900;color:${theme.primary};letter-spacing:-2px;line-height:1;">${esc(data.price)}</div>` : ''}
    </div>` : '';

  const descSection = data.description?.trim()
    ? `<div style="margin:20px 0;padding:20px 24px;background:#f8fafc;border-radius:16px;border:1px solid #e2e8f0;">
        ${data.description.trim().split('\n').filter(Boolean).map(line => `<div style="font-size:15px;color:#475569;line-height:2;padding-left:16px;position:relative;"><span style="position:absolute;left:0;color:${theme.primary};font-weight:700;">&#10003;</span> ${esc(line)}</div>`).join('')}
      </div>` : '';

  const periodSection = data.period?.trim()
    ? `<div style="margin:20px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:${theme.light};border:2px solid ${theme.border};border-radius:14px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${theme.primary}" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span style="font-size:15px;color:#334155;font-weight:700;">${esc(data.period)}</span>
        </div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:28px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:40px 36px 36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-40px;right:-40px;width:150px;height:150px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-30px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML}
      <div style="display:inline-block;margin-bottom:16px;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;">EVENT</div>
      <div style="font-size:32px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;line-height:1.3;text-shadow:0 2px 4px rgba(0,0,0,0.1);">${esc(data.title || '이벤트')}</div>
      ${data.subtitle ? `<div style="font-size:16px;color:rgba(255,255,255,0.85);margin-top:10px;font-weight:400;line-height:1.5;">${esc(data.subtitle)}</div>` : ''}
    </div>
    <div style="padding:28px 36px 32px;">
      ${priceSection}${descSection}${periodSection}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}

// ── 의사 소개 템플릿 ──

export interface DoctorTemplateData {
  doctorName: string;
  specialty: string;
  career?: string[];
  greeting?: string;
  doctorPhotoBase64?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildDoctorHTML(data: DoctorTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const careerHTML = (data.career && data.career.length > 0)
    ? `<div style="margin:24px 0;text-align:left;">
        <div style="font-size:12px;font-weight:800;color:${theme.primary};margin-bottom:14px;letter-spacing:1px;">CAREER & EDUCATION</div>
        <div style="padding:20px 24px;background:#f8fafc;border-radius:16px;border:1px solid #e2e8f0;">
          ${data.career.map(c => `<div style="font-size:14px;color:#475569;line-height:2.4;padding-left:20px;position:relative;"><span style="position:absolute;left:0;color:${theme.primary};font-size:8px;top:50%;transform:translateY(-50%);">&#9679;</span>${esc(c)}</div>`).join('')}
        </div>
      </div>` : '';

  const greetingHTML = data.greeting?.trim()
    ? `<div style="margin:24px 0;padding:24px;background:linear-gradient(135deg, ${theme.light}, #ffffff);border-radius:16px;border:1px solid ${theme.border};text-align:center;position:relative;">
        <div style="font-size:40px;color:${theme.primary};opacity:0.15;position:absolute;top:8px;left:20px;font-family:Georgia,serif;">&ldquo;</div>
        <div style="font-size:15px;color:#334155;line-height:1.8;font-style:italic;white-space:pre-line;padding:0 20px;">${esc(data.greeting.trim())}</div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:28px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML ? `<div style="margin-bottom:12px;">${logoHTML}</div>` : ''}
      <div style="display:inline-block;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;margin-bottom:12px;">NEW DOCTOR</div>
      <div style="font-size:26px;font-weight:900;color:#ffffff;text-shadow:0 2px 4px rgba(0,0,0,0.1);">신규 전문의 부임 안내</div>
    </div>
    <div style="padding:36px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;width:96px;height:96px;background:${theme.light};border:3px solid ${theme.border};border-radius:50%;line-height:96px;font-size:44px;margin-bottom:16px;box-shadow:0 4px 16px ${theme.primary}15;">&#129489;&#8205;&#9877;&#65039;</div>
        <div style="font-size:32px;font-weight:900;color:#1e293b;letter-spacing:-0.5px;">${esc(data.doctorName || '홍길동')}</div>
        <div style="font-size:15px;color:#64748b;font-weight:500;margin-top:4px;">전문의</div>
        <div style="display:inline-block;margin-top:12px;padding:8px 24px;background:${theme.light};color:${theme.primary};border:2px solid ${theme.border};border-radius:24px;font-size:14px;font-weight:700;">${esc(data.specialty || '전문 분야')}</div>
      </div>
      ${careerHTML}${greetingHTML}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}

// ── 공지사항 템플릿 ──

export interface NoticeTemplateData {
  title: string;
  content: string[];
  effectiveDate?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildNoticeHTML(data: NoticeTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const contentHTML = data.content.length > 0
    ? `<div style="margin:24px 0;">
        ${data.content.map((line, i) => `<div style="display:flex;align-items:flex-start;gap:14px;padding:16px 0;${i < data.content.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">
          <div style="flex-shrink:0;width:28px;height:28px;background:${theme.light};border:2px solid ${theme.border};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${theme.primary};">${i + 1}</div>
          <div style="font-size:15px;color:#334155;line-height:1.8;padding-top:3px;">${esc(line)}</div>
        </div>`).join('')}
      </div>` : '';

  const dateHTML = data.effectiveDate?.trim()
    ? `<div style="margin:20px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:${theme.light};border:2px solid ${theme.border};border-radius:14px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${theme.primary}" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span style="font-size:15px;color:${theme.primary};font-weight:700;">적용일: ${esc(data.effectiveDate)}</span>
        </div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:28px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML ? `<div style="margin-bottom:12px;">${logoHTML}</div>` : ''}
      <div style="display:inline-block;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;margin-bottom:12px;">NOTICE</div>
      <div style="font-size:30px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 2px 4px rgba(0,0,0,0.1);">${esc(data.title || '공지사항')}</div>
    </div>
    <div style="padding:28px 36px 32px;">
      ${contentHTML}${dateHTML}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}

// ── 명절 인사 템플릿 ──

export interface GreetingTemplateData {
  holiday: string;
  greeting: string;
  closurePeriod?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

// 명절별 전용 디자인 설정
interface HolidayDesign {
  emoji: string;
  bgGradient: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  subtleColor: string;
  borderColor: string;
  tagBg: string;
  tagText: string;
  decoElements: string; // 장식 HTML
  closureTagColor: string;
}

const HOLIDAY_DESIGNS: Record<string, HolidayDesign> = {
  '설날': {
    emoji: '&#127982;',
    bgGradient: 'linear-gradient(180deg, #fef2f2 0%, #fff5f5 30%, #fffbeb 70%, #fef2f2 100%)',
    primaryColor: '#dc2626',
    accentColor: '#b91c1c',
    textColor: '#7f1d1d',
    subtleColor: '#fecaca',
    borderColor: '#fca5a5',
    tagBg: 'rgba(220,38,38,0.12)',
    tagText: '#dc2626',
    closureTagColor: '#b91c1c',
    decoElements: `
      <div style="position:absolute;top:20px;left:20px;font-size:28px;opacity:0.15;transform:rotate(-15deg);">&#127982;</div>
      <div style="position:absolute;top:40px;right:24px;font-size:22px;opacity:0.12;transform:rotate(10deg);">&#129511;</div>
      <div style="position:absolute;bottom:60px;left:30px;font-size:20px;opacity:0.10;transform:rotate(-8deg);">&#127885;</div>
      <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle, #dc262612 0%, transparent 70%);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-30px;left:-30px;width:120px;height:120px;background:radial-gradient(circle, #f59e0b0a 0%, transparent 70%);border-radius:50%;"></div>`,
  },
  '추석': {
    emoji: '&#127765;',
    bgGradient: 'linear-gradient(180deg, #1e293b 0%, #1e3a5f 40%, #2d1b4e 100%)',
    primaryColor: '#f59e0b',
    accentColor: '#d97706',
    textColor: '#ffffff',
    subtleColor: '#44403c',
    borderColor: '#78716c',
    tagBg: 'rgba(245,158,11,0.2)',
    tagText: '#fbbf24',
    closureTagColor: '#fbbf24',
    decoElements: `
      <div style="position:absolute;top:16px;right:16px;width:80px;height:80px;background:radial-gradient(circle, #fbbf2420 0%, transparent 70%);border-radius:50%;"></div>
      <div style="position:absolute;top:30px;left:20px;font-size:20px;opacity:0.15;">&#127810;</div>
      <div style="position:absolute;bottom:80px;right:28px;font-size:18px;opacity:0.12;">&#127810;</div>
      <div style="position:absolute;top:-50px;left:-50px;width:180px;height:180px;background:radial-gradient(circle, #f59e0b08 0%, transparent 60%);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;right:-40px;width:140px;height:140px;background:radial-gradient(circle, #7c3aed06 0%, transparent 60%);border-radius:50%;"></div>`,
  },
  '새해': {
    emoji: '&#127882;',
    bgGradient: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #172554 100%)',
    primaryColor: '#a78bfa',
    accentColor: '#7c3aed',
    textColor: '#ffffff',
    subtleColor: '#334155',
    borderColor: '#4c1d95',
    tagBg: 'rgba(167,139,250,0.2)',
    tagText: '#c4b5fd',
    closureTagColor: '#c4b5fd',
    decoElements: `
      <div style="position:absolute;top:12px;left:15px;font-size:14px;opacity:0.3;">&#10022;</div>
      <div style="position:absolute;top:50px;right:20px;font-size:10px;opacity:0.25;">&#10022;</div>
      <div style="position:absolute;top:28px;right:50px;font-size:8px;opacity:0.2;">&#10022;</div>
      <div style="position:absolute;bottom:100px;left:25px;font-size:12px;opacity:0.2;">&#10022;</div>
      <div style="position:absolute;bottom:60px;right:35px;font-size:16px;opacity:0.15;">&#127878;</div>
      <div style="position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:radial-gradient(circle, #7c3aed10 0%, transparent 60%);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;background:radial-gradient(circle, #a78bfa08 0%, transparent 60%);border-radius:50%;"></div>`,
  },
  '어버이날': {
    emoji: '&#127801;',
    bgGradient: 'linear-gradient(180deg, #fff1f2 0%, #ffe4e6 30%, #fdf2f8 70%, #fff1f2 100%)',
    primaryColor: '#e11d48',
    accentColor: '#be123c',
    textColor: '#881337',
    subtleColor: '#fecdd3',
    borderColor: '#fda4af',
    tagBg: 'rgba(225,29,72,0.1)',
    tagText: '#e11d48',
    closureTagColor: '#be123c',
    decoElements: `
      <div style="position:absolute;top:15px;left:20px;font-size:24px;opacity:0.15;transform:rotate(-10deg);">&#127801;</div>
      <div style="position:absolute;top:50px;right:18px;font-size:18px;opacity:0.12;transform:rotate(15deg);">&#127801;</div>
      <div style="position:absolute;bottom:80px;left:35px;font-size:16px;opacity:0.08;transform:rotate(-5deg);">&#127801;</div>
      <div style="position:absolute;bottom:50px;right:30px;font-size:20px;opacity:0.10;transform:rotate(8deg);">&#10084;&#65039;</div>
      <div style="position:absolute;top:-50px;right:-50px;width:180px;height:180px;background:radial-gradient(circle, #e11d4810 0%, transparent 70%);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-30px;left:-30px;width:140px;height:140px;background:radial-gradient(circle, #f472b608 0%, transparent 70%);border-radius:50%;"></div>`,
  },
  '크리스마스': {
    emoji: '&#127876;',
    bgGradient: 'linear-gradient(180deg, #14532d 0%, #166534 40%, #1a2e1a 100%)',
    primaryColor: '#ef4444',
    accentColor: '#dc2626',
    textColor: '#ffffff',
    subtleColor: '#365314',
    borderColor: '#4ade80',
    tagBg: 'rgba(239,68,68,0.2)',
    tagText: '#fca5a5',
    closureTagColor: '#fca5a5',
    decoElements: `
      <div style="position:absolute;top:10px;left:18px;font-size:14px;opacity:0.25;color:#fbbf24;">&#10022;</div>
      <div style="position:absolute;top:40px;right:22px;font-size:10px;opacity:0.2;color:#fbbf24;">&#10022;</div>
      <div style="position:absolute;top:20px;right:55px;font-size:18px;opacity:0.15;">&#10052;&#65039;</div>
      <div style="position:absolute;bottom:90px;left:20px;font-size:12px;opacity:0.15;">&#10052;&#65039;</div>
      <div style="position:absolute;bottom:60px;right:25px;font-size:20px;opacity:0.12;">&#127873;</div>
      <div style="position:absolute;top:-50px;right:-50px;width:180px;height:180px;background:radial-gradient(circle, #ef444410 0%, transparent 60%);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;background:radial-gradient(circle, #22c55e08 0%, transparent 60%);border-radius:50%;"></div>`,
  },
};

const DEFAULT_HOLIDAY_DESIGN: HolidayDesign = {
  emoji: '&#127881;',
  bgGradient: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 40%, #eff6ff 100%)',
  primaryColor: '#2563eb',
  accentColor: '#1d4ed8',
  textColor: '#1e293b',
  subtleColor: '#dbeafe',
  borderColor: '#bfdbfe',
  tagBg: 'rgba(37,99,235,0.12)',
  tagText: '#2563eb',
  closureTagColor: '#1d4ed8',
  decoElements: `
    <div style="position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:rgba(37,99,235,0.05);border-radius:50%;"></div>
    <div style="position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;background:rgba(37,99,235,0.03);border-radius:50%;"></div>`,
};

export function buildGreetingHTML(data: GreetingTemplateData): string {
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const design = HOLIDAY_DESIGNS[data.holiday] || DEFAULT_HOLIDAY_DESIGN;
  const isDark = ['추석', '새해', '크리스마스'].includes(data.holiday);

  const logoHTML = data.logoBase64
    ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;${isDark ? 'filter:brightness(0) invert(1);' : ''}opacity:0.8;" />`
    : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 24px;background:${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)'};border-radius:16px;${isDark ? '' : 'backdrop-filter:blur(4px);'}text-align:center;font-size:13px;color:${isDark ? 'rgba(255,255,255,0.7)' : '#475569'};line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>`
    : '';

  const closureHTML = data.closurePeriod?.trim()
    ? `<div style="margin:28px auto;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:10px;padding:14px 28px;background:${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)'};border-radius:16px;border:1px solid ${isDark ? 'rgba(255,255,255,0.12)' : design.borderColor};box-shadow:0 4px 16px rgba(0,0,0,${isDark ? '0.2' : '0.04'});">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${design.closureTagColor}" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <div>
            <div style="font-size:11px;font-weight:700;color:${isDark ? 'rgba(255,255,255,0.5)' : '#94a3b8'};letter-spacing:1px;">CLOSED</div>
            <div style="font-size:15px;color:${isDark ? '#ffffff' : '#334155'};font-weight:700;margin-top:2px;">${esc(data.closurePeriod)}</div>
          </div>
        </div>
      </div>`
    : '';

  return `<div id="calendar-render-target" style="width:100%;background:${design.bgGradient};border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,${isDark ? '0.3' : '0.08'}),0 1px 3px rgba(0,0,0,0.04);position:relative;">
    ${design.decoElements}
    <div style="padding:56px 40px 48px;text-align:center;position:relative;">
      ${logoHTML ? `<div style="margin-bottom:20px;">${logoHTML}</div>` : ''}
      <div style="font-size:72px;margin-bottom:20px;filter:drop-shadow(0 4px 8px rgba(0,0,0,${isDark ? '0.3' : '0.1'}));">${design.emoji}</div>
      <div style="display:inline-block;padding:6px 24px;background:${design.tagBg};border-radius:24px;margin-bottom:20px;">
        <span style="font-size:14px;color:${design.tagText};font-weight:700;letter-spacing:2px;">${esc(data.holiday || '명절')}</span>
      </div>
      <div style="font-size:30px;font-weight:900;color:${design.textColor};line-height:1.6;white-space:pre-line;letter-spacing:-0.5px;${isDark ? 'text-shadow:0 2px 8px rgba(0,0,0,0.3);' : ''}">${esc(data.greeting || '행복한 명절 되세요')}</div>
      ${closureHTML}${customMsgHTML}
      ${data.hospitalName ? `<div style="margin-top:36px;padding-top:20px;border-top:2px solid ${isDark ? 'rgba(255,255,255,0.1)' : design.subtleColor};">
        <div style="font-size:13px;color:${isDark ? 'rgba(255,255,255,0.5)' : '#94a3b8'};font-weight:600;letter-spacing:3px;">${esc(data.hospitalName)}</div>
      </div>` : ''}
    </div>
  </div>`;
}

// ── 채용/공고 템플릿 ──

export interface HiringTemplateData {
  position: string;
  description?: string;
  qualifications?: string[];
  benefits?: string[];
  salary?: string;
  deadline?: string;
  contact?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildHiringHTML(data: HiringTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const qualHTML = (data.qualifications && data.qualifications.length > 0)
    ? `<div style="margin:20px 0;">
        <div style="font-size:12px;font-weight:800;color:${theme.primary};margin-bottom:12px;letter-spacing:1px;">&#9989; 자격 요건</div>
        <div style="padding:16px 20px;background:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;">
          ${data.qualifications.map(q => `<div style="font-size:14px;color:#475569;line-height:2.2;padding-left:18px;position:relative;"><span style="position:absolute;left:0;color:${theme.primary};font-size:11px;top:50%;transform:translateY(-50%);">&#9679;</span>${esc(q)}</div>`).join('')}
        </div>
      </div>` : '';

  const benefitsHTML = (data.benefits && data.benefits.length > 0)
    ? `<div style="margin:20px 0;">
        <div style="font-size:12px;font-weight:800;color:${theme.primary};margin-bottom:12px;letter-spacing:1px;">&#127873; 복리후생</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${data.benefits.map(b => `<div style="padding:12px 14px;background:${theme.light};border-radius:12px;border:1px solid ${theme.border};font-size:13px;color:#334155;font-weight:600;text-align:center;">${esc(b)}</div>`).join('')}
        </div>
      </div>` : '';

  const salaryHTML = data.salary?.trim()
    ? `<div style="margin:16px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:${theme.light};border:2px solid ${theme.border};border-radius:14px;">
          <span style="font-size:18px;">&#128176;</span>
          <span style="font-size:15px;color:${theme.primary};font-weight:800;">${esc(data.salary)}</span>
        </div>
      </div>` : '';

  const deadlineHTML = data.deadline?.trim()
    ? `<div style="margin:16px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:#fef2f2;border:1px solid #fecaca;border-radius:14px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style="font-size:14px;color:#dc2626;font-weight:700;">마감: ${esc(data.deadline)}</span>
        </div>
      </div>` : '';

  const contactHTML = data.contact?.trim()
    ? `<div style="margin:16px 0;padding:16px 20px;background:#f0f9ff;border-radius:14px;border:1px solid #bae6fd;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:#0284c7;letter-spacing:1px;margin-bottom:6px;">CONTACT</div>
        <div style="font-size:14px;color:#0369a1;font-weight:600;">${esc(data.contact)}</div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:24px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML ? `<div style="margin-bottom:12px;">${logoHTML}</div>` : ''}
      <div style="display:inline-block;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;margin-bottom:12px;">HIRING</div>
      <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 2px 4px rgba(0,0,0,0.1);">${esc(data.position || '직원 모집')}</div>
      ${data.description ? `<div style="font-size:15px;color:rgba(255,255,255,0.85);margin-top:10px;font-weight:400;line-height:1.5;">${esc(data.description)}</div>` : ''}
    </div>
    <div style="padding:28px 36px 32px;">
      ${salaryHTML}${qualHTML}${benefitsHTML}${deadlineHTML}${contactHTML}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}

// ── 주의사항 템플릿 ──

export interface CautionTemplateData {
  title: string;
  type?: string;
  items: string[];
  emergency?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildCautionHTML(data: CautionTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const typeColors: Record<string, { bg: string; text: string; icon: string }> = {
    '시술 후': { bg: '#eff6ff', text: '#2563eb', icon: '&#128137;' },
    '진료 후': { bg: '#f0fdf4', text: '#16a34a', icon: '&#129658;' },
    '수술 후': { bg: '#fef2f2', text: '#dc2626', icon: '&#127975;' },
    '복약': { bg: '#f5f3ff', text: '#7c3aed', icon: '&#128138;' },
    '일반': { bg: '#f8fafc', text: '#475569', icon: '&#9888;&#65039;' },
  };
  const typeStyle = typeColors[data.type || '일반'] || typeColors['일반'];

  const typeHTML = data.type
    ? `<div style="display:inline-block;margin-top:12px;padding:6px 18px;background:${typeStyle.bg};border-radius:20px;">
        <span style="font-size:13px;color:${typeStyle.text};font-weight:700;">${typeStyle.icon} ${esc(data.type)}</span>
      </div>` : '';

  const itemsHTML = data.items.length > 0
    ? `<div style="margin:24px 0;">
        ${data.items.map((item, i) => `<div style="display:flex;align-items:flex-start;gap:14px;padding:16px 0;${i < data.items.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">
          <div style="flex-shrink:0;width:32px;height:32px;background:${theme.light};border:2px solid ${theme.border};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:${theme.primary};">${i + 1}</div>
          <div style="font-size:15px;color:#334155;line-height:1.8;padding-top:5px;">${esc(item)}</div>
        </div>`).join('')}
      </div>` : '';

  const emergencyHTML = data.emergency?.trim()
    ? `<div style="margin:20px 0;padding:18px 24px;background:#fef2f2;border-radius:16px;border:2px solid #fecaca;text-align:center;">
        <div style="font-size:11px;font-weight:800;color:#dc2626;letter-spacing:1px;margin-bottom:6px;">&#128680; 응급 연락처</div>
        <div style="font-size:16px;color:#991b1b;font-weight:700;">${esc(data.emergency)}</div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:24px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML ? `<div style="margin-bottom:12px;">${logoHTML}</div>` : ''}
      <div style="display:inline-block;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;margin-bottom:12px;">CAUTION</div>
      <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 2px 4px rgba(0,0,0,0.1);">${esc(data.title || '주의사항')}</div>
      ${typeHTML}
    </div>
    <div style="padding:28px 36px 32px;">
      ${itemsHTML}${emergencyHTML}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}

// ── 비급여 안내 템플릿 (신규 — HTML 폴백 누락 버그 수정) ──

export interface PricingTemplateData {
  title: string;
  items: { name: string; price: string }[];
  notice?: string;
  hospitalName?: string;
  logoBase64?: string;
  colorTheme?: string;
  customMessage?: string;
}

export function buildPricingHTML(data: PricingTemplateData): string {
  const theme = THEMES[data.colorTheme || 'blue'] || THEMES.blue;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoHTML = data.logoBase64 ? `<img src="${data.logoBase64}" style="max-height:36px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9;" />` : '';
  const customMsgHTML = data.customMessage?.trim()
    ? `<div style="margin-top:20px;padding:16px 20px;background:${theme.light};border-radius:14px;border:1px solid ${theme.border};text-align:center;font-size:13px;color:#475569;line-height:1.7;white-space:pre-line;">${esc(data.customMessage.trim())}</div>` : '';

  const itemsHTML = data.items.length > 0
    ? `<div style="margin:24px 0;">
        ${data.items.map((item, i) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;${i < data.items.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">
          <div style="font-size:15px;color:#334155;font-weight:600;">${esc(item.name)}</div>
          <div style="font-size:16px;color:${theme.primary};font-weight:800;">${esc(item.price)}</div>
        </div>`).join('')}
      </div>` : '';

  const noticeHTML = data.notice?.trim()
    ? `<div style="margin:16px 0;padding:14px 20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:12px;color:#64748b;line-height:1.6;">${esc(data.notice)}</div>
      </div>` : '';

  const hospitalFooter = data.hospitalName
    ? `<div style="margin-top:24px;padding:16px 0 4px;border-top:2px solid ${theme.subtle};text-align:center;">
        <div style="font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:2px;">${esc(data.hospitalName)}</div>
      </div>` : '';

  return `<div id="calendar-render-target" style="width:100%;background:#ffffff;border-radius:24px;overflow:hidden;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.04);">
    <div style="background:${theme.headerBg};padding:36px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
      ${logoHTML ? `<div style="margin-bottom:12px;">${logoHTML}</div>` : ''}
      <div style="display:inline-block;padding:5px 18px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:700;letter-spacing:2px;margin-bottom:12px;">PRICE LIST</div>
      <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 2px 4px rgba(0,0,0,0.1);">${esc(data.title || '비급여 진료비 안내')}</div>
    </div>
    <div style="padding:28px 36px 32px;">
      ${itemsHTML}${noticeHTML}${customMsgHTML}${hospitalFooter}
    </div>
  </div>`;
}
