/**
 * 카드뉴스 디자인 템플릿 서비스
 * - 참고 이미지 → Gemini Vision 분석 → 디자인 토큰 추출
 * - localStorage 저장/불러오기
 */

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
    const prompt = `당신은 카드뉴스 디자인 분석 전문가입니다.
첨부된 카드뉴스 이미지 ${imageDataUrls.length}개의 디자인 패턴을 분석해주세요.

반드시 아래 JSON 형식으로만 출력하세요:

{
  "colors": {
    "background": "#hex",
    "backgroundGradient": "linear-gradient(...) 또는 빈 문자열",
    "titleColor": "#hex",
    "subtitleColor": "#hex",
    "bodyColor": "#hex",
    "accentColor": "#hex"
  },
  "typography": {
    "titleSize": "28px~36px",
    "titleWeight": "700~900",
    "subtitleSize": "14px~18px",
    "bodySize": "13px~16px",
    "fontFamily": "Pretendard, sans-serif"
  },
  "layout": {
    "subtitlePosition": "top 또는 bottom",
    "titlePosition": "center 또는 top-third",
    "visualPosition": "bottom 또는 center 또는 background",
    "padding": "30px~50px",
    "borderRadius": "0px 또는 12px 또는 20px"
  },
  "decoration": {
    "hasFrame": true/false,
    "frameStyle": "CSS border 또는 빈 문자열",
    "hasShapes": true/false,
    "shapeStyle": "장식 설명 또는 빈 문자열",
    "overlay": "CSS 또는 빈 문자열"
  },
  "cssTemplate": "1080x1080 정사각형 카드를 재현하는 CSS. .card-container(position:relative) 안에 .subtitle, .title, .description, .visual 영역을 position:absolute로 배치. 배경/장식 포함.",
  "description": "이 디자인의 느낌을 한 문장으로"
}

⚠️ JSON만 출력. 마크다운 코드블록도 쓰지 마세요.`;

    // 이미지를 inlineImages로 전달
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: 'gemini-3.1-pro-preview',
        temperature: 0.3,
        maxOutputTokens: 4096,
        inlineImages: imageDataUrls,
      }),
    });

    const data = await res.json();
    if (!data.text) return null;

    const cleaned = data.text.replace(/```json?\s*\n?/gi, '').replace(/\n?```\s*$/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      analysis: parsed.description || '',
      template: {
        colors: parsed.colors,
        typography: parsed.typography,
        layout: parsed.layout,
        decoration: parsed.decoration,
        rawAnalysis: data.text,
        cssTemplate: parsed.cssTemplate || '',
      },
    };
  } catch (err) {
    console.error('[cardTemplate] 분석 실패:', err);
    return null;
  }
}
