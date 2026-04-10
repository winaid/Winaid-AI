/**
 * TTS 목소리 라이브러리 — 3가지 엔진 지원
 *
 * 1. Gemini 2.5 TTS (최신, 추천) — 30개, 자연어 스타일 제어
 * 2. Chirp 3: HD — 고음질, 30개
 * 3. Legacy (Standard/WaveNet/Neural2) — 기존 안정적
 */

export type TtsEngine = 'gemini' | 'chirp3_hd' | 'legacy';

export interface TtsVoice {
  id: string;
  name: string;
  engine: TtsEngine;
  model?: string;
  label: string;
  gender: 'male' | 'female' | 'neutral';
  description: string;
  recommended?: boolean;
}

export const ENGINE_LABELS: Record<TtsEngine, { label: string; desc: string }> = {
  gemini: { label: '가장 자연스러움', desc: '최신 · 톤/감정 지시 가능' },
  chirp3_hd: { label: 'HD 고음질', desc: '깨끗한 신경망 음성' },
  legacy: { label: '기본', desc: '기본 · 자연스러움 · 사람같음' },
};

// ── 스타일 프롬프트 프리셋 (Gemini TTS 전용) ──

export const TTS_STYLE_PRESETS: Record<string, { label: string; prompt: string }> = {
  professional: { label: '전문적', prompt: '차분하고 신뢰감 있는 전문가 톤으로, 적절한 속도로 또렷하게 말해주세요.' },
  friendly: { label: '친근한', prompt: '친근하고 따뜻한 톤으로, 미소 짓는 것처럼 밝게 말해주세요.' },
  calm: { label: '차분한', prompt: '차분하고 편안한 톤으로, 환자를 안심시키듯 천천히 말해주세요.' },
  energetic: { label: '활기찬', prompt: '활기차고 에너지 넘치는 톤으로, 쇼츠에 적합하게 빠르고 임팩트 있게 말해주세요.' },
  explanatory: { label: '설명형', prompt: '교육적이고 알기 쉬운 톤으로, 중요한 부분은 강조하면서 명확하게 설명해주세요.' },
};

// ── 전체 목소리 목록 ──

// Gemini 30개 목소리 — 영어 구글 코드명(Aoede, Leda 등)은 name에만 유지,
// 사용자에겐 한글 특성만 노출. rec=true는 label에 ⭐로 자동 표시.
const GEMINI_VOICE_NAMES: Array<{ name: string; label: string; gender: 'male' | 'female' | 'neutral'; desc: string; rec?: boolean }> = [
  // 여성
  { name: 'Aoede',         label: '밝고 명랑한 여성',   gender: 'female', desc: '밝고 에너지 넘치는 톤' },
  { name: 'Leda',          label: '차분한 여성',         gender: 'female', desc: '차분하고 신뢰감 있는 톤 — 병원 추천', rec: true },
  { name: 'Kore',          label: '또렷한 여성',         gender: 'female', desc: '또렷하고 전문적인 톤 — 설명 추천', rec: true },
  { name: 'Callirhoe',     label: '부드러운 여성',       gender: 'female', desc: '부드럽고 따뜻한 톤' },
  { name: 'Despina',       label: '활기찬 여성',         gender: 'female', desc: '활기차고 친근한 톤' },
  { name: 'Erinome',       label: '감성적인 여성',       gender: 'female', desc: '감성적이고 섬세한 톤' },
  { name: 'Laomedeia',     label: '우아한 여성',         gender: 'female', desc: '우아하고 세련된 톤' },
  { name: 'Autonoe',       label: '자연스러운 여성',     gender: 'female', desc: '자연스럽고 편안한 톤' },
  { name: 'Pulcherrima',   label: '고급스러운 여성',     gender: 'female', desc: '고급스럽고 품격 있는 톤' },
  { name: 'Vindemiatrix',  label: '안정적인 여성',       gender: 'female', desc: '안정적이고 믿음직한 톤' },
  // 남성
  { name: 'Charon',        label: '신뢰감 있는 남성',    gender: 'male',   desc: '깊고 신뢰감 있는 톤 — 병원 추천', rec: true },
  { name: 'Fenrir',        label: '저음 남성',           gender: 'male',   desc: '낮고 묵직한 톤' },
  { name: 'Orus',          label: '밝은 남성',           gender: 'male',   desc: '밝고 친근한 톤' },
  { name: 'Puck',          label: '활발한 남성',         gender: 'male',   desc: '활발하고 에너지 넘치는 톤' },
  { name: 'Iapetus',       label: '차분한 남성',         gender: 'male',   desc: '차분하고 지적인 톤 — 설명 추천', rec: true },
  { name: 'Enceladus',     label: '따뜻한 남성',         gender: 'male',   desc: '따뜻하고 안정적인 톤' },
  { name: 'Gacrux',        label: '전문적인 남성',       gender: 'male',   desc: '전문적이고 권위 있는 톤' },
  { name: 'Umbriel',       label: '부드러운 남성',       gender: 'male',   desc: '부드럽고 편안한 톤' },
  { name: 'Rasalgethi',    label: '중후한 남성',         gender: 'male',   desc: '중후하고 깊이 있는 톤' },
  { name: 'Sulafar',       label: '또렷한 남성',         gender: 'male',   desc: '또렷하고 명확한 톤' },
  // 중성
  { name: 'Zephyr',        label: '중성적인 목소리',     gender: 'neutral', desc: '중성적이고 현대적인 톤' },
  { name: 'Achernar',      label: '맑은 목소리',         gender: 'neutral', desc: '맑고 깨끗한 톤' },
  { name: 'Achird',        label: '생동감 있는 목소리',  gender: 'neutral', desc: '생동감 있는 톤' },
  { name: 'Algenib',       label: '절제된 목소리',       gender: 'neutral', desc: '절제되고 차분한 톤' },
  { name: 'Algieba',       label: '풍부한 목소리',       gender: 'neutral', desc: '풍부하고 표현력 있는 톤' },
  { name: 'Alnilam',       label: '균형 잡힌 목소리',    gender: 'neutral', desc: '균형 잡히고 안정적인 톤' },
  { name: 'Sadachbia',     label: '경쾌한 목소리',       gender: 'neutral', desc: '경쾌하고 밝은 톤' },
  { name: 'Sadaltager',    label: '진중한 목소리',       gender: 'neutral', desc: '진중하고 무게감 있는 톤' },
  { name: 'Schedar',       label: '선명한 목소리',       gender: 'neutral', desc: '선명하고 명확한 톤' },
  { name: 'Zubenelgenubi', label: '개성 있는 목소리',    gender: 'neutral', desc: '독특하고 개성 있는 톤' },
];

// Gemini TTS 목소리 생성
const geminiVoices: TtsVoice[] = GEMINI_VOICE_NAMES.map(v => ({
  id: `gemini-${v.name.toLowerCase()}`,
  name: v.name,
  engine: 'gemini' as TtsEngine,
  model: 'gemini-2.5-flash-tts',
  label: v.label + (v.rec ? ' ⭐' : ''),
  gender: v.gender,
  description: v.desc,
  recommended: v.rec,
}));

// HD 고음질 목소리 생성 (구 Chirp3 HD)
const chirp3Voices: TtsVoice[] = GEMINI_VOICE_NAMES.map(v => ({
  id: `chirp3-${v.name.toLowerCase()}`,
  name: `ko-KR-Chirp3-HD-${v.name}`,
  engine: 'chirp3_hd' as TtsEngine,
  label: `${v.label} · HD`,
  gender: v.gender,
  description: `HD 고음질 — ${v.desc}`,
}));

// 기본 음성 (구 Legacy: Standard / WaveNet / Neural2)
//   - 기본: 로봇 느낌 살짝, 가장 저렴
//   - 자연스러움: 신경망 기반, 대부분 상황에 추천
//   - 사람에 가까움: 최신 AI, 가장 사람 같음 (가격 약 4배)
const legacyVoices: TtsVoice[] = [
  { id: 'legacy-std-a', name: 'ko-KR-Standard-A', engine: 'legacy', label: '여성 A (기본)', gender: 'female', description: '기본 엔진 — 로봇 느낌 살짝' },
  { id: 'legacy-std-b', name: 'ko-KR-Standard-B', engine: 'legacy', label: '여성 B (기본)', gender: 'female', description: '기본 엔진 — 로봇 느낌 살짝' },
  { id: 'legacy-std-c', name: 'ko-KR-Standard-C', engine: 'legacy', label: '남성 C (기본)', gender: 'male', description: '기본 엔진 — 로봇 느낌 살짝' },
  { id: 'legacy-std-d', name: 'ko-KR-Standard-D', engine: 'legacy', label: '남성 D (기본)', gender: 'male', description: '기본 엔진 — 로봇 느낌 살짝' },
  { id: 'legacy-wn-a', name: 'ko-KR-Wavenet-A', engine: 'legacy', label: '여성 A (자연스러움)', gender: 'female', description: '자연스러운 음성 — 대부분 상황에 추천' },
  { id: 'legacy-wn-b', name: 'ko-KR-Wavenet-B', engine: 'legacy', label: '여성 B (자연스러움)', gender: 'female', description: '자연스러운 여성 음성' },
  { id: 'legacy-wn-c', name: 'ko-KR-Wavenet-C', engine: 'legacy', label: '남성 C (자연스러움)', gender: 'male', description: '자연스러운 남성 음성 — 추천' },
  { id: 'legacy-wn-d', name: 'ko-KR-Wavenet-D', engine: 'legacy', label: '남성 D (자연스러움)', gender: 'male', description: '자연스러운 남성 음성' },
  { id: 'legacy-n2-a', name: 'ko-KR-Neural2-A', engine: 'legacy', label: '여성 A (사람에 가까움)', gender: 'female', description: '최신 AI — 가장 사람 같음' },
  { id: 'legacy-n2-b', name: 'ko-KR-Neural2-B', engine: 'legacy', label: '남성 B (사람에 가까움)', gender: 'male', description: '최신 AI — 가장 사람 같음' },
  { id: 'legacy-n2-c', name: 'ko-KR-Neural2-C', engine: 'legacy', label: '남성 C (사람에 가까움, 저음)', gender: 'male', description: '최신 AI — 저음 남성' },
];

export const TTS_VOICES: TtsVoice[] = [...geminiVoices, ...chirp3Voices, ...legacyVoices];

// ── 유틸 ──

export function getVoicesByEngine(engine: TtsEngine): TtsVoice[] {
  return TTS_VOICES.filter(v => v.engine === engine);
}

export function getRecommendedVoices(): TtsVoice[] {
  return TTS_VOICES.filter(v => v.recommended);
}

export function getVoiceById(id: string): TtsVoice | undefined {
  return TTS_VOICES.find(v => v.id === id);
}

export function getVoicesByGender(gender: 'male' | 'female' | 'neutral', engine?: TtsEngine): TtsVoice[] {
  return TTS_VOICES.filter(v => v.gender === gender && (!engine || v.engine === engine));
}
