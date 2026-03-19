/**
 * Image Router — role + sceneType + bucket 기반 장면 다양화 엔진
 *
 * ── 4-layer scene prompt 구조 ──
 * 1. Base Scene (sceneType): 의미 분류별 기본 장면 설명
 * 2. Bucket Detail (resolved bucket): 시각적 구체화 (closeup, monitor 등)
 * 3. Shot Intent (bucket): 구도/피사체/프레이밍 방향
 * 4. Repetition Avoid: 이전 슬롯과 중복 방지 힌트
 *
 * Final prompt = topic + sectionTitle + baseScene(sceneType) + bucketDetail(bucket) + shotIntent(bucket) + repetitionAvoid
 *
 * sceneBucket 메타데이터는 프롬프트 본문에 포함하지 않음 (로그/디버그 전용).
 */

import type { SceneType } from './imageTypes';
import type { ImageStyle } from '../../types';
import type { ImageRole } from './imageTypes';

// ── 장면 키워드 → SceneType 매핑 ──

const SCENE_KEYWORDS: Record<SceneType, RegExp> = {
  'symptom-discomfort': /통증|아프|붓기|출혈|시림|불편|증상|이상|징후|피가|욱신|저림|민감/,
  'cause-mechanism': /원인|이유|발생|진행|악화|염증|세균|위험|요인|메커니즘|과정|구조/,
  'consultation-treatment': /치료|시술|수술|상담|검진|진료|진단|처방|보철|임플란트|스케일링|발치/,
  'prevention-care': /예방|관리|양치|칫솔|치실|습관|위생|세정|관리법|홈케어|구강 관리|정기/,
  'caution-checkup': /주의|방치|조기|검진|내원|방문|신호|점검|체크|확인|필요/,
};

// ═══════════════════════════════════════════════
// Multi-bucket: sceneType당 후보 bucket 목록
// ═══════════════════════════════════════════════

/** Sub 이미지용 bucket 후보군 (sceneType별 3개) */
export const SCENE_BUCKETS: Record<SceneType, string[]> = {
  'symptom-discomfort': ['symptom-gesture', 'pain-point-focus', 'discomfort-expression'],
  'cause-mechanism': ['mechanism-closeup', 'exam-monitor', 'progression-visual'],
  'consultation-treatment': ['treatment-interaction', 'chair-side-procedure', 'explanation-dialogue'],
  'prevention-care': ['homecare-action', 'hygiene-tools', 'routine-habit'],
  'caution-checkup': ['checkup-exam', 'waiting-reception', 'xray-review'],
};

/** Hero 이미지 전용 bucket 후보군 */
export const HERO_BUCKETS: string[] = ['overview-clinical', 'editorial-hero', 'topic-anchor'];

// ═══════════════════════════════════════════════
// resolveSceneBucket — planner-level 분산
// ═══════════════════════════════════════════════

/**
 * sceneType + usedBuckets → 미사용 bucket 우선 선택 (deterministic)
 * - hero: HERO_BUCKETS에서 선택
 * - sub: SCENE_BUCKETS[sceneType]에서 선택
 * - 고갈 시 첫 번째 재사용
 */
export function resolveSceneBucket(
  sceneType: SceneType,
  usedBuckets: string[],
  role: ImageRole = 'sub',
): string {
  const candidates = role === 'hero' ? HERO_BUCKETS : SCENE_BUCKETS[sceneType];
  const unused = candidates.filter(b => !usedBuckets.includes(b));
  return unused.length > 0 ? unused[0] : candidates[0];
}

// ═══════════════════════════════════════════════
// Layer 1: Base Scene Prompts (sceneType 기본 의미)
// 스타일별로 분리, sceneType의 핵심 의미를 전달
// ═══════════════════════════════════════════════

const PHOTO_SCENE_BASE: Record<SceneType, string> = {
  'symptom-discomfort': '환자가 턱이나 볼을 가볍게 잡고 불편을 느끼는 자연스러운 장면. 과장된 고통 표현 금지. 거울/반사면 장면 금지.',
  'cause-mechanism': '구강 건강 문제의 원인이나 검사 맥락의 의료 정보 이미지. 사람 전신보다 검사 대상에 초점.',
  'consultation-treatment': '현대 한국 병원/치과에서 의사가 환자에게 진료 또는 시술하는 장면. 깨끗한 진료실, 신뢰감 있는 분위기.',
  'prevention-care': '양치질, 치실 사용, 구강 세정제 등 예방 행동을 하는 현대 한국인의 일상 장면. 거울 앞 장면 금지.',
  'caution-checkup': '구강 건강 경각심을 전달하는 현실적 검진 장면. 건강 점검 환경에 초점.',
};

const MEDICAL_SCENE_BASE: Record<SceneType, string> = {
  'symptom-discomfort': '해당 증상 부위의 해부학적 3D 단면도. 영향받는 조직/구조를 시각적으로 강조한 임상 다이어그램.',
  'cause-mechanism': '질환 원인 또는 진행 메커니즘을 보여주는 3D 의학 렌더. 조직/세포/구조 수준의 시각화.',
  'consultation-treatment': '치료 또는 시술 과정을 보여주는 3D 의학 단면도. 치료 도구와 해부학적 구조의 상호작용.',
  'prevention-care': '올바른 관리/예방을 위한 구강/신체 구조의 3D 교육용 다이어그램.',
  'caution-checkup': '조기 발견이 중요한 병변/구조를 강조한 3D 임상 시각화.',
};

const ILLUSTRATION_SCENE_BASE: Record<SceneType, string> = {
  'symptom-discomfort': '불편을 느끼는 캐릭터의 3D 일러스트. 증상 부위를 시각적으로 강조하는 아이콘/표시. 따뜻하고 공감적인 톤.',
  'cause-mechanism': '원인/진행 과정을 설명하는 인포그래픽 스타일 3D 일러스트. 순서도나 화살표로 메커니즘 표현. 텍스트 삽입 금지.',
  'consultation-treatment': '의료진과 환자의 상호작용을 보여주는 3D 캐릭터 일러스트. 진료 도구와 의료 환경이 포함된 따뜻한 장면.',
  'prevention-care': '일상에서 구강 관리를 하는 3D 캐릭터 일러스트. 칫솔/치실 등 관리 도구가 강조된 밝고 교육적인 장면.',
  'caution-checkup': '건강 점검의 중요성을 전달하는 3D 일러스트. 체크리스트, 달력, 알림 등 점검 시각 요소 포함.',
};

function getBaseScene(sceneType: SceneType, imageStyle?: ImageStyle): string {
  if (imageStyle === 'medical') return MEDICAL_SCENE_BASE[sceneType];
  if (imageStyle === 'illustration') return ILLUSTRATION_SCENE_BASE[sceneType];
  return PHOTO_SCENE_BASE[sceneType];
}

// ═══════════════════════════════════════════════
// Layer 2: Bucket Detail — bucket별 시각 구체화
// base scene 위에 덧씌워지는 구도/피사체 세부 지시
// ═══════════════════════════════════════════════

const BUCKET_DETAILS: Record<string, string> = {
  // symptom-discomfort
  'symptom-gesture': 'Focus: 얼굴 하단~턱선 미디엄 클로즈업, 손으로 턱/볼 잡는 제스처.',
  'pain-point-focus': 'Focus: 통증/불편 부위(잇몸, 치아, 턱관절) 극 클로즈업, 해당 부위에 시선 집중.',
  'discomfort-expression': 'Focus: 환자의 미간/입매 표정 변화, 상반신 와이드 구도, 일상 배경.',
  // cause-mechanism
  'mechanism-closeup': 'Focus: 구강 내부 또는 치아/잇몸 클로즈업, 검사 도구와 함께.',
  'exam-monitor': 'Focus: 의료 모니터/화면에 표시된 구강 상태 또는 엑스레이.',
  'progression-visual': 'Focus: 질환 진행 단계를 보여주는 비교 구도 (초기 vs 악화).',
  // consultation-treatment
  'treatment-interaction': 'Focus: 치료 도구와 진료 의자가 보이는 chair-side 구도.',
  'chair-side-procedure': 'Focus: 시술 중 의사 손과 도구 클로즈업, 환자 입 주변.',
  'explanation-dialogue': 'Focus: 모니터/차트를 가리키며 설명하는 의사, 환자와 눈높이.',
  // prevention-care
  'homecare-action': 'Focus: 손과 구강 관리 도구(칫솔/치실)에 초점, 집/생활 배경.',
  'hygiene-tools': 'Focus: 구강 관리 도구 배열/구성 스틸라이프, 깨끗한 테이블/세면대.',
  'routine-habit': 'Focus: 일상 루틴 중 구강 관리 순간, 아침/저녁 시간대 분위기.',
  // caution-checkup
  'checkup-exam': 'Focus: 병원 접수대 또는 대기실, 검진 환경.',
  'waiting-reception': 'Focus: 대기실/접수 환경, 번호표/접수용지, 병원 인테리어.',
  'xray-review': 'Focus: 엑스레이 모니터 앞 검진 장면, 의사가 화면을 가리키는 구도.',
  // hero
  'overview-clinical': 'Focus: 주제를 대표하는 넓은 진료실/의료 환경 오버뷰.',
  'editorial-hero': 'Focus: 주제를 상징적으로 보여주는 editorial 대표 이미지. 차분하고 신뢰감 있는 분위기.',
  'topic-anchor': 'Focus: 주제 핵심 요소를 중앙 배치한 앵커 구도.',
};

// ═══════════════════════════════════════════════
// Layer 3: Shot Intent — bucket별 구도/프레이밍
// ═══════════════════════════════════════════════

const SHOT_INTENTS: Record<string, string> = {
  // symptom-discomfort
  'symptom-gesture': 'Shot intent: patient gesture showing discomfort (jaw touch, wince), medium shot or close-up on affected area. Avoid generic standing portrait.',
  'pain-point-focus': 'Shot intent: extreme close-up on the specific pain area (gum, tooth, jaw joint). Macro or detail shot perspective.',
  'discomfort-expression': 'Shot intent: upper body wide shot capturing patient expression and posture in everyday context. Not a medical setting.',
  // cause-mechanism
  'mechanism-closeup': 'Shot intent: close-up or detail shot of the affected structure, instrument, or examination context. Avoid full-body consultation scene.',
  'exam-monitor': 'Shot intent: over-shoulder or front view of a medical monitor/screen displaying dental imagery or x-ray.',
  'progression-visual': 'Shot intent: side-by-side or sequential comparison layout showing disease progression stages.',
  // consultation-treatment
  'treatment-interaction': 'Shot intent: doctor-patient interaction at chair-side, showing procedure or explanation. Treatment tools or monitor visible.',
  'chair-side-procedure': 'Shot intent: close-up of procedure in progress — dentist hands, tools, and patient mouth area.',
  'explanation-dialogue': 'Shot intent: medium shot of doctor pointing at monitor/chart while explaining to seated patient.',
  // prevention-care
  'homecare-action': 'Shot intent: daily hygiene action (brushing, flossing, rinsing) in home or bathroom setting. Hands and oral care product visible.',
  'hygiene-tools': 'Shot intent: still-life or flat-lay arrangement of oral care products on clean surface. Product-focused, no person.',
  'routine-habit': 'Shot intent: lifestyle moment of oral care as part of daily routine. Morning/evening atmosphere, natural lighting.',
  // caution-checkup
  'checkup-exam': 'Shot intent: reception desk, waiting room, x-ray monitor, or examination chair context. Emphasis on check-up environment, not consultation dialogue.',
  'waiting-reception': 'Shot intent: hospital/clinic reception area, number ticket, waiting seats. Administrative context.',
  'xray-review': 'Shot intent: x-ray image on lightbox or monitor, doctor reviewing results. Diagnostic context.',
  // hero
  'overview-clinical': 'Shot intent: wide establishing shot of modern clinical environment. Clean, professional, trust-building.',
  'editorial-hero': 'Shot intent: editorial hero image — symbolic, calm, professional tone. Represents the overall topic.',
  'topic-anchor': 'Shot intent: central subject placement, balanced composition, clear visual anchor for the article topic.',
};

// ═══════════════════════════════════════════════
// Layer 4: Repetition Avoid (공통)
// ═══════════════════════════════════════════════

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
  const sameCount = usedSceneTypes.filter(s => s === sceneType).length;
  if (sameCount === 0) return '';

  const styleKey = imageStyle === 'medical' ? 'medical'
    : imageStyle === 'illustration' ? 'illustration'
    : 'photo';
  return ` ${STYLE_REPETITION_AVOIDS[styleKey]}`;
}

// ═══════════════════════════════════════════════
// Hero Scene Prompts (style별)
// ═══════════════════════════════════════════════

const HERO_SCENE_PROMPTS: Record<string, Record<string, string>> = {
  photo: {
    'overview-clinical': '주제를 대표하는 현대 한국 병원/치과의 넓고 깨끗한 진료 환경.',
    'editorial-hero': '주제를 상징적으로 보여주는 현대 한국인. 의료/구강 건강 맥락의 현실적 editorial 이미지. 차분하고 신뢰감 있는 분위기.',
    'topic-anchor': '주제 핵심 요소를 중앙에 배치한 현대 한국 의료 맥락의 대표 이미지.',
  },
  medical: {
    'overview-clinical': '주제를 대표하는 3D 의학 렌더. 해부학적 구조 또는 치료 메커니즘의 전체 시각화.',
    'editorial-hero': '주제를 대표하는 3D 의학 렌더. 해부학적 구조 또는 치료 메커니즘의 임상 시각화.',
    'topic-anchor': '주제 핵심 해부학적 구조를 중앙에 배치한 3D 의학 교육용 대표 렌더.',
  },
  illustration: {
    'overview-clinical': '주제를 대표하는 3D 캐릭터 일러스트. 밝고 신뢰감 있는 의료 환경 오버뷰.',
    'editorial-hero': '주제를 상징하는 3D 일러스트. 핵심 캐릭터와 의료 요소가 조화된 대표 장면.',
    'topic-anchor': '주제 핵심을 중앙에 배치한 3D 일러스트. 밝고 교육적인 분위기.',
  },
};

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
 * Sub 이미지용 scene prompt 생성
 *
 * 4-layer 구조:
 *   1. Base scene (sceneType 의미 기반)
 *   2. Bucket detail (resolved bucket의 시각 구체화)
 *   3. Shot intent (bucket별 구도/프레이밍)
 *   4. Repetition-avoid hint (중복 방지)
 *
 * sceneBucket 메타는 프롬프트 본문에 포함하지 않음 (로그 전용).
 *
 * @param resolvedBucket - resolveSceneBucket()으로 미리 결정된 bucket (없으면 첫 번째 후보 사용)
 */
export function buildScenePrompt(
  topic: string,
  sectionTitle: string,
  sceneType: SceneType,
  imageStyle?: ImageStyle,
  usedSceneTypes?: string[],
  resolvedBucket?: string,
): string {
  const bucket = resolvedBucket || SCENE_BUCKETS[sceneType][0];
  const baseScene = getBaseScene(sceneType, imageStyle);
  const bucketDetail = BUCKET_DETAILS[bucket] || '';
  const shotIntent = SHOT_INTENTS[bucket] || SHOT_INTENTS[SCENE_BUCKETS[sceneType][0]] || '';
  const repAvoid = buildRepetitionAvoid(sceneType, usedSceneTypes || [], imageStyle);

  if (imageStyle === 'medical') {
    return `${topic} — ${sectionTitle}. ${baseScene} ${bucketDetail} ${shotIntent}${repAvoid}`;
  }

  if (imageStyle === 'illustration') {
    return `${topic} — ${sectionTitle}. ${baseScene} ${bucketDetail} ${shotIntent}${repAvoid}`;
  }

  // photo / custom / 미지정 → photo 계열
  return `${topic} — ${sectionTitle}. ${baseScene} ${bucketDetail} ${shotIntent} 현대 한국인, 현대적 일상복 또는 의료복.${repAvoid}`;
}

/**
 * Hero 이미지용 scene prompt 생성
 *
 * Hero 전용 bucket 체계 + style별 hero scene prompt.
 * Sub와 같은 엔진이지만 role=hero 전용 bucket/prompt 사용.
 *
 * sceneBucket 메타는 프롬프트 본문에 포함하지 않음 (로그 전용).
 */
export function buildHeroScenePrompt(
  topic: string,
  imageStyle?: ImageStyle,
  resolvedBucket?: string,
): string {
  const bucket = resolvedBucket || HERO_BUCKETS[0];
  const styleKey = imageStyle === 'medical' ? 'medical'
    : imageStyle === 'illustration' ? 'illustration'
    : 'photo';

  const heroScene = HERO_SCENE_PROMPTS[styleKey]?.[bucket]
    || HERO_SCENE_PROMPTS[styleKey]?.['editorial-hero']
    || '';
  const bucketDetail = BUCKET_DETAILS[bucket] || '';
  const shotIntent = SHOT_INTENTS[bucket] || '';

  if (imageStyle === 'medical') {
    return `${topic} — ${heroScene} ${bucketDetail} ${shotIntent}`;
  }

  if (imageStyle === 'illustration') {
    return `${topic} — ${heroScene} ${bucketDetail} ${shotIntent}`;
  }

  // photo / custom / 미지정
  return `${topic} — ${heroScene} ${bucketDetail} ${shotIntent} 현대 한국인, 현대적 일상복 또는 의료복.`;
}
