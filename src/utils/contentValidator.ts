/**
 * AI 생성 콘텐츠 품질 검증 시스템
 * - 의료법 위반 키워드 감지
 * - AI 냄새 점수 계산
 * - 출처 신뢰도 검증
 * - 팩트 체킹 통합
 * - 종합 품질 점수
 */

import { GeneratedContent } from '../types';
import { MedicalFactCheckReport, checkContentFacts, normalizeSearchResults as _normalizeSearchResults } from './factChecker';

export interface ValidationResult {
  isValid: boolean;
  violations: string[];
  warnings: string[];
  score: number;
}

export interface QualityReport {
  medicalLawCompliance: number; // 0-100
  aiSmellScore: number; // 0-100 (높을수록 자연스러움)
  sourceCredibility: number; // 0-100
  readabilityScore: number; // 0-100
  factCheckScore: number; // 0-100 (팩트 체킹 정확성 점수)
  overallScore: number; // 0-100
  violations: string[];
  warnings: string[];
  suggestions: string[];
  medicalFactCheck?: MedicalFactCheckReport; // 상세 팩트 체킹 결과
}

export class ContentValidator {
  // 의료법 금지 키워드 (강도별 분류)
  private static readonly FORBIDDEN_KEYWORDS = {
    critical: [
      '완치', '치료 가능', '100% 효과', '특효약', '확실히 치료',
      '반드시 낫는다', '완전히 제거', '영구적 효과'
    ],
    high: [
      '최고', '1위', '최상', '최고급', '프리미엄',
      '반드시', '확실히', '보증', '무조건'
    ],
    medium: [
      '골든타임', '48시간 내', '즉시', '지금 당장',
      '빨리', '서둘러', '놓치면 후회'
    ],
  };

  // 🚫 의료광고법: 출처/공공기관명 사용 금지
  // 이 목록은 검증에서 제외됨 (의료광고법 준수)
  private static readonly FORBIDDEN_SOURCES = [
    'kdca.go.kr', 'health.kdca.go.kr', '질병관리청',
    'mohw.go.kr', '보건복지부', 'nhis.or.kr', 'hira.or.kr', 'mfds.go.kr',
    'who.int', 'cdc.gov', 'nih.gov',
    'pubmed.ncbi.nlm.nih.gov', 'jamanetwork.com', 'nejm.org', 'thelancet.com',
    '대한의학회', '대한내과학회', '대한외과학회', '대한', '학회'
  ];

  /**
   * 종합 품질 검증 (팩트 체킹 포함)
   */
  static validate(
    content: GeneratedContent | { html: string },
    searchResults?: { url: string; snippet: string }[]
  ): QualityReport {
    const html = 'html' in content ? content.html : content.htmlContent;
    const text = this.extractText(html);

    const medicalLawViolations = this.checkMedicalLawViolations(text);
    const aiSmell = this.calculateAiSmellScore(text);
    const sourceCheck = this.verifySourceCredibility(text);
    const readability = this.calculateReadabilityScore(text);

    // 팩트 체킹 수행 (검색 결과가 있는 경우)
    let medicalFactCheck: MedicalFactCheckReport | undefined;
    let factCheckScore = 100; // 기본값

    if (searchResults && searchResults.length > 0) {
      medicalFactCheck = checkContentFacts(html, searchResults);
      factCheckScore = medicalFactCheck.accuracyScore;
    }

    const violations: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 의료법 위반 체크
    medicalLawViolations.critical.forEach(v => violations.push(`🚨 중대 위반: ${v}`));
    medicalLawViolations.high.forEach(v => violations.push(`⚠️ 높은 위험: ${v}`));
    medicalLawViolations.medium.forEach(v => warnings.push(`⚡ 주의 필요: ${v}`));

    // AI 냄새 경고
    if (aiSmell.score < 70) {
      warnings.push(`🤖 AI 냄새 감지 (${aiSmell.score}점): ${aiSmell.reasons.join(', ')}`);
    }

    // 출처 금지 확인 (의료광고법)
    if (sourceCheck.hasForbiddenSource) {
      violations.push('🚨 출처/공공기관명 사용 금지 (의료광고법): ' + sourceCheck.sources.join(', '));
    }

    // 팩트 체킹 경고
    if (medicalFactCheck) {
      if (medicalFactCheck.overallRecommendation === 'danger') {
        violations.push(`🚨 정보 정확성 문제 감지 (${medicalFactCheck.unverifiedClaims}개 주장 검증 실패)`);
      } else if (medicalFactCheck.overallRecommendation === 'warning') {
        warnings.push(`⚠️ 일부 정보 검증 필요 (정확성 점수: ${factCheckScore}점)`);
      }

      // 팩트 체킹 제안사항 추가
      medicalFactCheck.suggestions.forEach(s => suggestions.push(`📊 ${s}`));
    }

    // 가독성 경고
    if (readability < 60) {
      warnings.push(`📖 가독성이 낮습니다 (${readability}점)`);
      suggestions.push('문장을 더 짧고 간결하게 작성해보세요');
    }

    // 종합 점수 계산 (팩트 체킹 포함)
    const medicalLawScore = 100 - (
      medicalLawViolations.critical.length * 30 +
      medicalLawViolations.high.length * 15 +
      medicalLawViolations.medium.length * 5
    );

    // 출처 위반 시 점수 차감
    const sourceDeduction = sourceCheck.hasForbiddenSource ? 40 : 0;

    // 팩트 체킹 포함한 종합 점수 (가중치 조정)
    const overallScore = Math.max(0, Math.round(
      medicalLawScore * 0.4 +
      aiSmell.score * 0.3 +
      factCheckScore * 0.2 +
      readability * 0.1 -
      sourceDeduction
    ));

    return {
      medicalLawCompliance: Math.max(0, medicalLawScore),
      aiSmellScore: aiSmell.score,
      sourceCredibility: sourceCheck.score,
      readabilityScore: readability,
      factCheckScore,
      overallScore,
      violations,
      warnings,
      suggestions,
      medicalFactCheck,
    };
  }

  /**
   * 의료법 위반 키워드 감지
   */
  private static checkMedicalLawViolations(text: string): {
    critical: string[];
    high: string[];
    medium: string[];
  } {
    const result = {
      critical: [] as string[],
      high: [] as string[],
      medium: [] as string[],
    };

    // Critical 검사
    this.FORBIDDEN_KEYWORDS.critical.forEach(keyword => {
      if (text.includes(keyword)) {
        result.critical.push(keyword);
      }
    });

    // High 검사
    this.FORBIDDEN_KEYWORDS.high.forEach(keyword => {
      if (text.includes(keyword)) {
        result.high.push(keyword);
      }
    });

    // Medium 검사
    this.FORBIDDEN_KEYWORDS.medium.forEach(keyword => {
      if (text.includes(keyword)) {
        result.medium.push(keyword);
      }
    });

    return result;
  }

  /**
   * AI 냄새 점수 계산
   */
  private static calculateAiSmellScore(text: string): {
    score: number;
    reasons: string[];
  } {
    let deductions = 0;
    const reasons: string[] = [];

    // 1. 반복 표현 체크
    const repetitivePatterns = [
      { pattern: /~수 있습니다/g, name: '~수 있습니다', threshold: 3 },
      { pattern: /~할 수 있습니다/g, name: '~할 수 있습니다', threshold: 3 },
      { pattern: /~하는 것이 좋습니다/g, name: '~하는 것이 좋습니다', threshold: 2 },
      { pattern: /~인 것으로 알려져 있습니다/g, name: '~인 것으로 알려져', threshold: 2 },
    ];

    repetitivePatterns.forEach(({ pattern, name, threshold }) => {
      const matches = text.match(pattern) || [];
      if (matches.length >= threshold) {
        deductions += (matches.length - threshold + 1) * 5;
        reasons.push(`"${name}" 과도한 반복 (${matches.length}회)`);
      }
    });

    // 2. 교과서식 시작 체크
    if (text.match(/^[가-힣]+은\/는|^[가-힣]+이란/)) {
      deductions += 10;
      reasons.push('교과서식 정의형 시작');
    }

    // 3. 추상명사 연결 체크
    const abstractNouns = text.match(/기준을|방법을|과정을|단계를/g) || [];
    if (abstractNouns.length > 5) {
      deductions += abstractNouns.length * 2;
      reasons.push(`추상명사 과다 (${abstractNouns.length}개)`);
    }

    // 4. 나열 패턴 체크 (~인지, ~인지, ~인지)
    if (text.includes('인지,') && text.match(/인지,.*?인지,.*?인지/)) {
      deductions += 15;
      reasons.push('~인지 나열 패턴 발견');
    }

    // 5. 메타 설명 체크
    if (text.match(/이 글에서는|이번 포스팅에서는|오늘은.*?알아보겠습니다/)) {
      deductions += 10;
      reasons.push('메타 설명 포함');
    }

    // 6. AI 전환어/접속어 체크 (gpt52-prompts-staged.ts 금지 패턴)
    const aiConnectors = (text.match(/이처럼|이러한|이와 같이|이로 인해|나아가|무엇보다/g) || []);
    if (aiConnectors.length >= 2) {
      deductions += aiConnectors.length * 3;
      reasons.push(`AI 전환어 과다 (${aiConnectors.length}개)`);
    }

    // 7. ~기도 합니다 남발 체크 (글 전체 3회 이하)
    const gidoMatches = text.match(/기도 합니다/g) || [];
    if (gidoMatches.length > 3) {
      deductions += (gidoMatches.length - 3) * 5;
      reasons.push(`"~기도 합니다" 남발 (${gidoMatches.length}회, 3회 이하 권장)`);
    }

    // 8. ~게 됩니다 남발 체크 (글 전체 2회 이하)
    const gedoeMatches = text.match(/게 됩니다/g) || [];
    if (gedoeMatches.length > 2) {
      deductions += (gedoeMatches.length - 2) * 5;
      reasons.push(`"~게 됩니다" 남발 (${gedoeMatches.length}회, 2회 이하 권장)`);
    }

    // 9. 도입부 질환 경험자 공감 검증 (반복성 마커 체크)
    const introSection = text.substring(0, Math.min(text.length, 400));
    const hasRepetitionMarker = /며칠째|몇 주째|몇 달째|계속|반복|매번|요며칠|부쩍|처음엔.*?(는데|지만)|줄 알았는데/.test(introSection);
    if (!hasRepetitionMarker && text.length > 500) {
      deductions += 8;
      reasons.push('도입부에 반복성/시간 흐름 마커 부족 (질환 경험자 공감 약함)');
    }

    // 10. 딱딱한 단어 체크 (금지 목록)
    const stiffWords = (text.match(/측면|관점|맥락|양상|경향|파악하다|인지하다|고려하다|유발하다|초래하다|야기하다|체계적|효과적/g) || []);
    if (stiffWords.length >= 3) {
      deductions += stiffWords.length * 2;
      reasons.push(`딱딱한 단어 과다 (${stiffWords.length}개)`);
    }

    const score = Math.max(0, 100 - deductions);
    return { score, reasons };
  }

  /**
   * 출처 금지 검증 (의료광고법)
   * 공공기관명, 학회명 등 출처 사용 금지
   */
  private static verifySourceCredibility(text: string): {
    hasForbiddenSource: boolean;
    score: number;
    sources: string[];
  } {
    const foundSources: string[] = [];

    this.FORBIDDEN_SOURCES.forEach(source => {
      if (text.includes(source)) {
        foundSources.push(source);
      }
    });

    const hasForbiddenSource = foundSources.length > 0;
    // 출처가 없으면 100점 (의료광고법 준수)
    const score = hasForbiddenSource ? 0 : 100;

    return { hasForbiddenSource, score, sources: foundSources };
  }

  /**
   * 가독성 점수 계산 (간단한 휴리스틱)
   */
  private static calculateReadabilityScore(text: string): number {
    let score = 100;

    // 평균 문장 길이 체크
    const sentences = text.split(/[.!?]/);
    const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    
    if (avgLength > 100) {
      score -= 20;
    } else if (avgLength > 80) {
      score -= 10;
    }

    // 문단 나누기 체크
    const paragraphs = text.split(/\n\n/);
    if (paragraphs.length < 3 && text.length > 1000) {
      score -= 15;
    }

    // 소제목 체크
    const hasSubheadings = text.match(/<h3/g) || [];
    if (hasSubheadings.length < 2 && text.length > 1500) {
      score -= 10;
    }

    return Math.max(0, score);
  }

  /**
   * HTML에서 텍스트 추출
   */
  private static extractText(html: string): string {
    // 간단한 HTML 태그 제거
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 빠른 검증 (간단한 체크만)
   */
  static quickValidate(text: string): ValidationResult {
    const violations: string[] = [];
    const warnings: string[] = [];

    // Critical 위반만 체크
    this.FORBIDDEN_KEYWORDS.critical.forEach(keyword => {
      if (text.includes(keyword)) {
        violations.push(`금지 키워드 발견: "${keyword}"`);
      }
    });

    const isValid = violations.length === 0;
    const score = isValid ? 100 : Math.max(0, 100 - violations.length * 30);

    return { isValid, violations, warnings, score };
  }

  /**
   * 자동 수정 제안
   */
  static suggestFixes(report: QualityReport): string[] {
    const fixes: string[] = [];

    if (report.medicalLawCompliance < 80) {
      fixes.push('의료법 위반 키워드를 제거하거나 완화된 표현으로 수정하세요');
    }

    if (report.aiSmellScore < 70) {
      fixes.push('반복되는 표현을 다양한 문장으로 바꿔보세요');
      fixes.push('교과서식 정의 대신 상황 묘사로 시작하세요');
    }

    if (report.sourceCredibility < 60) {
      fixes.push('🚫 출처/공공기관명을 제거하세요 (의료광고법 준수)');
    }

    if (report.readabilityScore < 60) {
      fixes.push('문장을 짧게 나누고 소제목을 추가하세요');
    }

    return fixes;
  }
}

// 편의 함수
export const validateContent = (content: GeneratedContent) => 
  ContentValidator.validate(content);

export const quickValidate = (text: string) => 
  ContentValidator.quickValidate(text);
