import React from 'react';
import { SeoScoreReport, FactCheckReport, SimilarityCheckResult } from '../types';

interface SeoDetailModalProps {
  darkMode: boolean;
  seoScore: SeoScoreReport;
  showSeoDetail: boolean;
  setShowSeoDetail: (v: boolean) => void;
  isEvaluatingSeo: boolean;
  handleEvaluateSeo: () => void;
}

export const SeoDetailModal: React.FC<SeoDetailModalProps> = ({
  darkMode,
  seoScore,
  showSeoDetail,
  setShowSeoDetail,
  isEvaluatingSeo,
  handleEvaluateSeo,
}) => {
  if (!showSeoDetail || !seoScore) return null;

  return (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowSeoDetail(false)}>
          <div className={`w-full max-w-2xl rounded-[28px] shadow-2xl overflow-hidden my-4 ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black ${
                  seoScore.total >= 85 ? 'bg-emerald-100 text-emerald-600' :
                  seoScore.total >= 70 ? 'bg-amber-100 text-amber-600' :
                  'bg-red-100 text-red-600'
                }`}>
                  {seoScore.total}
                </div>
                <div>
                  <div className={`text-lg font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>📊 SEO 점수 분석</div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {seoScore.total >= 85 ? '✅ 상위 노출 가능성 높음' : seoScore.total >= 70 ? '⚠️ 개선 권장' : '🚨 85점 미만 - 재설계 필요'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSeoDetail(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                ✕
              </button>
            </div>

            {/* 본문 */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* ① 제목 최적화 (25점) */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>① 제목 최적화</span>
                  <span className={`text-lg font-black ${seoScore.title.score >= 20 ? 'text-emerald-500' : seoScore.title.score >= 15 ? 'text-amber-500' : 'text-red-500'}`}>
                    {seoScore.title.score}/25점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 키워드 자연 포함: <span className="font-bold">{seoScore.title.keyword_natural}/10</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 시기성/상황성: <span className="font-bold">{seoScore.title.seasonality}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 판단 유도형: <span className="font-bold">{seoScore.title.judgment_inducing}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 의료광고 안전: <span className="font-bold">{seoScore.title.medical_law_safe}/5</span>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{seoScore.title.feedback}</p>
              </div>

              {/* ② 본문 키워드 구조 (25점) */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>② 본문 키워드 구조</span>
                  <span className={`text-lg font-black ${seoScore.keyword_structure.score >= 20 ? 'text-emerald-500' : seoScore.keyword_structure.score >= 15 ? 'text-amber-500' : 'text-red-500'}`}>
                    {seoScore.keyword_structure.score}/25점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 메인키워드 노출: <span className="font-bold">{seoScore.keyword_structure.main_keyword_exposure}/10</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 연관키워드 분산: <span className="font-bold">{seoScore.keyword_structure.related_keyword_spread}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 소제목 키워드: <span className="font-bold">{seoScore.keyword_structure.subheading_variation}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 무의미반복 없음: <span className="font-bold">{seoScore.keyword_structure.no_meaningless_repeat}/5</span>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{seoScore.keyword_structure.feedback}</p>
              </div>

              {/* ③ 사용자 체류 구조 (20점) */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>③ 사용자 체류 구조</span>
                  <span className={`text-lg font-black ${seoScore.user_retention.score >= 16 ? 'text-emerald-500' : seoScore.user_retention.score >= 12 ? 'text-amber-500' : 'text-red-500'}`}>
                    {seoScore.user_retention.score}/20점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 도입부 문제인식: <span className="font-bold">{seoScore.user_retention.intro_problem_recognition}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 생활 예시: <span className="font-bold">{seoScore.user_retention.relatable_examples}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 중간 이탈방지: <span className="font-bold">{seoScore.user_retention.mid_engagement_points}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 정보과부하 없음: <span className="font-bold">{seoScore.user_retention.no_info_overload}/5</span>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{seoScore.user_retention.feedback}</p>
              </div>

              {/* ④ 의료법 안전성 + 신뢰 신호 (20점) */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>④ 의료법 안전성</span>
                  <span className={`text-lg font-black ${seoScore.medical_safety.score >= 16 ? 'text-emerald-500' : seoScore.medical_safety.score >= 12 ? 'text-amber-500' : 'text-red-500'}`}>
                    {seoScore.medical_safety.score}/20점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 단정/보장 없음: <span className="font-bold">{seoScore.medical_safety.no_definitive_guarantee}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 개인차 언급: <span className="font-bold">{seoScore.medical_safety.individual_difference}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 자가진단 한계: <span className="font-bold">{seoScore.medical_safety.self_diagnosis_limit}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 직접홍보 최소화: <span className="font-bold">{seoScore.medical_safety.minimal_direct_promo}/5</span>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{seoScore.medical_safety.feedback}</p>
              </div>

              {/* ⑤ 전환 연결성 (10점) */}
              <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>⑤ 전환 연결성</span>
                  <span className={`text-lg font-black ${seoScore.conversion.score >= 8 ? 'text-emerald-500' : seoScore.conversion.score >= 6 ? 'text-amber-500' : 'text-red-500'}`}>
                    {seoScore.conversion.score}/10점
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • CTA 자연 흐름: <span className="font-bold">{seoScore.conversion.cta_flow_natural}/5</span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    • 시점 고정형 문장: <span className="font-bold">{seoScore.conversion.time_fixed_sentence}/5</span>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{seoScore.conversion.feedback}</p>
              </div>

              {/* 결론 */}
              <div className={`rounded-xl p-4 border-2 ${
                seoScore.total >= 85 ? 'border-emerald-400 bg-emerald-50' :
                seoScore.total >= 70 ? 'border-amber-400 bg-amber-50' :
                'border-red-400 bg-red-50'
              } ${darkMode ? 'bg-opacity-10' : ''}`}>
                <div className={`text-sm font-black mb-2 ${
                  seoScore.total >= 85 ? 'text-emerald-700' :
                  seoScore.total >= 70 ? 'text-amber-700' :
                  'text-red-700'
                }`}>
                  {seoScore.total >= 85 ? '✅ 우수한 SEO 점수입니다!' :
                   seoScore.total >= 70 ? '⚠️ 개선이 필요한 영역이 있습니다' :
                   '🚨 85점 미만 - 재설계/재작성을 권장합니다'}
                </div>
                <p className={`text-xs ${
                  seoScore.total >= 85 ? 'text-emerald-600' :
                  seoScore.total >= 70 ? 'text-amber-600' :
                  'text-red-600'
                }`}>
                  SEO 점수는 상위 노출 가능성과 클릭 후 이탈 최소화를 함께 반영하는 비교 지표입니다.
                  글 간 차이점과 전환 이탈 지점을 파악하여 콘텐츠 품질을 개선하세요.
                </p>
              </div>
            </div>

            {/* 푸터 */}
            <div className={`px-6 py-4 border-t flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={handleEvaluateSeo}
                disabled={isEvaluatingSeo}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                🔄 다시 평가
              </button>
              <button
                type="button"
                onClick={() => setShowSeoDetail(false)}
                className="px-6 py-2 rounded-xl font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
  );
};

interface AiSmellDetailModalProps {
  darkMode: boolean;
  showAiSmellDetail: boolean;
  setShowAiSmellDetail: (v: boolean) => void;
  recheckResult: FactCheckReport | null;
  factCheck?: FactCheckReport;
}

export const AiSmellDetailModal: React.FC<AiSmellDetailModalProps> = ({
  darkMode,
  showAiSmellDetail,
  setShowAiSmellDetail,
  recheckResult,
  factCheck,
}) => {
  if (!showAiSmellDetail || !(recheckResult?.ai_smell_analysis || factCheck?.ai_smell_analysis)) return null;

  return (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowAiSmellDetail(false)}>
          <div className={`w-full max-w-2xl rounded-[28px] shadow-2xl overflow-hidden my-4 ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black ${
                  (recheckResult?.ai_smell_score ?? factCheck?.ai_smell_score ?? 0) <= 7 ? 'bg-green-100 text-green-600' :
                  (recheckResult?.ai_smell_score ?? factCheck?.ai_smell_score ?? 0) <= 15 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
                }`}>
                  {recheckResult?.ai_smell_score ?? factCheck?.ai_smell_score ?? 0}
                </div>
                <div>
                  <div className={`text-lg font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>🤖 AI 냄새 분석 결과</div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {(recheckResult?.ai_smell_score ?? factCheck?.ai_smell_score ?? 0) <= 20
                      ? '✅ 사람 글 수준 (0~20점) - 바로 발행 가능!'
                      : (recheckResult?.ai_smell_score ?? factCheck?.ai_smell_score ?? 0) <= 40
                        ? '⚠️ 경계선 (21~40점) - 부분 수정 후 발행 가능'
                        : '🚨 AI 냄새 강함 (41점 이상) - 재작성 권장'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAiSmellDetail(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                ✕
              </button>
            </div>

            {/* 본문 */}
            {(() => {
              const analysis = recheckResult?.ai_smell_analysis || factCheck?.ai_smell_analysis;
              if (!analysis) return null;
              return (
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* 우선 수정 사항 */}
              {analysis.priority_fixes && analysis.priority_fixes.length > 0 && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-amber-900/30 border border-amber-700' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className={`text-sm font-black mb-3 ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                    ⚡ 우선 수정 사항 (이것만 고쳐도 OK!)
                  </div>
                  <ul className="space-y-2">
                    {analysis.priority_fixes.map((fix, idx) => (
                      <li key={idx} className={`text-sm flex items-start gap-2 ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                        <span className="font-bold">{idx + 1}.</span>
                        <span>{fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ① 문장 리듬 단조로움 */}
              {analysis.sentence_rhythm && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>① 문장 리듬 단조로움</span>
                    <span className={`text-lg font-black ${analysis.sentence_rhythm.score <= 5 ? 'text-green-500' : analysis.sentence_rhythm.score <= 12 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.sentence_rhythm.score}/25점
                    </span>
                  </div>
                  {analysis.sentence_rhythm.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.sentence_rhythm.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.sentence_rhythm.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.sentence_rhythm.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ② 판단 단정형 글쓰기 */}
              {analysis.judgment_avoidance && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>② 판단 단정형 글쓰기</span>
                    <span className={`text-lg font-black ${analysis.judgment_avoidance.score <= 4 ? 'text-green-500' : analysis.judgment_avoidance.score <= 10 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.judgment_avoidance.score}/20점
                    </span>
                  </div>
                  {analysis.judgment_avoidance.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.judgment_avoidance.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.judgment_avoidance.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.judgment_avoidance.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ③ 현장감 부재 */}
              {analysis.lack_of_realism && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>③ 현장감 부재</span>
                    <span className={`text-lg font-black ${analysis.lack_of_realism.score <= 4 ? 'text-green-500' : analysis.lack_of_realism.score <= 10 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.lack_of_realism.score}/20점
                    </span>
                  </div>
                  {analysis.lack_of_realism.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.lack_of_realism.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.lack_of_realism.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.lack_of_realism.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ④ 템플릿 구조 */}
              {analysis.template_structure && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>④ 템플릿 구조</span>
                    <span className={`text-lg font-black ${analysis.template_structure.score <= 3 ? 'text-green-500' : analysis.template_structure.score <= 8 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.template_structure.score}/15점
                    </span>
                  </div>
                  {analysis.template_structure.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.template_structure.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.template_structure.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.template_structure.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ⑤ 가짜 공감 */}
              {analysis.fake_empathy && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>⑤ 가짜 공감</span>
                    <span className={`text-lg font-black ${analysis.fake_empathy.score <= 2 ? 'text-green-500' : analysis.fake_empathy.score <= 5 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.fake_empathy.score}/10점
                    </span>
                  </div>
                  {analysis.fake_empathy.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.fake_empathy.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.fake_empathy.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.fake_empathy.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ⑥ 행동 유도 실패 */}
              {analysis.cta_failure && (
                <div className={`rounded-xl p-4 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>⑥ 행동 유도 실패</span>
                    <span className={`text-lg font-black ${analysis.cta_failure.score <= 2 ? 'text-green-500' : analysis.cta_failure.score <= 5 ? 'text-amber-500' : 'text-red-500'}`}>
                      {analysis.cta_failure.score}/10점
                    </span>
                  </div>
                  {analysis.cta_failure.issues.length > 0 && (
                    <div className="mb-2">
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>문제점:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.cta_failure.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.cta_failure.fix_suggestions.length > 0 && (
                    <div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>수정 제안:</span>
                      <ul className={`mt-1 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {analysis.cta_failure.fix_suggestions.map((fix, idx) => (
                          <li key={idx}>✅ {fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* 점수 기준 안내 */}
              <div className={`rounded-xl p-4 text-center ${darkMode ? 'bg-slate-700/30' : 'bg-slate-100'}`}>
                <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  <span className="font-bold">📊 AI 냄새 점수 기준</span><br />
                  <span className="text-green-500">0~20점: 사람 글 ✅</span> |
                  <span className="text-amber-500"> 21~40점: 경계선 ⚠️</span> |
                  <span className="text-red-500"> 41점↑: AI 확정 🚨</span>
                </div>
              </div>
            </div>
              );
            })()}

            {/* 하단 버튼 */}
            <div className={`px-6 py-4 border-t flex justify-end ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setShowAiSmellDetail(false)}
                className="px-6 py-2 rounded-xl font-bold text-sm bg-amber-600 text-white hover:bg-amber-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
  );
};

interface SimilarityModalProps {
  darkMode: boolean;
  showSimilarityModal: boolean;
  setShowSimilarityModal: (v: boolean) => void;
  similarityResult: SimilarityCheckResult;
}

export const SimilarityModal: React.FC<SimilarityModalProps> = ({
  darkMode,
  showSimilarityModal,
  setShowSimilarityModal,
  similarityResult,
}) => {
  if (!showSimilarityModal || !similarityResult) return null;

  return (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowSimilarityModal(false)}
        >
          <div
            className={`max-w-2xl w-full max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden ${
              darkMode ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              similarityResult.status === 'HIGH_RISK' ? 'bg-red-500 text-white' :
              similarityResult.status === 'MEDIUM_RISK' ? 'bg-yellow-500 text-white' :
              similarityResult.status === 'LOW_RISK' ? 'bg-blue-500 text-white' :
              'bg-green-500 text-white'
            }`}>
              <h3 className="font-bold text-xl">🔍 유사도 검사 결과</h3>
              <button
                onClick={() => setShowSimilarityModal(false)}
                className="text-2xl hover:opacity-70 transition-opacity"
              >
                ×
              </button>
            </div>

            {/* 본문 */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* 점수 */}
              <div className="text-center mb-6">
                <div className={`text-6xl font-black mb-2 ${
                  similarityResult.finalScore >= 80 ? 'text-red-600' :
                  similarityResult.finalScore >= 60 ? 'text-yellow-600' :
                  similarityResult.finalScore >= 40 ? 'text-blue-600' :
                  'text-green-600'
                }`}>
                  {similarityResult.finalScore.toFixed(1)}점
                </div>
                <p className="text-lg font-bold mb-2">
                  {similarityResult.message}
                </p>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  검사 시간: {(similarityResult.checkDuration / 1000).toFixed(1)}초
                </p>
              </div>

              {/* 최다 매칭 출처 정보 (개선된 UI) */}
              {similarityResult.topSourceInfo && similarityResult.topSourceInfo.matchCount > 0 && (
                <div className={`mb-6 p-5 rounded-xl border-2 ${
                  similarityResult.topSourceInfo.matchCount >= 5
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : similarityResult.topSourceInfo.matchCount >= 3
                    ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                    : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                }`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    {similarityResult.topSourceInfo.matchCount >= 5 ? '🚨' :
                     similarityResult.topSourceInfo.matchCount >= 3 ? '⚠️' : '💡'}
                    최다 유사 출처
                  </h4>
                  <div className="space-y-3">
                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-white'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <a
                          href={similarityResult.topSourceInfo.blogInfo?.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-blue-600 hover:underline flex-1"
                        >
                          {similarityResult.topSourceInfo.blogInfo?.title?.replace(/<[^>]*>/g, '') || '블로그'}
                        </a>
                        <span className={`ml-3 px-3 py-1 rounded-full text-sm font-bold ${
                          similarityResult.topSourceInfo.matchCount >= 5
                            ? 'bg-red-500 text-white'
                            : similarityResult.topSourceInfo.matchCount >= 3
                            ? 'bg-yellow-500 text-white'
                            : 'bg-blue-500 text-white'
                        }`}>
                          {similarityResult.topSourceInfo.matchCount}개 문장 일치
                        </span>
                      </div>
                      <p className={`text-xs mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {similarityResult.topSourceInfo.blogInfo?.snippet?.substring(0, 150)}...
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {similarityResult.topSourceInfo.blogInfo?.displayLink || similarityResult.topSourceInfo.blogKey}
                      </p>
                    </div>
                    <div className={`text-sm p-3 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <p className="font-bold mb-2">📝 일치하는 문장:</p>
                      <ul className="space-y-1 text-xs">
                        {similarityResult.topSourceInfo.matchedPhrases?.slice(0, 5).map((phrase: string, idx: number) => (
                          <li key={idx} className={`${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            • "{phrase.substring(0, 80)}..."
                          </li>
                        ))}
                        {(similarityResult.topSourceInfo.matchedPhrases?.length ?? 0) > 5 && (
                          <li className={`italic ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                            외 {(similarityResult.topSourceInfo.matchedPhrases?.length ?? 0) - 5}개 문장 더...
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* 자체 블로그 매칭 */}
              {similarityResult.ownBlogMatches.length > 0 ? (
                <div className={`mb-6 p-4 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    📚 자체 블로그 유사 글
                  </h4>
                  <ul className="space-y-2">
                    {similarityResult.ownBlogMatches.map((match: any, idx: number) => {
                      // similarity 값 안전하게 처리
                      const similarity = typeof match.similarity === 'number' && !isNaN(match.similarity)
                        ? match.similarity
                        : 0;
                      const percentage = (similarity * 100).toFixed(1);

                      return (
                        <li key={idx} className={`flex justify-between items-center p-3 rounded-lg ${
                          darkMode ? 'bg-slate-600' : 'bg-white'
                        }`}>
                          <span className="truncate flex-1 text-sm">{match.blog?.title || '제목 없음'}</span>
                          <span className={`font-bold ml-3 text-lg ${
                            similarity >= 0.8 ? 'text-red-500' :
                            similarity >= 0.6 ? 'text-yellow-500' :
                            'text-blue-500'
                          }`}>
                            {percentage}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className={`mb-6 p-4 rounded-xl border-2 border-dashed ${
                  darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-blue-50 border-blue-300'
                }`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    📚 자체 블로그 유사 글
                  </h4>
                  <div className={`text-center py-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    <p className="text-lg mb-2">✨ 첫 글이시네요!</p>
                    <p className="text-sm">
                      이 글을 <strong>PDF 다운로드</strong> 또는 <strong>카드뉴스 다운로드</strong>하면<br/>
                      다음부터 자체 블로그와의 유사도 검사가 가능합니다.
                    </p>
                  </div>
                </div>
              )}

              {/* 웹 검색 매칭 (네이버 블로그) */}
              {similarityResult.webSearchMatches.length > 0 ? (
                <div className={`mb-6 p-4 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    🌐 네이버 블로그에서 발견된 유사 문장
                  </h4>
                  <ul className="space-y-4">
                    {similarityResult.webSearchMatches.map((match: any, idx: number) => (
                      <li key={idx} className={`p-4 rounded-lg border-l-4 border-red-500 ${
                        darkMode ? 'bg-slate-600' : 'bg-white'
                      }`}>
                        <p className="font-bold mb-2 text-sm text-red-600">"{match.phrase.substring(0, 100)}..."</p>
                        <div className="mb-2 text-xs">
                          <span className={`font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {match.matchCount}건의 네이버 블로그에서 발견
                          </span>
                        </div>
                        {/* 매칭된 블로그 목록 */}
                        {match.matches && match.matches.length > 0 && (
                          <div className="space-y-2 mt-3">
                            {match.matches.slice(0, 3).map((blog: any, blogIdx: number) => (
                              <a
                                key={blogIdx}
                                href={blog.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`block p-2 rounded text-xs hover:bg-opacity-80 transition-all ${
                                  darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-50 hover:bg-slate-100'
                                }`}
                              >
                                <div className="font-bold text-blue-600 hover:underline mb-1">
                                  {blog.title.replace(/<[^>]*>/g, '')}
                                </div>
                                <div className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {blog.snippet?.substring(0, 150)}...
                                </div>
                                <div className={`mt-1 text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {blog.displayLink || blog.link}
                                </div>
                              </a>
                            ))}
                            {match.matches.length > 3 && (
                              <div className={`text-xs text-center pt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                외 {match.matches.length - 3}개 블로그 더보기...
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : similarityResult.keyPhrases && similarityResult.keyPhrases.length > 0 && (
                <div className={`mb-6 p-4 rounded-xl border-2 border-dashed ${
                  darkMode ? 'bg-slate-700 border-slate-600' : 'bg-yellow-50 border-yellow-300'
                }`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    ⚠️ 웹 검색 결과 없음
                  </h4>
                  <p className={`text-sm mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    네이버 블로그 검색 결과가 없습니다. 다음을 확인해주세요:
                  </p>
                  <ul className={`text-sm space-y-2 ml-4 list-disc ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    <li>
                      <strong>Google Custom Search API 키 설정</strong>
                      <div className="text-xs mt-1 ml-2">
                        Cloudflare Dashboard &gt; Workers & Pages &gt; 프로젝트 &gt; Settings &gt; Environment variables
                      </div>
                    </li>
                    <li>
                      <strong>필요한 환경변수</strong>
                      <div className="text-xs mt-1 ml-2">
                        • GOOGLE_API_KEY<br/>
                        • GOOGLE_SEARCH_ENGINE_ID
                      </div>
                    </li>
                    <li>
                      <strong>API 할당량 확인</strong>
                      <div className="text-xs mt-1 ml-2">
                        무료: 100쿼리/일 | 유료: 10,000쿼리/일
                      </div>
                    </li>
                  </ul>
                  <div className={`mt-4 p-3 rounded-lg text-xs ${
                    darkMode ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-600'
                  }`}>
                    💡 <strong>참고:</strong> 콘솔(F12)에서 상세한 에러 메시지를 확인할 수 있습니다.
                  </div>
                </div>
              )}

              {/* 핵심 문장 */}
              {similarityResult.keyPhrases.length > 0 && (
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                  <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
                    💡 검사된 핵심 문장들
                  </h4>
                  <ul className="space-y-1 text-xs">
                    {similarityResult.keyPhrases.map((phrase: string, idx: number) => (
                      <li key={idx} className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                        {idx + 1}. "{phrase}"
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${
              darkMode ? 'border-slate-700' : 'border-slate-200'
            }`}>
              <button
                onClick={() => setShowSimilarityModal(false)}
                className={`px-6 py-2 rounded-lg font-bold transition-all ${
                  darkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
  );
};
