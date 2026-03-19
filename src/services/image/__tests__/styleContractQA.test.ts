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

// ── P0-3: medical 스타일 ──
describe('P0 스타일 계약: medical', () => {
  const r = buildPrompts('척추 디스크 구조', 'medical');

  it('isPhoto = false', () => {
    expect(r.isPhoto).toBe(false);
  });

  it('hero [Atmosphere]에 "Medical educational 3D illustration" 포함', () => {
    expect(r.heroAtmosphere).toContain('Medical educational 3D illustration');
  });

  it('hero [Atmosphere]에 "NOT a photograph" 포함', () => {
    expect(r.heroAtmosphere).toContain('NOT a photograph');
  });

  it('hero [Person]에 "stylized 3D rendered" 포함', () => {
    expect(r.heroPerson).toContain('stylized 3D rendered');
  });

  it('hero [Style]에 "NOT a photograph" 포함', () => {
    expect(r.heroStyleDirective).toContain('NOT a photograph');
  });

  it('hero [Style]에 "NOT photorealistic" 포함', () => {
    expect(r.heroStyleDirective).toContain('NOT photorealistic');
  });

  it('hero에 "realistic editorial photo" 없음', () => {
    expect(r.heroPrompt).not.toContain('realistic editorial photo');
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
  it('medical retry에 "NOT a photograph" 포함', () => {
    const item = buildHeroRetryItem('척추 디스크', 'medical', '16:9');
    expect(item.prompt).toContain('NOT a photograph');
    expect(item.prompt).toContain('의학 3D 일러스트');
    expect(item.style).toBe('medical');
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

  it('retry item은 style과 customStylePrompt를 보존 → generateBlogImage에서 분기 작동', () => {
    const item = buildHeroRetryItem('충치', 'medical', '16:9');
    // item이 generateBlogImage로 전달되면 style='medical'로 분기
    const r = buildPrompts(item.prompt, item.style, item.customStylePrompt);
    expect(r.heroAtmosphere).toContain('NOT a photograph');
    expect(r.heroAtmosphere).toContain('Medical educational 3D illustration');
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
  const PHOTO_KEYWORDS = ['realistic editorial photo', 'realistic medical attire', 'photorealistic'];

  for (const style of ['illustration', 'medical'] as ImageStyle[]) {
    describe(`${style} 스타일`, () => {
      const r = buildPrompts('테스트 주제', style);

      it(`hero에 "realistic editorial photo" 없음`, () => {
        expect(r.heroPrompt).not.toContain('realistic editorial photo');
      });

      it(`hero에 "realistic medical attire" 없음`, () => {
        expect(r.heroPrompt).not.toContain('realistic medical attire');
      });

      it(`hero [Style]에 "photorealistic"가 positive로 쓰이지 않음 (NOT photorealistic은 OK)`, () => {
        // "NOT photorealistic"은 negative 제약이므로 허용
        // "photorealistic,"나 "photorealistic " 단독 사용은 불허
        const directive = r.heroStyleDirective;
        const hasPositivePhotorealistic = directive.includes('photorealistic') &&
          !directive.includes('NOT photorealistic');
        expect(hasPositivePhotorealistic).toBe(false);
      });

      it(`sub에 "Modern Korean adult, natural Korean facial features, contemporary clothing" 없음`, () => {
        expect(r.subPersonHint).not.toContain('Modern Korean adult, natural Korean facial features');
      });
    });
  }
});
