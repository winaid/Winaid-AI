/**
 * 영상 스타일 변환 라이브러리
 */

export interface VideoStyle {
  id: string;
  name: string;
  category: 'original' | 'cartoon' | 'illustration' | '3d' | 'mood' | 'professional';
  categoryLabel: string;
  description: string;
  promptSuffix: string;
  ffmpegFilter?: string;
  ready: boolean;
  processingTime: string; // 예상 처리 시간
}

export const VIDEO_STYLES: VideoStyle[] = [
  // 원본
  { id: 'original', name: '실사 그대로', category: 'original', categoryLabel: '원본', description: '촬영 영상 그대로 — 스킵', promptSuffix: '', ready: true, processingTime: '즉시' },

  // 만화/웹툰 (Gemini AI)
  { id: 'korean_webtoon', name: '한국 웹툰', category: 'cartoon', categoryLabel: '만화/웹툰', description: '네이버 웹툰 느낌', promptSuffix: 'korean webtoon style', ready: true, processingTime: '~2분' },
  { id: 'japanese_anime', name: '일본 애니', category: 'cartoon', categoryLabel: '만화/웹툰', description: '일본 애니메이션', promptSuffix: 'japanese anime style', ready: true, processingTime: '~2분' },
  { id: 'american_comic', name: '미국 코믹', category: 'cartoon', categoryLabel: '만화/웹툰', description: '마블/DC 느낌', promptSuffix: 'american comic book style', ready: true, processingTime: '~2분' },

  // 일러스트
  { id: 'watercolor', name: '수채화', category: 'illustration', categoryLabel: '일러스트', description: '부드러운 수채화', promptSuffix: 'watercolor painting style', ready: true, processingTime: '~2분' },
  { id: 'pencil_sketch', name: '연필 스케치', category: 'illustration', categoryLabel: '일러스트', description: '연필 드로잉', promptSuffix: 'pencil sketch drawing', ffmpegFilter: 'edgedetect=low=0.08:high=0.3:mode=colormix,negate,eq=contrast=1.5:brightness=0.1', ready: true, processingTime: '~10초' },
  { id: 'flat_design', name: '플랫 디자인', category: 'illustration', categoryLabel: '일러스트', description: '미니멀 플랫', promptSuffix: 'flat design illustration', ready: true, processingTime: '~2분' },

  // 3D/게임 (Gemini AI)
  { id: '3d_cartoon', name: '3D 카툰', category: '3d', categoryLabel: '3D/게임', description: '픽사 느낌 3D', promptSuffix: 'pixar style 3D render', ready: true, processingTime: '~2분' },
  { id: 'pixel_art', name: '픽셀 아트', category: '3d', categoryLabel: '3D/게임', description: '8비트 레트로', promptSuffix: '8bit pixel art style', ready: true, processingTime: '~2분' },
  { id: 'claymation', name: '클레이', category: '3d', categoryLabel: '3D/게임', description: '클레이 애니메이션', promptSuffix: 'claymation stop-motion style', ready: true, processingTime: '~2분' },

  // 감성
  { id: 'vintage_film', name: '빈티지 필름', category: 'mood', categoryLabel: '감성', description: '옛날 필름 느낌', promptSuffix: 'vintage film photography', ffmpegFilter: 'curves=vintage,noise=c0s=8:c0f=t,eq=saturation=0.8:brightness=0.05:contrast=1.1', ready: true, processingTime: '~10초' },
  { id: 'pastel', name: '파스텔톤', category: 'mood', categoryLabel: '감성', description: '부드러운 파스텔', promptSuffix: 'pastel color palette', ffmpegFilter: 'eq=saturation=0.5:brightness=0.08:gamma=1.2,curves=lighter,unsharp=3:3:0.5', ready: true, processingTime: '~10초' },
  { id: 'neon', name: '네온', category: 'mood', categoryLabel: '감성', description: '사이버펑크 네온', promptSuffix: 'neon glow, cyberpunk aesthetic', ready: true, processingTime: '~2분' },

  // 전문/의료 (Gemini AI)
  { id: 'medical_clean', name: '깔끔한 의료', category: 'professional', categoryLabel: '전문/의료', description: '깨끗하고 전문적', promptSuffix: 'clean medical illustration', ready: true, processingTime: '~2분' },
  { id: 'infographic', name: '인포그래픽', category: 'professional', categoryLabel: '전문/의료', description: '정보 전달 최적화', promptSuffix: 'infographic style', ready: true, processingTime: '~2분' },
  { id: 'diagram', name: '다이어그램', category: 'professional', categoryLabel: '전문/의료', description: '의료 해부도 스타일', promptSuffix: 'medical diagram style', ready: true, processingTime: '~2분' },
];

/** 카테고리별 그룹핑 */
export function getStylesByCategory(): Array<{ label: string; styles: VideoStyle[] }> {
  const map = new Map<string, VideoStyle[]>();
  for (const s of VIDEO_STYLES) {
    if (!map.has(s.categoryLabel)) map.set(s.categoryLabel, []);
    map.get(s.categoryLabel)!.push(s);
  }
  return Array.from(map.entries()).map(([label, styles]) => ({ label, styles }));
}

/** FFmpeg만으로 가능한 스타일인지 */
export function isFfmpegStyle(styleId: string): boolean {
  return !!VIDEO_STYLES.find(s => s.id === styleId)?.ffmpegFilter;
}

/** 스타일 ID로 스타일 조회 */
export function getStyleById(id: string): VideoStyle | undefined {
  return VIDEO_STYLES.find(s => s.id === id);
}
