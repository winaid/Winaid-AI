/**
 * P0 QA: 스타일 계약 검증
 *
 * imageOrchestrator의 프롬프트 조합 로직을 함수로 추출하여
 * 각 스타일(photo / illustration / medical / custom)별 최종 프롬프트를 실측한다.
 *
 * 검증 대상:
 *   1. hero prompt에서 style intent가 살아 있는지
 *   2. sub prompt에서 style intent가 살아 있는지
 *   3. ultraMinimal에서 style intent가 유지되는지
 *   4. retry prompt에서 style intent가 유지되는지
 *   5. 실사/비실사 경계가 무너지지 않는지
 */
import { describe, it, expect } from 'vitest';
import {
  BLOG_IMAGE_STYLE_COMPACT,
  STYLE_KEYWORD_SHORT,
} from '../imagePromptBuilder';
import { buildHeroRetryItem } from '../../../core/generation/blogImagePlanner';
import type { ImageStyle } from '../../../types';

// ── imageOrchestrator.ts의 프롬프트 조합 로직을 정확히 재현 ──
// (원본 함수는 localStorage 의존으로 직접 import 불가)
function buildPrompts(
  promptText: string,
  style: ImageStyle,
  customStylePrompt?: string,
) {
  const styleKw = customStylePrompt || STYLE_KEYWORD_SHORT[style] || STYLE_KEYWORD_SHORT.illustration;
  const isPhoto = style === 'photo' && !customStylePrompt;

  const COMMON_CONSTRAINTS = 'No text, no letters, no typography, no watermark, no logo. No hanbok, no traditional clothing, no cultural costume, no historical styling, no wedding styling, no festival styling. No exaggerated poses, no glamorous fashion portrait. Single scene only — no split screen, no diptych, no collage, no side-by-side panels, no before-after comparison, no multiple frames in one image.';

  const heroAtmosphere = isPhoto
    ? 'Calm, trustworthy, realistic editorial photo. The setting should match the subject — hospital/clinic if about treatment, home/daily life if about prevention or symptoms.'
    : style === 'medical'
    ? 'Medical educational 3D illustration style. NOT a photograph. Clean, clinical, diagrammatic composition with semi-transparent anatomical elements.'
    : style === 'illustration'
    ? '3D rendered illustration, Blender/Pixar style. NOT a photograph. Soft pastel lighting, rounded friendly shapes, clean gradient background.'
    : 'Follow the custom style direction below. Do NOT default to photorealistic unless explicitly requested.';

  const heroPerson = isPhoto
    ? 'Modern Korean adult with natural Korean facial features, wearing contemporary everyday clothing or realistic medical attire.'
    : style === 'medical'
    ? 'If a person is needed: stylized 3D rendered Korean adult, simplified features. Anatomical/medical focus is primary.'
    : style === 'illustration'
    ? '3D rendered character — modern Korean adult with friendly rounded features, contemporary casual or medical clothing. NOT photorealistic.'
    : 'Modern Korean adult matching the custom style below.';

  const heroStyleDirective = customStylePrompt || BLOG_IMAGE_STYLE_COMPACT[style] || BLOG_IMAGE_STYLE_COMPACT.illustration;
  const heroPrompt = `Generate a 16:9 landscape editorial image for a Korean medical/dental health blog.
[Subject] ${promptText}
[Person] ${heroPerson}
[Atmosphere] ${heroAtmosphere}
[Style] ${heroStyleDirective}
[Rules] ${COMMON_CONSTRAINTS}`.trim();

  const subPersonHint = isPhoto
    ? 'Modern Korean adult, natural Korean facial features, contemporary clothing.'
    : style === 'medical'
    ? '3D medical illustration style, NOT a photo.'
    : style === 'illustration'
    ? '3D illustration style, friendly rounded character, NOT a photo.'
    : '';
  const subPrompt = `Korean health blog image: ${promptText.substring(0, 140)}. ${subPersonHint} ${styleKw}. ${COMMON_CONSTRAINTS} 16:9.`.trim();
  const ultraMinimal = `${promptText.substring(0, 80)}. ${subPersonHint} ${styleKw}. No text, no watermark, no hanbok. 16:9.`.trim();

  return { heroPrompt, subPrompt, ultraMinimal, isPhoto, heroAtmosphere, heroPerson, heroStyleDirective, subPersonHint, styleKw };
}

// ── P0-1: photo 스타일 ──
describe('P0 스타일 계약: photo', () => {
  const r = buildPrompts('임플란트 수술 과정', 'photo');

  it('isPhoto = true', () => {
    expect(r.isPhoto).toBe(true);
  });

  it('hero [Atmosphere]에 "realistic editorial photo" 포함', () => {
    expect(r.heroAtmosphere).toContain('realistic editorial photo');
  });

  it('hero [Person]에 "realistic medical attire" 포함', () => {
    expect(r.heroPerson).toContain('realistic medical attire');
  });

  it('hero [Style]에 "photorealistic" 포함', () => {
    expect(r.heroStyleDirective).toContain('photorealistic');
  });

  it('sub에 "Modern Korean adult" 포함', () => {
    expect(r.subPersonHint).toContain('Modern Korean adult');
  });

  it('sub styleKw에 "photorealistic" 포함', () => {
    expect(r.styleKw).toContain('photorealistic');
  });

  it('hero에 "NOT a photograph" 없음 (실사이므로)', () => {
    expect(r.heroPrompt).not.toContain('NOT a photograph');
  });
});

// ── P0-2: illustration 스타일 ──
describe('P0 스타일 계약: illustration', () => {
  const r = buildPrompts('잇몸 관리 방법', 'illustration');

  it('isPhoto = false', () => {
    expect(r.isPhoto).toBe(false);
  });

  it('hero [Atmosphere]에 "NOT a photograph" 포함', () => {
    expect(r.heroAtmosphere).toContain('NOT a photograph');
  });

  it('hero [Atmosphere]에 "3D rendered illustration" 포함', () => {
    expect(r.heroAtmosphere).toContain('3D rendered illustration');
  });

  it('hero [Person]에 "NOT photorealistic" 포함', () => {
    expect(r.heroPerson).toContain('NOT photorealistic');
  });

  it('hero [Style]에 "NOT a photograph" 포함', () => {
    expect(r.heroStyleDirective).toContain('NOT a photograph');
  });

  it('hero에 "realistic editorial photo" 없음', () => {
    expect(r.heroPrompt).not.toContain('realistic editorial photo');
  });

  it('hero [Style]에 "modern Korean adult patient" 같은 실사 인물 묘사 없음', () => {
    expect(r.heroStyleDirective).not.toContain('modern Korean adult patient');
    expect(r.heroStyleDirective).not.toContain('natural Korean facial features');
  });

  it('sub에 "NOT a photo" 포함', () => {
    expect(r.subPersonHint).toContain('NOT a photo');
  });

  it('sub styleKw에 "NOT a photo" 포함', () => {
    expect(r.styleKw).toContain('NOT a photo');
  });

  it('ultraMinimal에도 "NOT a photo" 포함', () => {
    expect(r.ultraMinimal).toContain('NOT a photo');
  });
});

// ── medical 전용 프롬프트 빌더 (오케스트레이터의 완전 분리 경로 재현) ──
function buildMedicalPrompts(promptText: string) {
  const COMMON_CONSTRAINTS = 'No text, no letters, no typography, no watermark, no logo. No hanbok, no traditional clothing, no cultural costume, no historical styling, no wedding styling, no festival styling. No exaggerated poses, no glamorous fashion portrait. Single scene only — no split screen, no diptych, no collage, no side-by-side panels, no before-after comparison, no multiple frames in one image.';
  const MEDICAL_NEGATIVE = 'Do NOT generate a photorealistic portrait. Do NOT show a human face close-up. Do NOT create a lifestyle clinic photo, stock photo, editorial patient photo, beauty shot, or cinematic portrait. No real human as main subject.';

  const heroPrompt = `Generate a 16:9 landscape 3D medical illustration for a Korean dental/health educational blog.
[Visual Subject] ${promptText} — Show this as an anatomical 3D render, clinical cross-section, or educational medical diagram. The main visual subject must be dental/oral anatomy, treatment mechanism, or medical structure — NOT a human portrait.
[Rendering Style] 3D medical illustration, anatomical render, educational clinical visualization, rendered tooth/gum/oral anatomy, clean studio lighting, blue-white-teal clinical palette, semi-transparent layers where relevant, diagrammatic composition. Similar to medical textbook 3D renders or dental education materials.
[Constraint] ${MEDICAL_NEGATIVE}
[Rules] ${COMMON_CONSTRAINTS}`.trim();

  const subPrompt = `3D medical illustration: ${promptText.substring(0, 120)}. Anatomical render, dental/oral structure visualization, clinical cross-section, educational diagram style. Blue-white palette, clean studio lighting. NOT a photograph, NOT a portrait, NOT a stock photo. ${COMMON_CONSTRAINTS} 16:9.`.trim();

  const ultraMinimal = `3D medical illustration of ${promptText.substring(0, 80)}. Anatomical render, clinical visualization, NOT a photo, NOT a portrait. No text, no watermark. 16:9.`.trim();

  return { heroPrompt, subPrompt, ultraMinimal, MEDICAL_NEGATIVE };
}

// ── P0-3: medical 스타일 (완전 분리 경로) ──
describe('P0 스타일 계약: medical', () => {
  const r = buildMedicalPrompts('척추 디스크 구조');

  it('hero에 "editorial image" 없음 (medical은 편집 사진 아님)', () => {
    expect(r.heroPrompt).not.toContain('editorial image');
  });

  it('hero에 "3D medical illustration" 포함', () => {
    expect(r.heroPrompt).toContain('3D medical illustration');
  });

  it('hero에 [Person] 섹션 없음 (medical은 인물 중심 아님)', () => {
    expect(r.heroPrompt).not.toContain('[Person]');
  });

  it('hero에 "NOT a human portrait" 포함', () => {
    expect(r.heroPrompt).toContain('NOT a human portrait');
  });

  it('hero에 "anatomical render" 포함', () => {
    expect(r.heroPrompt).toContain('anatomical render');
  });

  it('hero에 "educational clinical visualization" 포함', () => {
    expect(r.heroPrompt).toContain('educational clinical visualization');
  });

  it('hero에 "NOT a photograph" 없어도 "NOT a photorealistic portrait" 등 강한 제약 있음', () => {
    expect(r.heroPrompt).toContain('Do NOT generate a photorealistic portrait');
  });

  it('hero에 "realistic editorial photo" 없음', () => {
    expect(r.heroPrompt).not.toContain('realistic editorial photo');
  });

  it('hero에 "Modern Korean adult" 없음', () => {
    expect(r.heroPrompt).not.toContain('Modern Korean adult');
  });

  it('hero에 portrait/face 억제 제약 포함', () => {
    expect(r.MEDICAL_NEGATIVE).toContain('Do NOT show a human face close-up');
    expect(r.MEDICAL_NEGATIVE).toContain('stock photo');
    expect(r.MEDICAL_NEGATIVE).toContain('beauty shot');
  });

  it('sub에 "3D medical illustration" 포함', () => {
    expect(r.subPrompt).toContain('3D medical illustration');
  });

  it('sub에 "NOT a portrait" 포함', () => {
    expect(r.subPrompt).toContain('NOT a portrait');
  });

  it('sub에 "NOT a photograph" 포함', () => {
    expect(r.subPrompt).toContain('NOT a photograph');
  });

  it('sub에 "Modern Korean adult" 없음', () => {
    expect(r.subPrompt).not.toContain('Modern Korean adult');
  });

  it('ultraMinimal에 "3D medical illustration" 포함', () => {
    expect(r.ultraMinimal).toContain('3D medical illustration');
  });

  it('ultraMinimal에 "NOT a portrait" 포함', () => {
    expect(r.ultraMinimal).toContain('NOT a portrait');
  });

  it('ultraMinimal에 "NOT a photo" 포함', () => {
    expect(r.ultraMinimal).toContain('NOT a photo');
  });
});

// ── P0-3b: medical vs photo 구조 차이 ──
describe('P0 medical vs photo 구조 차이', () => {
  const med = buildMedicalPrompts('치아미백 원리');
  const photo = buildPrompts('치아미백 원리', 'photo');

  it('medical hero에 [Person] 없음, photo hero에 [Person] 있음', () => {
    expect(med.heroPrompt).not.toContain('[Person]');
    expect(photo.heroPrompt).toContain('[Person]');
  });

  it('medical hero에 "editorial image" 없음 (negative 제약의 "editorial patient photo"는 OK)', () => {
    expect(med.heroPrompt).not.toContain('editorial image');
    expect(med.heroPrompt).not.toContain('landscape editorial');
    expect(photo.heroPrompt).toContain('editorial');
  });

  it('medical hero에 "anatomical render" 있음, photo hero에 없음', () => {
    expect(med.heroPrompt).toContain('anatomical render');
    expect(photo.heroPrompt).not.toContain('anatomical render');
  });

  it('medical sub에 "portrait" 억제, photo sub에 portrait 억제 없음', () => {
    expect(med.subPrompt).toContain('NOT a portrait');
    expect(photo.subPrompt).not.toContain('NOT a portrait');
  });
});

// ── P0-4: custom 스타일 ──
describe('P0 스타일 계약: custom', () => {
  describe('custom with "수채화 스타일"', () => {
    const customPrompt = '수채화 스타일, 부드러운 붓터치, 따뜻한 색감';
    const r = buildPrompts('치아 미백 과정', 'custom', customPrompt);

    it('isPhoto = false (custom + customStylePrompt)', () => {
      expect(r.isPhoto).toBe(false);
    });

    it('hero [Atmosphere]에 "Do NOT default to photorealistic" 포함', () => {
      expect(r.heroAtmosphere).toContain('Do NOT default to photorealistic');
    });

    it('hero [Style]에 customStylePrompt 원문 반영', () => {
      expect(r.heroStyleDirective).toBe(customPrompt);
    });

    it('hero에 "realistic editorial photo" 없음', () => {
      expect(r.heroPrompt).not.toContain('realistic editorial photo');
    });

    it('sub styleKw가 customStylePrompt', () => {
      expect(r.styleKw).toBe(customPrompt);
    });

    it('sub에 custom 프롬프트 포함', () => {
      expect(r.subPrompt).toContain('수채화');
    });
  });

  describe('custom with "플랫 벡터 스타일"', () => {
    const customPrompt = '플랫 벡터, 미니멀, 선명한 색상 블록';
    const r = buildPrompts('교정 치료 단계', 'custom', customPrompt);

    it('hero [Style]에 customStylePrompt 반영', () => {
      expect(r.heroStyleDirective).toBe(customPrompt);
    });

    it('sub에 "플랫 벡터" 포함', () => {
      expect(r.subPrompt).toContain('플랫 벡터');
    });
  });

  describe('photo + customStylePrompt → custom이 우선', () => {
    const customPrompt = '파스텔 톤 일러스트';
    const r = buildPrompts('잇몸 건강', 'photo', customPrompt);

    it('isPhoto = false (customStylePrompt가 있으므로)', () => {
      expect(r.isPhoto).toBe(false);
    });

    it('hero에 "realistic editorial photo" 없음', () => {
      expect(r.heroPrompt).not.toContain('realistic editorial photo');
    });

    it('hero [Style]에 customStylePrompt 반영', () => {
      expect(r.heroStyleDirective).toBe(customPrompt);
    });
  });
});

// ── P0-5: retry 시 스타일 유지 ──
describe('P0 retry 스타일 유지', () => {
  it('medical retry: 완전 분리 구조 — "3D medical illustration" + "NOT a portrait"', () => {
    const item = buildHeroRetryItem('척추 디스크', 'medical', '16:9');
    expect(item.prompt).toContain('3D medical illustration');
    expect(item.prompt).toContain('NOT a portrait');
    expect(item.prompt).toContain('NOT a photograph');
    expect(item.prompt).not.toContain('현대 한국인');
    expect(item.prompt).not.toContain('신뢰감');
    expect(item.style).toBe('medical');
  });

  it('medical retry: editorial / person / portrait 없음', () => {
    const item = buildHeroRetryItem('치아미백', 'medical', '16:9');
    expect(item.prompt).not.toContain('editorial');
    expect(item.prompt).not.toContain('Modern Korean');
    expect(item.prompt).toContain('Anatomical render');
  });

  it('illustration retry에 "NOT a photograph" 포함', () => {
    const item = buildHeroRetryItem('잇몸 관리', 'illustration', '16:9');
    expect(item.prompt).toContain('NOT a photograph');
    expect(item.prompt).toContain('3D 일러스트');
    expect(item.style).toBe('illustration');
  });

  it('photo retry에 "실사 사진" 포함', () => {
    const item = buildHeroRetryItem('임플란트', 'photo', '16:9');
    expect(item.prompt).toContain('실사 사진');
    expect(item.style).toBe('photo');
  });

  it('custom retry에 customStylePrompt 60자 반영', () => {
    const customPrompt = '수채화 스타일, 부드러운 붓터치, 따뜻한 색감, 의료 일러스트레이션';
    const item = buildHeroRetryItem('치아 미백', 'custom', '16:9', customPrompt);
    expect(item.prompt).toContain('수채화 스타일');
    expect(item.customStylePrompt).toBe(customPrompt);
  });

  it('medical retry item이 generateBlogImage에서 medical 전용 경로를 타는지', () => {
    const item = buildHeroRetryItem('충치', 'medical', '16:9');
    // medical retry item은 style='medical'이므로 오케스트레이터에서 isMedical 분기
    expect(item.style).toBe('medical');
    // retry prompt 자체가 이미 medical 전용 구조
    expect(item.prompt).toContain('3D medical illustration');
    expect(item.prompt).not.toContain('[Person]');
  });
});

// ── P0-6: BLOG_IMAGE_STYLE_COMPACT 정합성 ──
describe('P0 COMPACT preset 정합성', () => {
  it('illustration COMPACT에 실사 인물 묘사 없음', () => {
    const compact = BLOG_IMAGE_STYLE_COMPACT.illustration;
    expect(compact).not.toContain('modern Korean adult patient');
    expect(compact).not.toContain('natural Korean facial features');
    expect(compact).toContain('3D rendered');
    expect(compact).toContain('NOT a photograph');
  });

  it('medical COMPACT에 "NOT a photograph" + "NOT photorealistic"', () => {
    const compact = BLOG_IMAGE_STYLE_COMPACT.medical;
    expect(compact).toContain('NOT a photograph');
    expect(compact).toContain('NOT photorealistic');
  });

  it('photo COMPACT에 "photorealistic" 유지', () => {
    const compact = BLOG_IMAGE_STYLE_COMPACT.photo;
    expect(compact).toContain('photorealistic');
    expect(compact).toContain('DSLR');
  });
});

// ── P0-7: STYLE_KEYWORD_SHORT 정합성 ──
describe('P0 SHORT keyword 정합성', () => {
  it('illustration SHORT에 "NOT a photo"', () => {
    expect(STYLE_KEYWORD_SHORT.illustration).toContain('NOT a photo');
  });

  it('medical SHORT에 "NOT a photo"', () => {
    expect(STYLE_KEYWORD_SHORT.medical).toContain('NOT a photo');
  });

  it('photo SHORT에 "photorealistic"', () => {
    expect(STYLE_KEYWORD_SHORT.photo).toContain('photorealistic');
  });
});

// ── P0-8: 전 구간 실사 키워드 혼입 검사 ──
describe('P0 실사 키워드 혼입 방지', () => {
  // illustration은 공통 경로 사용
  describe('illustration 스타일', () => {
    const r = buildPrompts('테스트 주제', 'illustration');

    it('hero에 "realistic editorial photo" 없음', () => {
      expect(r.heroPrompt).not.toContain('realistic editorial photo');
    });

    it('hero에 "realistic medical attire" 없음', () => {
      expect(r.heroPrompt).not.toContain('realistic medical attire');
    });

    it('hero [Style]에 "photorealistic"가 positive로 쓰이지 않음', () => {
      const directive = r.heroStyleDirective;
      const hasPositivePhotorealistic = directive.includes('photorealistic') &&
        !directive.includes('NOT photorealistic');
      expect(hasPositivePhotorealistic).toBe(false);
    });

    it('sub에 "Modern Korean adult, natural Korean facial features" 없음', () => {
      expect(r.subPersonHint).not.toContain('Modern Korean adult, natural Korean facial features');
    });
  });

  // medical은 완전 분리 경로 — 더 강한 검사
  describe('medical 스타일 (분리 경로)', () => {
    const r = buildMedicalPrompts('테스트 주제');

    it('hero에 "editorial" 없음', () => {
      expect(r.heroPrompt).not.toContain('editorial image');
      expect(r.heroPrompt).not.toContain('editorial photo');
    });

    it('hero에 "Modern Korean adult" 없음', () => {
      expect(r.heroPrompt).not.toContain('Modern Korean adult');
    });

    it('hero에 "facial features" 없음', () => {
      expect(r.heroPrompt).not.toContain('facial features');
    });

    it('hero에 [Person] 없음', () => {
      expect(r.heroPrompt).not.toContain('[Person]');
    });

    it('hero에 "realistic" (positive) 없음', () => {
      // "photorealistic portrait"는 negative 문맥에서만 사용
      expect(r.heroPrompt).not.toContain('realistic editorial');
      expect(r.heroPrompt).not.toContain('realistic medical attire');
    });

    it('sub에 "Modern Korean adult" 없음', () => {
      expect(r.subPrompt).not.toContain('Modern Korean adult');
    });

    it('ultraMinimal에 "Modern Korean adult" 없음', () => {
      expect(r.ultraMinimal).not.toContain('Modern Korean adult');
    });
  });
});
