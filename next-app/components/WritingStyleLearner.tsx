'use client';

import { useState, useRef, useEffect } from 'react';

// ── 타입 (old src/types.ts LearnedWritingStyle 동일) ──

interface AnalyzedStyle {
  tone: string;
  sentenceEndings: string[];
  vocabulary: string[];
  structure: string;
  emotionLevel: 'low' | 'medium' | 'high';
  formalityLevel: 'casual' | 'neutral' | 'formal';
  speakerIdentity?: string;
  readerDistance?: string;
  sentenceRhythm?: string;
  paragraphFlow?: string;
  persuasionStyle?: string;
  uniqueExpressions?: string[];
  bannedGenericStyle?: string[];
  oneLineSummary?: string;
  goodExamples?: string[];
  badExamples?: string[];
}

export interface LearnedWritingStyle {
  id: string;
  name: string;
  description: string;
  sampleText: string;
  analyzedStyle: AnalyzedStyle;
  stylePrompt: string;
  createdAt: string;
}

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

// ── 의료광고법 금지 표현 필터 (old 동일) ──

const PROHIBITED = [
  '방문하세요', '내원하세요', '예약하세요', '문의하세요', '상담하세요',
  '오세요', '완치', '최고', '유일', '특효', '1등', '최고급', '100%', '확실', '보장', '반드시',
];
const filterProhibited = (words: string[]) =>
  words.filter(w => !PROHIBITED.some(p => w.toLowerCase().includes(p.toLowerCase())));

// ── 생성 시 프롬프트 변환 (old getStylePromptForGeneration 동일) ──

export function getStylePromptForGeneration(style: LearnedWritingStyle): string {
  const as_ = style.analyzedStyle;
  const safeVocabulary = filterProhibited(as_.vocabulary || []);
  const safeSentenceEndings = filterProhibited(as_.sentenceEndings || []);
  const safeUniqueExpressions = filterProhibited(as_.uniqueExpressions || []);

  const hasDeep = as_.speakerIdentity || as_.readerDistance;
  const deepBlock = hasDeep ? `
[화자 캐릭터]
- 정체성: ${as_.speakerIdentity || '미분석'}
- 독자와의 거리감: ${as_.readerDistance || '미분석'}
- 설득 방식: ${as_.persuasionStyle || '미분석'}

[문장·문단 DNA]
- 리듬: ${as_.sentenceRhythm || '미분석'}
- 전개 구조: ${as_.paragraphFlow || '미분석'}
- 고유 표현: ${safeUniqueExpressions.length > 0 ? safeUniqueExpressions.join(', ') : '미분석'}

[한 줄 정의] ${as_.oneLineSummary || style.description}

[이 병원다운 문장 — 참고]
${(as_.goodExamples || []).map((ex, i) => `${i + 1}. ${ex}`).join('\n') || '(예시 없음)'}

[이 병원답지 않은 문장 — 절대 금지]
${(as_.badExamples || []).map((ex, i) => `${i + 1}. ${ex}`).join('\n') || '(예시 없음)'}
` : '';

  const bannedBlock = (as_.bannedGenericStyle || []).length > 0
    ? `\n[이 병원 글에서 금지할 범용 표현]\n${as_.bannedGenericStyle!.map(b => `- ${b}`).join('\n')}\n`
    : '';

  return `[병원 고유 문체: ${style.name}]
너는 이 병원의 편집자다. 어미 몇 개를 흉내 내는 것이 아니라,
화자의 태도·상담 방식·설명 습관·설득 구조를 재현하라.

[기본 톤]
- 어조: ${as_.tone}
- 격식: ${as_.formalityLevel === 'formal' ? '격식체' : as_.formalityLevel === 'casual' ? '편한 말투' : '중립적'}
- 감정 표현: ${as_.emotionLevel === 'high' ? '풍부하게' : as_.emotionLevel === 'medium' ? '적당히' : '절제하여'}
- 문장 끝 패턴: ${safeSentenceEndings.join(', ')}
- 자주 쓰는 표현: ${safeVocabulary.join(', ')}
- 글 구조: ${as_.structure}
${deepBlock}${bannedBlock}
[글 작성 전 자가점검]
1. 이 문단의 화자가 실제 상담실/진료실에서 말하는 것처럼 읽히는가?
2. 병원명을 가려도 이 병원 톤으로 느껴지는가?
3. 같은 어미가 3회 이상 연속 반복되지 않았는가?

[AI 냄새 제거 + 의료법 준수]
- "~가 핵심입니다" / "기억하세요" / "중요한 것은" → 삭제
- '방문하세요', '예약하세요', '상담하세요' → "고려해 보실 수 있습니다"
- '완치', '최고', '보장', '확실' → 과대광고 금지`;
}

// ── 컴포넌트 ──

interface WritingStyleLearnerProps {
  onStyleSelect: (styleId: string | undefined) => void;
  selectedStyleId?: string;
  contentType?: 'blog' | 'press_release';
}

type InputMethod = 'text' | 'image' | 'file';

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

  // ── 말투 분석 (old analyzeWritingStyle 동일: Gemini /api/gemini 경유) ──
  const handleAnalyze = async () => {
    if (!textInput.trim()) { setError('분석할 텍스트를 입력해주세요.'); return; }
    if (!styleName.trim()) { setError('스타일 이름을 입력해주세요.'); return; }

    setError(null);
    setIsAnalyzing(true);
    setAnalyzeProgress('Gemini AI로 말투 분석 중...');

    try {
      const prompt = `너는 단순히 기존 글의 문장 끝맺음을 흉내 내는 사람이 아니라,
해당 병원 고유의 화자 캐릭터, 상담 방식, 설명 습관, 설득 구조를 추출해
그 문체를 재현하는 편집자 역할을 수행한다.

[분석할 텍스트]
${textInput.substring(0, 5000)}

[중요 원칙]
- 표면적인 어미나 표현 몇 개만 모방하지 말 것
- 반드시 화자의 태도, 환자와의 거리감, 설명 흐름, 설득 구조까지 분석할 것
- 업종 공통 블로그 말투로 평준화하지 말 것
- 실제 상담실/진료실에서 나올 법한 문장인지 기준으로 판단할 것

[출력 형식]
반드시 아래 JSON으로만 답변. 설명 텍스트 없이 JSON만 출력.
{
  "tone": "전체적인 어조 설명 (2-3문장)",
  "sentenceEndings": ["자주 쓰는 문장 끝 패턴 5-8개"],
  "vocabulary": ["이 병원 고유의 특징적 단어/표현 5-10개"],
  "structure": "글 구조 설명",
  "emotionLevel": "low/medium/high",
  "formalityLevel": "casual/neutral/formal",
  "speakerIdentity": "화자 정체성 분석",
  "readerDistance": "독자와의 거리감 분석",
  "sentenceRhythm": "문장 리듬 분석",
  "paragraphFlow": "문단 전개 구조 분석",
  "persuasionStyle": "설득 방식 분석",
  "uniqueExpressions": ["고유 표현 5-10개"],
  "bannedGenericStyle": ["금지할 범용 표현 5-8개"],
  "oneLineSummary": "이 병원 문체를 한 줄로 정의",
  "goodExamples": ["이 병원다운 문장 예시 5개"],
  "badExamples": ["이 병원답지 않은 문장 예시 5개"],
  "description": "이 말투를 한 줄로 설명",
  "stylePrompt": "AI가 이 말투로 글을 쓸 때 사용할 핵심 지침 (100-200자)"
}`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: 'gemini-3.1-flash-lite-preview',
          temperature: 0.3,
          responseType: 'json',
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error || '말투 분석 실패');

      let text = data.text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) text = jsonMatch[1];
      const result = JSON.parse(text.trim()) as Record<string, unknown>;

      const newStyle: LearnedWritingStyle = {
        id: `style_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: styleName,
        description: (result.description as string) || '',
        sampleText: textInput.substring(0, 500),
        analyzedStyle: {
          tone: (result.tone as string) || '',
          sentenceEndings: (result.sentenceEndings as string[]) || [],
          vocabulary: (result.vocabulary as string[]) || [],
          structure: (result.structure as string) || '',
          emotionLevel: (result.emotionLevel as 'low' | 'medium' | 'high') || 'medium',
          formalityLevel: (result.formalityLevel as 'casual' | 'neutral' | 'formal') || 'neutral',
          speakerIdentity: result.speakerIdentity as string,
          readerDistance: result.readerDistance as string,
          sentenceRhythm: result.sentenceRhythm as string,
          paragraphFlow: result.paragraphFlow as string,
          persuasionStyle: result.persuasionStyle as string,
          uniqueExpressions: result.uniqueExpressions as string[],
          bannedGenericStyle: result.bannedGenericStyle as string[],
          oneLineSummary: result.oneLineSummary as string,
          goodExamples: result.goodExamples as string[],
          badExamples: result.badExamples as string[],
        },
        stylePrompt: (result.stylePrompt as string) || '',
        createdAt: new Date().toISOString(),
      };

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
              <button type="button" onClick={() => setInputMethod('text')} className={methodBtnCls(inputMethod === 'text')}>
                <span>✏️</span> <span className="leading-tight">직접<br/>입력</span>
              </button>
              <button type="button" onClick={() => setInputMethod('image')} className={methodBtnCls(inputMethod === 'image')}>
                <span>📷</span> 스크린샷
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
            {inputMethod === 'text' && (
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={contentExample}
                className={`${inputFieldCls} resize-none`}
                rows={6}
              />
            )}

            {inputMethod === 'image' && (
              <div className="space-y-3">
                <div
                  onClick={() => imageInputRef.current?.click()}
                  className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all border-slate-300 hover:border-violet-400 hover:bg-violet-50"
                >
                  <span className="text-4xl mb-2 block">📷</span>
                  <p className="text-sm font-bold text-slate-600">스크린샷 이미지 업로드</p>
                  <p className="text-[11px] mt-1 text-slate-400">
                    PNG, JPG, WEBP 지원 · {isPress ? '보도자료' : '블로그'} 캡쳐 이미지에서 텍스트 추출
                  </p>
                </div>
                <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
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
