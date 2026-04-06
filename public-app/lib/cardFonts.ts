export interface FontItem {
  id: string;
  name: string;
  family: string;
  googleFamily: string;
  category: 'gothic' | 'serif' | 'display' | 'handwriting' | 'mono';
  language: 'ko' | 'en' | 'both';
  description: string;
  weight: number[];
  isRecommended: boolean;
}

export const FONT_LIST: FontItem[] = [
  // ── 추천 한국어 ──
  { id: 'pretendard', name: 'Pretendard', family: "'Pretendard Variable', 'Pretendard', sans-serif", googleFamily: '', category: 'gothic', language: 'ko', description: '기본 깔끔한 고딕', weight: [400,500,600,700,800,900], isRecommended: true },
  { id: 'noto-sans-kr', name: 'Noto Sans KR', family: "'Noto Sans KR', sans-serif", googleFamily: 'Noto+Sans+KR:wght@400;500;700;900', category: 'gothic', language: 'ko', description: '구글 표준 고딕', weight: [400,500,700,900], isRecommended: true },
  { id: 'nanum-gothic', name: '나눔고딕', family: "'Nanum Gothic', sans-serif", googleFamily: 'Nanum+Gothic:wght@400;700;800', category: 'gothic', language: 'ko', description: '네이버 고딕', weight: [400,700,800], isRecommended: true },
  { id: 'nanum-myeongjo', name: '나눔명조', family: "'Nanum Myeongjo', serif", googleFamily: 'Nanum+Myeongjo:wght@400;700;800', category: 'serif', language: 'ko', description: '우아한 명조', weight: [400,700,800], isRecommended: true },
  { id: 'nanum-pen', name: '나눔손글씨 펜', family: "'Nanum Pen Script', cursive", googleFamily: 'Nanum+Pen+Script', category: 'handwriting', language: 'ko', description: '자연스러운 펜글씨', weight: [400], isRecommended: true },
  { id: 'black-han-sans', name: '블랙한산스', family: "'Black Han Sans', sans-serif", googleFamily: 'Black+Han+Sans', category: 'display', language: 'ko', description: '임팩트 두꺼운', weight: [400], isRecommended: true },
  { id: 'jua', name: '주아', family: "'Jua', sans-serif", googleFamily: 'Jua', category: 'display', language: 'ko', description: '둥글고 친근한', weight: [400], isRecommended: true },
  { id: 'do-hyeon', name: '도현', family: "'Do Hyeon', sans-serif", googleFamily: 'Do+Hyeon', category: 'display', language: 'ko', description: '굵고 강렬한', weight: [400], isRecommended: true },
  { id: 'gothic-a1', name: 'Gothic A1', family: "'Gothic A1', sans-serif", googleFamily: 'Gothic+A1:wght@400;500;600;700;800;900', category: 'gothic', language: 'ko', description: '모던 고딕', weight: [400,500,600,700,800,900], isRecommended: true },
  { id: 'gowun-dodum', name: '고운돋움', family: "'Gowun Dodum', sans-serif", googleFamily: 'Gowun+Dodum', category: 'gothic', language: 'ko', description: '부드러운 돋움', weight: [400], isRecommended: false },
  { id: 'gowun-batang', name: '고운바탕', family: "'Gowun Batang', serif", googleFamily: 'Gowun+Batang:wght@400;700', category: 'serif', language: 'ko', description: '고전적 바탕', weight: [400,700], isRecommended: false },
  { id: 'ibm-plex-kr', name: 'IBM Plex Sans KR', family: "'IBM Plex Sans KR', sans-serif", googleFamily: 'IBM+Plex+Sans+KR:wght@400;500;600;700', category: 'gothic', language: 'ko', description: 'IBM 한국어', weight: [400,500,600,700], isRecommended: false },
  { id: 'sunflower', name: '해바라기', family: "'Sunflower', sans-serif", googleFamily: 'Sunflower:wght@300;500;700', category: 'gothic', language: 'ko', description: '가벼운 산세리프', weight: [300,500,700], isRecommended: false },
  { id: 'single-day', name: '싱글데이', family: "'Single Day', cursive", googleFamily: 'Single+Day', category: 'handwriting', language: 'ko', description: '귀여운 손글씨', weight: [400], isRecommended: false },
  { id: 'poor-story', name: '아자', family: "'Poor Story', cursive", googleFamily: 'Poor+Story', category: 'handwriting', language: 'ko', description: '아기자기한', weight: [400], isRecommended: false },
  { id: 'gaegu', name: '개구', family: "'Gaegu', cursive", googleFamily: 'Gaegu:wght@300;400;700', category: 'handwriting', language: 'ko', description: '자유로운 손글씨', weight: [300,400,700], isRecommended: false },
  { id: 'east-sea', name: '동해독체', family: "'East Sea Dokdo', cursive", googleFamily: 'East+Sea+Dokdo', category: 'handwriting', language: 'ko', description: '붓글씨 느낌', weight: [400], isRecommended: false },
  { id: 'hahmlet', name: '함렛', family: "'Hahmlet', serif", googleFamily: 'Hahmlet:wght@400;500;600;700;800;900', category: 'serif', language: 'ko', description: '현대적 명조', weight: [400,500,600,700,800,900], isRecommended: false },
  // ── 추천 영어 ──
  { id: 'poppins', name: 'Poppins', family: "'Poppins', sans-serif", googleFamily: 'Poppins:wght@400;500;600;700;800;900', category: 'gothic', language: 'en', description: 'Clean & Modern', weight: [400,500,600,700,800,900], isRecommended: true },
  { id: 'montserrat', name: 'Montserrat', family: "'Montserrat', sans-serif", googleFamily: 'Montserrat:wght@400;500;600;700;800;900', category: 'gothic', language: 'en', description: 'Bold & Professional', weight: [400,500,600,700,800,900], isRecommended: true },
  { id: 'playfair', name: 'Playfair Display', family: "'Playfair Display', serif", googleFamily: 'Playfair+Display:wght@400;500;600;700;800;900', category: 'serif', language: 'en', description: 'Elegant Serif', weight: [400,500,600,700,800,900], isRecommended: true },
  { id: 'raleway', name: 'Raleway', family: "'Raleway', sans-serif", googleFamily: 'Raleway:wght@400;500;600;700;800;900', category: 'gothic', language: 'en', description: 'Thin & Elegant', weight: [400,500,600,700,800,900], isRecommended: true },
  { id: 'space-grotesk', name: 'Space Grotesk', family: "'Space Grotesk', sans-serif", googleFamily: 'Space+Grotesk:wght@400;500;600;700', category: 'gothic', language: 'en', description: 'Tech & Modern', weight: [400,500,600,700], isRecommended: true },
  { id: 'dm-sans', name: 'DM Sans', family: "'DM Sans', sans-serif", googleFamily: 'DM+Sans:wght@400;500;600;700', category: 'gothic', language: 'en', description: 'Clean Geometric', weight: [400,500,600,700], isRecommended: true },
  { id: 'oswald', name: 'Oswald', family: "'Oswald', sans-serif", googleFamily: 'Oswald:wght@400;500;600;700', category: 'display', language: 'en', description: 'Condensed Bold', weight: [400,500,600,700], isRecommended: false },
  { id: 'lora', name: 'Lora', family: "'Lora', serif", googleFamily: 'Lora:wght@400;500;600;700', category: 'serif', language: 'en', description: 'Classic Serif', weight: [400,500,600,700], isRecommended: false },
  { id: 'quicksand', name: 'Quicksand', family: "'Quicksand', sans-serif", googleFamily: 'Quicksand:wght@400;500;600;700', category: 'gothic', language: 'en', description: 'Rounded Friendly', weight: [400,500,600,700], isRecommended: false },
  { id: 'bebas-neue', name: 'Bebas Neue', family: "'Bebas Neue', sans-serif", googleFamily: 'Bebas+Neue', category: 'display', language: 'en', description: 'Impact Headline', weight: [400], isRecommended: false },
  { id: 'dancing-script', name: 'Dancing Script', family: "'Dancing Script', cursive", googleFamily: 'Dancing+Script:wght@400;500;600;700', category: 'handwriting', language: 'en', description: 'Elegant Script', weight: [400,500,600,700], isRecommended: false },
  { id: 'pacifico', name: 'Pacifico', family: "'Pacifico', cursive", googleFamily: 'Pacifico', category: 'handwriting', language: 'en', description: 'Fun & Casual', weight: [400], isRecommended: false },
];

/** ID로 FontItem 조회 */
export function getFontById(id: string): FontItem | undefined {
  return FONT_LIST.find(f => f.id === id);
}

/** Google Font CDN 로드 */
export function loadGoogleFont(font: FontItem) {
  if (typeof document === 'undefined' || !font.googleFamily) return;
  const linkId = `gfont-${font.id}`;
  if (document.getElementById(linkId)) return;
  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.googleFamily}&display=swap`;
  document.head.appendChild(link);
}
