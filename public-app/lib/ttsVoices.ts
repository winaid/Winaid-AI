/**
 * Google Cloud TTS 한국어 목소리 목록
 */

export interface TtsVoice {
  name: string;
  gender: 'female' | 'male';
  label: string;
  tier: 'standard' | 'wavenet' | 'neural2';
  recommended?: boolean;
}

export const KOREAN_VOICES: TtsVoice[] = [
  // Wavenet (자연스러운, 추천)
  { name: 'ko-KR-Wavenet-A', gender: 'female', label: '자연스러운 여성', tier: 'wavenet', recommended: true },
  { name: 'ko-KR-Wavenet-B', gender: 'male', label: '자연스러운 남성', tier: 'wavenet', recommended: true },
  { name: 'ko-KR-Wavenet-C', gender: 'male', label: '저음 남성', tier: 'wavenet' },
  { name: 'ko-KR-Wavenet-D', gender: 'female', label: '밝은 톤 여성', tier: 'wavenet' },

  // Neural2 (최고 품질)
  { name: 'ko-KR-Neural2-A', gender: 'female', label: '최고품질 여성', tier: 'neural2' },
  { name: 'ko-KR-Neural2-B', gender: 'male', label: '최고품질 남성', tier: 'neural2' },
  { name: 'ko-KR-Neural2-C', gender: 'male', label: '최고품질 저음 남성', tier: 'neural2' },

  // Standard (기본)
  { name: 'ko-KR-Standard-A', gender: 'female', label: '차분한 여성', tier: 'standard' },
  { name: 'ko-KR-Standard-B', gender: 'female', label: '밝은 여성', tier: 'standard' },
  { name: 'ko-KR-Standard-C', gender: 'male', label: '차분한 남성', tier: 'standard' },
  { name: 'ko-KR-Standard-D', gender: 'male', label: '밝은 남성', tier: 'standard' },
];

export function getVoiceByName(name: string): TtsVoice | undefined {
  return KOREAN_VOICES.find(v => v.name === name);
}
