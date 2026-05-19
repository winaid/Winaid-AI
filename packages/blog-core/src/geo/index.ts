/**
 * GEO-1.1 — AI 인용 출처 역추적기 (ChatGPT + Gemini, MVP).
 *
 * Public API:
 *   queryChatGptWithCitations / queryGeminiWithCitations — 단일 모델 호출
 *   normalizeCitations / isOursUrl / normalizeHostname / unwrapShortUrl 등 헬퍼
 *   Citation / CitationQueryResult / CitationRow / AnalyzeCitationsRequest 타입
 *
 * 사용처: next-app / public-app 의 /api/geo/citations/analyze route handler.
 * 직접 OpenAI / Gemini API 호출 (LLM router 미경유 — raw 응답에서 citation 추출 필요).
 */

export * from './types';
export * from './citationExtractor';
export { queryChatGptWithCitations } from './chatgptClient';
export { queryGeminiWithCitations } from './geminiClient';
export { classifyUrlPattern, classifyHtmlPattern } from './contentPatternClassifier';
export {
  buildMedicalOrganizationSchema,
  buildPhysicianSchema,
  buildFAQPageSchema,
  buildLocalBusinessSchema,
  buildAllSchemas,
  serializeSchema,
  wrapAsScript,
  type SchemaBuilderInput,
  type SchemaObject,
  type BuildAllSchemasResult,
} from './schemaOrgBuilder';
export {
  detectCiteRateChange,
  detectNewCompetitors,
  evaluateSubscription,
  formatAlertMessage,
  type Alert,
  type AlertType,
  type AlertPayload,
  type AlertSubscription,
  type DetectCiteRateChangeResult,
  type DetectNewCompetitorsResult,
} from './alertEngine';
export {
  sendSlack,
  sendEmail,
  sendKakao,
  sendToAllChannels,
  type SendResult,
  type ChannelsConfig,
} from './alertSenders';
export {
  scoreExperience,
  scoreExpertise,
  scoreAuthority,
  scoreTrust,
  scoreEEAT,
  type EEATInput,
  type EEATResult,
  type EEATAxisResult,
  type EEATAxis,
  type EEATSignal,
  type EEATCategoryItemMin,
} from './eeatScorer';
export {
  extractCompetitorsFromCitations,
  fetchCompetitorNewContent,
  searchNaverCompetitorPosts,
  detectNewContent,
  type CompetitorDomain,
  type CompetitorContentItem,
  type ExtractCompetitorsOpts,
  type DetectNewContentResult,
} from './competitorWatcher';
