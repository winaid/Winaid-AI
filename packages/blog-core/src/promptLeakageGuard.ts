/**
 * 시스템 프롬프트 누수 detector + 단락 strip.
 *
 * 증상: LLM 응답에 시스템 프롬프트 본문 (역할 정의, PRIORITY_ORDER / E_E_A_T 등
 *       빌더 내부 키, LLM 메타 토큰, 한국어 메타 라벨) 이 최종 HTML 에 echo.
 *
 * 정책:
 *  - HIGH confidence 패턴 (1개만 검출돼도 strip 대상): LLM 메타 토큰 / 빌더 내부 키.
 *    자연스러운 의료 콘텐츠에는 절대 안 나옴 → false-positive ≈ 0.
 *  - LOW confidence 패턴 (같은 단락 ≥ 2개일 때만 strip): "당신은 ...입니다" 류
 *    역할 선언. 의료 콘텐츠에 단독 등장 가능 (예: "환자분의 역할은...") → 단일 매칭은 log.
 *  - 모든 검출은 텔레메트리 console.warn 로 가시화. strip 도 그 단락만 제거,
 *    주변 구조 (<h2>, <img>) 는 보존.
 *
 * 한계:
 *  - HTML 외 raw text (보도자료 plain) 도 동일 패턴 적용 가능 (단락 = `\n\n`).
 *  - <code>/<pre> 안의 의도적 시스템 프롬프트 인용 (튜토리얼 등) 도 strip 됨 →
 *    의료 블로그에 그런 콘텐츠 없음으로 정책상 accept.
 */

/** HIGH confidence — 1개만 검출돼도 strip. 자연스러운 의료 콘텐츠에 등장 불가능한 표현. */
const HIGH_CONFIDENCE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // LLM 메타 토큰 (any provider)
  { name: 'inst_tag', re: /\[INST\]|\[\/INST\]/i },
  { name: 'sys_tag', re: /<\|system\|>|<\|user\|>|<\|assistant\|>/i },
  { name: 'sys_double_brace', re: /<<SYS>>|<<\/SYS>>/i },
  { name: 'role_label', re: /(?:^|\n)\s*(?:assistant|system|user)\s*:\s/i },

  // 빌더 내부 키 (blog-core 의 변수명)
  { name: 'builder_priority_order', re: /\bPRIORITY_ORDER(?:_BLOCK)?\b/ },
  { name: 'builder_eeat', re: /\bE_E_A_T(?:_GUIDE|_signals)?\b/ },
  { name: 'builder_common_writing_style', re: /\bCOMMON_WRITING_STYLE\b/ },
  { name: 'builder_medical_law_constraints', re: /\bMEDICAL_LAW_CONSTRAINTS\b/ },
  { name: 'builder_reviewer_persona', re: /\b(?:OUTLINE|BLOG|SECTION|REVIEWER|SECTION_REGEN)_PERSONA\b/ },

  // XML 시맨틱 태그 (시스템 프롬프트의 룰 블록을 감싸는 것들)
  { name: 'xml_persona', re: /<\/?(?:persona|role|task|instructions|rules)\b/i },
  { name: 'xml_writing_style', re: /<\/?common_writing_style>/ },
  { name: 'xml_priority_order_tag', re: /<\/?priority_order>/ },
  { name: 'xml_eeat_signals_tag', re: /<\/?(?:e_e_a_t_signals|reviewer_e_e_a_t_check)>/ },
  { name: 'xml_review_criteria_tag', re: /<\/?review_criteria>/ },

  // review_criteria 키 (Opus 감수 결과 JSON 필드명)
  { name: 'review_criteria_word', re: /\breview_criteria\b/ },
  { name: 'review_prose_flow', re: /\bprose_flow\b/ },
  { name: 'review_markdown_artifact', re: /\bmarkdown_artifact\b/ },
  { name: 'review_grammar_artifact', re: /\bgrammar_artifact\b/ },
  { name: 'review_verdict_kv', re: /\bverdict\s*[:=]\s*['"]?(?:pass|fail|revise|warn)/ },
  { name: 'review_severity_kv', re: /\bseverity\s*[:=]\s*['"]?(?:critical|high|medium|low)/ },

  // 한국어 메타 라벨 — 명확히 prompt 인 형태만 (대괄호 또는 markdown 헤더 형태)
  // "역할:" 같은 단순 콜론은 의료 본문 section 헤더와 혼동 가능 → 제외.
  { name: 'meta_label_bracket_korean', re: /\[(?:시스템|역할|지시사항|출력\s*형식|작성\s*가이드|작성\s*룰|작성\s*지침|글쓰기\s*룰)\]/ },
  { name: 'meta_label_md_korean', re: /(?:^|\n)#{1,3}\s*(?:시스템|지시사항|출력\s*형식|작성\s*가이드|작성\s*룰|작성\s*지침|글쓰기\s*룰)(?:\s|$)/ },
];

/** LOW confidence — 같은 단락에 2개 이상 동시 매칭일 때만 strip. 단일 매칭은 telemetry only. */
const LOW_CONFIDENCE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // 역할 선언 — "당신은 의료 전문가입니다" 류
  { name: 'role_declaration', re: /당신은\s.{1,40}?(?:입니다|이다|이며)/ },
  // CLAUDE.md 회귀 사례 인용
  { name: 'regression_case', re: /회귀\s*(?:사례|케이스)/ },
  // "절대 금지" — 의료법 compliance 본문에 합법적 사용 가능 → low
  { name: 'absolute_prohibition', re: /절대\s*금지/ },
  // 빌더 본문의 가이드 헤더 표현
  { name: 'guide_header', re: /(?:작성|글쓰기)\s*(?:가이드|룰|지침|원칙)\s*[:：]/ },
  // 자연어로 옮긴 프롬프트 메타 — "본 룰" / "본 가이드" 류
  { name: 'rule_self_reference', re: /본\s*(?:룰|가이드|지침|원칙)/ },
  // 한국어 우선순위 표현 — 시스템 프롬프트의 "우선순위" 언급
  { name: 'priority_korean', re: /우선\s*순위\s*[:：]/ },
];

export interface PromptLeakageDetection {
  /** 매칭된 패턴 이름 (HIGH + LOW 통합). */
  patterns: string[];
  /** strip 대상으로 판정된 단락 개수. */
  strippedParagraphs: number;
  /** 의심만 됐고 strip 안 한 단락 개수 (LOW 단일 매칭). */
  suspectedParagraphs: number;
}

export interface PromptLeakageResult {
  html: string;
  detection: PromptLeakageDetection;
}

/**
 * HTML 단락 분리 — `<p>...</p>`, `<h2>...</h2>` 류 block-level 태그 단위.
 * 태그 안 내부 텍스트만 검사 (속성·태그명 자체는 검사 대상 아님).
 *
 * 평문 입력 시: `\n\n` 단위 단락 분리.
 */
function splitParagraphs(input: string): Array<{ raw: string; text: string; isBlock: boolean }> {
  // HTML 인지 빠른 휴리스틱
  const looksLikeHtml = /<\s*(p|h[1-6]|div|li|blockquote|article|section)\b/i.test(input);
  if (!looksLikeHtml) {
    // 평문: `\n\n` 단위
    return input.split(/\n\s*\n/).map((para) => ({ raw: para, text: para, isBlock: false }));
  }

  // block-level 태그 단위 매칭 — 단순 정규식 (nested block 미고려 — 의료 블로그 구조는 평탄)
  const BLOCK_RE = /<(p|h[1-6]|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const out: Array<{ raw: string; text: string; isBlock: boolean }> = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_RE.exec(input)) !== null) {
    // block 사이 텍스트 (개행 등) 는 그대로 보존 — strip 대상 아님
    if (m.index > lastIdx) {
      const gap = input.slice(lastIdx, m.index);
      out.push({ raw: gap, text: '', isBlock: false });
    }
    // block 내부 텍스트만 검사 대상으로 추출 (속성 제외)
    const inner = m[2].replace(/<[^>]+>/g, ' ');
    out.push({ raw: m[0], text: inner, isBlock: true });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < input.length) {
    out.push({ raw: input.slice(lastIdx), text: '', isBlock: false });
  }
  return out;
}

/** 한 단락의 텍스트에 대해 HIGH/LOW 매칭 수행. */
function detectInParagraph(text: string): { high: string[]; low: string[] } {
  const high: string[] = [];
  const low: string[] = [];
  for (const { name, re } of HIGH_CONFIDENCE_PATTERNS) {
    if (re.test(text)) high.push(name);
  }
  for (const { name, re } of LOW_CONFIDENCE_PATTERNS) {
    if (re.test(text)) low.push(name);
  }
  return { high, low };
}

/**
 * 시스템 프롬프트 누수를 검출하고, strip 대상 단락은 제거한다.
 *
 * 정책:
 *  - HIGH 1개 이상 → 해당 block-level 단락 제거.
 *  - HIGH 0 + LOW ≥ 2 → 해당 단락 제거.
 *  - HIGH 0 + LOW 1 → strip 안 함, telemetry 만 발급.
 *
 * 입력이 평문이면 `\n\n` 단위로 같은 정책 적용.
 *
 * @param input HTML 또는 평문
 * @param telemetry 텔레메트리 console 출력 여부 (test 환경에서 끄고 싶을 때 false)
 */
export function stripPromptLeakage(
  input: string,
  telemetry = true,
): PromptLeakageResult {
  if (!input) {
    return {
      html: input,
      detection: { patterns: [], strippedParagraphs: 0, suspectedParagraphs: 0 },
    };
  }

  const parts = splitParagraphs(input);
  const allPatterns: string[] = [];
  let stripped = 0;
  let suspected = 0;

  const out: string[] = [];
  for (const part of parts) {
    if (!part.isBlock || !part.text.trim()) {
      out.push(part.raw);
      continue;
    }
    const { high, low } = detectInParagraph(part.text);
    if (high.length === 0 && low.length === 0) {
      out.push(part.raw);
      continue;
    }
    allPatterns.push(...high, ...low);
    const shouldStrip = high.length >= 1 || low.length >= 2;
    if (shouldStrip) {
      stripped++;
      if (telemetry) {
        // eslint-disable-next-line no-console
        console.warn(
          `[promptLeakageGuard] 단락 strip — high=[${high.join(',')}] low=[${low.join(',')}]`,
        );
      }
      // 단락 제거 — raw 그대로 drop
    } else {
      // LOW 단독: 의심만, strip 안 함
      suspected++;
      if (telemetry) {
        // eslint-disable-next-line no-console
        console.warn(
          `[promptLeakageGuard] 단락 의심 — low=[${low.join(',')}] (단일 매칭, strip 안 함)`,
        );
      }
      out.push(part.raw);
    }
  }

  return {
    html: out.join(''),
    detection: {
      patterns: Array.from(new Set(allPatterns)),
      strippedParagraphs: stripped,
      suspectedParagraphs: suspected,
    },
  };
}
