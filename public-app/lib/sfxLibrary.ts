/**
 * 효과음 라이브러리
 *
 * 모든 효과음은 Pixabay (pixabay.com/sound-effects) 또는 Freesound.org에서 다운로드.
 * 라이선스: Pixabay License (상업적 사용 가능, 저작자 표기 불필요).
 *
 * 파일 규격:
 *   - 포맷: MP3, 44.1kHz, 128kbps 이상
 *   - 효과음 길이: 0.5초 ~ 3초 (BGM 제외)
 *   - BGM 길이: 30초 ~ 2분 (루프 가능)
 *   - 볼륨: -14 LUFS 정규화
 *   - 파일명: {카테고리}_{설명}_{번호}.mp3
 *
 * TODO: 효과음 파일은 수동 다운로드 필요.
 *       아래 라이브러리는 메타데이터만 정의하며, 파일이 없으면 graceful하게 스킵한다.
 */

// ── 타입 ──

export type SfxCategory =
  | 'emphasis' | 'transition' | 'positive' | 'negative'
  | 'funny' | 'notification' | 'ambient' | 'musical' | 'speech' | 'ui';

export type BgmMood = 'bright' | 'calm' | 'emotional' | 'trendy' | 'corporate';

export interface SfxFile {
  id: string;
  path: string;
  name: string;
  category: SfxCategory;
  duration: number;
  tags: string[];
}

export interface BgmFile {
  id: string;
  path: string;
  name: string;
  mood: BgmMood;
  duration: number;
  tags: string[];
}

// ── 카테고리 한글 라벨 ──

export const SFX_CATEGORY_LABELS: Record<SfxCategory, string> = {
  emphasis: '강조',
  transition: '전환',
  positive: '긍정',
  negative: '부정/주의',
  funny: '재미/코믹',
  notification: '알림/정보',
  ambient: '분위기',
  musical: '음악적',
  speech: '음성',
  ui: 'UI/텍스트',
};

export const BGM_MOOD_LABELS: Record<BgmMood, string> = {
  bright: '밝고 경쾌한',
  calm: '차분하고 신뢰감 (병원 추천)',
  emotional: '감성적인',
  trendy: '트렌디/힙한',
  corporate: '기업/전문적',
};

// ── 효과음 라이브러리 ──

export const SFX_LIBRARY: SfxFile[] = [

  // ════════════════════════════════════════
  // emphasis — 강조 효과음 (20개)
  // ════════════════════════════════════════

  { id: 'ding_01', path: '/sfx/emphasis/ding_01.mp3', name: '띵 (맑은 벨)', category: 'emphasis', duration: 0.5, tags: ['강조', '포인트', '중요', '알림'] },
  { id: 'ding_02', path: '/sfx/emphasis/ding_02.mp3', name: '띵 (높은 톤)', category: 'emphasis', duration: 0.4, tags: ['강조', '포인트', '밝은'] },
  { id: 'ding_03', path: '/sfx/emphasis/ding_03.mp3', name: '띵 (부드러운)', category: 'emphasis', duration: 0.6, tags: ['강조', '부드러운', '정보'] },
  { id: 'pop_01', path: '/sfx/emphasis/pop_01.mp3', name: '뿅 (거품)', category: 'emphasis', duration: 0.3, tags: ['등장', '나타남', '새로운'] },
  { id: 'pop_02', path: '/sfx/emphasis/pop_02.mp3', name: '뿅 (가벼운)', category: 'emphasis', duration: 0.3, tags: ['등장', '가벼운', '귀여운'] },
  { id: 'pop_03', path: '/sfx/emphasis/pop_03.mp3', name: '뿅 (통통)', category: 'emphasis', duration: 0.4, tags: ['등장', '통통', '재미'] },
  { id: 'boom_01', path: '/sfx/emphasis/boom_01.mp3', name: '붐 (임팩트)', category: 'emphasis', duration: 0.8, tags: ['강한', '임팩트', '놀라운'] },
  { id: 'boom_02', path: '/sfx/emphasis/boom_02.mp3', name: '붐 (둥둥)', category: 'emphasis', duration: 0.6, tags: ['강조', '무거운', '중요'] },
  { id: 'sparkle_01', path: '/sfx/emphasis/sparkle_01.mp3', name: '반짝 (별빛)', category: 'emphasis', duration: 0.7, tags: ['반짝', '빛나는', '특별한'] },
  { id: 'sparkle_02', path: '/sfx/emphasis/sparkle_02.mp3', name: '반짝 (마법가루)', category: 'emphasis', duration: 0.8, tags: ['마법', '반짝', '예쁜'] },
  { id: 'sparkle_03', path: '/sfx/emphasis/sparkle_03.mp3', name: '반짝 (짧은빛)', category: 'emphasis', duration: 0.4, tags: ['반짝', '짧은', '포인트'] },
  { id: 'hit_01', path: '/sfx/emphasis/hit_01.mp3', name: '탁 (짧은타격)', category: 'emphasis', duration: 0.2, tags: ['탁', '짧은', '강조'] },
  { id: 'hit_02', path: '/sfx/emphasis/hit_02.mp3', name: '탁 (강한)', category: 'emphasis', duration: 0.3, tags: ['탁', '강한', '임팩트'] },
  { id: 'snap_01', path: '/sfx/emphasis/snap_01.mp3', name: '딱 (핑거스냅)', category: 'emphasis', duration: 0.3, tags: ['딱', '전환', '시작'] },
  { id: 'snap_02', path: '/sfx/emphasis/snap_02.mp3', name: '딱 (가벼운)', category: 'emphasis', duration: 0.2, tags: ['딱', '가벼운', '포인트'] },
  { id: 'click_01', path: '/sfx/emphasis/click_01.mp3', name: '틱 (클릭)', category: 'emphasis', duration: 0.2, tags: ['클릭', 'UI', '선택'] },
  { id: 'click_02', path: '/sfx/emphasis/click_02.mp3', name: '틱 (가벼운)', category: 'emphasis', duration: 0.1, tags: ['클릭', '가벼운', '작은'] },
  { id: 'punch_01', path: '/sfx/emphasis/punch_01.mp3', name: '펑 (펀치)', category: 'emphasis', duration: 0.4, tags: ['펀치', '강한', '타격'] },
  { id: 'stomp_01', path: '/sfx/emphasis/stomp_01.mp3', name: '쿵 (발구르기)', category: 'emphasis', duration: 0.5, tags: ['쿵', '무거운', '강조'] },
  { id: 'bass_drop_01', path: '/sfx/emphasis/bass_drop_01.mp3', name: '둥 (베이스드롭)', category: 'emphasis', duration: 0.8, tags: ['베이스', '드롭', '임팩트'] },

  // ════════════════════════════════════════
  // transition — 전환 효과음 (16개)
  // ════════════════════════════════════════

  { id: 'whoosh_01', path: '/sfx/transition/whoosh_01.mp3', name: '슉 (빠른바람)', category: 'transition', duration: 0.5, tags: ['전환', '빠른', '바람'] },
  { id: 'whoosh_02', path: '/sfx/transition/whoosh_02.mp3', name: '슉 (부드러운)', category: 'transition', duration: 0.6, tags: ['전환', '부드러운', '자연스러운'] },
  { id: 'whoosh_03', path: '/sfx/transition/whoosh_03.mp3', name: '슉 (위에서아래)', category: 'transition', duration: 0.5, tags: ['전환', '위아래', '낙하'] },
  { id: 'whoosh_04', path: '/sfx/transition/whoosh_04.mp3', name: '슉 (좌에서우)', category: 'transition', duration: 0.5, tags: ['전환', '좌우', '이동'] },
  { id: 'swoosh_01', path: '/sfx/transition/swoosh_01.mp3', name: '휙 (가벼운)', category: 'transition', duration: 0.4, tags: ['전환', '가벼운', '빠른'] },
  { id: 'swoosh_02', path: '/sfx/transition/swoosh_02.mp3', name: '휙 (빠른)', category: 'transition', duration: 0.3, tags: ['전환', '빠른', '날카로운'] },
  { id: 'swoosh_03', path: '/sfx/transition/swoosh_03.mp3', name: '쉭 (칼바람)', category: 'transition', duration: 0.4, tags: ['전환', '날카로운', '강한'] },
  { id: 'slide_01', path: '/sfx/transition/slide_01.mp3', name: '스르륵 (슬라이드)', category: 'transition', duration: 0.6, tags: ['전환', '슬라이드', '부드러운'] },
  { id: 'slide_02', path: '/sfx/transition/slide_02.mp3', name: '스르륵 (부드럽게)', category: 'transition', duration: 0.7, tags: ['전환', '부드러운', '느린'] },
  { id: 'wind_01', path: '/sfx/transition/wind_01.mp3', name: '우웅 (바람)', category: 'transition', duration: 0.8, tags: ['바람', '분위기', '전환'] },
  { id: 'glitch_01', path: '/sfx/transition/glitch_01.mp3', name: '지직 (글리치)', category: 'transition', duration: 0.4, tags: ['글리치', '디지털', '오류'] },
  { id: 'glitch_02', path: '/sfx/transition/glitch_02.mp3', name: '지직 (짧은)', category: 'transition', duration: 0.2, tags: ['글리치', '짧은', '전환'] },
  { id: 'tape_rewind_01', path: '/sfx/transition/tape_rewind_01.mp3', name: '되감기', category: 'transition', duration: 0.6, tags: ['되감기', '레트로', '과거'] },
  { id: 'page_turn_01', path: '/sfx/transition/page_turn_01.mp3', name: '페이지넘김', category: 'transition', duration: 0.4, tags: ['페이지', '넘기기', '다음'] },
  { id: 'zoom_in_01', path: '/sfx/transition/zoom_in_01.mp3', name: '줌인', category: 'transition', duration: 0.5, tags: ['줌인', '확대', '집중'] },
  { id: 'zoom_out_01', path: '/sfx/transition/zoom_out_01.mp3', name: '줌아웃', category: 'transition', duration: 0.5, tags: ['줌아웃', '축소', '마무리'] },

  // ════════════════════════════════════════
  // positive — 긍정 효과음 (20개)
  // ════════════════════════════════════════

  { id: 'fanfare_01', path: '/sfx/positive/fanfare_01.mp3', name: '짜잔 (팡파레)', category: 'positive', duration: 1.5, tags: ['짜잔', '성공', '축하', '발표'] },
  { id: 'fanfare_02', path: '/sfx/positive/fanfare_02.mp3', name: '짜잔 (짧은)', category: 'positive', duration: 0.8, tags: ['짜잔', '짧은', '결과'] },
  { id: 'fanfare_03', path: '/sfx/positive/fanfare_03.mp3', name: '짜잔 (화려한)', category: 'positive', duration: 2.0, tags: ['화려한', '성공', '대단한'] },
  { id: 'success_01', path: '/sfx/positive/success_01.mp3', name: '성공 (레벨업)', category: 'positive', duration: 0.8, tags: ['성공', '레벨업', '달성'] },
  { id: 'success_02', path: '/sfx/positive/success_02.mp3', name: '성공 (달성)', category: 'positive', duration: 0.6, tags: ['성공', '완료', '좋은'] },
  { id: 'tada_01', path: '/sfx/positive/tada_01.mp3', name: '타다 (서프라이즈)', category: 'positive', duration: 1.0, tags: ['서프라이즈', '놀라움', '공개'] },
  { id: 'tada_02', path: '/sfx/positive/tada_02.mp3', name: '타다 (짧은)', category: 'positive', duration: 0.5, tags: ['서프라이즈', '짧은', '등장'] },
  { id: 'chime_01', path: '/sfx/positive/chime_01.mp3', name: '딩동 (밝은종)', category: 'positive', duration: 0.6, tags: ['딩동', '밝은', '알림'] },
  { id: 'chime_02', path: '/sfx/positive/chime_02.mp3', name: '딩동 (크리스탈)', category: 'positive', duration: 0.7, tags: ['크리스탈', '맑은', '고급'] },
  { id: 'magic_01', path: '/sfx/positive/magic_01.mp3', name: '마법 (반짝반짝)', category: 'positive', duration: 1.0, tags: ['마법', '반짝', '변신'] },
  { id: 'magic_02', path: '/sfx/positive/magic_02.mp3', name: '마법 (요정)', category: 'positive', duration: 0.8, tags: ['요정', '마법', '귀여운'] },
  { id: 'coin_01', path: '/sfx/positive/coin_01.mp3', name: '코인획득', category: 'positive', duration: 0.4, tags: ['코인', '획득', '게임', '보상'] },
  { id: 'power_up_01', path: '/sfx/positive/power_up_01.mp3', name: '파워업', category: 'positive', duration: 0.8, tags: ['파워업', '강화', '업그레이드'] },
  { id: 'applause_01', path: '/sfx/positive/applause_01.mp3', name: '박수 (짧은)', category: 'positive', duration: 1.5, tags: ['박수', '칭찬', '좋은'] },
  { id: 'applause_02', path: '/sfx/positive/applause_02.mp3', name: '박수 (관중)', category: 'positive', duration: 2.0, tags: ['박수', '관중', '환호'] },
  { id: 'cheering_01', path: '/sfx/positive/cheering_01.mp3', name: '환호 (짧은)', category: 'positive', duration: 1.0, tags: ['환호', '우와', '대단한'] },
  { id: 'party_horn_01', path: '/sfx/positive/party_horn_01.mp3', name: '파티호른 (뿌우)', category: 'positive', duration: 0.8, tags: ['파티', '축하', '생일'] },
  { id: 'confetti_01', path: '/sfx/positive/confetti_01.mp3', name: '색종이 (와!)', category: 'positive', duration: 1.0, tags: ['색종이', '축하', '이벤트'] },
  { id: 'correct_01', path: '/sfx/positive/correct_01.mp3', name: '정답 (딩동댕)', category: 'positive', duration: 0.8, tags: ['정답', '맞음', '딩동댕'] },
  { id: 'win_01', path: '/sfx/positive/win_01.mp3', name: '승리 (짜잔짜잔)', category: 'positive', duration: 1.2, tags: ['승리', '우승', '최고'] },

  // ════════════════════════════════════════
  // (2/3에서 계속: negative, funny, notification, ambient)
  // (3/3에서 계속: musical, speech, ui + BGM_LIBRARY + 유틸 함수)
  // ════════════════════════════════════════
];

// ── BGM 라이브러리 (3/3에서 추가) ──

export const BGM_LIBRARY: BgmFile[] = [];

// ── 유틸 함수 (3/3에서 추가) ──
