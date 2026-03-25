'use client';

import { useState, useCallback } from 'react';
import { TEAM_DATA } from '../../../lib/teamData';
import { buildCardNewsPrompt, type CardNewsRequest } from '../../../lib/cardNewsPrompt';
import { savePost } from '../../../lib/postStorage';
import { getSessionSafe, supabase } from '../../../lib/supabase';
import { getHospitalStylePrompt } from '../../../lib/styleService';
import { CARD_NEWS_DESIGN_TEMPLATES } from '../../../lib/cardNewsDesignTemplates';
import { ErrorPanel } from '../../../components/GenerationResult';
import type { WritingStyle, CardNewsDesignTemplateId } from '../../../lib/types';

interface CardSlide {
  index: number;
  role: string;
  title: string;
  body: string;
  imagePrompt: string;
  imageUrl: string | null;
}

const WRITING_STYLE_OPTIONS: { value: WritingStyle; label: string }[] = [
  { value: 'empathy', label: '공감형' },
  { value: 'expert', label: '전문가형' },
  { value: 'conversion', label: '전환유도형' },
];

const IMAGE_STYLE_OPTIONS = [
  { id: 'photo', icon: '📸', label: '실사' },
  { id: 'illustration', icon: '🎨', label: '일러스트' },
  { id: 'medical', icon: '🫀', label: '의학 3D' },
] as const;

type ImageStyleType = typeof IMAGE_STYLE_OPTIONS[number]['id'];

export default function CardNewsPage() {
  // ── 폼 상태 ──
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [showHospitalPicker, setShowHospitalPicker] = useState(false);
  const [slideCount, setSlideCount] = useState(6);
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('empathy');
  const [designTemplateId, setDesignTemplateId] = useState<CardNewsDesignTemplateId | undefined>(undefined);
  const [imageStyle, setImageStyle] = useState<ImageStyleType>('illustration');

  // ── 생성 상태 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [cards, setCards] = useState<CardSlide[]>([]);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [regeneratingCard, setRegeneratingCard] = useState<number | null>(null);

  // ── 이미지 생성 헬퍼 ──
  const generateCardImage = async (prompt: string, index: number): Promise<string | null> => {
    try {
      const styleMap: Record<ImageStyleType, string> = {
        photo: '실사 DSLR 사진, 자연스러운 조명, 의료/건강 환경',
        illustration: '3D 렌더 일러스트, Blender 스타일, 파스텔 색상, 깔끔한 배경',
        medical: '의학 3D 일러스트, 해부학적 렌더링, 임상 조명',
      };
      const fullPrompt = `${prompt}. 스타일: ${styleMap[imageStyle]}. 정사각형(1:1). 텍스트/글자/라벨 절대 금지. 시각적 장면만.`;

      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt, aspectRatio: '1:1', mode: 'card_news' }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { imageDataUrl?: string };
      if (!data.imageDataUrl) return null;

      // Supabase Storage 업로드
      if (supabase) {
        try {
          const dataUrl = data.imageDataUrl;
          const commaIdx = dataUrl.indexOf(',');
          const base64Data = dataUrl.substring(commaIdx + 1);
          const mimeType = dataUrl.substring(0, commaIdx).match(/data:(.*?);base64/)?.[1] || 'image/png';
          const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
          const byteChars = atob(base64Data);
          const byteArray = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
          const blob = new Blob([byteArray], { type: mimeType });
          const fileName = `card-news/${Date.now()}_${index}.${ext}`;
          const { error: uploadErr } = await supabase.storage.from('blog-images').upload(fileName, blob, { contentType: mimeType, upsert: false });
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(fileName);
            if (urlData?.publicUrl) return urlData.publicUrl;
          }
        } catch { /* fallback to base64 */ }
      }
      return data.imageDataUrl;
    } catch {
      return null;
    }
  };

  // ── 메인 생성 ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    const request: CardNewsRequest = {
      topic: topic.trim(),
      keywords: keywords.trim() || undefined,
      hospitalName: hospitalName || undefined,
      slideCount,
      writingStyle,
      designTemplateId,
    };

    setIsGenerating(true);
    setError(null);
    setCards([]);
    setSaveStatus(null);
    setProgress('슬라이드 원고 작성 중...');

    try {
      // Stage 1: 텍스트 원고 생성
      const { systemInstruction, prompt } = buildCardNewsPrompt(request);
      let finalPrompt = prompt;
      // 말투 주입
      if (hospitalName) {
        try {
          const stylePrompt = await getHospitalStylePrompt(hospitalName);
          if (stylePrompt) finalPrompt += `\n\n[병원 말투 적용]\n${stylePrompt}`;
        } catch { /* ignore */ }
      }
      // 이미지 프롬프트도 같이 요청
      finalPrompt += `\n\n## 이미지 프롬프트\n각 슬라이드에 어울리는 이미지 프롬프트를 작성하세요.\n형식: 각 슬라이드 아래에 **이미지**: (영어 프롬프트) 추가\n- 텍스트/글자/라벨 절대 금지\n- 시각적 장면만 묘사 (인물, 공간, 사물)`;

      console.info(`[CARD] ========== 카드뉴스 생성 시작 ==========`);
      console.info(`[CARD] 주제="${topic}" 슬라이드=${slideCount}장 스타일=${writingStyle} 템플릿=${designTemplateId || 'auto'}`);

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          systemInstruction,
          model: 'gemini-3.1-pro-preview',
          temperature: 0.85,
          maxOutputTokens: 8192,
        }),
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        setError(data.error || `서버 오류 (${res.status})`);
        return;
      }

      console.info(`[CARD] 원고 생성 완료 — ${data.text.length}자`);

      // Stage 2: 파싱 — 슬라이드별 분리
      const parsedCards: CardSlide[] = [];
      const slideBlocks = data.text.split(/###\s*(\d+)장[:\s]*/);

      for (let i = 1; i < slideBlocks.length; i += 2) {
        const num = parseInt(slideBlocks[i], 10);
        const block = slideBlocks[i + 1] || '';
        const roleMatch = block.match(/^(.+?)[\n\r]/);
        const titleMatch = block.match(/\*\*제목\*\*[:\s]*(.+)/m) || block.match(/\*\*메인.*?\*\*[:\s]*(.+)/m);
        const bodyMatch = block.match(/\*\*본문\*\*[:\s]*([\s\S]*?)(?=\*\*|$)/m) || block.match(/\*\*부제\*\*[:\s]*(.+)/m);
        const imgMatch = block.match(/\*\*이미지\*\*[:\s]*(.+)/m);

        parsedCards.push({
          index: num,
          role: roleMatch?.[1]?.replace(/\*\*/g, '').trim() || `${num}장`,
          title: titleMatch?.[1]?.trim() || `슬라이드 ${num}`,
          body: bodyMatch?.[1]?.trim() || '',
          imagePrompt: imgMatch?.[1]?.trim() || `medical health ${topic} slide ${num}`,
          imageUrl: null,
        });
      }

      // 파싱 실패 시 단순 분할
      if (parsedCards.length === 0) {
        for (let i = 0; i < slideCount; i++) {
          parsedCards.push({
            index: i + 1,
            role: i === 0 ? '표지' : i === slideCount - 1 ? '마무리' : `본문 ${i}`,
            title: `슬라이드 ${i + 1}`,
            body: '',
            imagePrompt: `medical health ${topic} slide ${i + 1}`,
            imageUrl: null,
          });
        }
      }

      setCards(parsedCards);
      console.info(`[CARD] 파싱 완료 — ${parsedCards.length}장`);

      // Stage 3: 이미지 병렬 생성
      setProgress(`이미지 생성 중... (0/${parsedCards.length}장)`);
      let completed = 0;

      const imageResults = await Promise.all(
        parsedCards.map(async (card) => {
          const url = await generateCardImage(card.imagePrompt, card.index);
          completed++;
          setProgress(`이미지 생성 중... (${completed}/${parsedCards.length}장)`);
          return { index: card.index, url };
        }),
      );

      // 이미지 URL 매핑
      const finalCards = parsedCards.map(card => {
        const result = imageResults.find(r => r.index === card.index);
        return { ...card, imageUrl: result?.url || null };
      });
      setCards(finalCards);

      const successCount = finalCards.filter(c => c.imageUrl).length;
      console.info(`[CARD] 이미지 생성 완료 — ${successCount}/${finalCards.length}장 성공`);
      setProgress('');

      // 저장
      try {
        const { userId, userEmail } = await getSessionSafe();
        await savePost({
          userId,
          userEmail,
          hospitalName: hospitalName || undefined,
          postType: 'card_news',
          title: finalCards[0]?.title || topic,
          content: data.text,
          topic: topic.trim(),
          keywords: keywords.trim() ? keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
        });
        setSaveStatus('저장 완료');
      } catch {
        setSaveStatus('저장 실패');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  // ── 개별 카드 이미지 재생성 ──
  const handleCardRegenerate = useCallback(async (cardIndex: number) => {
    const card = cards.find(c => c.index === cardIndex);
    if (!card) return;

    const newPrompt = window.prompt('이미지 프롬프트를 수정하세요:', card.imagePrompt);
    if (!newPrompt) return;

    setRegeneratingCard(cardIndex);
    const url = await generateCardImage(newPrompt, cardIndex);
    setCards(prev => prev.map(c =>
      c.index === cardIndex ? { ...c, imageUrl: url, imagePrompt: newPrompt } : c
    ));
    setRegeneratingCard(null);
  }, [cards, imageStyle]);

  // ── 개별 카드 다운로드 ──
  const handleCardDownload = (card: CardSlide) => {
    if (!card.imageUrl) return;
    const a = document.createElement('a');
    a.href = card.imageUrl;
    a.download = `card_${card.index}.png`;
    a.click();
  };

  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-400 transition-all";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5";

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-start p-5">
      {/* ── 입력 폼 ── */}
      <div className="w-full lg:w-[340px] xl:w-[380px] lg:flex-none">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎨</span>
            <h2 className="text-base font-bold text-slate-800">카드뉴스 생성</h2>
          </div>

          {/* 병원 선택 */}
          <div>
            <label className={labelCls}>병원 선택 (선택)</label>
            <div className="relative">
              <input
                type="text"
                value={hospitalName}
                onChange={e => setHospitalName(e.target.value)}
                onFocus={() => setShowHospitalPicker(true)}
                placeholder="병원명 입력 또는 선택"
                className={inputCls}
              />
              {showHospitalPicker && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowHospitalPicker(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-64 overflow-y-auto">
                    {TEAM_DATA.map(team => (
                      <div key={team.id}>
                        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 sticky top-0">{team.label}</div>
                        {team.hospitals.map(h => (
                          <button key={`${team.id}-${h.name}`} type="button"
                            onClick={() => { setHospitalName(h.name); setShowHospitalPicker(false); }}
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-pink-50 hover:text-pink-700 transition-colors"
                          >
                            {h.name}<span className="text-[11px] text-slate-400 ml-2">{h.manager}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 주제 */}
          <div>
            <label className={labelCls}>주제 *</label>
            <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="예: 스케일링 후 주의사항" required className={inputCls} />
          </div>

          {/* 키워드 */}
          <div>
            <label className={labelCls}>키워드 (쉼표 구분)</label>
            <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="예: 스케일링, 잇몸, 관리" className={inputCls} />
          </div>

          {/* 디자인 템플릿 */}
          <div>
            <label className={labelCls}>디자인 템플릿</label>
            <div className="grid grid-cols-5 gap-1.5">
              {CARD_NEWS_DESIGN_TEMPLATES.map(tmpl => (
                <button key={tmpl.id} type="button"
                  onClick={() => setDesignTemplateId(designTemplateId === tmpl.id ? undefined : tmpl.id)}
                  className={`relative flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition-all ${designTemplateId === tmpl.id ? 'border-pink-500 bg-pink-50 shadow-md shadow-pink-500/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  {designTemplateId === tmpl.id && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-pink-500 rounded-full flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </span>
                  )}
                  <div className="w-full aspect-square rounded-lg overflow-hidden" dangerouslySetInnerHTML={{ __html: tmpl.previewSvg }} />
                  <span className="text-[9px] font-semibold text-slate-600 leading-tight text-center">{tmpl.name}</span>
                </button>
              ))}
            </div>
            {designTemplateId ? (
              <div className="mt-2 px-2.5 py-1.5 bg-pink-50 rounded-lg border border-pink-200">
                <p className="text-[10px] text-pink-700 font-medium">
                  {CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId)?.icon}{' '}
                  {CARD_NEWS_DESIGN_TEMPLATES.find(t => t.id === designTemplateId)?.description}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-slate-400">선택하지 않으면 AI가 자동으로 디자인합니다.</p>
            )}
          </div>

          {/* 슬라이드 수 */}
          <div>
            <label className={labelCls}>슬라이드 수: {slideCount}장</label>
            <input type="range" min={4} max={7} step={1} value={slideCount} onChange={e => setSlideCount(Number(e.target.value))} className="w-full accent-pink-600" />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>4장</span><span>7장</span></div>
          </div>

          {/* 이미지 스타일 */}
          <div>
            <label className={labelCls}>이미지 스타일</label>
            <div className="flex gap-1.5">
              {IMAGE_STYLE_OPTIONS.map(s => (
                <button key={s.id} type="button" onClick={() => setImageStyle(s.id)}
                  className={`flex-1 py-2 rounded-lg border transition-all flex flex-col items-center gap-0.5 ${imageStyle === s.id ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                >
                  <span className="text-base">{s.icon}</span>
                  <span className="text-[10px] font-semibold">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 글 스타일 */}
          <div>
            <label className={labelCls}>글 스타일</label>
            <div className="flex gap-1.5">
              {WRITING_STYLE_OPTIONS.map(ws => (
                <button key={ws.value} type="button" onClick={() => setWritingStyle(ws.value)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${writingStyle === ws.value ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >{ws.label}</button>
              ))}
            </div>
          </div>

          {/* 생성 버튼 */}
          <button type="submit" disabled={isGenerating || !topic.trim()}
            className="w-full py-3 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>생성 중...</>
            ) : '카드뉴스 생성하기'}
          </button>
        </form>
      </div>

      {/* ── 결과 영역 ── */}
      <div className="flex-1 min-w-0">
        {isGenerating ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-[480px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-pink-50 text-pink-600 border border-pink-100">
              <span>🎨</span><span>카드뉴스 생성 중</span>
            </div>
            <div className="relative mb-6">
              <div className="w-14 h-14 border-[3px] border-pink-100 border-t-pink-500 rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-slate-700 mb-2">{progress || `${slideCount}장 분량의 카드뉴스를 만들고 있어요`}</p>
            <p className="text-xs text-slate-400">원고 작성 → 이미지 생성 순서로 진행됩니다</p>
          </div>
        ) : error ? (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        ) : cards.length > 0 ? (
          <div className="space-y-4">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">카드뉴스 · {cards.length}장</span>
                {saveStatus && <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{saveStatus}</span>}
              </div>
            </div>

            {/* 카드 그리드 */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map(card => (
                <div key={card.index} className="group relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* 카드 번호 배지 */}
                  <div className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-black/60 text-white text-[10px] font-bold flex items-center justify-center">
                    {card.index}
                  </div>

                  {/* 이미지 */}
                  <div className="aspect-square bg-slate-100 relative">
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={`카드 ${card.index}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
                      </div>
                    )}

                    {/* 재생성 중 오버레이 */}
                    {regeneratingCard === card.index && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <div className="w-8 h-8 border-3 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
                      </div>
                    )}

                    {/* 호버 액션 버튼 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button onClick={() => handleCardRegenerate(card.index)} disabled={regeneratingCard !== null}
                        className="px-3 py-1.5 bg-white rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-lg"
                      >🔄 재생성</button>
                      {card.imageUrl && (
                        <button onClick={() => handleCardDownload(card)}
                          className="px-3 py-1.5 bg-white rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-lg"
                        >💾 저장</button>
                      )}
                    </div>
                  </div>

                  {/* 텍스트 */}
                  <div className="p-3">
                    <p className="text-[10px] text-pink-500 font-semibold mb-0.5">{card.role}</p>
                    <p className="text-xs font-bold text-slate-800 mb-1 line-clamp-2">{card.title}</p>
                    {card.body && <p className="text-[11px] text-slate-500 line-clamp-3">{card.body}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* EmptyState */
          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] flex-1 min-h-[520px] overflow-hidden flex flex-col">
            <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              {[4, 5, 6, 7].map(n => (
                <div key={n} className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-slate-300">{n}</div>
              ))}
              <div className="w-px h-4 mx-1 bg-slate-200" />
              <div className="text-[10px] text-slate-300 font-medium">slides</div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center px-12 py-16 select-none">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-100">
                <svg className="w-7 h-7 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
              </div>
              <div className="max-w-sm text-center">
                <h2 className="text-3xl font-black tracking-tight leading-tight mb-3 text-slate-800">
                  AI가 만드는<br /><span className="text-pink-600">카드뉴스</span>
                </h2>
                <p className="text-sm leading-relaxed text-slate-400">주제 하나로 슬라이드별 원고 + 이미지를<br />자동 생성합니다</p>
              </div>
              <div className="mt-8 flex flex-col items-center gap-2">
                {['슬라이드별 역할 자동 배분', '카드별 이미지 자동 생성', '3초 임팩트 카피라이팅', '의료광고법 준수'].map(text => (
                  <div key={text} className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs text-slate-400">
                    <span className="text-[10px] text-pink-400">✦</span>{text}
                  </div>
                ))}
              </div>
              <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-pink-50 text-pink-500 border border-pink-100">
                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse" />AI 대기 중
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
