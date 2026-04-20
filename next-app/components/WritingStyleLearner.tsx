'use client';

import { useState, useRef, useEffect } from 'react';
import { buildStylePrompt, createLearnedWritingStyle } from '../lib/styleService';
import type { LearnedWritingStyle } from '../lib/styleService';

export type { LearnedWritingStyle };

// ── localStorage 헬퍼 (old writingStyleService 동일) ──

const LEARNED_STYLES_KEY = 'hospital_learned_writing_styles';

export function getSavedStyles(): LearnedWritingStyle[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(LEARNED_STYLES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

export function getStyleById(id: string): LearnedWritingStyle | null {
  return getSavedStyles().find(s => s.id === id) || null;
}

// ── 생성 시 프롬프트 변환 — styleService.buildStylePrompt 사용 ──

export function getStylePromptForGeneration(style: LearnedWritingStyle): string {
  return buildStylePrompt(
    style.analyzedStyle,
    style.name,
    style.description || '',
    style.sampleText || undefined,
  );
}

// ── 컴포넌트 ──

interface WritingStyleLearnerProps {
  onStyleSelect: (styleId: string | undefined) => void;
  selectedStyleId?: string;
  contentType?: 'blog' | 'press_release';
}

type InputMethod = 'text' | 'image' | 'file' | 'url';

export default function WritingStyleLearner({
  onStyleSelect,
  selectedStyleId,
  contentType = 'blog',
}: WritingStyleLearnerProps) {
  const isPress = contentType === 'press_release';
  const contentExample = isPress
    ? '기존 보도자료를 붙여넣기 해주세요...\n\n예시:\n[보도자료] OO병원, 첨단 의료장비 도입으로 진료 서비스 강화\n\nOO병원(원장 홍길동)은 최신 의료장비를 도입하여 환자 진료 서비스를 한층 강화했다고 밝혔다.'
    : '학습시킬 블로그 글을 붙여넣기 해주세요...\n\n예시:\n임플란트 수명에 대해 알아보겠습니다.\n임플란트를 심고 나면 관리가 정말 중요합니다. 자연 치아처럼 꼼꼼한 양치와 정기검진이 필요합니다.';
  const styleNamePlaceholder = isPress
    ? '스타일 이름 (예: 공식 보도자료, 친근한 홍보문)'
    : '말투 이름 (예: 친절한 원장님, 동네 치과언니)';

  const [isExpanded, setIsExpanded] = useState(false);
  const [inputMethod, setInputMethod] = useState<InputMethod>('text');
  const [textInput, setTextInput] = useState('');
  const [styleName, setStyleName] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState('');
  const [savedStyles, setSavedStyles] = useState<LearnedWritingStyle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [urlInput, setUrlInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSavedStyles(getSavedStyles());
  }, []);

  const saveStyles = (styles: LearnedWritingStyle[]) => {
    localStorage.setItem(LEARNED_STYLES_KEY, JSON.stringify(styles));
    setSavedStyles(styles);
  };

  // ── 이미지 OCR (old 동일: Gemini Vision 경유) ──
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsAnalyzing(true);
    setAnalyzeProgress('이미지에서 텍스트 추출 중...');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        try {
          // Gemini Vision OCR via /api/gemini
          const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `이 이미지에서 텍스트를 정확하게 추출해주세요. 텍스트만 반환하세요.`,
              model: 'gemini-3.1-flash-lite-preview',
              temperature: 0.1,
            }),
          });
          const data = await res.json() as { text?: string };
          const text = data.text?.trim();
          if (text) {
            setExtractedText(text);
            setTextInput(text);
          } else {
            setError('이미지에서 텍스트를 찾을 수 없습니다.');
          }
        } catch {
          setError('텍스트 추출 실패');
        } finally {
          setIsAnalyzing(false);
          setAnalyzeProgress('');
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setError('이미지 처리 실패');
      setIsAnalyzing(false);
    }
  };

  // ── 파일 텍스트 추출 (txt 직접, 나머지 Gemini) ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsAnalyzing(true);
    setAnalyzeProgress('문서에서 텍스트 추출 중...');

    try {
      let text = '';
      if (file.name.endsWith('.txt')) {
        text = await file.text();
      } else {
        // pdf/docx → base64 → Gemini
        const buf = await file.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const res = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `이 문서의 텍스트 내용을 정확하게 추출해주세요. 텍스트만 반환하세요.\n\n[Base64 파일 데이터]\n${b64.substring(0, 10000)}`,
            model: 'gemini-3.1-flash-lite-preview',
            temperature: 0.1,
          }),
        });
        const data = await res.json() as { text?: string };
        text = data.text?.trim() || '';
      }

      if (text) {
        setExtractedText(text);
        setTextInput(text);
      } else {
        setError('문서에서 텍스트를 찾을 수 없습니다.');
      }
    } catch {
      setError('문서 처리 실패');
    } finally {
      setIsAnalyzing(false);
      setAnalyzeProgress('');
    }
  };

  // ── 네이버 블로그 URL 크롤링 ──
  const handleUrlCrawl = async () => {
    if (!urlInput.trim()) { setError('URL을 입력해주세요.'); return; }
    setError(null);
    setIsAnalyzing(true);
    setAnalyzeProgress('블로그 글 수집 중...');
    try {
      const isBlog = /blog\.naver\.com/i.test(urlInput);
      let content = '';
      if (isBlog) {
        const res = await fetch('/api/naver/crawl-hospital-blog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blogUrl: urlInput.trim(), maxPosts: 5 }),
        });
        if (!res.ok) throw new Error('크롤링 실패');
        const data = (await res.json()) as { posts?: { content?: string }[] };
        content = (data.posts || [])
          .map(p => (p.content || '').trim())
          .filter(t => t.length > 30)
          .join('\n\n---\n\n')
          .slice(0, 12000);
      } else {
        const res = await fetch('/api/crawler', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlInput.trim() }),
        });
        if (!res.ok) throw new Error('크롤링 실패');
        const data = (await res.json()) as { content?: string };
        content = (data.content || '').trim().slice(0, 12000);
      }
      if (content.length < 100) {
        setError('크롤링된 텍스트가 너무 짧습니다. 다른 URL을 시도해주세요.');
      } else {
        setExtractedText(content);
        setTextInput(content);
        setAnalyzeProgress(`${isBlog ? '블로그 글' : '페이지'} 수집 완료! (${content.length}자)`);
      }
    } catch {
      setError('URL 크롤링 실패. URL을 확인해주세요.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── 말투 분석 (/api/llm + style_learn task → Sonnet 4.6) ──
  const handleAnalyze = async () => {
    if (!textInput.trim()) { setError('분석할 텍스트를 입력해주세요.'); return; }
    if (!styleName.trim()) { setError('스타일 이름을 입력해주세요.'); return; }

    setError(null);
    setIsAnalyzing(true);
    setAnalyzeProgress('AI로 말투 분석 중...');

    try {
      const sampleText = textInput.substring(0, 12000);
      const prompt = `<task>
당신은 병원 마케팅 콘텐츠 전문 편집자입니다.
단순히 어미나 표현 몇 개를 모방하는 수준이 아니라,
해당 병원 고유의 화자 캐릭터·상담 방식·설명 습관·설득 구조·의료 콘텐츠 전략까지 추출해
정밀하게 문체를 재현할 수 있는 프로파일을 만들어야 합니다.
</task>

<source_text length="${sampleText.length}">
${sampleText}
</source_text>

<analysis_principles>
1. 표면적 어미 모방이 아닌 화자의 태도·환자와의 거리감·설명 흐름·설득 구조까지 분석
2. 업종 공통 블로그 말투로 평준화하지 않기 — 이 병원만의 차별점에 집중
3. "이 문장이 실제 상담실에서 쓰일 수 있는가?" 기준
4. 의료 콘텐츠 특화 — 시술 설명 방식·환자 불안 대응·신뢰 구축 패턴도 분석
5. 단락 통계는 원문의 줄바꿈(\\n, \\n\\n)을 기준으로 실제로 세기 — 추측 금지
6. goodExamples와 representativeParagraphs는 반드시 원문에서 정확히 복사 — 한 글자도 바꾸지 않기
</analysis_principles>

<analysis_examples>
참고용 예시 (이 형태로 구체적으로 작성):
- tone: "환자에게 옆집 언니처럼 친근하게 말하되, 의학적 설명은 정확한 용어를 쓰며 권위를 유지함"
- speakerIdentity: "원장 본인이 직접 쓰는 톤. 1인칭 '저'를 쓰며, 수술 경험담을 자연스럽게 녹임"
- medicalTermLevel: "전문 용어를 먼저 쓰고 괄호 안에 쉬운 설명 추가. 예: 치주염(잇몸병)"
- trustBuildingPattern: "케이스 수치를 구체적으로 언급. '10년간 3,200건' 식의 숫자 근거를 자주 활용"
- paragraphStats.lineBreakStyle: 원문에서 빈 줄(\\n\\n)이 3문장마다 나오면 "airy", 10문장 이상 이어지면 "dense"
</analysis_examples>

<output_format>
JSON 객체 하나만 출력하세요. JSON 밖의 텍스트는 포함하지 마세요.

{
  "tone": "전체적인 어조 설명 (2~3문장, 구체적으로)",
  "sentenceEndings": ["자주 쓰는 문장 끝 패턴 5~8개, 빈도 높은 순"],
  "vocabulary": ["이 병원 고유의 특징적 단어/표현 5~10개"],
  "structure": "글 구조 설명 (도입-본문-마무리 각각의 특징)",
  "emotionLevel": "low | medium | high",
  "formalityLevel": "casual | neutral | formal",
  "speakerIdentity": "화자 정체성 상세 분석",
  "readerDistance": "독자와의 거리감 분석",
  "sentenceRhythm": "문장 리듬 분석",
  "paragraphFlow": "문단 전개 구조 분석",
  "persuasionStyle": "설득 방식 분석",
  "medicalTermLevel": "의료 용어 사용 수준 분석",
  "procedureExplainStyle": "시술·치료 설명 방식",
  "trustBuildingPattern": "환자 신뢰 구축 패턴",
  "ctaStyle": "행동 유도(CTA) 방식",
  "anxietyHandling": "환자 불안 대응 방식",
  "uniqueExpressions": ["이 병원만의 고유 표현 5~10개"],
  "bannedGenericStyle": ["금지할 범용/AI식 표현 5~8개"],
  "oneLineSummary": "이 병원 문체를 한 줄로 정의",
  "goodExamples": ["원문에서 그대로 복사한 이 병원다운 문장 5~8개"],
  "badExamples": ["이 병원답지 않은 문장 예시 5개"],
  "paragraphStats": {
    "avgSentencesPerParagraph": 0,
    "avgCharsPerParagraph": 0,
    "lineBreakStyle": "dense | airy | mixed",
    "doubleBreakFrequency": "low | medium | high",
    "paragraphLengthPattern": "단락 길이 리듬 서술"
  },
  "representativeParagraphs": ["원문에서 그대로 복사한 대표 단락 5개, 줄바꿈 포함, 각 200~500자"],
  "description": "이 말투를 한 줄로 설명",
  "stylePrompt": "AI가 이 말투로 글을 쓸 때 반드시 지켜야 할 핵심 지침 (150~250자)"
}
</output_format>

<critical_rules>
1. goodExamples: 반드시 source_text에서 그대로 복사. 한 글자도 바꾸지 마세요.
2. representativeParagraphs: 반드시 source_text에서 그대로 복사. 줄바꿈(\\n, \\n\\n) 포함.
3. paragraphStats: 원문을 실제로 세서 계산. 추측이나 평균적인 숫자 금지.
4. badExamples: 원문에 없는 "이렇게 쓰면 안 되는" 예시를 새로 작성.
5. representativeParagraphs는 5개. 다양한 위치에서 선택.
</critical_rules>`;

      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'style_learn',
          prompt,
          systemInstruction: '당신은 병원 마케팅 콘텐츠 전문 편집자입니다. 문체·화자 캐릭터·의료 콘텐츠 전략을 정밀 분석합니다. JSON으로만 출력하세요.',
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseType: 'json',
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || '말투 분석 실패');

      let text = data.text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) text = jsonMatch[1];
      const result = JSON.parse(text.trim()) as Record<string, unknown>;

      const newStyle = createLearnedWritingStyle(result, textInput, styleName);

      setAnalyzeProgress('프로파일 저장 중...');
      const newStyles = [...savedStyles, newStyle];
      saveStyles(newStyles);
      onStyleSelect(newStyle.id);

      setTextInput('');
      setStyleName('');
      setExtractedText('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '말투 분석에 실패했습니다.';
      setError(msg);
    } finally {
      setIsAnalyzing(false);
      setAnalyzeProgress('');
    }
  };

  const handleDeleteStyle = (id: string) => {
    if (!confirm(`이 ${isPress ? '문체' : '말투'}를 삭제하시겠습니까?`)) return;
    const newStyles = savedStyles.filter(s => s.id !== id);
    saveStyles(newStyles);
    if (selectedStyleId === id) onStyleSelect(undefined);
  };

  // ── 공통 스타일 ──
  const methodBtnCls = (active: boolean) =>
    `flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
      active
        ? 'bg-violet-500 text-white shadow-lg'
        : 'bg-white text-slate-600 hover:bg-violet-50 border border-slate-200'
    }`;

  const inputFieldCls = 'w-full p-3 rounded-xl text-sm font-medium outline-none transition-all bg-white border border-slate-200 text-slate-700 placeholder-slate-400 focus:border-violet-500';

  return (
    <div className="rounded-2xl border transition-all bg-gradient-to-br from-violet-50 to-purple-50 border-violet-200">
      {/* 헤더 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">📝</span>
          <div className="text-left">
            <span className="text-sm font-black text-violet-700">
              {isPress ? '문체 학습' : '말투 학습'}
            </span>
            <p className="text-[10px] font-medium mt-0.5 text-violet-500">
              {isPress ? '보도자료의 문체/어조를 학습시켜보세요' : '블로그 글의 말투/어조를 학습시켜보세요'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savedStyles.length > 0 && (
            <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-violet-100 text-violet-600">
              {savedStyles.length}개 저장됨
            </span>
          )}
          <span className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </button>

      {/* 펼쳐진 내용 */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-violet-100">

          {/* 저장된 스타일 목록 */}
          {savedStyles.length > 0 && (
            <div className="pt-4">
              <label className="block text-xs font-black mb-2 text-slate-500">
                저장된 {isPress ? '문체' : '말투'}
              </label>
              <div className="space-y-2">
                {savedStyles.map((style) => (
                  <div
                    key={style.id}
                    className={`p-3 rounded-xl flex items-center justify-between transition-all ${
                      selectedStyleId === style.id
                        ? 'bg-violet-100 border-2 border-violet-500'
                        : 'bg-white border border-slate-200 hover:border-violet-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onStyleSelect(selectedStyleId === style.id ? undefined : style.id)}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${
                          selectedStyleId === style.id ? 'text-violet-600' : 'text-slate-700'
                        }`}>
                          {style.name}
                        </span>
                        {selectedStyleId === style.id && (
                          <span className="text-[10px] bg-violet-500 text-white px-2 py-0.5 rounded-full font-bold">
                            적용 중
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] mt-1 text-slate-500">{style.description}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStyle(style.id)}
                      className="ml-2 p-2 rounded-lg transition-all hover:bg-red-50 text-slate-400 hover:text-red-500"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 새 말투 학습 섹션 */}
          <div className={`pt-4 ${savedStyles.length > 0 ? 'border-t border-violet-100' : ''}`}>
            <label className="block text-xs font-black mb-3 text-slate-500">
              ✨ 새 {isPress ? '문체' : '말투'} 학습하기
            </label>

            {/* 입력 방식 선택 */}
            <div className="flex gap-2 mb-4">
              <button type="button" onClick={() => setInputMethod('url')} className={methodBtnCls(inputMethod === 'url')}>
                <span>🔗</span> <span className="leading-tight">블로그<br/>URL</span>
              </button>
              <button type="button" onClick={() => setInputMethod('text')} className={methodBtnCls(inputMethod === 'text')}>
                <span>✏️</span> <span className="leading-tight">직접<br/>입력</span>
              </button>
              <button type="button" onClick={() => setInputMethod('file')} className={methodBtnCls(inputMethod === 'file')}>
                <span>📄</span> 파일
              </button>
            </div>

            {/* 스타일 이름 */}
            <input
              type="text"
              value={styleName}
              onChange={(e) => setStyleName(e.target.value)}
              placeholder={styleNamePlaceholder}
              className={`${inputFieldCls} mb-3`}
            />

            {/* 입력 방식별 UI */}
            {inputMethod === 'url' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleUrlCrawl(); }}
                    placeholder="https://blog.naver.com/병원아이디"
                    className={`${inputFieldCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={handleUrlCrawl}
                    disabled={isAnalyzing || !urlInput.trim()}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 whitespace-nowrap"
                  >
                    {isAnalyzing ? '수집 중...' : '크롤링'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">네이버 블로그 URL을 입력하면 최근 글 5개를 자동으로 수집합니다.</p>
                {extractedText && (
                  <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                    <p className="text-xs font-bold mb-2 text-green-600">✅ 수집된 텍스트 ({extractedText.length}자)</p>
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      className="w-full p-2 rounded-lg text-sm resize-none bg-white text-slate-700"
                      rows={4}
                    />
                  </div>
                )}
              </div>
            )}

            {inputMethod === 'text' && (
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={contentExample}
                className={`${inputFieldCls} resize-none`}
                rows={6}
              />
            )}

            {inputMethod === 'file' && (
              <div className="space-y-3">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all border-slate-300 hover:border-violet-400 hover:bg-violet-50"
                >
                  <span className="text-4xl mb-2 block">📄</span>
                  <p className="text-sm font-bold text-slate-600">워드/PDF 파일 업로드</p>
                  <p className="text-[11px] mt-1 text-slate-400">.docx, .pdf, .txt 지원</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".docx,.pdf,.txt,.doc" onChange={handleFileUpload} className="hidden" />
                {extractedText && (
                  <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                    <p className="text-xs font-bold mb-2 text-green-600">✅ 추출된 텍스트:</p>
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      className="w-full p-2 rounded-lg text-sm resize-none bg-white text-slate-700"
                      rows={4}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 에러 */}
            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-600 font-medium">❌ {error}</p>
              </div>
            )}

            {/* 분석 진행 */}
            {isAnalyzing && (
              <div className="mt-3 p-3 rounded-xl flex items-center gap-3 bg-violet-100">
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium text-violet-600">{analyzeProgress}</p>
              </div>
            )}

            {/* 학습 버튼 */}
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing || !textInput.trim() || !styleName.trim()}
              className={`w-full mt-4 py-3 rounded-xl text-sm font-black transition-all ${
                isAnalyzing || !textInput.trim() || !styleName.trim()
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-violet-500 text-white hover:bg-violet-600 shadow-lg shadow-violet-200'
              }`}
            >
              {isAnalyzing ? '분석 중...' : `🎓 이 ${isPress ? '문체' : '말투'} 학습하기`}
            </button>

            <p className="text-[10px] mt-3 text-center text-slate-400">
              💡 300자 이상의 텍스트를 입력하면 더 정확하게 학습됩니다
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
