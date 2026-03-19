/**
 * Scene Diversification QA — 전 스타일 장면 분화 + bucket 분산 + hero 통합 검증
 *
 * 검증 대상:
 *   1. SCENE_BUCKETS 다중 후보 완전성
 *   2. resolveSceneBucket planner-level 분산
 *   3. 스타일별 sceneType base + bucket detail 조합
 *   4. hero 공통 구조 편입
 *   5. shot intent / repetition-avoid
 *   6. sceneBucket 메타가 prompt 본문에 없음 (로그 전용)
 *   7. 회귀 보호 (style contract)
 */
import { describe, it, expect } from 'vitest';
import {
  buildScenePrompt,
  buildHeroScenePrompt,
  classifySceneType,
  resolveSceneBucket,
  SCENE_BUCKETS,
  HERO_BUCKETS,
} from '../imageRouter';
import type { SceneType } from '../imageTypes';
import type { ImageStyle } from '../../../types';

const ALL_SCENE_TYPES: SceneType[] = [
  'symptom-discomfort',
  'cause-mechanism',
  'consultation-treatment',
  'prevention-care',
  'caution-checkup',
];

const ALL_STYLES: ImageStyle[] = ['photo', 'medical', 'illustration'];

// ═══════════════════════════════════════════════
// 1. SCENE_BUCKETS 다중 후보 완전성
// ═══════════════════════════════════════════════

describe('SCENE_BUCKETS (다중 후보)', () => {
  it('모든 sceneType에 bucket 후보가 2개 이상', () => {
    for (const st of ALL_SCENE_TYPES) {
      expect(SCENE_BUCKETS[st]).toBeDefined();
      expect(SCENE_BUCKETS[st].length).toBeGreaterThanOrEqual(2);
    }
  });

  it('각 sceneType의 bucket 후보가 서로 고유', () => {
    for (const st of ALL_SCENE_TYPES) {
      const unique = new Set(SCENE_BUCKETS[st]);
      expect(unique.size).toBe(SCENE_BUCKETS[st].length);
    }
  });

  it('sceneType 간 bucket이 겹치지 않음', () => {
    const allBuckets = ALL_SCENE_TYPES.flatMap(st => SCENE_BUCKETS[st]);
    const unique = new Set(allBuckets);
    expect(unique.size).toBe(allBuckets.length);
  });
});

describe('HERO_BUCKETS', () => {
  it('hero bucket이 2개 이상', () => {
    expect(HERO_BUCKETS.length).toBeGreaterThanOrEqual(2);
  });

  it('hero bucket이 sub bucket과 겹치지 않음', () => {
    const subBuckets = ALL_SCENE_TYPES.flatMap(st => SCENE_BUCKETS[st]);
    for (const hb of HERO_BUCKETS) {
      expect(subBuckets).not.toContain(hb);
    }
  });
});

// ═══════════════════════════════════════════════
// 2. resolveSceneBucket — planner-level 분산
// ═══════════════════════════════════════════════

describe('resolveSceneBucket', () => {
  it('첫 호출 → 첫 번째 후보', () => {
    const bucket = resolveSceneBucket('cause-mechanism', [], 'sub');
    expect(bucket).toBe(SCENE_BUCKETS['cause-mechanism'][0]);
  });

  it('같은 sceneType 두 번째 호출 → 두 번째 후보', () => {
    const first = SCENE_BUCKETS['cause-mechanism'][0];
    const bucket = resolveSceneBucket('cause-mechanism', [first], 'sub');
    expect(bucket).toBe(SCENE_BUCKETS['cause-mechanism'][1]);
  });

  it('같은 sceneType 세 번째 호출 → 세 번째 후보', () => {
    const [a, b] = SCENE_BUCKETS['cause-mechanism'];
    const bucket = resolveSceneBucket('cause-mechanism', [a, b], 'sub');
    expect(bucket).toBe(SCENE_BUCKETS['cause-mechanism'][2]);
  });

  it('모든 후보 사용됨 → 첫 번째 재사용 (graceful fallback)', () => {
    const all = [...SCENE_BUCKETS['cause-mechanism']];
    const bucket = resolveSceneBucket('cause-mechanism', all, 'sub');
    expect(bucket).toBe(SCENE_BUCKETS['cause-mechanism'][0]);
  });

  it('다른 sceneType bucket은 영향 없음', () => {
    const usedBuckets = [SCENE_BUCKETS['symptom-discomfort'][0]];
    const bucket = resolveSceneBucket('cause-mechanism', usedBuckets, 'sub');
    expect(bucket).toBe(SCENE_BUCKETS['cause-mechanism'][0]);
  });

  it('hero role → HERO_BUCKETS에서 선택', () => {
    const bucket = resolveSceneBucket('cause-mechanism', [], 'hero');
    expect(bucket).toBe(HERO_BUCKETS[0]);
  });

  it('hero bucket 연속 분산', () => {
    const first = HERO_BUCKETS[0];
    const bucket = resolveSceneBucket('cause-mechanism', [first], 'hero');
    expect(bucket).toBe(HERO_BUCKETS[1]);
  });
});

// ═══════════════════════════════════════════════
// 3. 5-image 세트 시뮬레이션: unique bucket 보장
// ═══════════════════════════════════════════════

describe('5-image 세트 bucket 다양성', () => {
  it('hero + 4 sub → 최소 5개 unique bucket', () => {
    const usedBuckets: string[] = [];
    const usedTypes: string[] = [];

    // hero
    const heroBucket = resolveSceneBucket('symptom-discomfort', usedBuckets, 'hero');
    usedBuckets.push(heroBucket);
    usedTypes.push('hero');

    // 4 subs with different sceneTypes
    const subTypes: SceneType[] = ['symptom-discomfort', 'cause-mechanism', 'consultation-treatment', 'prevention-care'];
    for (const st of subTypes) {
      const bucket = resolveSceneBucket(st, usedBuckets, 'sub');
      usedBuckets.push(bucket);
      usedTypes.push(st);
    }

    expect(usedBuckets.length).toBe(5);
    expect(new Set(usedBuckets).size).toBe(5); // all unique
  });

  it('같은 sceneType 반복 시에도 다른 bucket 할당', () => {
    const usedBuckets: string[] = [];

    // cause-mechanism 3번
    for (let i = 0; i < 3; i++) {
      const bucket = resolveSceneBucket('cause-mechanism', usedBuckets, 'sub');
      usedBuckets.push(bucket);
    }

    // 3개 모두 다른 bucket
    expect(new Set(usedBuckets).size).toBe(3);
    expect(usedBuckets[0]).toBe('mechanism-closeup');
    expect(usedBuckets[1]).toBe('exam-monitor');
    expect(usedBuckets[2]).toBe('progression-visual');
  });
});

// ═══════════════════════════════════════════════
// 4. buildScenePrompt: sceneType base + bucket detail 조합
// ═══════════════════════════════════════════════

describe('buildScenePrompt: base + bucket 조합', () => {
  it('resolvedBucket 지정 시 해당 bucket의 detail과 shot intent 사용', () => {
    const p = buildScenePrompt('임플란트', '원인', 'cause-mechanism', 'photo', [], 'exam-monitor');
    expect(p).toContain('모니터'); // bucket detail contains 모니터
    expect(p).toContain('monitor'); // shot intent contains monitor
  });

  it('resolvedBucket 미지정 시 첫 번째 bucket 사용 (하위 호환)', () => {
    const p = buildScenePrompt('임플란트', '원인', 'cause-mechanism', 'photo');
    expect(p).toContain('close-up'); // mechanism-closeup의 shot intent
  });

  it('같은 sceneType, 다른 bucket → 다른 prompt', () => {
    const p1 = buildScenePrompt('임플란트', '원인', 'cause-mechanism', 'photo', [], 'mechanism-closeup');
    const p2 = buildScenePrompt('임플란트', '원인', 'cause-mechanism', 'photo', [], 'exam-monitor');
    expect(p1).not.toBe(p2);
  });

  it('같은 sceneType, 다른 bucket → base scene은 공유', () => {
    const p1 = buildScenePrompt('임플란트', '원인', 'cause-mechanism', 'photo', [], 'mechanism-closeup');
    const p2 = buildScenePrompt('임플란트', '원인', 'cause-mechanism', 'photo', [], 'exam-monitor');
    // Both should contain the base scene for cause-mechanism
    expect(p1).toContain('원인');
    expect(p2).toContain('원인');
  });
});

// ═══════════════════════════════════════════════
// 5. 스타일별 sceneType 분화 (기존 유지)
// ═══════════════════════════════════════════════

describe('photo 스타일: sceneType별 분화', () => {
  const prompts = ALL_SCENE_TYPES.map(st =>
    buildScenePrompt('임플란트', '테스트', st, 'photo')
  );

  it('5개 sceneType 프롬프트가 모두 다름', () => {
    const unique = new Set(prompts);
    expect(unique.size).toBe(5);
  });

  it('photo 프롬프트에 "현대 한국인" 포함', () => {
    for (const p of prompts) {
      expect(p).toContain('현대 한국인');
    }
  });

  it('cause-mechanism이 상담 장면으로 수렴하지 않음', () => {
    const cause = buildScenePrompt('임플란트', '원인', 'cause-mechanism', 'photo');
    const consult = buildScenePrompt('임플란트', '상담', 'consultation-treatment', 'photo');
    expect(cause).not.toBe(consult);
  });
});

describe('medical 스타일: sceneType별 분화', () => {
  const prompts = ALL_SCENE_TYPES.map(st =>
    buildScenePrompt('임플란트', '테스트', st, 'medical')
  );

  it('5개 sceneType 프롬프트가 모두 다름', () => {
    const unique = new Set(prompts);
    expect(unique.size).toBe(5);
  });

  it('medical 프롬프트에 "현대 한국인" 없음', () => {
    for (const p of prompts) {
      expect(p).not.toContain('현대 한국인');
    }
  });

  it('모든 medical 프롬프트에 "3D" 또는 "단면도" 또는 "임상" 포함', () => {
    for (const p of prompts) {
      expect(p).toMatch(/3D|단면도|임상/);
    }
  });
});

describe('illustration 스타일: sceneType별 분화', () => {
  const prompts = ALL_SCENE_TYPES.map(st =>
    buildScenePrompt('임플란트', '테스트', st, 'illustration')
  );

  it('5개 sceneType 프롬프트가 모두 다름', () => {
    const unique = new Set(prompts);
    expect(unique.size).toBe(5);
  });

  it('illustration 프롬프트에 "현대 한국인" 없음', () => {
    for (const p of prompts) {
      expect(p).not.toContain('현대 한국인');
    }
  });
});

// ═══════════════════════════════════════════════
// 6. 같은 sceneType, 다른 스타일 → 다른 프롬프트
// ═══════════════════════════════════════════════

describe('같은 sceneType, 스타일별 표현 분화', () => {
  for (const st of ALL_SCENE_TYPES) {
    it(`sceneType '${st}' — photo/medical/illustration 프롬프트가 모두 다름`, () => {
      const photo = buildScenePrompt('임플란트', '테스트', st, 'photo');
      const medical = buildScenePrompt('임플란트', '테스트', st, 'medical');
      const illust = buildScenePrompt('임플란트', '테스트', st, 'illustration');

      expect(photo).not.toBe(medical);
      expect(photo).not.toBe(illust);
      expect(medical).not.toBe(illust);
    });
  }
});

// ═══════════════════════════════════════════════
// 7. Shot Intent (bucket별)
// ═══════════════════════════════════════════════

describe('Shot Intent', () => {
  it('모든 프롬프트에 "Shot intent" 키워드 포함', () => {
    for (const style of ALL_STYLES) {
      for (const st of ALL_SCENE_TYPES) {
        const p = buildScenePrompt('테스트', '테스트', st, style);
        expect(p).toContain('Shot intent');
      }
    }
  });

  it('다른 bucket → 다른 shot intent', () => {
    const p1 = buildScenePrompt('테스트', '테스트', 'cause-mechanism', 'photo', [], 'mechanism-closeup');
    const p2 = buildScenePrompt('테스트', '테스트', 'cause-mechanism', 'photo', [], 'exam-monitor');
    // Both have shot intent but different content
    expect(p1).toContain('close-up');
    expect(p2).toContain('monitor');
  });
});

// ═══════════════════════════════════════════════
// 8. Repetition Avoid
// ═══════════════════════════════════════════════

describe('Repetition Avoid', () => {
  it('이전에 같은 sceneType이 없으면 repetition-avoid 없음', () => {
    const p = buildScenePrompt('임플란트', '치료', 'consultation-treatment', 'photo', []);
    expect(p).not.toContain('Avoid repeating');
  });

  it('이전에 같은 sceneType이 있으면 repetition-avoid 추가', () => {
    const p = buildScenePrompt('임플란트', '치료', 'consultation-treatment', 'photo', ['consultation-treatment']);
    expect(p).toContain('Avoid repeating');
  });

  it('다른 sceneType이면 repetition-avoid 없음', () => {
    const p = buildScenePrompt('임플란트', '치료', 'consultation-treatment', 'photo', ['cause-mechanism']);
    expect(p).not.toContain('Avoid repeating');
  });
});

// ═══════════════════════════════════════════════
// 9. sceneBucket 메타가 prompt 본문에 없음
// ═══════════════════════════════════════════════

describe('sceneBucket 메타 분리', () => {
  it('sub prompt에 [sceneBucket=...] 태그 없음', () => {
    for (const style of ALL_STYLES) {
      for (const st of ALL_SCENE_TYPES) {
        const p = buildScenePrompt('테스트', '테스트', st, style);
        expect(p).not.toContain('[sceneBucket=');
      }
    }
  });

  it('hero prompt에 [sceneBucket=...] 태그 없음', () => {
    for (const style of ALL_STYLES) {
      const p = buildHeroScenePrompt('테스트', style);
      expect(p).not.toContain('[sceneBucket=');
    }
  });
});

// ═══════════════════════════════════════════════
// 10. Hero 공통 구조 편입
// ═══════════════════════════════════════════════

describe('buildHeroScenePrompt', () => {
  it('photo hero → "현대 한국인" 포함', () => {
    const p = buildHeroScenePrompt('임플란트', 'photo');
    expect(p).toContain('현대 한국인');
  });

  it('medical hero → "3D" 포함, "현대 한국인" 없음', () => {
    const p = buildHeroScenePrompt('임플란트', 'medical');
    expect(p).toContain('3D');
    expect(p).not.toContain('현대 한국인');
  });

  it('illustration hero → "3D" 또는 "일러스트" 포함', () => {
    const p = buildHeroScenePrompt('임플란트', 'illustration');
    expect(p).toMatch(/3D|일러스트/);
  });

  it('hero에 Shot intent 포함', () => {
    const p = buildHeroScenePrompt('임플란트', 'photo');
    expect(p).toContain('Shot intent');
  });

  it('hero bucket별로 다른 prompt', () => {
    const p1 = buildHeroScenePrompt('임플란트', 'photo', 'overview-clinical');
    const p2 = buildHeroScenePrompt('임플란트', 'photo', 'editorial-hero');
    expect(p1).not.toBe(p2);
  });

  it('hero topic이 prompt에 포함됨', () => {
    const p = buildHeroScenePrompt('치아 미백', 'photo');
    expect(p).toContain('치아 미백');
  });
});

// ═══════════════════════════════════════════════
// 11. 회귀 보호: buildScenePrompt 기존 계약
// ═══════════════════════════════════════════════

describe('회귀 보호: buildScenePrompt 기존 계약', () => {
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

  it('classifySceneType 연속 중복 방지 유지', () => {
    const result = classifySceneType('통증과 치료', ['symptom-discomfort']);
    expect(result).toBe('consultation-treatment');
  });

  it('classifySceneType 3차 fallback (가장 적게 사용된 타입)', () => {
    const result = classifySceneType('일반적인 내용', []);
    expect(ALL_SCENE_TYPES).toContain(result);
  });
});
