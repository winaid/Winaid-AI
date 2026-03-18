/**
 * Image Router — role + sceneType 기반 라우팅 로직
 * 구 geminiService.ts의 classifySceneType / buildScenePrompt를 이관하여 독립 모듈화.
 */

import type { SceneType } from './imageTypes';

// ── 장면 키워드 → SceneType 매핑 ──

const SCENE_KEYWORDS: Record<SceneType, RegExp> = {
  'symptom-discomfort': /통증|아프|붓기|출혈|시림|불편|증상|이상|징후|피가|욱신|저림|민감/,
  'cause-mechanism': /원인|이유|발생|진행|악화|염증|세균|위험|요인|메커니즘|과정|구조/,
  'consultation-treatment': /치료|시술|수술|상담|검진|진료|진단|처방|보철|임플란트|스케일링|발치/,
  'prevention-care': /예방|관리|양치|칫솔|치실|습관|위생|세정|관리법|홈케어|구강 관리|정기/,
  'caution-checkup': /주의|방치|조기|검진|내원|방문|신호|점검|체크|확인|필요/,
};

const SCENE_PROMPTS: Record<SceneType, string> = {
  'symptom-discomfort': '구강 불편감이나 통증을 느끼는 현대 한국인의 자연스러운 일상 장면. 과장된 고통 표현 금지. 입 주변이나 잇몸 불편을 인지하는 모습.',
  'cause-mechanism': '구강 건강 문제의 원인이나 진행 과정을 설명하는 맥락의 의료 정보 이미지. 반드시 병원 장면일 필요 없음.',
  'consultation-treatment': '현대 한국 병원/치과에서 의사와 환자가 진료 또는 상담하는 장면. 깨끗한 진료실, 신뢰감 있는 분위기.',
  'prevention-care': '양치질, 구강 위생 관리, 예방 행동을 하는 현대 한국인의 일상 장면. 집이나 욕실 등 일상 배경 허용.',
  'caution-checkup': '구강 건강 경각심을 전달하는 현실적 장면. 병원 방문 전후를 암시하거나, 건강 점검이 필요함을 보여주는 모습.',
};

/**
 * 소제목 키워드 기반 SceneType 분류
 * - 1차: 키워드 매칭 (연속 중복 방지)
 * - 2차: 연속 중복 무시 후 첫 매칭
 * - 3차: 가장 적게 사용된 타입 (다양성 보장)
 */
export function classifySceneType(sectionTitle: string, usedSceneTypes: string[]): SceneType {
  // 1차: 키워드 매칭
  for (const [type, regex] of Object.entries(SCENE_KEYWORDS) as [SceneType, RegExp][]) {
    if (regex.test(sectionTitle)) {
      // 직전 sceneType과 같으면 다른 걸 찾아봄 (연속 중복 방지)
      if (usedSceneTypes.length > 0 && usedSceneTypes[usedSceneTypes.length - 1] === type) {
        continue; // 다음 매칭 시도
      }
      return type;
    }
  }
  // 2차: 연속 중복 방지 실패 시에도 최초 매칭 반환
  for (const [type, regex] of Object.entries(SCENE_KEYWORDS) as [SceneType, RegExp][]) {
    if (regex.test(sectionTitle)) return type;
  }
  // 3차: 매칭 없으면 가장 적게 사용된 타입 반환 (다양성 보장)
  const typeCounts: Record<string, number> = {};
  const allTypes: SceneType[] = ['symptom-discomfort', 'cause-mechanism', 'consultation-treatment', 'prevention-care', 'caution-checkup'];
  for (const t of allTypes) typeCounts[t] = usedSceneTypes.filter(u => u === t).length;
  return allTypes.sort((a, b) => (typeCounts[a] || 0) - (typeCounts[b] || 0))[0];
}

/**
 * topic + sectionTitle + sceneType → 이미지 프롬프트 텍스트
 */
export function buildScenePrompt(topic: string, sectionTitle: string, sceneType: SceneType): string {
  const sceneDesc = SCENE_PROMPTS[sceneType];
  return `${topic} — ${sectionTitle}. ${sceneDesc} 현대 한국인, 현대적 일상복 또는 의료복.`;
}
