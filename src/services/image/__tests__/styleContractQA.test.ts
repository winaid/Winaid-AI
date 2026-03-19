/**
 * Style Contract QA — 세트 단위 스타일 일관성 검증
 *
 * 검증 대상:
 *   1. StyleContract가 모든 스타일에 존재하는지
 *   2. medical hero/sub/ultraMinimal/retry가 공통 style contract를 공유하는지
 *   3. medical prompt에 금지 문구(photo/portrait/cartoon/infographic) 포함
 *   4. fallback이 medical일 때 emoji/text CTA가 없는지
 *   5. photo/illustration 테스트가 깨지지 않는지
 *   6. "세트 전체 공통 style anchor"가 각 경로에 포함되는지 (문자열 검증)
 */
import { describe, it, expect } from 'vitest';
import {
  BLOG_IMAGE_STYLE_COMPACT,
  STYLE_KEYWORD_SHORT,
  getStyleContract,
  STYLE_CONTRACTS,
} from '../imagePromptBuilder';
import { buildHeroRetryItem } from '../../../core/generation/blogImagePlanner';
import { buildTemplateFallbackSvg } from '../imageFallbackService';
import { buildScenePrompt, classifySceneType } from '../imageRouter';
import type { ImageStyle } from '../../../types';

// ═══════════════════════════════════════════════════════
// StyleContract 시스템 기본 검증
// ═══════════════════════════════════════════════════════

describe('StyleContract 시스템', () => {
  it('medical/illustration/photo 계약이 모두 존재', () => {
    expect(STYLE_CONTRACTS.medical).toBeDefined();
    expect(STYLE_CONTRACTS.illustration).toBeDefined();
    expect(STYLE_CONTRACTS.photo).toBeDefined();
  });

  it('각 계약에 anchor/negative/anchorShort/fallbackPalette/subjectHint 존재', () => {
    for (const key of ['medical', 'illustration', 'photo']) {
      const c = STYLE_CONTRACTS[key];
      expect(c.anchor).toBeTruthy();
      expect(c.negative).toBeTruthy();
      expect(c.anchorShort).toBeTruthy();
      expect(c.fallbackPalette).toBeTruthy();
      expect(c.fallbackPalette.primary).toBeTruthy();
      expect(c.subjectHint).toBeTruthy();
    }
  });

  it('getStyleContract로 medical 계약 조회', () => {
    const c = getStyleContract('medical');
    expect(c.anchor).toContain('3D medical render');
  });

  it('unknown style은 illustration 계약 반환', () => {
    const c = getStyleContract('unknown_style' as ImageStyle);
    expect(c).toBe(STYLE_CONTRACTS.illustration);
  });

  it('BLOG_IMAGE_STYLE_COMPACT가 StyleContract.anchor와 동기화', () => {
    expect(BLOG_IMAGE_STYLE_COMPACT.medical).toBe(STYLE_CONTRACTS.medical.anchor);
    expect(BLOG_IMAGE_STYLE_COMPACT.illustration).toBe(STYLE_CONTRACTS.illustration.anchor);
    expect(BLOG_IMAGE_STYLE_COMPACT.photo).toBe(STYLE_CONTRACTS.photo.anchor);
  });

  it('STYLE_KEYWORD_SHORT가 StyleContract.anchorShort와 동기화', () => {
    expect(STYLE_KEYWORD_SHORT.medical).toBe(STYLE_CONTRACTS.medical.anchorShort);
    expect(STYLE_KEYWORD_SHORT.illustration).toBe(STYLE_CONTRACTS.illustration.anchorShort);
    expect(STYLE_KEYWORD_SHORT.photo).toBe(STYLE_CONTRACTS.photo.anchorShort);
  });
});

// ═══════════════════════════════════════════════════════
// medical 공통 anchor 문자열 검증
// — 핵심 키워드가 계약에 포함되어 있는지
// ═══════════════════════════════════════════════════════

describe('medical StyleContract 핵심 키워드', () => {
  const mc = getStyleContract('medical');

  // anchor에 반드시 포함되어야 할 핵심 개념
  const REQUIRED_ANCHOR_CONCEPTS = [
    '3D medical render',
    'clinical visualization',
    'same rendering family',
    'same lighting and material language',
    'blue-white-teal',
    'clean studio lighting',
    'NOT a photograph',
    'NOT a portrait',
    'NOT cartoon',
    'NOT flat vector',
    'NOT infographic',
    'NOT lifestyle stock photo',
  ];

  for (const concept of REQUIRED_ANCHOR_CONCEPTS) {
    it(`anchor에 "${concept}" 포함`, () => {
      expect(mc.anchor).toContain(concept);
    });
  }

  // negative에 반드시 포함되어야 할 금지 항목
  const REQUIRED_NEGATIVE_CONCEPTS = [
    'photorealistic portrait',
    'human face close-up',
    'cartoon character',
    'flat 2D',
    'flat infographic',
    'emoji',
    'template card',
  ];

  for (const concept of REQUIRED_NEGATIVE_CONCEPTS) {
    it(`negative에 "${concept}" 포함`, () => {
      expect(mc.negative).toContain(concept);
    });
  }

  // anchorShort에도 핵심 고정력 유지
  it('anchorShort에 "3D medical render" 포함', () => {
    expect(mc.anchorShort).toContain('3D medical render');
  });

  it('anchorShort에 "NOT photo" 포함', () => {
    expect(mc.anchorShort).toContain('NOT photo');
  });

  it('anchorShort에 "NOT portrait" 포함', () => {
    expect(mc.anchorShort).toContain('NOT portrait');
  });

  it('anchorShort에 "NOT cartoon" 포함', () => {
    expect(mc.anchorShort).toContain('NOT cartoon');
  });

  it('anchorShort에 "NOT infographic" 포함', () => {
    expect(mc.anchorShort).toContain('NOT infographic');
  });

  it('anchorShort에 "same rendering family" 포함', () => {
    expect(mc.anchorShort).toContain('same rendering family');
  });
});

// ═══════════════════════════════════════════════════════
// medical 오케스트레이터 프롬프트 재현 + 계약 준수 검증
// (오케스트레이터는 localStorage 의존이므로 로직을 재현)
// ═══════════════════════════════════════════════════════

function buildMedicalOrchestratorPrompts(promptText: string) {
  const mc = getStyleContract('medical');
  const COMMON_CONSTRAINTS = 'No text, no letters, no typography, no watermark, no logo.';

  const heroPrompt = `Generate a 16:9 landscape 3D medical illustration for a Korean dental/health educational blog.
[Visual Subject] ${promptText} — ${mc.subjectHint}
[Rendering Style] ${mc.anchor}
[Constraint] ${mc.negative}
[Rules] ${COMMON_CONSTRAINTS}`.trim();

  const subPrompt = `3D medical illustration: ${promptText.substring(0, 120)}. ${mc.anchor} ${COMMON_CONSTRAINTS} 16:9.`.trim();
  const ultraMinimal = `3D medical render: ${promptText.substring(0, 80)}. ${mc.anchorShort} 16:9.`.trim();

  return { heroPrompt, subPrompt, ultraMinimal };
}

describe('medical 오케스트레이터 프롬프트: 계약 준수', () => {
  const prompts = buildMedicalOrchestratorPrompts('척추 디스크 구조');

  it('hero에 StyleContract.anchor 전체 포함', () => {
    const mc = getStyleContract('medical');
    expect(prompts.heroPrompt).toContain(mc.anchor);
  });

  it('hero에 StyleContract.negative 전체 포함', () => {
    const mc = getStyleContract('medical');
    expect(prompts.heroPrompt).toContain(mc.negative);
  });

  it('hero에 StyleContract.subjectHint 포함', () => {
    const mc = getStyleContract('medical');
    expect(prompts.heroPrompt).toContain(mc.subjectHint);
  });

  it('sub에 StyleContract.anchor 전체 포함', () => {
    const mc = getStyleContract('medical');
    expect(prompts.subPrompt).toContain(mc.anchor);
  });

  it('ultraMinimal에 StyleContract.anchorShort 전체 포함', () => {
    const mc = getStyleContract('medical');
    expect(prompts.ultraMinimal).toContain(mc.anchorShort);
  });

  // 금지 키워드 혼입 검사
  it('hero에 "editorial image" 없음', () => {
    expect(prompts.heroPrompt).not.toContain('editorial image');
  });

  it('hero에 "Modern Korean adult" 없음', () => {
    expect(prompts.heroPrompt).not.toContain('Modern Korean adult');
  });

  it('hero에 [Person] 없음', () => {
    expect(prompts.heroPrompt).not.toContain('[Person]');
  });

  it('sub에 "Modern Korean adult" 없음', () => {
    expect(prompts.subPrompt).not.toContain('Modern Korean adult');
  });

  it('ultraMinimal에 "Modern Korean adult" 없음', () => {
    expect(prompts.ultraMinimal).not.toContain('Modern Korean adult');
  });
});

// ═══════════════════════════════════════════════════════
// retry 시 StyleContract 준수 검증
// ═══════════════════════════════════════════════════════

describe('medical retry: StyleContract 준수', () => {
  const item = buildHeroRetryItem('척추 디스크', 'medical', '16:9');
  const mc = getStyleContract('medical');

  it('retry prompt에 anchorShort 전체 포함', () => {
    expect(item.prompt).toContain(mc.anchorShort);
  });

  it('retry prompt에 "3D medical render" 포함', () => {
    expect(item.prompt).toContain('3D medical render');
  });

  it('retry prompt에 "NOT photo" 포함', () => {
    expect(item.prompt).toContain('NOT photo');
  });

  it('retry prompt에 "NOT portrait" 포함', () => {
    expect(item.prompt).toContain('NOT portrait');
  });

  it('retry prompt에 "NOT cartoon" 포함', () => {
    expect(item.prompt).toContain('NOT cartoon');
  });

  it('retry prompt에 "NOT infographic" 포함', () => {
    expect(item.prompt).toContain('NOT infographic');
  });

  it('retry에 "현대 한국인" 없음', () => {
    expect(item.prompt).not.toContain('현대 한국인');
  });

  it('retry에 "editorial" 없음', () => {
    expect(item.prompt).not.toContain('editorial');
  });

  it('retry style=medical 유지', () => {
    expect(item.style).toBe('medical');
  });
});

// ═══════════════════════════════════════════════════════
// fallback 스타일 검증
// ═══════════════════════════════════════════════════════

describe('medical fallback: 세트 톤 유지', () => {
  const heroSvg = buildTemplateFallbackSvg('임플란트 구조', 'medical', 'hero');
  const subSvg = buildTemplateFallbackSvg('치근 단면', 'medical', 'sub');

  it('medical fallback에 emoji 없음', () => {
    // emoji는 유니코드 범위 U+1F000 이상
    const emojiRegex = /[\u{1F000}-\u{1FFFF}]/u;
    expect(emojiRegex.test(heroSvg)).toBe(false);
    expect(emojiRegex.test(subSvg)).toBe(false);
  });

  it('medical fallback에 CTA 텍스트 없음', () => {
    expect(heroSvg).not.toContain('클릭');
    expect(heroSvg).not.toContain('업그레이드');
    expect(heroSvg).not.toContain('전환');
    expect(subSvg).not.toContain('클릭');
  });

  it('medical fallback에 한국어 키워드 텍스트 없음', () => {
    // medical SVG에는 <text> 요소가 없어야 함
    expect(heroSvg).not.toContain('<text');
  });

  it('medical fallback에 임상 팔레트 사용', () => {
    const mc = getStyleContract('medical');
    expect(heroSvg).toContain(mc.fallbackPalette.primary);
    expect(heroSvg).toContain(mc.fallbackPalette.secondary);
    expect(heroSvg).toContain(mc.fallbackPalette.accent);
  });

  it('generic fallback에는 키워드 텍스트 유지 (photo)', () => {
    const photoSvg = buildTemplateFallbackSvg('임플란트 시술', 'photo', 'hero');
    expect(photoSvg).toContain('<text');
  });
});

// ═══════════════════════════════════════════════════════
// buildScenePrompt style-aware 검증
// ═══════════════════════════════════════════════════════

describe('buildScenePrompt: 스타일 인식', () => {
  it('medical style은 "현대 한국인" 없음', () => {
    const prompt = buildScenePrompt('치아미백', '미백 원리', 'cause-mechanism', 'medical');
    expect(prompt).not.toContain('현대 한국인');
    expect(prompt).not.toContain('일상복');
  });

  it('medical style은 해부학/임상 키워드 포함', () => {
    const prompt = buildScenePrompt('임플란트', '시술 과정', 'consultation-treatment', 'medical');
    expect(prompt).toContain('3D');
  });

  it('photo style은 "현대 한국인" 유지', () => {
    const prompt = buildScenePrompt('치아미백', '미백 원리', 'cause-mechanism', 'photo');
    expect(prompt).toContain('현대 한국인');
  });

  it('style 미지정 시 기존 동작 (현대 한국인) 유지', () => {
    const prompt = buildScenePrompt('치아미백', '미백 원리', 'cause-mechanism');
    expect(prompt).toContain('현대 한국인');
  });
});

// ═══════════════════════════════════════════════════════
// photo/illustration 기존 동작 보존 검증
// ═══════════════════════════════════════════════════════

describe('photo 스타일: 기존 동작 보존', () => {
  it('photo anchor에 "photorealistic" 포함', () => {
    const c = getStyleContract('photo');
    expect(c.anchor).toContain('photorealistic');
    expect(c.anchor).toContain('DSLR');
  });

  it('photo retry에 "실사 사진" 포함', () => {
    const item = buildHeroRetryItem('임플란트', 'photo', '16:9');
    expect(item.prompt).toContain('실사 사진');
  });

  it('photo fallback에 키워드 텍스트 유지', () => {
    const svg = buildTemplateFallbackSvg('임플란트', 'photo', 'hero');
    expect(svg).toContain('<text');
  });
});

describe('illustration 스타일: 기존 동작 보존', () => {
  it('illustration anchor에 "3D rendered illustration" 포함', () => {
    const c = getStyleContract('illustration');
    expect(c.anchor).toContain('3D rendered illustration');
    expect(c.anchor).toContain('NOT a photograph');
  });

  it('illustration retry에 "NOT a photograph" 포함', () => {
    const item = buildHeroRetryItem('잇몸 관리', 'illustration', '16:9');
    expect(item.prompt).toContain('NOT a photograph');
  });
});

// ═══════════════════════════════════════════════════════
// 세트 전체 공통 anchor 관통 검증 (통합 테스트)
// ═══════════════════════════════════════════════════════

describe('medical 세트 통합: 모든 경로에 공통 핵심 키워드', () => {
  const mc = getStyleContract('medical');
  const orchestratorPrompts = buildMedicalOrchestratorPrompts('임플란트 수술');
  const retryItem = buildHeroRetryItem('임플란트 수술', 'medical', '16:9');
  const fallbackSvg = buildTemplateFallbackSvg('임플란트 수술', 'medical', 'hero');

  // 모든 AI 프롬프트 경로에서 "3D medical render" 포함
  it('hero/sub/ultraMinimal/retry 모두 "3D medical" 포함', () => {
    expect(orchestratorPrompts.heroPrompt).toContain('3D medical');
    expect(orchestratorPrompts.subPrompt).toContain('3D medical');
    expect(orchestratorPrompts.ultraMinimal).toContain('3D medical');
    expect(retryItem.prompt).toContain('3D medical');
  });

  // 모든 AI 프롬프트 경로에서 portrait 억제
  it('hero/sub/ultraMinimal/retry 모두 "NOT" + "portrait" 포함', () => {
    expect(orchestratorPrompts.heroPrompt).toMatch(/NOT.*portrait/i);
    expect(orchestratorPrompts.subPrompt).toMatch(/NOT.*portrait/i);
    expect(orchestratorPrompts.ultraMinimal).toMatch(/NOT.*portrait/i);
    expect(retryItem.prompt).toMatch(/NOT.*portrait/i);
  });

  // fallback은 세트에서 안 튀도록 임상 팔레트
  it('fallback은 임상 팔레트 사용', () => {
    expect(fallbackSvg).toContain(mc.fallbackPalette.primary);
  });

  it('fallback에 emoji/CTA 없음', () => {
    expect(fallbackSvg).not.toContain('🫀');
    expect(fallbackSvg).not.toContain('클릭');
  });
});
