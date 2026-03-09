import React, { useState, useEffect } from 'react';
import {
  MEDICAL_LAW_SOURCES,
  fetchMedicalLawInfo,
  checkMedicalLawUpdates,
  getCachedMedicalLawInfo,
  cacheMedicalLawInfo,
  searchMedicalLaw,
  updateForbiddenWordsDatabase,
  type MedicalLawInfo,
  type ProhibitionRule
} from '../services/medicalLawService';
import { toast } from './Toast';

export function MedicalLawSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [medicalLawInfo, setMedicalLawInfo] = useState<MedicalLawInfo | null>(null);
  const [searchResults, setSearchResults] = useState<ProhibitionRule[]>([]);
  const [hasUpdates, setHasUpdates] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);

  // 캐시된 정보 로드
  useEffect(() => {
    const cached = getCachedMedicalLawInfo();
    if (cached) {
      setMedicalLawInfo(cached);
    }
  }, []);

  // 최신 업데이트 확인 (에러 처리 추가)
  useEffect(() => {
    checkMedicalLawUpdates()
      .then(result => {
        setHasUpdates(result.hasUpdates);
        setUpdateInfo(result);
      })
      .catch(error => {
        // 에러 무시 (API 없어도 정상 동작)
        console.debug('의료광고법 업데이트 확인 API 없음 (정상)');
        setHasUpdates(false);
        setUpdateInfo(null);
      });
  }, []);

  // 의료광고법 정보 가져오기
  const handleFetchLaw = async (sourceUrl: string) => {
    setLoading(true);
    try {
      const info = await fetchMedicalLawInfo(sourceUrl);
      if (info) {
        setMedicalLawInfo(info);
        cacheMedicalLawInfo(info);
        toast.success('의료광고법 정보를 성공적으로 가져왔습니다.');
      } else {
        toast.error('의료광고법 정보를 가져오는데 실패했습니다.');
      }
    } catch (error) {
      console.error('의료광고법 정보 가져오기 실패:', error);
      toast.error('오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 검색
  const handleSearch = () => {
    if (!medicalLawInfo || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const results = searchMedicalLaw(searchQuery, medicalLawInfo);
    setSearchResults(results);
  };

  // 금지어 데이터베이스 업데이트
  const handleUpdateDatabase = async () => {
    setLoading(true);
    try {
      const result = await updateForbiddenWordsDatabase();
      if (result.success) {
        toast.success(`금지어 데이터베이스 업데이트 완료! 새 금지어: ${result.newWords}개`);
      } else {
        toast.error('업데이트 실패');
      }
    } catch (error) {
      console.error('데이터베이스 업데이트 실패:', error);
      toast.error('오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="medical-law-search">
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-6 bg-red-600 hover:bg-red-700 text-white p-4 rounded-full shadow-lg z-50 transition-all"
        title="의료광고법 검색"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {hasUpdates && (
          <span className="absolute -top-1 -right-1 bg-yellow-500 text-xs text-white rounded-full w-5 h-5 flex items-center justify-center">
            !
          </span>
        )}
      </button>

      {/* 검색 패널 */}
      {isOpen && (
        <div className="fixed bottom-40 right-6 w-96 bg-white rounded-lg shadow-2xl z-50 max-h-[600px] overflow-y-auto">
          <div className="p-6">
            {/* 헤더 */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <span>⚖️</span>
                의료광고법 검색
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* 최신 업데이트 알림 */}
            {hasUpdates && updateInfo?.latestUpdate && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-yellow-800">
                    📰 보건복지부 보도자료
                  </p>
                  <span className="text-[10px] text-gray-400">
                    게시일 {updateInfo.latestUpdate.date}
                  </span>
                </div>
                <p className="text-xs text-yellow-700 mb-2">
                  {updateInfo.latestUpdate.title}
                </p>
                <a
                  href={updateInfo.latestUpdate.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  자세히 보기 →
                </a>
                {updateInfo.recentNews?.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-yellow-200 space-y-1">
                    {updateInfo.recentNews.slice(1, 4).map((item: any, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">{item.date}</span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-600 hover:text-blue-600 hover:underline line-clamp-1"
                        >
                          {item.title}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 공식 소스 버튼 */}
            <div className="mb-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">
                공식 정보 소스
              </p>
              <div className="space-y-2">
                {MEDICAL_LAW_SOURCES.map((source, index) => (
                  <button
                    key={index}
                    onClick={() => handleFetchLaw(source.url)}
                    disabled={loading}
                    className="w-full text-left p-2 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 text-sm transition-colors disabled:opacity-50"
                  >
                    <span className="font-medium text-blue-900">{source.name}</span>
                    <span className="ml-2 text-xs text-blue-600">
                      {source.type === 'law' ? '법령' : '가이드라인'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 검색 바 */}
            {medicalLawInfo && (
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="금지사항 검색... (예: 치료경험담)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleSearch}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                  >
                    검색
                  </button>
                </div>
              </div>
            )}

            {/* 검색 결과 */}
            {searchResults.length > 0 && (
              <div className="mb-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700">
                  검색 결과 ({searchResults.length}개)
                </p>
                {searchResults.map((rule, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        rule.severity === 'critical' ? 'bg-red-100 text-red-800' :
                        rule.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                        rule.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {rule.severity === 'critical' ? '중대' :
                         rule.severity === 'high' ? '높음' :
                         rule.severity === 'medium' ? '중간' : '낮음'}
                      </span>
                      <span className="text-xs text-gray-500">{rule.legalBasis}</span>
                    </div>
                    <p className="text-sm text-gray-800 mb-2">{rule.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {rule.examples.map((ex, i) => (
                        <span key={i} className="text-xs bg-white px-2 py-1 rounded border border-gray-300">
                          {ex}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 의료광고법 정보 요약 */}
            {medicalLawInfo && searchResults.length === 0 && !searchQuery && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  📋 정보 요약
                </p>
                <p className="text-xs text-gray-600 mb-3">
                  {medicalLawInfo.summary}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>마지막 업데이트:</span>
                  <span>{new Date(medicalLawInfo.lastUpdated).toLocaleString('ko-KR')}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {medicalLawInfo.prohibitions.slice(0, 4).map((rule, index) => (
                    <div key={index} className="text-xs p-2 bg-white rounded border border-gray-200">
                      <span className={`font-medium ${
                        rule.severity === 'critical' ? 'text-red-600' :
                        rule.severity === 'high' ? 'text-orange-600' :
                        'text-yellow-600'
                      }`}>
                        {rule.category === 'treatment_experience' ? '치료경험담' :
                         rule.category === 'false_info' ? '허위정보' :
                         rule.category === 'comparison' ? '비교광고' :
                         rule.category === 'exaggeration' ? '과장광고' :
                         rule.category === 'guarantee' ? '보장표현' : '기타'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 금지어 DB 업데이트 버튼 */}
            {medicalLawInfo && (
              <button
                onClick={handleUpdateDatabase}
                disabled={loading}
                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? '업데이트 중...' : '💾 금지어 데이터베이스 업데이트'}
              </button>
            )}

            {/* 로딩 상태 */}
            {loading && (
              <div className="mt-4 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600 mt-2">처리 중...</p>
              </div>
            )}

            {/* 도움말 */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
              <p className="font-semibold mb-1">💡 사용 방법</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>공식 소스에서 최신 의료광고법 정보 가져오기</li>
                <li>키워드로 특정 금지사항 검색</li>
                <li>금지어 데이터베이스 자동 업데이트</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
