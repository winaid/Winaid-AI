/**
 * Image Router — role + sceneType 기반 라우팅 로직
 * 구 geminiService.ts의 classifySceneType / buildScenePrompt를 이관하여 독립 모듈화.
 *
 * ── 3-layer scene prompt 구조 ──
 * 1. Shot Intent (공통): sceneType별 구도/피사체/프레이밍 방향
 * 2. Style Scene (스타일별): photo / medical / illustration 각각의 표현
 * 3. Repetition Avoid (공통): 이전 슬롯과 중복 방지 힌트
 *
 * Final prompt = topic + sectionTitle + styleScene + shotIntent + repetitionAvoid
 */

import type { SceneType } from './imageTypes';
import type { ImageStyle } from '../../types';

// ── 장면 키워드 → SceneType 매핑 ──

const SCENE_KEYWORDS: Record<SceneType, RegExp> = {
  'symptom-discomfort': /통증|아프|붓기|출혈|시림|불편|증상|이상|징후|피가|욱신|저림|민감/,
  'cause-mechanism': /원인|이유|발생|진행|악화|염증|세균|위험|요인|메커니즘|과정|구조/,
  'consultation-treatment': /치료|시술|수술|상담|검진|진료|진단|처방|보철|임플란트|스케일링|발치/,
  'prevention-care': /예방|관리|양치|칫솔|치실|습관|위생|세정|관리법|홈케어|구강 관리|정기/,
  'caution-checkup': /주의|방치|조기|검진|내원|방문|신호|점검|체크|확인|필요/,
};

// ═══════════════════════════════════════════════
// Layer 1: Shot Intent (공통) — 구도/피사체/프레이밍
// sceneType이 같아도 스타일마다 표현은 다르지만
// "무엇을 찍을지"의 방향은 공통으로 잡는다.
// ═══════════════════════════════════════════════

/** 공통 sceneBucket: 로그/디버그용 시각적 분류 라벨 */
export const SCENE_BUCKETS: Record<SceneType, string> = {
  'symptom-discomfort': 'symptom-gesture',
  'cause-mechanism': 'mechanism-closeup',
  'consultation-treatment': 'treatment-interaction',
  'prevention-care': 'homecare-action',
  'caution-checkup': 'checkup-exam',
};

/**
 * 공통 shot intent: 스타일에 관계없이 "이 sceneType은 이런 구도/피사체를 지향"
 * 스타일별 scene prompt 뒤에 추가된다.
 */
const SHOT_INTENTS: Record<SceneType, string> = {
  'symptom-discomfort': 'Shot intent: patient gesture showing discomfort (jaw touch, wince), medium shot or close-up on affected area. Avoid generic standing portrait.',
  'cause-mechanism': 'Shot intent: close-up or detail shot of the affected structure, instrument, or examination context. Avoid full-body consultation scene.',
  'consultation-treatment': 'Shot intent: doctor-patient interaction at chair-side, showing procedure or explanation. Treatment tools or monitor visible.',
  'prevention-care': 'Shot intent: daily hygiene action (brushing, flossing, rinsing) in home or bathroom setting. Hands and oral care product visible.',
  'caution-checkup': 'Shot intent: reception desk, waiting room, x-ray monitor, or examination chair context. Emphasis on check-up environment, not consultation dialogue.',
};

// ═══════════════════════════════════════════════
// Layer 2: Style-specific Scene Prompts
// 같은 sceneType이라도 스타일마다 다른 표현
// ═══════════════════════════════════════════════

// ── photo: 실사 사진, 다양한 shot type으로 분화 ──
const PHOTO_SCENE_PROMPTS: Record<SceneType, string> = {
  'symptom-discomfort': '환자가 턱이나 볼을 가볍게 잡고 불편을 느끼는 자연스러운 장면. 얼굴 하단~턱선 중심 미디엄 클로즈업. 과장된 고통 표현 금지. 거울/반사면 장면 금지.',
  'cause-mechanism': '구강 내부 또는 치아/잇몸 클로즈업 검사 장면, 또는 의료 모니터에 구강 상태가 표시된 장면. 사람 전신보다 검사 대상에 초점. 반드시 병원 장면일 필요 없음.',
  'consultation-treatment': '현대 한국 병원/치과에서 의사가 환자에게 진료 또는 시술하는 장면. 치료 도구나 진료 의자가 보이는 chair-side 구도. 깨끗한 진료실, 신뢰감 있는 분위기.',
  'prevention-care': '양치질, 치실 사용, 구강 세정제 등 예방 행동을 하는 현대 한국인의 일상 장면. 손과 구강 관리 도구에 초점. 집이나 생활 공간 배경. 거울 앞 장면 금지.',
  'caution-checkup': '병원 접수대, 대기실, 또는 엑스레이 모니터 앞 검진 장면. 건강 점검 환경에 초점. 단순 대화 장면이 아닌 검사/점검 맥락.',
};

// ── medical: 3D 해부학/임상 시각화, 구조 수준 분화 ──
const MEDICAL_SCENE_PROMPTS: Record<SceneType, string> = {
  'symptom-discomfort': '해당 증상 부위의 해부학적 3D 단면도. 영향받는 조직/구조를 시각적으로 강조한 임상 다이어그램. 염증이나 손상 부위를 색상 강조.',
  'cause-mechanism': '질환 원인 또는 진행 메커니즘을 보여주는 3D 의학 렌더. 조직/세포/구조 수준의 시각화. 단면도와 전체도를 조합한 교육용 구성.',
  'consultation-treatment': '치료 또는 시술 과정을 보여주는 3D 의학 단면도. 치료 도구와 해부학적 구조의 상호작용. 시술 전후 비교 가능한 구성.',
  'prevention-care': '올바른 관리/예방을 위한 구강/신체 구조의 3D 교육용 다이어그램. 보호 메커니즘이나 관리 효과를 시각적으로 표현.',
  'caution-checkup': '조기 발견이 중요한 병변/구조를 강조한 3D 임상 시각화. 정상 vs 이상 비교 또는 경고 표시가 있는 교육적 구성.',
};

// ── illustration: 설명형 일러스트, 레이아웃/구성 분화 ──
const ILLUSTRATION_SCENE_PROMPTS: Record<SceneType, string> = {
  'symptom-discomfort': '불편을 느끼는 캐릭터의 3D 일러스트. 증상 부위를 시각적으로 강조하는 아이콘/표시. 따뜻하고 공감적인 톤.',
  'cause-mechanism': '원인/진행 과정을 설명하는 인포그래픽 스타일 3D 일러스트. 순서도나 화살표로 메커니즘 표현. 텍스트 삽입 금지.',
  'consultation-treatment': '의료진과 환자의 상호작용을 보여주는 3D 캐릭터 일러스트. 진료 도구와 의료 환경이 포함된 따뜻한 장면.',
  'prevention-care': '일상에서 구강 관리를 하는 3D 캐릭터 일러스트. 칫솔/치실 등 관리 도구가 강조된 밝고 교육적인 장면.',
  'caution-checkup': '건강 점검의 중요성을 전달하는 3D 일러스트. 체크리스트, 달력, 알림 등 점검 시각 요소 포함. 경각심 있지만 공포스럽지 않은 톤.',
};

// ═══════════════════════════════════════════════
// Layer 3: Repetition Avoid (공통)
// 이전 슬롯과 중복 방지
// ═══════════════════════════════════════════════

/**
 * 스타일별 자주 반복되는 패턴 방지 힌트.
 * 이전 sceneType이 같은 경우 추가된다.
 */
const STYLE_REPETITION_AVOIDS: Record<string, string> = {
  photo: 'Avoid repeating: same consultation/face-to-face dialogue composition. Vary shot distance, subject focus, or environment.',
  medical: 'Avoid repeating: same cross-section angle or organ view. Vary between sagittal/coronal/axial views, or switch to macro/micro scale.',
  illustration: 'Avoid repeating: same character pose or infographic layout. Vary scene composition, character action, or visual metaphor.',
};

function buildRepetitionAvoid(
  sceneType: SceneType,
  usedSceneTypes: string[],
  imageStyle?: ImageStyle,
): string {
  // 이전에 같은 sceneType이 이미 사용된 경우에만 방지 힌트 추가
  const sameCount = usedSceneTypes.filter(s => s === sceneType).length;
  if (sameCount === 0) return '';

  const styleKey = imageStyle === 'medical' ? 'medical'
    : imageStyle === 'illustration' ? 'illustration'
    : 'photo';
  return ` ${STYLE_REPETITION_AVOIDS[styleKey]}`;
}

// ═══════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════

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
 * topic + sectionTitle + sceneType + imageStyle → 이미지 프롬프트 텍스트
 *
 * 3-layer 구조:
 *   1. Style-specific scene description (photo/medical/illustration)
 *   2. Common shot intent (구도/피사체 방향)
 *   3. Repetition-avoid hint (중복 방지)
 *
 * @param usedSceneTypes - 이전 슬롯에서 사용된 sceneType 목록 (반복 방지용, optional)
 */
export function buildScenePrompt(
  topic: string,
  sectionTitle: string,
  sceneType: SceneType,
  imageStyle?: ImageStyle,
  usedSceneTypes?: string[],
): string {
  const shotIntent = SHOT_INTENTS[sceneType];
  const repAvoid = buildRepetitionAvoid(sceneType, usedSceneTypes || [], imageStyle);
  const sceneBucket = SCENE_BUCKETS[sceneType];

  if (imageStyle === 'medical') {
    const medicalDesc = MEDICAL_SCENE_PROMPTS[sceneType];
    return `${topic} — ${sectionTitle}. ${medicalDesc} ${shotIntent}${repAvoid} [sceneBucket=${sceneBucket}]`;
  }

  if (imageStyle === 'illustration') {
    const illustDesc = ILLUSTRATION_SCENE_PROMPTS[sceneType];
    return `${topic} — ${sectionTitle}. ${illustDesc} ${shotIntent}${repAvoid} [sceneBucket=${sceneBucket}]`;
  }

  // photo / custom / 미지정 → photo 계열
  const photoDesc = PHOTO_SCENE_PROMPTS[sceneType];
  return `${topic} — ${sectionTitle}. ${photoDesc} ${shotIntent} 현대 한국인, 현대적 일상복 또는 의료복.${repAvoid} [sceneBucket=${sceneBucket}]`;
}
