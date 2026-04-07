/**
 * 카드뉴스 디자인 템플릿 서비스
 * - 참고 이미지 → Gemini Vision 분석 → 상세 디자인 토큰 추출
 * - localStorage 저장/불러오기
 *
 * v2: 색상뿐 아니라 배경 패턴·내부 카드 스타일·장식 요소·레이아웃 규칙까지
 *     추출해서 렌더러가 거의 동일한 디자인을 재현할 수 있게 확장.
 */

export interface CardTemplateBackgroundStyle {
  type: 'solid' | 'gradient' | 'pattern';
  gradient?: string;         // CSS gradient (e.g. "linear-gradient(180deg, #111 0%, #222 100%)")
  patternCSS?: string;       // background-image 문자열 (radial/linear 조합 등)
  hasTopAccent: boolean;
  topAccentCSS?: string;     // "height: 6px; background: linear-gradient(...)"
  hasBottomAccent: boolean;
  bottomAccentCSS?: string;
}

export interface CardTemplateInnerCardStyle {
  background: string;
  borderRadius: string;
  border: string;            // "1px solid rgba(...)" 또는 "none"
  boxShadow: string;         // "0 4px 20px rgba(...)" 또는 "none"
  padding: string;
}

export interface CardTemplateHighlightStyle {
  background: string;
  color: string;
  borderRadius: string;
}

export interface CardTemplateDecorations {
  hasDividerLine: boolean;
  dividerCSS?: string;
  hasAccentBar: boolean;
  accentBarCSS?: string;     // "width: 60px; height: 5px; background: #F5A623; border-radius: 3px"
  hasCornerDecor: boolean;
  cornerDecorCSS?: string;
  hasShapeDecor: boolean;
  shapeDecorCSS?: string;    // "top: 40px; right: 40px; width: 120px; height: 120px; background: ..."
}

export interface CardTemplateLayoutRules {
  titleAlign: 'left' | 'center';
  contentPadding: string;    // "60px 64px"
  gap: string;               // "20px"
  headerStyle: 'bar' | 'rounded' | 'underline' | 'none';
}

export interface CardTemplate {
  id: string;
  name: string;
  createdAt: number;
  colors: {
    background: string;
    backgroundGradient?: string;
    titleColor: string;
    subtitleColor: string;
    bodyColor: string;
    accentColor: string;
  };
  typography: {
    titleSize: string;
    titleWeight: string;
    subtitleSize: string;
    bodySize: string;
    fontFamily: string;
  };
  // 이전 버전 호환 — 단순 레이아웃 힌트 (사용 빈도 낮음)
  layout: {
    subtitlePosition: 'top' | 'bottom';
    titlePosition: 'center' | 'top-third';
    visualPosition: 'bottom' | 'center' | 'background';
    padding: string;
    borderRadius: string;
  };
  decoration: {
    hasFrame: boolean;
    frameStyle?: string;
    hasShapes: boolean;
    shapeStyle?: string;
    overlay?: string;
  };

  // ── v2 신규 토큰 ──
  backgroundStyle?: CardTemplateBackgroundStyle;
  innerCardStyle?: CardTemplateInnerCardStyle;
  highlightStyle?: CardTemplateHighlightStyle;
  decorations?: CardTemplateDecorations;
  layoutRules?: CardTemplateLayoutRules;

  // v3: 레이아웃 학습
  layoutMatch?: string[];        // 매칭 레이아웃 (최대 3개)
  slideStructure?: string[];     // 추천 슬라이드 구성 순서

  rawAnalysis: string;
  cssTemplate: string;
  thumbnailDataUrl?: string;
}

const STORAGE_KEY = 'winaid_card_templates';
const MAX_TEMPLATES = 10;

export function getSavedTemplates(): CardTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveTemplate(template: CardTemplate): void {
  const list = getSavedTemplates();
  const idx = list.findIndex(t => t.id === template.id);
  if (idx >= 0) list[idx] = template;
  else list.unshift(template);
  while (list.length > MAX_TEMPLATES) list.pop();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function deleteTemplate(id: string): void {
  const list = getSavedTemplates().filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export async function analyzeDesignFromImages(imageDataUrls: string[]): Promise<{
  analysis: string;
  template: Omit<CardTemplate, 'id' | 'name' | 'createdAt' | 'thumbnailDataUrl'>;
} | null> {
  try {
    const prompt = `카드뉴스 이미지 ${imageDataUrls.length}장을 분석해서 디자인 토큰을 추출하세요.

**가장 중요한 것: 색상을 정확하게 뽑아주세요.** 스포이드로 찍듯이 정확한 hex 값.

JSON만 출력. 마크다운/코드블록/설명 절대 금지:

{
  "colors": {
    "background": "#hex (카드 전체 배경색)",
    "backgroundGradient": "linear-gradient(...) 또는 빈 문자열",
    "titleColor": "#hex (제목 색상)",
    "subtitleColor": "#hex (부제/소제목 색상)",
    "bodyColor": "#hex (본문 색상)",
    "accentColor": "#hex (강조색 — 버튼, 장식, 아이콘 배경 등)"
  },
  "typography": {
    "titleSize": "48px",
    "titleWeight": "800",
    "subtitleSize": "22px",
    "bodySize": "18px",
    "fontFamily": "'Pretendard', sans-serif"
  },
  "backgroundStyle": {
    "type": "solid 또는 gradient",
    "gradient": "CSS gradient 또는 빈 문자열",
    "hasTopAccent": true/false,
    "topAccentCSS": "height:6px;background:#hex 또는 빈 문자열",
    "hasBottomAccent": true/false,
    "bottomAccentCSS": ""
  },
  "innerCardStyle": {
    "background": "rgba(...) 또는 #hex (내부 카드/셀 배경)",
    "borderRadius": "18px",
    "border": "1px solid rgba(...) 또는 none",
    "boxShadow": "그림자 CSS 또는 none"
  },
  "decorations": {
    "hasAccentBar": true/false,
    "accentBarCSS": "width:60px;height:4px;background:#hex;border-radius:2px"
  },
  "layoutRules": {
    "titleAlign": "left 또는 center",
    "contentPadding": "60px 64px"
  },
  "layoutMatch": ["이 디자인에 어울리는 레이아웃 2~3개"],
  "slideStructure": ["cover","icon-grid","comparison","steps","checklist","closing"],
  "description": "이 디자인의 느낌을 2문장으로"
}`;

    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: 'gemini-3.1-pro-preview',
        temperature: 0.2,
        maxOutputTokens: 4096,
        inlineImages: imageDataUrls,
      }),
    });

    const data = await res.json();
    if (!data.text) return null;

    let cleaned = (data.text as string).replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
    // 혹시 앞뒤에 설명이 붙으면 첫 { 부터 마지막 } 까지만 추출
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    const parsed = JSON.parse(cleaned);

    return {
      analysis: parsed.description || '',
      template: {
        colors: parsed.colors,
        typography: parsed.typography,
        layout: parsed.layout || {
          subtitlePosition: 'top',
          titlePosition: 'center',
          visualPosition: 'bottom',
          padding: '60px 64px',
          borderRadius: '0px',
        },
        decoration: parsed.decoration || {
          hasFrame: false,
          hasShapes: false,
        },
        backgroundStyle: parsed.backgroundStyle,
        innerCardStyle: parsed.innerCardStyle,
        highlightStyle: parsed.highlightStyle,
        decorations: parsed.decorations,
        layoutRules: parsed.layoutRules,
        layoutMatch: Array.isArray(parsed.layoutMatch) ? parsed.layoutMatch : [],
        slideStructure: Array.isArray(parsed.slideStructure) ? parsed.slideStructure : [],
        rawAnalysis: data.text,
        cssTemplate: parsed.cssTemplate || '',
      },
    };
  } catch (err) {
    console.error('[cardTemplate] 분석 실패:', err);
    return null;
  }
}

/**
 * 이미지를 분석해서 편집 가능한 SlideData 템플릿으로 변환.
 * Mirra 스타일 — 이미지의 레이아웃을 재현하되, 텍스트/이미지를 교체 가능하게.
 */
export async function imageToEditableTemplate(imageDataUrl: string): Promise<{
  slide: {
    layout: string;
    title: string;
    subtitle?: string;
    body?: string;
    columns?: { header: string; items: string[]; highlight: boolean }[];
    compareLabels?: string[];
    icons?: { emoji: string; title: string; desc?: string }[];
    steps?: { label: string; desc?: string }[];
    checkItems?: string[];
    dataPoints?: { value: string; label: string; highlight?: boolean }[];
    questions?: { q: string; a: string }[];
    imagePosition?: string;
  };
  colors: {
    background: string;
    backgroundGradient?: string;
    titleColor: string;
    subtitleColor: string;
    bodyColor: string;
    accentColor: string;
  };
} | null> {
  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `이 카드뉴스 이미지를 보고 편집 가능한 슬라이드 데이터로 변환해줘.

1. 이미지에 보이는 텍스트를 정확히 읽어주세요
2. 레이아웃 구조를 파악해서 가장 적합한 layout 타입을 선택
3. 색상은 스포이드로 찍듯이 정확한 hex 값

layout 타입: cover, info, comparison, icon-grid, steps, checklist, data-highlight, qna, timeline, before-after, pros-cons, price-table, warning, quote, numbered-list, closing

JSON만 출력 (마크다운/코드블록 절대 금지):
{
  "slide": {
    "layout": "16종 중 하나",
    "title": "이미지에서 읽은 제목",
    "subtitle": "부제 (있으면)",
    "body": "본문 (있으면)",
    "columns": [{"header":"헤더","items":["항목"],"highlight":false}],
    "compareLabels": ["라벨"],
    "icons": [{"emoji":"🦷","title":"항목","desc":"설명"}],
    "steps": [{"label":"단계","desc":"설명"}],
    "checkItems": ["항목"],
    "dataPoints": [{"value":"95%","label":"라벨","highlight":true}],
    "questions": [{"q":"질문","a":"답변"}],
    "imagePosition": "top 또는 background 또는 없음"
  },
  "colors": {
    "background": "#hex (정확한 배경색)",
    "backgroundGradient": "linear-gradient(...) 또는 빈 문자열",
    "titleColor": "#hex",
    "subtitleColor": "#hex",
    "bodyColor": "#hex",
    "accentColor": "#hex"
  }
}

이미지에 없는 필드는 생략. layout에 맞는 필드만 포함.`,
        model: 'gemini-3.1-pro-preview',
        temperature: 0.2,
        maxOutputTokens: 4096,
        inlineImages: [imageDataUrl],
      }),
    });

    const data = await res.json();
    if (!data.text) return null;

    let cleaned = (data.text as string).replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) cleaned = cleaned.slice(firstBrace, lastBrace + 1);

    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[cardTemplate] 이미지→템플릿 변환 실패:', err);
    return null;
  }
}
