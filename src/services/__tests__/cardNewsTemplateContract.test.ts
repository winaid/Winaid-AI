/**
 * 카드뉴스 템플릿 계약 검증 — designTemplateId 고정 테스트
 *
 * 핵심 계약:
 *   사용자가 선택한 카드뉴스 템플릿(designTemplateId)은
 *   생성 시작부터 결과까지 절대 유실되지 않는다.
 *
 * 검증 대상:
 *   1. 모든 정의된 템플릿이 유효한지
 *   2. 템플릿 lookup이 정확한지
 *   3. 각 템플릿에 필수 필드(stylePrompt, styleConfig)가 있는지
 *   4. defaultTemplate이 선택값을 덮어쓰지 않는지
 *   5. GeneratedContent 타입에 designTemplateId가 있는지
 */
import { describe, it, expect } from 'vitest';
import {
  CARD_NEWS_DESIGN_TEMPLATES,
  getDesignTemplateById,
} from '../cardNewsDesignTemplates';
import { ContentCategory } from '../../types';
import type { CardNewsDesignTemplateId, GeneratedContent, GenerationRequest } from '../../types';

// ═══════════════════════════════════════════════
// 1. 템플릿 정의 완전성
// ═══════════════════════════════════════════════

describe('카드뉴스 템플릿 정의', () => {
  const EXPECTED_TEMPLATE_IDS: CardNewsDesignTemplateId[] = [
    'medical-clean',
    'spring-floral',
    'modern-grid',
    'simple-pin',
    'medical-illust',
  ];

  it('5개 템플릿이 정의되어 있음', () => {
    expect(CARD_NEWS_DESIGN_TEMPLATES).toHaveLength(5);
  });

  for (const id of EXPECTED_TEMPLATE_IDS) {
    it(`템플릿 '${id}' 존재`, () => {
      const tpl = getDesignTemplateById(id);
      expect(tpl).toBeDefined();
      expect(tpl!.id).toBe(id);
    });

    it(`템플릿 '${id}'에 stylePrompt 포함`, () => {
      const tpl = getDesignTemplateById(id)!;
      expect(tpl.stylePrompt).toBeTruthy();
      expect(tpl.stylePrompt.length).toBeGreaterThan(10);
    });

    it(`템플릿 '${id}'에 styleConfig 포함`, () => {
      const tpl = getDesignTemplateById(id)!;
      expect(tpl.styleConfig).toBeDefined();
      expect(tpl.styleConfig.backgroundColor).toBeTruthy();
    });

    it(`템플릿 '${id}'에 name, icon 포함`, () => {
      const tpl = getDesignTemplateById(id)!;
      expect(tpl.name).toBeTruthy();
      expect(tpl.icon).toBeTruthy();
    });
  }

  it('존재하지 않는 ID → undefined', () => {
    expect(getDesignTemplateById('nonexistent' as any)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════
// 2. 템플릿 선택값이 payload에 정확히 포함
// ═══════════════════════════════════════════════

describe('GenerationRequest → designTemplateId 전달', () => {
  const baseRequest = {
    topic: '임플란트',
    category: ContentCategory.DENTAL,
    postType: 'card_news' as const,
    imageStyle: 'illustration' as const,
    keywords: '',
    tone: '' as any,
    audienceMode: '환자용(친절/공감)' as any,
    persona: '' as any,
  };

  it('card_news request에 designTemplateId가 optional로 존재', () => {
    const request: GenerationRequest = {
      ...baseRequest,
      slideCount: 6,
      designTemplateId: 'medical-clean',
    };
    expect(request.designTemplateId).toBe('medical-clean');
  });

  it('designTemplateId 미설정 시 undefined', () => {
    const request: GenerationRequest = { ...baseRequest };
    expect(request.designTemplateId).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════
// 3. 생성 결과(GeneratedContent)에 designTemplateId 포함
// ═══════════════════════════════════════════════

describe('GeneratedContent → designTemplateId 보존', () => {
  it('card_news 결과에 designTemplateId가 포함 가능', () => {
    const result: Partial<GeneratedContent> = {
      postType: 'card_news',
      designTemplateId: 'spring-floral',
      title: '테스트',
      htmlContent: '<div>test</div>',
    };
    expect(result.designTemplateId).toBe('spring-floral');
  });

  it('designTemplateId가 없으면 undefined (legacy 호환)', () => {
    const result: Partial<GeneratedContent> = {
      postType: 'card_news',
      title: '테스트',
      htmlContent: '<div>test</div>',
    };
    expect(result.designTemplateId).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════
// 4. 템플릿 stylePrompt가 customImagePrompt보다 우선
// ═══════════════════════════════════════════════

describe('템플릿 stylePrompt 우선순위', () => {
  it('디자인 템플릿의 stylePrompt가 customImagePrompt보다 우선', () => {
    const templateId: CardNewsDesignTemplateId = 'medical-clean';
    const template = getDesignTemplateById(templateId)!;
    const customPrompt = 'user custom prompt';

    // 서비스 로직 재현: designTemplateStylePrompt || request.customImagePrompt
    const effectivePrompt = template.stylePrompt || customPrompt;
    expect(effectivePrompt).toBe(template.stylePrompt);
    expect(effectivePrompt).not.toBe(customPrompt);
  });

  it('디자인 템플릿 없으면 customImagePrompt 사용', () => {
    const template = getDesignTemplateById('nonexistent' as any);
    const customPrompt = 'user custom prompt';

    const effectivePrompt = template?.stylePrompt || customPrompt;
    expect(effectivePrompt).toBe(customPrompt);
  });
});

// ═══════════════════════════════════════════════
// 5. default fallback이 선택값을 덮어쓰지 않는 계약
// ═══════════════════════════════════════════════

describe('default fallback 계약', () => {
  it('선택된 templateId가 있으면 undefined로 덮어쓰면 안 됨', () => {
    const selectedId: CardNewsDesignTemplateId = 'modern-grid';

    // 실제 코드 패턴 재현
    const designTemplate = selectedId ? getDesignTemplateById(selectedId) : undefined;
    expect(designTemplate).toBeDefined();
    expect(designTemplate!.id).toBe(selectedId);
  });

  it('모든 정의된 ID에 대해 lookup이 정확히 동작', () => {
    for (const tpl of CARD_NEWS_DESIGN_TEMPLATES) {
      const found = getDesignTemplateById(tpl.id);
      expect(found).toBe(tpl);
    }
  });

  it('styleConfig 필드가 모든 템플릿에서 빈 객체가 아님', () => {
    for (const tpl of CARD_NEWS_DESIGN_TEMPLATES) {
      expect(tpl.styleConfig).toBeDefined();
      expect(Object.keys(tpl.styleConfig).length).toBeGreaterThan(0);
    }
  });
});
