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
  // negative — 부정/주의 효과음 (14개)
  // ════════════════════════════════════════

  { id: 'buzzer_01', path: '/sfx/negative/buzzer_01.mp3', name: '삐빅 (오답)', category: 'negative', duration: 0.6, tags: ['오답', '틀림', '실패'] },
  { id: 'buzzer_02', path: '/sfx/negative/buzzer_02.mp3', name: '삐 (짧은)', category: 'negative', duration: 0.3, tags: ['오답', '짧은', '경고'] },
  { id: 'fail_01', path: '/sfx/negative/fail_01.mp3', name: '실패 (뚜루루)', category: 'negative', duration: 1.0, tags: ['실패', '슬픈', '아쉬운'] },
  { id: 'fail_02', path: '/sfx/negative/fail_02.mp3', name: '실패 (슬픈트롬본)', category: 'negative', duration: 1.5, tags: ['실패', '트롬본', '코믹'] },
  { id: 'boo_01', path: '/sfx/negative/boo_01.mp3', name: '부우 (야유)', category: 'negative', duration: 1.0, tags: ['야유', '부정', '싫은'] },
  { id: 'error_01', path: '/sfx/negative/error_01.mp3', name: '에러 (삐빕)', category: 'negative', duration: 0.4, tags: ['에러', '오류', '경고'] },
  { id: 'wrong_01', path: '/sfx/negative/wrong_01.mp3', name: '땡 (오답)', category: 'negative', duration: 0.5, tags: ['땡', '오답', '아닌'] },
  { id: 'warning_01', path: '/sfx/negative/warning_01.mp3', name: '경고음 (삐삐삐)', category: 'negative', duration: 1.0, tags: ['경고', '주의', '위험'] },
  { id: 'siren_short_01', path: '/sfx/negative/siren_short_01.mp3', name: '사이렌 (짧은)', category: 'negative', duration: 0.8, tags: ['사이렌', '긴급', '주의'] },
  { id: 'tension_01', path: '/sfx/negative/tension_01.mp3', name: '긴장 (두둥)', category: 'negative', duration: 0.8, tags: ['긴장', '두둥', '반전'] },
  { id: 'tension_02', path: '/sfx/negative/tension_02.mp3', name: '긴장 (두두둥)', category: 'negative', duration: 1.2, tags: ['긴장', '서스펜스', '무서운'] },
  { id: 'dramatic_01', path: '/sfx/negative/dramatic_01.mp3', name: '드라마틱 (던던던)', category: 'negative', duration: 1.5, tags: ['드라마틱', '충격', '반전'] },
  { id: 'record_scratch_01', path: '/sfx/negative/record_scratch_01.mp3', name: '레코드스크래치 (끼익)', category: 'negative', duration: 0.6, tags: ['스크래치', '멈춤', '잠깐'] },
  { id: 'glass_break_01', path: '/sfx/negative/glass_break_01.mp3', name: '유리깨짐 (와장창)', category: 'negative', duration: 0.8, tags: ['깨짐', '충격', '파괴'] },

  // ════════════════════════════════════════
  // funny — 재미/코믹 효과음 (20개)
  // ════════════════════════════════════════

  { id: 'boing_01', path: '/sfx/funny/boing_01.mp3', name: '뿡 (스프링)', category: 'funny', duration: 0.4, tags: ['스프링', '통통', '재미'] },
  { id: 'boing_02', path: '/sfx/funny/boing_02.mp3', name: '뿡 (통통)', category: 'funny', duration: 0.5, tags: ['통통', '튀는', '귀여운'] },
  { id: 'boing_03', path: '/sfx/funny/boing_03.mp3', name: '뿡 (큰스프링)', category: 'funny', duration: 0.6, tags: ['스프링', '큰', '과장'] },
  { id: 'squeak_01', path: '/sfx/funny/squeak_01.mp3', name: '삑 (고무오리)', category: 'funny', duration: 0.3, tags: ['고무오리', '삑', '귀여운'] },
  { id: 'squeak_02', path: '/sfx/funny/squeak_02.mp3', name: '삑 (생쥐)', category: 'funny', duration: 0.3, tags: ['생쥐', '삑', '작은'] },
  { id: 'cartoon_run_01', path: '/sfx/funny/cartoon_run_01.mp3', name: '만화달리기 (따다다다)', category: 'funny', duration: 0.8, tags: ['달리기', '만화', '빠른'] },
  { id: 'cartoon_slip_01', path: '/sfx/funny/cartoon_slip_01.mp3', name: '미끄러짐 (슈르륵)', category: 'funny', duration: 0.5, tags: ['미끄러짐', '넘어짐', '코믹'] },
  { id: 'cartoon_spring_01', path: '/sfx/funny/cartoon_spring_01.mp3', name: '만화스프링 (뽀잉)', category: 'funny', duration: 0.4, tags: ['뽀잉', '만화', '귀여운'] },
  { id: 'whistle_01', path: '/sfx/funny/whistle_01.mp3', name: '호루라기 (삐!)', category: 'funny', duration: 0.5, tags: ['호루라기', '심판', '주목'] },
  { id: 'whistle_slide_01', path: '/sfx/funny/whistle_slide_01.mp3', name: '슬라이드휘슬 (뿌~잉)', category: 'funny', duration: 0.8, tags: ['휘슬', '올라가는', '재미'] },
  { id: 'bonk_01', path: '/sfx/funny/bonk_01.mp3', name: '꽝 (머리맞는)', category: 'funny', duration: 0.3, tags: ['꽝', '머리', '충격'] },
  { id: 'honk_01', path: '/sfx/funny/honk_01.mp3', name: '빵빵 (경적)', category: 'funny', duration: 0.5, tags: ['경적', '빵빵', '주의'] },
  { id: 'fart_01', path: '/sfx/funny/fart_01.mp3', name: '방귀 (뿌우)', category: 'funny', duration: 0.5, tags: ['방귀', '코믹', '장난'] },
  { id: 'laugh_track_01', path: '/sfx/funny/laugh_track_01.mp3', name: '웃음소리 (짧은)', category: 'funny', duration: 1.5, tags: ['웃음', '시트콤', '재미'] },
  { id: 'rimshot_01', path: '/sfx/funny/rimshot_01.mp3', name: '드럼바림샷 (빠담)', category: 'funny', duration: 0.6, tags: ['바림샷', '개그', '마무리'] },
  { id: 'bruh_01', path: '/sfx/funny/bruh_01.mp3', name: '브러 (밈)', category: 'funny', duration: 0.5, tags: ['브러', '밈', '황당'] },
  { id: 'vine_boom_01', path: '/sfx/funny/vine_boom_01.mp3', name: '바인붐 (밈)', category: 'funny', duration: 0.8, tags: ['바인붐', '밈', '임팩트'] },
  { id: 'oof_01', path: '/sfx/funny/oof_01.mp3', name: '우프 (밈)', category: 'funny', duration: 0.3, tags: ['우프', '밈', '아야'] },
  { id: 'airhorn_01', path: '/sfx/funny/airhorn_01.mp3', name: '에어혼 (빠아앙)', category: 'funny', duration: 1.0, tags: ['에어혼', '축하', '파티'] },
  { id: 'wow_01', path: '/sfx/funny/wow_01.mp3', name: '와우 (감탄)', category: 'funny', duration: 0.5, tags: ['와우', '감탄', '놀라운'] },

  // ════════════════════════════════════════
  // notification — 알림/정보 효과음 (16개)
  // ════════════════════════════════════════

  { id: 'bell_01', path: '/sfx/notification/bell_01.mp3', name: '벨 (딩동)', category: 'notification', duration: 0.5, tags: ['딩동', '벨', '알림'] },
  { id: 'bell_02', path: '/sfx/notification/bell_02.mp3', name: '벨 (교회종)', category: 'notification', duration: 0.8, tags: ['종', '교회', '울림'] },
  { id: 'bell_03', path: '/sfx/notification/bell_03.mp3', name: '벨 (카운터)', category: 'notification', duration: 0.3, tags: ['카운터', '호출', '딩'] },
  { id: 'ping_01', path: '/sfx/notification/ping_01.mp3', name: '핑 (알림)', category: 'notification', duration: 0.3, tags: ['핑', '알림', '도착'] },
  { id: 'ping_02', path: '/sfx/notification/ping_02.mp3', name: '핑 (메시지)', category: 'notification', duration: 0.3, tags: ['메시지', '수신', '알림'] },
  { id: 'ping_03', path: '/sfx/notification/ping_03.mp3', name: '핑 (부드러운)', category: 'notification', duration: 0.4, tags: ['핑', '부드러운', '조용한'] },
  { id: 'alert_01', path: '/sfx/notification/alert_01.mp3', name: '알림 (띠리링)', category: 'notification', duration: 0.6, tags: ['띠리링', '알림', '정보'] },
  { id: 'alert_02', path: '/sfx/notification/alert_02.mp3', name: '알림 (짧은)', category: 'notification', duration: 0.3, tags: ['알림', '짧은', '간단'] },
  { id: 'notification_01', path: '/sfx/notification/notification_01.mp3', name: '폰알림', category: 'notification', duration: 0.5, tags: ['폰', '알림', '메시지'] },
  { id: 'notification_02', path: '/sfx/notification/notification_02.mp3', name: '폰알림 (아이폰)', category: 'notification', duration: 0.4, tags: ['아이폰', '알림', '익숙한'] },
  { id: 'message_01', path: '/sfx/notification/message_01.mp3', name: '메시지수신', category: 'notification', duration: 0.3, tags: ['메시지', 'DM', '수신'] },
  { id: 'typing_01', path: '/sfx/notification/typing_01.mp3', name: '타이핑', category: 'notification', duration: 0.8, tags: ['타이핑', '키보드', '입력'] },
  { id: 'camera_01', path: '/sfx/notification/camera_01.mp3', name: '카메라셔터', category: 'notification', duration: 0.3, tags: ['카메라', '셔터', '촬영'] },
  { id: 'screenshot_01', path: '/sfx/notification/screenshot_01.mp3', name: '스크린샷', category: 'notification', duration: 0.3, tags: ['스크린샷', '캡처', '저장'] },
  { id: 'countdown_beep_01', path: '/sfx/notification/countdown_beep_01.mp3', name: '카운트다운 (삐삐삐빕)', category: 'notification', duration: 1.5, tags: ['카운트다운', '시작', '준비'] },
  { id: 'new_item_01', path: '/sfx/notification/new_item_01.mp3', name: '새항목 (띵)', category: 'notification', duration: 0.4, tags: ['새로운', '항목', '추가'] },

  // ════════════════════════════════════════
  // ambient — 분위기/환경 효과음 (10개)
  // ════════════════════════════════════════

  { id: 'nature_birds_01', path: '/sfx/ambient/nature_birds_01.mp3', name: '새소리', category: 'ambient', duration: 3.0, tags: ['새', '자연', '아침'] },
  { id: 'nature_wind_01', path: '/sfx/ambient/nature_wind_01.mp3', name: '바람소리', category: 'ambient', duration: 3.0, tags: ['바람', '자연', '평화'] },
  { id: 'nature_rain_01', path: '/sfx/ambient/nature_rain_01.mp3', name: '빗소리', category: 'ambient', duration: 3.0, tags: ['비', '자연', '편안'] },
  { id: 'nature_wave_01', path: '/sfx/ambient/nature_wave_01.mp3', name: '파도소리', category: 'ambient', duration: 3.0, tags: ['파도', '바다', '여름'] },
  { id: 'nature_creek_01', path: '/sfx/ambient/nature_creek_01.mp3', name: '시냇물', category: 'ambient', duration: 3.0, tags: ['시냇물', '자연', '맑은'] },
  { id: 'city_cafe_01', path: '/sfx/ambient/city_cafe_01.mp3', name: '카페분위기', category: 'ambient', duration: 3.0, tags: ['카페', '배경', '일상'] },
  { id: 'city_street_01', path: '/sfx/ambient/city_street_01.mp3', name: '거리소음 (먼)', category: 'ambient', duration: 3.0, tags: ['거리', '도시', '배경'] },
  { id: 'crowd_murmur_01', path: '/sfx/ambient/crowd_murmur_01.mp3', name: '웅성웅성', category: 'ambient', duration: 3.0, tags: ['사람들', '웅성', '배경'] },
  { id: 'hospital_beep_01', path: '/sfx/ambient/hospital_beep_01.mp3', name: '심전도 (삐삐)', category: 'ambient', duration: 2.0, tags: ['병원', '심전도', '의료'] },
  { id: 'clock_tick_01', path: '/sfx/ambient/clock_tick_01.mp3', name: '시계째깍', category: 'ambient', duration: 2.0, tags: ['시계', '째깍', '시간'] },

  // ════════════════════════════════════════
  // (3/3에서 계속: musical, speech, ui + BGM_LIBRARY + 유틸 함수)
  // ════════════════════════════════════════
];

// ── BGM 라이브러리 (3/3에서 추가) ──

export const BGM_LIBRARY: BgmFile[] = [];

// ── 유틸 함수 (3/3에서 추가) ──
