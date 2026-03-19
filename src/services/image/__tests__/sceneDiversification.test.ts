/**
 * Scene Diversification QA — 전 스타일 장면 분화 검증
 *
 * 검증 대상:
 *   1. photo/medical/illustration 각 스타일에서 sceneType별 프롬프트가 충분히 구분되는지
 *   2. 같은 sceneType이라도 스타일마다 표현이 다른지
 *   3. hero/sub 역할 구분이 유지되는지
 *   4. 반복 방지(repetition-avoid)가 중복 sceneType에서 동작하는지
 *   5. sceneBucket이 모든 sceneType에 매핑되는지
 *   6. 기존 style contract가 깨지지 않는지 (회귀)
 */
import { describe, it, expect } from 'vitest';
import { buildScenePrompt, classifySceneType, SCENE_BUCKETS } from '../imageRouter';
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
// 1. sceneBucket 매핑 완전성
// ═══════════════════════════════════════════════

describe('SCENE_BUCKETS', () => {
  it('모든 sceneType에 sceneBucket이 매핑됨', () => {
    for (const st of ALL_SCENE_TYPES) {
      expect(SCENE_BUCKETS[st]).toBeTruthy();
      expect(SCENE_BUCKETS[st].length).toBeGreaterThan(3);
    }
  });

  it('각 sceneBucket이 서로 다름', () => {
    const buckets = ALL_SCENE_TYPES.map(st => SCENE_BUCKETS[st]);
    const unique = new Set(buckets);
    expect(unique.size).toBe(ALL_SCENE_TYPES.length);
  });
});

// ═══════════════════════════════════════════════
// 2. 스타일별 장면 프롬프트 분화 검증
// ═══════════════════════════════════════════════

describe('photo 스타일: sceneType별 장면 분화', () => {
  const prompts = ALL_SCENE_TYPES.map(st =>
    buildScenePrompt('임플란트', '테스트 섹션', st, 'photo')
  );

  it('5개 sceneType 프롬프트가 모두 다름', () => {
    const unique = new Set(prompts);
    expect(unique.size).toBe(5);
  });

  it('symptom은 불편/통증 표현 포함', () => {
    const p = buildScenePrompt('임플란트', '통증 증상', 'symptom-discomfort', 'photo');
    expect(p).toMatch(/불편|통증|턱|볼/);
  });

  it('cause-mechanism은 클로즈업/검사 장면 유도', () => {
    const p = buildScenePrompt('임플란트', '원인', 'cause-mechanism', 'photo');
    expect(p).toMatch(/클로즈업|모니터|검사/);
  });

  it('consultation은 진료/시술 장면', () => {
    const p = buildScenePrompt('임플란트', '치료', 'consultation-treatment', 'photo');
    expect(p).toMatch(/진료|시술|치료/);
  });

  it('prevention은 일상 관리 장면', () => {
    const p = buildScenePrompt('임플란트', '예방', 'prevention-care', 'photo');
    expect(p).toMatch(/양치|치실|구강/);
  });

  it('caution-checkup은 검진/접수 환경 장면', () => {
    const p = buildScenePrompt('임플란트', '검진', 'caution-checkup', 'photo');
    expect(p).toMatch(/접수|대기|엑스레이|검진/);
  });

  it('photo 프롬프트에 "현대 한국인" 포함', () => {
    for (const p of prompts) {
      expect(p).toContain('현대 한국인');
    }
  });

  it('cause-mechanism이 상담 장면으로 수렴하지 않음', () => {
    const cause = buildScenePrompt('임플란트', '원인', 'cause-mechanism', 'photo');
    const consult = buildScenePrompt('임플란트', '상담', 'consultation-treatment', 'photo');
    // cause에는 "상담"이 없어야 함
    expect(cause).not.toMatch(/상담|의사와 환자가 진료/);
    // 둘은 다른 프롬프트
    expect(cause).not.toBe(consult);
  });
});

describe('medical 스타일: sceneType별 장면 분화', () => {
  const prompts = ALL_SCENE_TYPES.map(st =>
    buildScenePrompt('임플란트', '테스트', st, 'medical')
  );

  it('5개 sceneType 프롬프트가 모두 다름', () => {
    const unique = new Set(prompts);
    expect(unique.size).toBe(5);
  });

  it('medical 프롬프트에 "현대 한국인" 없음 (회귀 보호)', () => {
    for (const p of prompts) {
      expect(p).not.toContain('현대 한국인');
    }
  });

  it('모든 medical 프롬프트에 "3D" 또는 "단면도" 또는 "임상" 포함', () => {
    for (const p of prompts) {
      expect(p).toMatch(/3D|단면도|임상/);
    }
  });

  it('symptom-discomfort는 증상 부위 강조', () => {
    const p = buildScenePrompt('잇몸', '증상', 'symptom-discomfort', 'medical');
    expect(p).toMatch(/해부학|단면도|조직/);
  });

  it('cause-mechanism은 메커니즘/진행 시각화', () => {
    const p = buildScenePrompt('충치', '원인', 'cause-mechanism', 'medical');
    expect(p).toMatch(/메커니즘|진행|조직|구조/);
  });

  it('medical 프롬프트 간 비슷한 단면도 반복 방지 — shot intent가 다름', () => {
    const symptom = buildScenePrompt('잇몸', '증상', 'symptom-discomfort', 'medical');
    const cause = buildScenePrompt('잇몸', '원인', 'cause-mechanism', 'medical');
    // shot intent 부분이 다른지 확인
    expect(symptom).not.toBe(cause);
    // shot intent 키워드가 각각 포함
    expect(symptom).toContain('discomfort');
    expect(cause).toContain('close-up');
  });
});

describe('illustration 스타일: sceneType별 장면 분화', () => {
  const prompts = ALL_SCENE_TYPES.map(st =>
    buildScenePrompt('임플란트', '테스트', st, 'illustration')
  );

  it('5개 sceneType 프롬프트가 모두 다름', () => {
    const unique = new Set(prompts);
    expect(unique.size).toBe(5);
  });

  it('illustration 프롬프트에 "현대 한국인" 없음 (illustration 전용 프롬프트)', () => {
    for (const p of prompts) {
      expect(p).not.toContain('현대 한국인');
    }
  });

  it('cause-mechanism은 인포그래픽/메커니즘 표현', () => {
    const p = buildScenePrompt('충치', '원인', 'cause-mechanism', 'illustration');
    expect(p).toMatch(/인포그래픽|메커니즘|순서도/);
  });

  it('caution-checkup은 체크리스트/점검 시각 요소', () => {
    const p = buildScenePrompt('치과', '검진', 'caution-checkup', 'illustration');
    expect(p).toMatch(/체크리스트|점검|알림/);
  });
});

// ═══════════════════════════════════════════════
// 3. 같은 sceneType, 다른 스타일 → 다른 프롬프트
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
// 4. Shot Intent가 sceneType별로 다름 (공통 레이어)
// ═══════════════════════════════════════════════

describe('Shot Intent 공통 레이어', () => {
  it('모든 프롬프트에 "Shot intent" 키워드 포함', () => {
    for (const style of ALL_STYLES) {
      for (const st of ALL_SCENE_TYPES) {
        const p = buildScenePrompt('테스트', '테스트', st, style);
        expect(p).toContain('Shot intent');
      }
    }
  });

  it('sceneType별 shot intent가 서로 다름', () => {
    const intents = ALL_SCENE_TYPES.map(st =>
      buildScenePrompt('테스트', '테스트', st, 'photo')
    );
    // shot intent 부분이 모두 달라야 함
    const unique = new Set(intents);
    expect(unique.size).toBe(5);
  });
});

// ═══════════════════════════════════════════════
// 5. Repetition Avoid 동작 검증
// ═══════════════════════════════════════════════

describe('Repetition Avoid', () => {
  it('이전에 같은 sceneType이 없으면 repetition-avoid 없음', () => {
    const p = buildScenePrompt('임플란트', '치료', 'consultation-treatment', 'photo', []);
    expect(p).not.toContain('Avoid repeating');
  });

  it('이전에 같은 sceneType이 있으면 photo repetition-avoid 추가', () => {
    const p = buildScenePrompt('임플란트', '치료', 'consultation-treatment', 'photo', ['consultation-treatment']);
    expect(p).toContain('Avoid repeating');
    expect(p).toContain('consultation');
  });

  it('medical repetition-avoid는 cross-section 관련', () => {
    const p = buildScenePrompt('임플란트', '증상', 'symptom-discomfort', 'medical', ['symptom-discomfort']);
    expect(p).toContain('Avoid repeating');
    expect(p).toContain('cross-section');
  });

  it('illustration repetition-avoid는 layout 관련', () => {
    const p = buildScenePrompt('임플란트', '원인', 'cause-mechanism', 'illustration', ['cause-mechanism']);
    expect(p).toContain('Avoid repeating');
    expect(p).toContain('layout');
  });

  it('다른 sceneType이면 repetition-avoid 없음', () => {
    const p = buildScenePrompt('임플란트', '치료', 'consultation-treatment', 'photo', ['cause-mechanism', 'symptom-discomfort']);
    expect(p).not.toContain('Avoid repeating');
  });
});

// ═══════════════════════════════════════════════
// 6. sceneBucket 로그 태그 포함
// ═══════════════════════════════════════════════

describe('sceneBucket 태그', () => {
  it('모든 프롬프트에 [sceneBucket=...] 태그 포함', () => {
    for (const style of ALL_STYLES) {
      for (const st of ALL_SCENE_TYPES) {
        const p = buildScenePrompt('테스트', '테스트', st, style);
        expect(p).toContain(`[sceneBucket=${SCENE_BUCKETS[st]}]`);
      }
    }
  });
});

// ═══════════════════════════════════════════════
// 7. 회귀 보호: 기존 style contract 유지
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
    // '통증'이 먼저 매칭되지만 직전과 같으므로 '치료' → consultation-treatment
    expect(result).toBe('consultation-treatment');
  });

  it('classifySceneType 3차 fallback (가장 적게 사용된 타입)', () => {
    const result = classifySceneType('일반적인 내용', []);
    expect(ALL_SCENE_TYPES).toContain(result);
  });
});
