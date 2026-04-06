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
    const prompt = `당신은 카드뉴스 디자인 리버스 엔지니어링 전문가입니다.
첨부된 카드뉴스 이미지 ${imageDataUrls.length}개를 정밀 분석해, 이 디자인을 HTML/CSS로 **거의 완벽하게 재현**할 수 있는 상세 토큰을 추출하세요.

분석 항목:
1. 색상: 배경, 제목, 부제, 본문, 강조, 내부 카드 배경
2. 배경: 단색인지 그라데이션인지, 미세 패턴/텍스처가 있는지
3. 상/하단 장식: 색상 바, 라인, 그라데이션 바 유무
4. 내부 카드: 비교표·아이콘 등의 컨테이너 배경·라운드·그림자·보더
5. 강조 스타일: 하이라이트된 셀/항목의 배경·색상·라운드
6. 장식 요소: 구분선·제목 바·모서리 장식·도형(원, 육각형 등)
7. 타이포그래피: 제목/부제/본문 크기·굵기·정렬·자간
8. 레이아웃: 전체 패딩, 요소 간 간격, 정렬 방식

여러 이미지가 있으면 공통 패턴을 추출하고, 가장 자주 나타나는 스타일을 채택하세요.
CSS 값은 반드시 실제 동작하는 CSS여야 합니다.

반드시 아래 JSON 스키마로만 출력하세요. 마크다운 코드블록·주석·설명 금지:

{
  "colors": {
    "background": "#hex",
    "backgroundGradient": "linear-gradient(...) 또는 ''",
    "titleColor": "#hex",
    "subtitleColor": "#hex",
    "bodyColor": "#hex",
    "accentColor": "#hex"
  },
  "typography": {
    "titleSize": "42px~64px",
    "titleWeight": "700~900",
    "subtitleSize": "18px~26px",
    "bodySize": "16px~22px",
    "fontFamily": "'Pretendard', sans-serif"
  },
  "backgroundStyle": {
    "type": "solid|gradient|pattern",
    "gradient": "CSS gradient 문자열 또는 ''",
    "patternCSS": "background-image로 표현한 패턴 또는 ''",
    "hasTopAccent": true,
    "topAccentCSS": "height: 6px; background: linear-gradient(90deg, #F5A623, rgba(245,166,35,0.4), transparent)",
    "hasBottomAccent": false,
    "bottomAccentCSS": ""
  },
  "innerCardStyle": {
    "background": "rgba(255,255,255,0.06) 또는 #hex",
    "borderRadius": "18px~24px",
    "border": "1px solid rgba(255,255,255,0.1) 또는 'none'",
    "boxShadow": "0 10px 30px rgba(0,0,0,0.15) 또는 'none'",
    "padding": "28px 32px"
  },
  "highlightStyle": {
    "background": "rgba(245,166,35,0.18) 또는 #hex",
    "color": "#hex",
    "borderRadius": "14px"
  },
  "decorations": {
    "hasDividerLine": false,
    "dividerCSS": "",
    "hasAccentBar": true,
    "accentBarCSS": "width: 60px; height: 5px; background: #F5A623; border-radius: 3px",
    "hasCornerDecor": false,
    "cornerDecorCSS": "",
    "hasShapeDecor": false,
    "shapeDecorCSS": ""
  },
  "layoutRules": {
    "titleAlign": "left",
    "contentPadding": "60px 64px",
    "gap": "24px",
    "headerStyle": "bar"
  },
  "layout": {
    "subtitlePosition": "top",
    "titlePosition": "center",
    "visualPosition": "bottom",
    "padding": "60px 64px",
    "borderRadius": "0px"
  },
  "decoration": {
    "hasFrame": false,
    "frameStyle": "",
    "hasShapes": false,
    "shapeStyle": "",
    "overlay": ""
  },
  "layoutMatch": ["16종 중 이 디자인에 가장 어울리는 레이아웃 1~3개: cover/info/comparison/checklist/steps/icon-grid/data-highlight/qna/timeline/before-after/pros-cons/price-table/warning/quote/numbered-list/closing"],
  "slideStructure": ["이 스타일로 6장 카드뉴스를 만든다면 추천 레이아웃 순서, 예: cover,icon-grid,comparison,steps,checklist,closing"],
  "cssTemplate": ".card-container { ... } 전체 재현용 CSS. 비어도 무방.",
  "description": "이 디자인의 전체 느낌과 특징을 2~3문장으로"
}`;

    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: 'gemini-3.1-pro-preview',
        temperature: 0.3,
        maxOutputTokens: 8192,
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
