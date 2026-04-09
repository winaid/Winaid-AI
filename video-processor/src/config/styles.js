/**
 * 스타일 변환 설정
 *
 * FFmpeg 필터 (3종) + Gemini AI 프롬프트 (12종)
 */

// ── FFmpeg 필터 스타일 (빠름, 비용 없음) ──

const FFMPEG_STYLES = {
  vintage_film: 'curves=vintage,noise=c0s=8:c0f=t,eq=saturation=0.8:brightness=0.05:contrast=1.1',
  pencil_sketch: 'edgedetect=low=0.08:high=0.3:mode=colormix,negate,eq=contrast=1.5:brightness=0.1',
  pastel: 'eq=saturation=0.5:brightness=0.08:gamma=1.2,curves=lighter,unsharp=3:3:0.5',
};

// ── Gemini AI 스타일 프롬프트 (12종) ──

const GEMINI_STYLE_PROMPTS = {
  // 만화/웹툰
  korean_webtoon: {
    prompt: 'Transform this photo into Korean webtoon (manhwa) style illustration. Use clean digital lineart, flat cel shading with soft gradients, bright vivid colors. Characters should have semi-realistic proportions with slightly larger eyes. Background should be simplified but recognizable.',
    negative: 'Do not change the composition, number of people, or objects in the scene.',
    quality: 'High resolution, crisp lines, professional digital art quality.',
  },
  japanese_anime: {
    prompt: 'Transform this photo into Japanese anime illustration style. Use characteristic anime features: large expressive eyes, pointed chin, colorful hair highlights, vibrant saturated colors, dramatic lighting with rim light effects. Use anime cel shading technique.',
    negative: 'Do not change the composition or scene layout. Keep all people and objects in same positions.',
    quality: 'High quality anime illustration, studio Ghibli level detail.',
  },
  american_comic: {
    prompt: 'Transform this photo into American comic book style (Marvel/DC). Use bold black ink outlines, crosshatching for shadows, halftone dot patterns for mid-tones, dramatic contrast. Use vibrant primary colors.',
    negative: 'Maintain original composition and all visible people/objects.',
    quality: 'Professional comic book art quality, clean inks.',
  },

  // 일러스트
  watercolor: {
    prompt: 'Transform this photo into a beautiful watercolor painting. Use visible wet brush strokes, paint bleeding at edges, paper texture showing through, soft color transitions. Colors should be slightly muted and dreamy.',
    negative: 'Keep the same composition and recognizable subjects.',
    quality: 'Fine art watercolor quality, museum-worthy painting.',
  },
  flat_design: {
    prompt: 'Transform this photo into minimal flat design vector illustration. Use solid flat colors with no gradients, simple geometric shapes, clean edges, limited color palette (5-7 colors max). Modern corporate illustration style.',
    negative: 'Do not add new elements. Simplify but keep all main subjects.',
    quality: 'Clean vector art quality, suitable for professional presentation.',
  },

  // 3D/게임
  '3d_cartoon': {
    prompt: 'Transform this photo into Pixar/Disney 3D cartoon render style. Characters should have smooth plastic-like skin, oversized heads with big round eyes, small noses, exaggerated expressions. Use bright cheerful lighting with soft shadows.',
    negative: 'Keep the same scene layout and number of characters.',
    quality: 'Pixar movie quality 3D render, ray-traced lighting.',
  },
  pixel_art: {
    prompt: 'Transform this photo into retro 8-bit pixel art style. Use visible square pixels, very limited color palette (16 colors maximum), NES/SNES game aesthetic. Characters should be simplified to pixel form but still recognizable.',
    negative: 'Maintain the overall scene composition.',
    quality: 'Clean pixel art, consistent pixel size throughout.',
  },
  claymation: {
    prompt: 'Transform this photo into claymation stop-motion animation style. Everything should look like modeling clay or plasticine. Show subtle fingerprint marks on surfaces, soft rounded edges, warm studio lighting.',
    negative: 'Keep all subjects and their positions the same.',
    quality: 'Professional claymation quality like Wallace & Gromit.',
  },

  // 감성
  neon: {
    prompt: 'Transform this photo into cyberpunk neon aesthetic. Make the background very dark. Add bright neon glow effects in pink, cyan, and purple. Add neon light reflections on surfaces. Characters should be lit by neon rim lighting. Add subtle fog.',
    negative: 'Keep all people and objects in place. Only change lighting and color scheme.',
    quality: 'Cinematic cyberpunk quality, Blade Runner aesthetic.',
  },

  // 전문/의료
  medical_clean: {
    prompt: 'Transform this photo into clean professional medical illustration style. Use white and light blue color scheme. Make everything look sterile and clinical. Use soft shadows, even lighting, clean precise lines.',
    negative: 'Keep the same composition. Make it look professional and trustworthy.',
    quality: 'Medical-grade professional illustration, clean and precise.',
  },
  infographic: {
    prompt: 'Transform this photo into infographic illustration style. Use flat design with clean icons, labeled callouts, organized layout. Use professional color palette (blue, teal, gray). Add subtle grid lines and geometric shapes.',
    negative: 'Keep main subjects recognizable while stylizing into infographic form.',
    quality: 'Professional infographic quality, clean and informative.',
  },
  diagram: {
    prompt: 'Transform this photo into medical/anatomical diagram style. Use cross-section view where appropriate, add labeled arrows and annotations, use clinical color coding.',
    negative: 'Maintain the subject matter while converting to educational diagram form.',
    quality: 'Medical textbook quality diagram, educational and precise.',
  },
};

module.exports = { FFMPEG_STYLES, GEMINI_STYLE_PROMPTS };
