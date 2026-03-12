import React, { useState, useRef, useEffect } from 'react';
import { LearnedWritingStyle } from '../types';
import { analyzeWritingStyle, extractTextFromImage, extractTextFromDocument } from '../services/writingStyleService';
import { toast } from './Toast';

// localStorage 키
const LEARNED_STYLES_KEY = 'hospital_learned_writing_styles';

interface WritingStyleLearnerProps {
  onStyleSelect: (styleId: string | undefined) => void;
  selectedStyleId?: string;
  darkMode?: boolean;
  contentType?: 'blog' | 'press_release';  // 콘텐츠 타입에 따라 UI 텍스트 변경
}

type InputMethod = 'text' | 'image' | 'file';

const WritingStyleLearner: React.FC<WritingStyleLearnerProps> = ({ 
  onStyleSelect, 
  selectedStyleId,
  darkMode = false,
  contentType = 'blog'
}) => {
  // 콘텐츠 타입별 텍스트
  const isPress = contentType === 'press_release';
  const _contentLabel = isPress ? '보도자료' : '블로그 글'; // 향후 UI 라벨에 활용
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

  // 저장된 스타일 불러오기
  useEffect(() => {
    const saved = localStorage.getItem(LEARNED_STYLES_KEY);
    if (saved) {
      try {
        setSavedStyles(JSON.parse(saved));
      } catch (e) {
        console.error('저장된 스타일 로드 실패:', e);
      }
    }
  }, []);

  // 스타일 저장
  const saveStyles = (styles: LearnedWritingStyle[]) => {
    localStorage.setItem(LEARNED_STYLES_KEY, JSON.stringify(styles));
    setSavedStyles(styles);
  };

  // 이미지 업로드 처리 (OCR)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsAnalyzing(true);
    setAnalyzeProgress('이미지에서 텍스트 추출 중...');

    try {
      // 이미지를 base64로 변환
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        try {
          const text = await extractTextFromImage(base64);
          if (text && text.trim()) {
            setExtractedText(text);
            setTextInput(text);
            setAnalyzeProgress('');
          } else {
            setError('이미지에서 텍스트를 찾을 수 없습니다.');
          }
        } catch (err: any) {
          setError(err.message || '텍스트 추출 실패');
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || '이미지 처리 실패');
      setIsAnalyzing(false);
    }
  };

  // 파일 업로드 처리 (Word/PDF)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsAnalyzing(true);
    setAnalyzeProgress('문서에서 텍스트 추출 중...');

    try {
      const text = await extractTextFromDocument(file);
      if (text && text.trim()) {
        setExtractedText(text);
        setTextInput(text);
        setAnalyzeProgress('');
      } else {
        setError('문서에서 텍스트를 찾을 수 없습니다.');
      }
    } catch (err: any) {
      setError(err.message || '문서 처리 실패');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 말투 분석 및 학습
  const handleAnalyze = async () => {
    if (!textInput.trim()) {
      setError('분석할 텍스트를 입력해주세요.');
      return;
    }

    if (!styleName.trim()) {
      setError('스타일 이름을 입력해주세요.');
      return;
    }

    setError(null);
    setIsAnalyzing(true);
    setAnalyzeProgress('말투 분석 중...');

    try {
      setAnalyzeProgress('Gemini AI로 말투 분석 중...');
      const analyzedStyle = await analyzeWritingStyle(textInput, styleName);

      // 프로필 저장
      setAnalyzeProgress('프로파일 저장 중...');
      const newStyles = [...savedStyles, analyzedStyle];
      saveStyles(newStyles);

      // 방금 학습한 스타일 선택
      onStyleSelect(analyzedStyle.id);

      // 입력 초기화
      setTextInput('');
      setStyleName('');
      setExtractedText('');
      setAnalyzeProgress('');

      toast.success(`"${analyzedStyle.name}" ${isPress ? '문체' : '말투'}가 학습되었습니다!`);
    } catch (err: any) {
      console.error('[WritingStyleLearner] 분석/저장 실패:', err);
      const errorMsg = err?.message || '말투 분석에 실패했습니다.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsAnalyzing(false);
      setAnalyzeProgress('');
    }
  };

  // 스타일 삭제
  const handleDeleteStyle = (id: string) => {
    if (!confirm(`이 ${isPress ? '문체' : '말투'}를 삭제하시겠습니까?`)) return;
    
    const newStyles = savedStyles.filter(s => s.id !== id);
    saveStyles(newStyles);
    
    if (selectedStyleId === id) {
      onStyleSelect(undefined);
    }
  };

  return (
    <div className={`rounded-2xl border transition-all ${
      darkMode 
        ? 'bg-slate-800 border-slate-700' 
        : 'bg-gradient-to-br from-violet-50 to-purple-50 border-violet-200'
    }`}>
      {/* 헤더 - 클릭하면 펼쳐짐 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">📝</span>
          <div className="text-left">
            <span className={`text-sm font-black ${darkMode ? 'text-violet-300' : 'text-violet-700'}`}>
              {isPress ? '문체 학습' : '말투 학습'}
            </span>
            <p className={`text-[10px] font-medium mt-0.5 ${darkMode ? 'text-violet-400' : 'text-violet-500'}`}>
              {isPress ? '보도자료의 문체/어조를 학습시켜보세요' : '블로그 글의 말투/어조를 학습시켜보세요'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savedStyles.length > 0 && (
            <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
              darkMode ? 'bg-violet-900 text-violet-300' : 'bg-violet-100 text-violet-600'
            }`}>
              {savedStyles.length}개 저장됨
            </span>
          )}
          <span className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>

      {/* 펼쳐진 내용 */}
      {isExpanded && (
        <div className={`px-4 pb-4 space-y-4 border-t ${darkMode ? 'border-slate-700' : 'border-violet-100'}`}>
          
          {/* 저장된 스타일 목록 */}
          {savedStyles.length > 0 && (
            <div className="pt-4">
              <label className={`block text-xs font-black mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                저장된 {isPress ? '문체' : '말투'}
              </label>
              <div className="space-y-2">
                {savedStyles.map((style) => (
                  <div
                    key={style.id}
                    className={`p-3 rounded-xl flex items-center justify-between transition-all ${
                      selectedStyleId === style.id
                        ? darkMode 
                          ? 'bg-violet-900 border-2 border-violet-500' 
                          : 'bg-violet-100 border-2 border-violet-500'
                        : darkMode
                          ? 'bg-slate-700 border border-slate-600 hover:border-violet-500'
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
                          selectedStyleId === style.id
                            ? 'text-violet-600'
                            : darkMode ? 'text-slate-200' : 'text-slate-700'
                        }`}>
                          {style.name}
                        </span>
                        {selectedStyleId === style.id && (
                          <span className="text-[10px] bg-violet-500 text-white px-2 py-0.5 rounded-full font-bold">
                            적용 중
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {style.description}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStyle(style.id)}
                      className={`ml-2 p-2 rounded-lg transition-all ${
                        darkMode 
                          ? 'hover:bg-red-900 text-slate-400 hover:text-red-400' 
                          : 'hover:bg-red-50 text-slate-400 hover:text-red-500'
                      }`}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 새 말투 학습 섹션 */}
          <div className={`pt-4 ${savedStyles.length > 0 ? 'border-t' : ''} ${darkMode ? 'border-slate-700' : 'border-violet-100'}`}>
            <label className={`block text-xs font-black mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              ✨ 새 {isPress ? '문체' : '말투'} 학습하기
            </label>

            {/* 입력 방식 선택 */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setInputMethod('text')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  inputMethod === 'text'
                    ? 'bg-violet-500 text-white shadow-lg'
                    : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-white text-slate-600 hover:bg-violet-50 border border-slate-200'
                }`}
              >
                <span>✏️</span> <span className="leading-tight">직접<br/>입력</span>
              </button>
              <button
                type="button"
                onClick={() => setInputMethod('image')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  inputMethod === 'image'
                    ? 'bg-violet-500 text-white shadow-lg'
                    : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-white text-slate-600 hover:bg-violet-50 border border-slate-200'
                }`}
              >
                <span>📷</span> 스크린샷
              </button>
              <button
                type="button"
                onClick={() => setInputMethod('file')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  inputMethod === 'file'
                    ? 'bg-violet-500 text-white shadow-lg'
                    : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-white text-slate-600 hover:bg-violet-50 border border-slate-200'
                }`}
              >
                <span>📄</span> 파일
              </button>
            </div>

            {/* 스타일 이름 입력 */}
            <input
              type="text"
              value={styleName}
              onChange={(e) => setStyleName(e.target.value)}
              placeholder={styleNamePlaceholder}
              className={`w-full p-3 rounded-xl text-sm font-medium mb-3 outline-none transition-all ${
                darkMode
                  ? 'bg-slate-700 border border-slate-600 text-slate-200 placeholder-slate-400 focus:border-violet-500'
                  : 'bg-white border border-slate-200 text-slate-700 placeholder-slate-400 focus:border-violet-500'
              }`}
            />

            {/* 입력 방식별 UI */}
            {inputMethod === 'text' && (
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={contentExample}
                className={`w-full p-4 rounded-xl text-sm font-medium outline-none resize-none transition-all ${
                  darkMode
                    ? 'bg-slate-700 border border-slate-600 text-slate-200 placeholder-slate-400 focus:border-violet-500'
                    : 'bg-white border border-slate-200 text-slate-700 placeholder-slate-400 focus:border-violet-500'
                }`}
                rows={6}
              />
            )}

            {inputMethod === 'image' && (
              <div className="space-y-3">
                <div
                  onClick={() => imageInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    darkMode
                      ? 'border-slate-600 hover:border-violet-500 hover:bg-slate-700'
                      : 'border-slate-300 hover:border-violet-400 hover:bg-violet-50'
                  }`}
                >
                  <span className="text-4xl mb-2 block">📷</span>
                  <p className={`text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    스크린샷 이미지 업로드
                  </p>
                  <p className={`text-[11px] mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    PNG, JPG, WEBP 지원 • {isPress ? '보도자료' : '블로그'} 캡쳐 이미지에서 텍스트 추출
                  </p>
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                
                {/* 추출된 텍스트 표시 */}
                {extractedText && (
                  <div className={`p-3 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-green-50 border border-green-200'}`}>
                    <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                      ✅ 추출된 텍스트:
                    </p>
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      className={`w-full p-2 rounded-lg text-sm resize-none ${
                        darkMode ? 'bg-slate-600 text-slate-200' : 'bg-white text-slate-700'
                      }`}
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
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    darkMode
                      ? 'border-slate-600 hover:border-violet-500 hover:bg-slate-700'
                      : 'border-slate-300 hover:border-violet-400 hover:bg-violet-50'
                  }`}
                >
                  <span className="text-4xl mb-2 block">📄</span>
                  <p className={`text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    워드/PDF 파일 업로드
                  </p>
                  <p className={`text-[11px] mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    .docx, .pdf, .txt 지원
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.pdf,.txt,.doc"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                {/* 추출된 텍스트 표시 */}
                {extractedText && (
                  <div className={`p-3 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-green-50 border border-green-200'}`}>
                    <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                      ✅ 추출된 텍스트:
                    </p>
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      className={`w-full p-2 rounded-lg text-sm resize-none ${
                        darkMode ? 'bg-slate-600 text-slate-200' : 'bg-white text-slate-700'
                      }`}
                      rows={4}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 에러 메시지 */}
            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-600 font-medium">❌ {error}</p>
              </div>
            )}

            {/* 분석 진행 상태 */}
            {isAnalyzing && (
              <div className={`mt-3 p-3 rounded-xl flex items-center gap-3 ${
                darkMode ? 'bg-violet-900' : 'bg-violet-100'
              }`}>
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                <p className={`text-sm font-medium ${darkMode ? 'text-violet-300' : 'text-violet-600'}`}>
                  {analyzeProgress}
                </p>
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
                  : 'bg-violet-500 text-white hover:bg-violet-600 shadow-lg shadow-violet-200 active:scale-98'
              }`}
            >
              {isAnalyzing ? '분석 중...' : `🎓 이 ${isPress ? '문체' : '말투'} 학습하기`}
            </button>

            {/* 안내 문구 */}
            <p className={`text-[10px] mt-3 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              💡 300자 이상의 텍스트를 입력하면 더 정확하게 학습됩니다
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WritingStyleLearner;
