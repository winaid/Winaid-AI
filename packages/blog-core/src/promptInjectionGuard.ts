/**
 * 저장형 prompt injection 가드 (감사 #3 — Top 5).
 *
 * 위협 모델:
 *   1. 시스템이 병원 URL 크롤 → LLM 분석 → analyzedStyle 추출 → DB 저장
 *   2. 외부 사이트 조작 가능성 (어드민이 직접 입력 X) → analyzedStyle 에
 *      injection payload 보존 가능
 *   3. 후속 블로그 생성 시 hospitalStyleBlock 으로 builder 의 system slot 에 보간 →
 *      LLM 이 system instruction 으로 오인 가능
 *
 * P-1 호환성:
 *   - 본 가드는 "권한 게이트" 가 아닌 "콘텐츠 무결성 검증". 어드민이라도 system
 *     instruction override 페이로드는 차단해야 LLM 출력 무결성 유지.
 *   - 저장 거부 시 사유 메시지로 어드민에게 어디가 문제인지 알리고 수정 가이드 제공.
 *
 * 사용 패턴:
 *   - 저장 시점 (`validateForStorage`): high confidence detect 시 저장 거부.
 *     호출자 (어드민 UI / 학습 endpoint) 가 사유 메시지 노출.
 *   - 사용 시점 (`stripInjectionForUse`): builder prompt 구성 직전 호출. high
 *     confidence detect 시 해당 단락 strip + telemetry. 기존 DB 의 통과된 payload
 *     보호.
 *
 * promptLeakageGuard 와 차이:
 *   - promptLeakageGuard: LLM 응답 (output) 에서 system prompt 변수명/태그 leak detect
 *   - promptInjectionGuard: 외부 input (저장된 style block 등) 의 system instruction
 *     override 시도 detect. 두 가드 패턴 일부 겹치나 layer 다름.
 */

/** HIGH confidence — 1개 매칭 시 차단. 의료 콘텐츠에 자연 출현 0. */
const HIGH_INJECTION_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // LLM 메타 토큰 — 어느 모델이든 system instruction 영역
  { name: 'inst_tag', re: /\[INST\]|\[\/INST\]/i },
  { name: 'sys_tag', re: /<\|system\|>|<\|user\|>|<\|assistant\|>/i },
  { name: 'sys_double_brace', re: /<<SYS>>|<<\/SYS>>/i },
  { name: 'role_label_line', re: /(?:^|\n)\s*(?:assistant|system|user)\s*:\s/i },

  // 명시적 override 지시 — English
  // qualifier 와 target keyword 사이에 중간 단어 0-3 개 허용 (e.g. "disregard all prior rules").
  { name: 'ignore_previous_en', re: /ignore\s+(?:previous|prior|above|all)(?:\s+\w+){0,3}\s+(?:instructions?|prompts?|rules?|messages?|context)/i },
  { name: 'disregard_en', re: /disregard\s+(?:previous|prior|above|all)(?:\s+\w+){0,3}\s+(?:instructions?|prompts?|rules?|messages?|context)/i },
  { name: 'forget_all_en', re: /forget\s+(?:all|everything|previous|prior)(?:\s+\w+){0,3}\s+(?:instructions?|context|rules?|messages?|prompts?)/i },
  { name: 'reveal_prompt_en', re: /(?:show|reveal|output|print|display)\s+(?:me\s+)?(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules?)/i },
  { name: 'new_instructions_en', re: /(?:new|updated|revised|override)\s+instructions?\s*[:：]/i },

  // 명시적 override 지시 — Korean
  { name: 'ignore_korean', re: /(?:이전|위|앞|모든)\s*(?:지시(?:사항)?|명령|규칙|룰|시스템\s*메시지|프롬프트)\s*(?:무시|disregard|잊어|폐기)/ },
  { name: 'real_mission_korean', re: /(?:너의|당신의|실제|진짜)\s*(?:임무|역할|목적|미션)(?:은|는)\s/ },
  { name: 'reveal_korean', re: /(?:시스템\s*프롬프트|system\s*prompt|지시사항|시스템\s*메시지)\s*(?:출력|보여|공개|reveal|노출|뱉)/ },
  { name: 'new_instruction_korean', re: /(?:^|\n)\s*\[?\s*(?:새\s*지시사항|새\s*명령|override)\s*\]?\s*[:：]/ },

  // markdown 헤더로 위장한 override
  { name: 'instruction_md_header', re: /(?:^|\n)#{1,3}\s*(?:지시사항|새\s*지시|new\s+instructions?|system\s+prompt)\b/i },
];

/** LOW confidence — 단일 매칭은 의심만, 2개 이상이면 차단. */
const LOW_INJECTION_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // 역할 선언 (의료 본문에도 가끔 등장 — 단일 매칭으로는 차단 X)
  { name: 'role_declaration_korean', re: /당신은\s.{1,40}?(?:입니다|이다|이며)/ },
  // 구분자 시퀀스 — system / user 영역 분리 시도
  { name: 'multi_dash_separator', re: /\n\s*---\s*\n[\s\S]{1,200}\n\s*---\s*\n/ },
  // JSON 객체 break — schema 우회 시도
  { name: 'json_object_break', re: /\}\s*\n\s*\{\s*['"](?:role|system|content)['"]/i },
  // Triple backtick block 다중 — code injection 패턴
  { name: 'triple_backtick_multi', re: /```[\s\S]{0,50}```[\s\S]{0,200}```/ },
];

const MAX_PARA_LENGTH = 1500;

export interface InjectionDetection {
  /** HIGH confidence 매칭된 패턴 이름 list. */
  highConfidencePatterns: string[];
  /** LOW confidence 매칭된 패턴 이름 list. */
  lowConfidencePatterns: string[];
  /** 단락 길이 이상치 (단락 > 1500 chars) — 의심 시그널. */
  lengthAnomaly: boolean;
  /** 차단 권장 여부 — HIGH ≥ 1 OR LOW ≥ 2. */
  shouldBlock: boolean;
}

/**
 * 텍스트 분석 — pattern detection only. side effect 0.
 */
export function detectInjection(text: string): InjectionDetection {
  if (!text) {
    return {
      highConfidencePatterns: [],
      lowConfidencePatterns: [],
      lengthAnomaly: false,
      shouldBlock: false,
    };
  }

  const high: string[] = [];
  const low: string[] = [];

  for (const { name, re } of HIGH_INJECTION_PATTERNS) {
    if (re.test(text)) high.push(name);
  }
  for (const { name, re } of LOW_INJECTION_PATTERNS) {
    if (re.test(text)) low.push(name);
  }

  // 단락 길이 이상치 — 정상 style block 은 보통 < 1500/단락.
  const longParas = text.split(/\n\s*\n/).filter((p) => p.length > MAX_PARA_LENGTH);
  const lengthAnomaly = longParas.length > 0;

  return {
    highConfidencePatterns: high,
    lowConfidencePatterns: low,
    lengthAnomaly,
    shouldBlock: high.length >= 1 || low.length >= 2,
  };
}

export interface StorageValidationResult {
  ok: boolean;
  detection: InjectionDetection;
  /** ok=false 일 때 어드민/사용자에게 보여줄 사유 메시지. */
  reason?: string;
}

/**
 * 저장 시점 — high confidence 면 거부, 호출자가 사유 메시지 노출.
 *
 * P-1 호환성: 어드민이라도 system instruction override 페이로드는 차단해야
 * LLM 출력 무결성 유지. 거부는 "기능 접근 권한 차단" 이 아닌 "콘텐츠 무결성 보호".
 */
export function validateForStorage(text: string | null | undefined): StorageValidationResult {
  if (!text) {
    return {
      ok: true,
      detection: detectInjection(''),
    };
  }
  const detection = detectInjection(text);
  if (detection.shouldBlock) {
    const patterns = [...detection.highConfidencePatterns, ...detection.lowConfidencePatterns];
    return {
      ok: false,
      detection,
      reason:
        `Prompt injection 패턴 감지: [${patterns.join(', ')}]. ` +
        `LLM system instruction override 시도는 차단됩니다 (어드민 경로 포함 — ` +
        `콘텐츠 무결성 보호 차원). 원본 소스에서 명시적 override 표현 ` +
        `(예: "ignore previous", "당신의 진짜 임무는", [INST] 등) 을 제거하고 ` +
        `다시 저장해주세요.`,
    };
  }
  return { ok: true, detection };
}

/**
 * 사용 시점 — high confidence 단락 strip + telemetry.
 *
 * 기존 DB 에 이미 저장된 payload (validateForStorage 적용 이전) 가 그대로 builder
 * 에 흐르지 않게 보호. 빈 결과 가능 (모든 단락 strip).
 */
export function stripInjectionForUse(text: string | null | undefined, telemetry = true): string {
  if (!text) return text ?? '';

  const overall = detectInjection(text);
  if (overall.highConfidencePatterns.length === 0) {
    // HIGH 없음 — 전체 통과. LOW 단일은 무시 (단락별 검사 시 다중 매칭 시 strip).
    return text;
  }

  // 단락 분리 + 단락별 검사 (HIGH ≥1 OR LOW ≥2 → strip).
  const parts = text.split(/(\n\s*\n)/);
  const out: string[] = [];
  let strippedCount = 0;

  for (let i = 0; i < parts.length; i++) {
    const isSep = i % 2 === 1;
    if (isSep) {
      out.push(parts[i]);
      continue;
    }
    const det = detectInjection(parts[i]);
    if (det.highConfidencePatterns.length >= 1 || det.lowConfidencePatterns.length >= 2) {
      strippedCount++;
      if (telemetry) {
        // eslint-disable-next-line no-console
        console.warn(
          `[promptInjectionGuard] 저장된 payload 단락 strip — ` +
            `high=[${det.highConfidencePatterns.join(',')}] ` +
            `low=[${det.lowConfidencePatterns.join(',')}]`,
        );
      }
      // drop
    } else {
      out.push(parts[i]);
    }
  }

  return out.join('');
}
