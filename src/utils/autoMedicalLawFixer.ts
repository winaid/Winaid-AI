/**
 * 의료광고법 자동 수정 시스템
 * AI가 생성한 글을 자동으로 의료광고법에 맞게 수정
 */

// 의료광고법 금지 패턴 (🔥 2025년 피드백 반영 + 약물/치료법 추가)
const PROHIBITED_PATTERNS = {
  // 1. 질환명 강조/반복 패턴
  diseaseEmphasis: /(\S+암|\S+증|\S+림프종)\s*(일\s*수\s*있습니다|의심됩니다|가능성)/g,
  
  // 2. 질환 비교/차별 구조
  diseaseComparison: ['일반 질환과 다르게', '흔한 증상과 달리', '특별히 주의', '놓치기 쉬운', '다른 질환보다'],
  
  // 3. 자가진단/판단 유도
  selfDiagnosis: /의심(된다|해봐야|해보세요)|가능성이\s*(높다|있다)|확인해보는\s*것이\s*좋다/g,
  
  // 4. 치료/검사 권유 (직접 + 간접)
  medicalAdvice: /확인이\s*필요한\s*시점|살펴볼\s*때|검사(받으세요|하세요)|병원(가세요|방문)/g,
  
  // 🆕 5. 약물/치료법 권유
  drugAdvice: /권장합니다|선택하면\s*좋(다|습니다)|우선입니다|적합합니다|확인해보자|고려해보자|선택하자/g,
  drugSafety: /(약물|상호작용)이?\s*(위험합니다|안전합니다)/g,
  
  // 기존 패턴 유지
  suspicion: /의심/g,
  judgment: /판단/g,
  possibility: /가능성/g,
  
  // 비교 광고 금지 패턴
  comparison: ['최고', '최상', '가장', '유일', '독보적', '업계 1위', '최초', '타 병원보다', '경쟁 병원'],
  
  // 환자 후기 패턴  
  testimonial: ['치료 후기', '환자 후기', '치료 사례', '완치 사례', '성공 사례', '치료 경험담'],
};

// 신뢰할 수 있는 출처 (향후 출처 검증 기능에 활용)
const _TRUSTED_SOURCES: string[] = [];

export interface FixResult {
  originalText: string;
  fixedText: string;
  changes: Array<{
    type: 'replace' | 'remove' | 'add_source';
    original: string;
    fixed: string;
    reason: string;
  }>;
  autoFixSuccessRate: number; // 0-100
}

/**
 * 과장 표현 자동 완화
 */
const EXAGGERATION_REPLACEMENTS: Record<string, string> = {
  // 완치 관련
  '완치': '증상 개선',
  '완전히 치료': '치료 가능',
  '완벽하게 치료': '효과적으로 치료',
  '근본적으로 치료': '원인을 치료',
  '100% 치료': '높은 치료율',

  // 병원 방문 유도/지시 표현
  '병원을 방문해': '상태를 확인해',
  '병원에 방문': '상태를 확인',
  '선생님의 도움을 받아': '객관적으로',
  '선생님과 상담': '상태 확인',
  '잊지 마시길 바랍니다': '관련이 있을 수 있습니다',
  '권해드립니다': '수 있습니다',
  '보내시길': '수 있습니다',

  // 호전/완화 표현 (의료광고법 금지)
  '호전될 수 있는': '경과를 살펴볼 수 있는',
  '호전됩니다': '변화가 나타나기도 합니다',
  '호전될 수': '변화가 나타날 수',
  '호전이 가능': '경과를 확인할 수 있습니다',
  '호전을 기대': '경과를 살펴볼 수',
  '호전': '변화',
  '증상 완화': '증상 변화',
  '통증 완화': '통증 변화',
  '증상이 완화': '증상에 변화가 나타날 수',

  // 효과 과장
  '즉각적인 효과': '일정 시간 후 효과',
  '즉시 효과': '빠른 효과',
  '바로 효과': '효과',
  '당장 효과': '효과',
  '기적적인': '효과적인',
  '놀라운 효과': '좋은 효과',
  '혁명적인': '새로운',
  '획기적인': '효과적인',

  // 최상급 표현
  '최고의 치료': '효과적인 치료 방법 중 하나',
  '최상의 치료': '우수한 치료',
  '최강의': '효과적인',
  '유일한 치료': '대표적인 치료',
  '독보적인': '효과적인',

  // 100% 주장
  '100% 안전': '안전성이 입증된',
  '100% 효과': '높은 효과',
  '완벽하게 안전': '안전한',
  '전혀 위험이 없': '안전성이 검증된',

  // 공포/경고/지시 표현
  '넘겨서는 안 됩니다': '살펴볼 수 있는 부분입니다',
  '경고입니다': '참고할 수 있는 부분입니다',
  '위험이 생길 수 있습니다': '변화가 나타날 수 있습니다',
  '합병증으로 이어질 수': '다른 변화와 관련될 수',
  '주의하는 것이 좋습니다': '살펴볼 수 있는 부분입니다',
  '것이 좋습니다': '수 있습니다',
  '것도 좋습니다': '수도 있습니다',
  '것도 좋은 방법입니다': '수도 있습니다',
  '좋은 방법입니다': '방법일 수 있습니다',
  '주의가 필요합니다': '살펴볼 수 있는 부분입니다',
  '노력이 필요합니다': '노력이 도움이 될 수 있습니다',
  '과정이 필요합니다': '과정이 도움이 될 수 있습니다',
  '태도가 필요합니다': '태도가 도움이 될 수 있습니다',
  '태도가 요구됩니다': '태도가 도움이 될 수 있습니다',
  '뒤따라야 합니다': '뒤따를 수 있습니다',
  '유익합니다': '도움이 될 수 있습니다',

  // "해야 합니다" 계열 (3대 금지 어미 - 프롬프트에서 금지해도 모델이 무시하므로 후처리)
  '조심해야 합니다': '살펴볼 수 있는 부분입니다',
  '확인해야 합니다': '확인해볼 수 있습니다',
  '써야 합니다': '쓸 수 있습니다',
  '씻어야 합니다': '씻는 것이 도움이 될 수 있습니다',
  '줄여야 합니다': '줄이는 것이 도움이 될 수 있습니다',
  '지켜야 합니다': '살펴볼 수 있는 부분입니다',
  '받아야 합니다': '받아볼 수 있습니다',
  '섭취해야 합니다': '섭취하는 것이 도움이 될 수 있습니다',
  '관리해야 합니다': '관리가 도움이 될 수 있습니다',

  // 부작용 없음 주장
  '부작용이 전혀 없': '부작용이 적은',
  '부작용 없는': '부작용이 적은',
  '전혀 아프지 않': '통증이 적은',
  '무통': '저통증',

  // 비교 표현
  '타 병원보다': '',
  '다른 곳보다': '',
  '경쟁 병원보다': '',
  '업계 최초': '새로운',
  '국내 최초': '새로운',
};

/**
 * 과장 표현 자동 수정
 */
export function fixExaggeration(text: string): {
  fixed: string;
  changes: FixResult['changes'];
} {
  let fixed = text;
  const changes: FixResult['changes'] = [];

  // 정확한 매칭을 위해 긴 패턴부터 처리
  const sortedPatterns = Object.entries(EXAGGERATION_REPLACEMENTS)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [original, replacement] of sortedPatterns) {
    if (fixed.includes(original)) {
      fixed = fixed.replace(new RegExp(original, 'g'), replacement);
      changes.push({
        type: 'replace',
        original,
        fixed: replacement,
        reason: '의료광고법: 과장 표현 완화'
      });
    }
  }

  return { fixed, changes };
}

/**
 * 통계/마케팅성 수치 제거 (의료광고법 위반 패턴만 대상)
 * ⚠️ 의학적 사실 숫자(검진 주기, 연령 기준, 잠복기 등)는 보존!
 */
export function fixMissingSource(text: string): {
  fixed: string;
  changes: FixResult['changes'];
} {
  let fixed = text;
  const changes: FixResult['changes'] = [];

  // 숫자 제거 - 의료광고법 위반 가능성 높은 패턴만 (본문 의학 정보 숫자는 보존)
  const numberReplacements: [RegExp, string, string][] = [
    [/(\d+(?:\.\d+)?%)/g, '상당수', '퍼센트 수치 금지'],
    [/(\d+(?:,\d+)*명)/g, '많은 분들이', '인원 수치 금지'],
    [/(\d+(?:,\d+)*건)/g, '여러 사례에서', '건수 수치 금지'],
    [/(\d+배)/g, '상당히 높은', '배수 표현 금지'],
    [/(\d+여\s*종)/g, '다양한', '수량 표현 금지'],
  ];

  for (const [pattern, replacement, reason] of numberReplacements) {
    const matches = Array.from(fixed.matchAll(pattern));
    for (const match of matches) {
      fixed = fixed.replace(match[0], replacement);
      changes.push({
        type: 'replace',
        original: match[0],
        fixed: replacement,
        reason: `의료광고법: ${reason}`
      });
    }
  }

  return { fixed, changes };
}

/**
 * 비교 광고 제거
 */
export function removeComparison(text: string): {
  fixed: string;
  changes: FixResult['changes'];
} {
  let fixed = text;
  const changes: FixResult['changes'] = [];

  // 비교 표현 제거
  for (const pattern of PROHIBITED_PATTERNS.comparison) {
    if (fixed.includes(pattern)) {
      // 문장 전체 제거 (비교 표현이 포함된)
      const sentences = fixed.split(/[.!?]\s*/);
      const filteredSentences = sentences.filter(s => !s.includes(pattern));

      if (filteredSentences.length < sentences.length) {
        fixed = filteredSentences.join('. ') + '.';
        changes.push({
          type: 'remove',
          original: pattern,
          fixed: '(제거됨)',
          reason: '의료광고법: 비교 광고 금지'
        });
      }
    }
  }

  return { fixed, changes };
}

/**
 * 환자 후기/사례 제거 또는 경고
 */
export function handleTestimonials(text: string): {
  fixed: string;
  changes: FixResult['changes'];
} {
  let fixed = text;
  const changes: FixResult['changes'] = [];

  for (const pattern of PROHIBITED_PATTERNS.testimonial) {
    if (fixed.includes(pattern)) {
      // 후기/사례 문장에 경고 추가
      const replacement = `[의료광고법 주의: 환자 후기 사용 제한]`;

      changes.push({
        type: 'replace',
        original: pattern,
        fixed: replacement,
        reason: '의료광고법: 환자 후기 사용 제한'
      });
    }
  }

  return { fixed, changes };
}

/**
 * AI 냄새 제거 (부수적 개선)
 */
export function removeAiSmell(text: string): {
  fixed: string;
  changes: FixResult['changes'];
} {
  let fixed = text;
  const changes: FixResult['changes'] = [];

  // 🚨 gpt52-prompts-staged.ts와 일관성 유지
  const aiPatterns: Record<string, string> = {
    '에 대해 알아보겠습니다': '',
    '에 대해 살펴보겠습니다': '',
    '라고 할 수 있습니다': '경우가 있습니다',
    '것으로 나타났습니다': '경향을 보입니다',
    '것으로 알려져 있습니다': '언급되기도 합니다',
    '여러분': '', // 🚨 '환자분들' 대신 삭제 (환자 표현 금지!)
    '환자분들': '~을 겪는 분들', // 환자 표현 대체
    '환자': '~을 겪는 분',
  };

  for (const [original, replacement] of Object.entries(aiPatterns)) {
    if (fixed.includes(original)) {
      fixed = fixed.replace(new RegExp(original, 'g'), replacement);
      changes.push({
        type: 'replace',
        original,
        fixed: replacement,
        reason: 'AI 특유 표현 제거'
      });
    }
  }

  return { fixed, changes };
}

/**
 * 🆕 질환명 강조/반복 제거 (피드백 1)
 */
export function fixDiseaseEmphasis(text: string): {
  fixed: string;
  changes: FixResult['changes'];
} {
  let fixed = text;
  const changes: FixResult['changes'] = [];

  // "○○암일 수 있습니다" → "이런 변화가 나타나기도 합니다"
  const matches = Array.from(fixed.matchAll(PROHIBITED_PATTERNS.diseaseEmphasis));
  for (const match of matches) {
    fixed = fixed.replace(match[0], '이런 변화가 나타나기도 합니다');
    changes.push({
      type: 'replace',
      original: match[0],
      fixed: '이런 변화가 나타나기도 합니다',
      reason: '의료광고법: 질환명 직접 연결 금지'
    });
  }

  return { fixed, changes };
}

/**
 * 🆕 질환 비교/차별 제거 (피드백 4)
 */
export function fixDiseaseComparison(text: string): {
  fixed: string;
  changes: FixResult['changes'];
} {
  let fixed = text;
  const changes: FixResult['changes'] = [];

  for (const pattern of PROHIBITED_PATTERNS.diseaseComparison) {
    if (fixed.includes(pattern)) {
      // 해당 문장 제거
      const sentences = fixed.split(/[.!?]\s*/);
      const filteredSentences = sentences.filter(s => !s.includes(pattern));

      if (filteredSentences.length < sentences.length) {
        fixed = filteredSentences.join('. ') + '.';
        changes.push({
          type: 'remove',
          original: pattern,
          fixed: '(제거됨)',
          reason: '의료광고법: 질환 비교/차별 구조 금지'
        });
      }
    }
  }

  return { fixed, changes };
}

/**
 * 🆕 자가진단 유도 제거 (피드백 2)
 */
export function fixSelfDiagnosis(text: string): {
  fixed: string;
  changes: FixResult['changes'];
} {
  let fixed = text;
  const changes: FixResult['changes'] = [];

  const replacements: [RegExp, string][] = [
    [/의심(된다|됩니다|해봐야|해보세요)/g, '나타나기도 합니다'],
    [/가능성이\s*(높다|높습니다|있다|있습니다)/g, '경우가 있습니다'],
    [/확인해보는\s*것이\s*좋(다|습니다)/g, '기록해두는 것도 방법입니다'],
  ];

  for (const [pattern, replacement] of replacements) {
    const matches = Array.from(fixed.matchAll(pattern));
    for (const match of matches) {
      fixed = fixed.replace(match[0], replacement);
      changes.push({
        type: 'replace',
        original: match[0],
        fixed: replacement,
        reason: '의료광고법: 자가진단 유도 금지'
      });
    }
  }

  return { fixed, changes };
}

/**
 * 🆕 의료 권유 제거 (피드백 3)
 */
export function fixMedicalAdvice(text: string): {
  fixed: string;
  changes: FixResult['changes'];
} {
  let fixed = text;
  const changes: FixResult['changes'] = [];

  const replacements: [RegExp, string][] = [
    [/확인이\s*필요한\s*시점(입니다)?/g, '변화가 나타나는 경우입니다'],
    [/살펴볼\s*때(입니다)?/g, '관찰할 수 있습니다'],
    [/검사(받으세요|하세요)/g, '기록해두세요'],
    [/병원(가세요|방문하세요)/g, '변화를 관찰하세요'],
  ];

  for (const [pattern, replacement] of replacements) {
    const matches = Array.from(fixed.matchAll(pattern));
    for (const match of matches) {
      fixed = fixed.replace(match[0], replacement);
      changes.push({
        type: 'replace',
        original: match[0],
        fixed: replacement,
        reason: '의료광고법: 의료 권유 금지'
      });
    }
  }

  return { fixed, changes };
}

/**
 * 🆕 약물/치료법 권유 제거 (신규 피드백)
 */
export function fixDrugAdvice(text: string): {
  fixed: string;
  changes: FixResult['changes'];
} {
  let fixed = text;
  const changes: FixResult['changes'] = [];

  // 약물/치료법 권유 표현 제거
  const adviceReplacements: [RegExp, string][] = [
    [/권장합니다/g, '사용되는 경우가 있습니다'],
    [/선택하면\s*좋(다|습니다)/g, '고려되는 방법 중 하나입니다'],
    [/우선입니다/g, '알려져 있습니다'],
    [/적합합니다/g, '사용되기도 합니다'],
    [/확인해보자/g, '확인해볼 수 있습니다'],
    [/고려해보자/g, '고려되는 경우가 있습니다'],
    [/선택하자/g, '선택 사항 중 하나입니다'],
  ];

  for (const [pattern, replacement] of adviceReplacements) {
    const matches = Array.from(fixed.matchAll(pattern));
    for (const match of matches) {
      fixed = fixed.replace(match[0], replacement);
      changes.push({
        type: 'replace',
        original: match[0],
        fixed: replacement,
        reason: '의료광고법: 약물/치료법 권유 금지'
      });
    }
  }

  // 약물 안전성 단정 제거
  const safetyReplacements: [RegExp, string][] = [
    [/(약물|상호작용)이?\s*위험합니다/g, '경우에 따라 주의가 필요할 수 있습니다'],
    [/(약물|상호작용)이?\s*안전합니다/g, '일반적으로 사용되는 경우가 있습니다'],
  ];

  for (const [pattern, replacement] of safetyReplacements) {
    const matches = Array.from(fixed.matchAll(pattern));
    for (const match of matches) {
      fixed = fixed.replace(match[0], replacement);
      changes.push({
        type: 'replace',
        original: match[0],
        fixed: replacement,
        reason: '의료광고법: 약물 안전성 단정 금지'
      });
    }
  }

  return { fixed, changes };
}

/**
 * 종합 자동 수정 실행 (🔥 2025 피드백 반영)
 */
export function autoFixMedicalLaw(content: string): FixResult {
  const originalText = content;
  let fixedText = content;
  const allChanges: FixResult['changes'] = [];

  // 🆕 1. 질환명 강조/반복 제거 (피드백 1)
  const diseaseEmphasisResult = fixDiseaseEmphasis(fixedText);
  fixedText = diseaseEmphasisResult.fixed;
  allChanges.push(...diseaseEmphasisResult.changes);

  // 🆕 2. 질환 비교/차별 제거 (피드백 4)
  const diseaseComparisonResult = fixDiseaseComparison(fixedText);
  fixedText = diseaseComparisonResult.fixed;
  allChanges.push(...diseaseComparisonResult.changes);

  // 🆕 3. 자가진단 유도 제거 (피드백 2)
  const selfDiagnosisResult = fixSelfDiagnosis(fixedText);
  fixedText = selfDiagnosisResult.fixed;
  allChanges.push(...selfDiagnosisResult.changes);

  // 🆕 4. 의료 권유 제거 (피드백 3)
  const medicalAdviceResult = fixMedicalAdvice(fixedText);
  fixedText = medicalAdviceResult.fixed;
  allChanges.push(...medicalAdviceResult.changes);

  // 🆕 5. 약물/치료법 권유 제거 (신규 피드백)
  const drugAdviceResult = fixDrugAdvice(fixedText);
  fixedText = drugAdviceResult.fixed;
  allChanges.push(...drugAdviceResult.changes);

  // 6. 과장 표현 수정 (기존)
  const exaggerationResult = fixExaggeration(fixedText);
  fixedText = exaggerationResult.fixed;
  allChanges.push(...exaggerationResult.changes);

  // 7. 출처 추가 (기존)
  const sourceResult = fixMissingSource(fixedText);
  fixedText = sourceResult.fixed;
  allChanges.push(...sourceResult.changes);

  // 8. 비교 광고 제거 (기존)
  const comparisonResult = removeComparison(fixedText);
  fixedText = comparisonResult.fixed;
  allChanges.push(...comparisonResult.changes);

  // 9. 환자 후기 처리 (기존)
  const testimonialResult = handleTestimonials(fixedText);
  fixedText = testimonialResult.fixed;
  allChanges.push(...testimonialResult.changes);

  // 10. AI 냄새 제거 (기존)
  const aiSmellResult = removeAiSmell(fixedText);
  fixedText = aiSmellResult.fixed;
  allChanges.push(...aiSmellResult.changes);

  // 성공률 계산
  const successRate = allChanges.length > 0
    ? Math.round((allChanges.filter(c => c.fixed !== '(제거됨)').length / allChanges.length) * 100)
    : 100;

  return {
    originalText,
    fixedText,
    changes: allChanges,
    autoFixSuccessRate: successRate
  };
}

/**
 * 수정 전후 비교 리포트 생성
 */
export function generateFixReport(result: FixResult): string {
  const { changes, autoFixSuccessRate } = result;

  if (changes.length === 0) {
    return '✅ 의료광고법 위반사항이 발견되지 않았습니다.';
  }

  let report = `📊 자동 수정 완료 (성공률: ${autoFixSuccessRate}%)\n\n`;
  report += `총 ${changes.length}개 항목 수정:\n\n`;

  const groupedChanges = changes.reduce((acc, change) => {
    if (!acc[change.type]) acc[change.type] = [];
    acc[change.type].push(change);
    return acc;
  }, {} as Record<string, FixResult['changes']>);

  for (const [type, items] of Object.entries(groupedChanges)) {
    const typeLabel = {
      replace: '🔄 표현 수정',
      remove: '🗑️ 제거',
      add_source: '📎 출처 추가 필요'
    }[type] || type;

    report += `${typeLabel} (${items.length}건):\n`;
    for (const item of items.slice(0, 5)) { // 최대 5개만 표시
      report += `  • "${item.original}" → "${item.fixed}"\n`;
      report += `    이유: ${item.reason}\n`;
    }
    if (items.length > 5) {
      report += `  ... 외 ${items.length - 5}건\n`;
    }
    report += '\n';
  }

  return report;
}
