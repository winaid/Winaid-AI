/**
 * 의료광고법 크롤링 및 캐시 관리 시스템
 * - 하루 1회 자동 크롤링
 * - Supabase에 캐시 저장
 * - 첫 글 작성 시 자동 업데이트
 */

import { supabase } from '../lib/supabase';

// ============================================
// 1. 인터페이스 정의
// ============================================

export interface MedicalLawProhibition {
  category: 'guarantee' | 'comparison' | 'exaggeration' | 'urgency' | 'medical_law' | 'treatment_experience' | 'false_info' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  examples: string[];
  legalBasis: string;
}

export interface MedicalLawCache {
  id: string;
  source_url: string;
  last_crawled_at: string;
  prohibitions: MedicalLawProhibition[];
  summary: string | null;
  raw_content: string | null;
  version: number;
  is_active: boolean;
}

// ============================================
// 2. 캐시 확인 및 가져오기
// ============================================

/**
 * 최신 의료광고법 캐시 가져오기
 * - 24시간 이내 데이터면 캐시 사용
 * - 24시간 지났으면 크롤링 후 업데이트
 */
export async function getMedicalLawRules(): Promise<MedicalLawProhibition[]> {
  try {
    console.log('🏥 의료광고법 규칙 로드 중...');
    
    // 1. 최신 활성 캐시 조회
    const { data: cache, error } = await (supabase
      .from('medical_law_cache') as any)
      .select('*')
      .eq('is_active', true)
      .order('last_crawled_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('❌ 캐시 조회 실패:', error);
      return getDefaultRules();
    }
    
    // 2. 캐시가 없거나 24시간 지났으면 크롤링
    const now = new Date();
    const lastCrawled = cache ? new Date(cache.last_crawled_at) : null;
    const hoursSinceLastCrawl = lastCrawled 
      ? (now.getTime() - lastCrawled.getTime()) / (1000 * 60 * 60)
      : 999;
    
    if (!cache || hoursSinceLastCrawl >= 24) {
      console.log('⏰ 캐시가 오래됨 (또는 없음). 크롤링 시작...');
      await crawlAndUpdateMedicalLaw();
      
      // 업데이트 후 다시 조회
      const { data: newCache } = await (supabase
        .from('medical_law_cache') as any)
        .select('*')
        .eq('is_active', true)
        .order('last_crawled_at', { ascending: false })
        .limit(1)
        .single();
      
      if (newCache) {
        console.log('✅ 새로운 캐시 로드 완료');
        return newCache.prohibitions || getDefaultRules();
      }
    }
    
    console.log(`✅ 캐시 사용 (마지막 업데이트: ${hoursSinceLastCrawl.toFixed(1)}시간 전)`);
    return cache?.prohibitions || getDefaultRules();
    
  } catch (error) {
    console.error('❌ 의료광고법 규칙 로드 실패:', error);
    return getDefaultRules();
  }
}

// ============================================
// 3. 크롤링 및 업데이트
// ============================================

/**
 * 의료광고법 크롤링 및 Supabase 업데이트
 */
async function crawlAndUpdateMedicalLaw(): Promise<void> {
  try {
    console.log('🔍 의료광고법 크롤링 시작...');
    
    // 법제처 국가법령정보센터 크롤링
    const lawUrl = 'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=230993#0000';
    
    const response = await fetch('/api/medical-law/fetch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: lawUrl })
    });
    
    if (!response.ok) {
      console.warn('⚠️ 크롤링 실패, 기본 규칙 사용');
      await saveDefaultRulesToCache();
      return;
    }
    
    const data: any = await response.json();
    
    // 기존 활성 캐시 비활성화
    await (supabase
      .from('medical_law_cache') as any)
      .update({ is_active: false })
      .eq('is_active', true);

    // 새 캐시 저장
    const { error: insertError } = await (supabase
      .from('medical_law_cache') as any)
      .insert({
        source_url: lawUrl,
        last_crawled_at: new Date().toISOString(),
        prohibitions: data.prohibitions || getDefaultRules(),
        summary: data.summary || '의료광고법 제56조에 따른 금지사항',
        raw_content: data.rawContent?.substring(0, 10000) || null,
        version: 1,
        is_active: true
      });
    
    if (insertError) {
      console.error('❌ 캐시 저장 실패:', insertError);
      await saveDefaultRulesToCache();
      return;
    }
    
    console.log('✅ 의료광고법 크롤링 및 저장 완료');
    
  } catch (error) {
    console.error('❌ 크롤링 실패:', error);
    await saveDefaultRulesToCache();
  }
}

/**
 * 기본 규칙을 캐시에 저장
 */
async function saveDefaultRulesToCache(): Promise<void> {
  try {
    // 기존 활성 캐시 비활성화
    await (supabase
      .from('medical_law_cache') as any)
      .update({ is_active: false })
      .eq('is_active', true);

    // 기본 규칙 저장
    await (supabase
      .from('medical_law_cache') as any)
      .insert({
        source_url: 'default',
        last_crawled_at: new Date().toISOString(),
        prohibitions: getDefaultRules(),
        summary: '의료광고법 제56조에 따른 기본 금지사항',
        version: 1,
        is_active: true
      });
    
    console.log('✅ 기본 규칙 캐시 저장 완료');
  } catch (error) {
    console.error('❌ 기본 규칙 저장 실패:', error);
  }
}

// ============================================
// 4. 기본 규칙 (Fallback)
// ============================================

/**
 * 기본 의료광고법 규칙 (크롤링 실패 시 사용)
 */
function getDefaultRules(): MedicalLawProhibition[] {
  return [
    {
      category: 'guarantee',
      severity: 'critical',
      description: '치료 효과 보장 금지',
      examples: ['완치', '100%', '확실히 치료', '반드시 낫', '완전히 제거', '영구적 효과'],
      legalBasis: '의료법 제56조 제2항'
    },
    {
      category: 'comparison',
      severity: 'high',
      description: '비교 광고 금지',
      examples: ['최고', '1위', '최상', '최고급', '타 병원', '다른 병원보다', '어디보다'],
      legalBasis: '의료법 제56조 제2항 제4호'
    },
    {
      category: 'exaggeration',
      severity: 'critical',
      description: '과장 광고 금지',
      examples: ['기적의', '특효약', '획기적', '혁신적', '전문가', '명의', '베테랑'],
      legalBasis: '의료법 제56조 제2항 제8호'
    },
    {
      category: 'urgency',
      severity: 'medium',
      description: '긴급성 과장 및 공포 조장 금지',
      examples: ['골든타임', '즉시', '지금 당장', '서둘러', '놓치면 후회', '위험합니다', '방치하면'],
      legalBasis: '의료법 제56조'
    },
    {
      category: 'medical_law',
      severity: 'critical',
      description: '의료법 위반 표현',
      examples: ['의심', '진단', '판단', '환자', '환자분'],
      legalBasis: '의료법 제27조'
    },
    {
      category: 'treatment_experience',
      severity: 'critical',
      description: '환자 치료경험담 금지',
      examples: ['환자 후기', '치료 사례', 'Before & After', '체험담', '실제 사례'],
      legalBasis: '의료법 제56조 제2항 제2호'
    }
  ];
}

// ============================================
// 5. 유틸리티 함수
// ============================================

/**
 * 수동으로 캐시 갱신 (관리자용)
 */
export async function forceUpdateMedicalLaw(): Promise<boolean> {
  try {
    console.log('🔄 수동 캐시 갱신 시작...');
    await crawlAndUpdateMedicalLaw();
    return true;
  } catch (error) {
    console.error('❌ 수동 갱신 실패:', error);
    return false;
  }
}

/**
 * 캐시 상태 확인
 */
export async function checkCacheStatus(): Promise<{
  hasCache: boolean;
  lastUpdate: string | null;
  hoursAgo: number | null;
  isExpired: boolean;
}> {
  try {
    const { data: cache } = await (supabase
      .from('medical_law_cache') as any)
      .select('last_crawled_at')
      .eq('is_active', true)
      .order('last_crawled_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!cache) {
      return { hasCache: false, lastUpdate: null, hoursAgo: null, isExpired: true };
    }
    
    const lastUpdate = cache.last_crawled_at;
    const hoursAgo = (new Date().getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60);
    const isExpired = hoursAgo >= 24;
    
    return { hasCache: true, lastUpdate, hoursAgo, isExpired };
  } catch (error) {
    console.error('❌ 캐시 상태 확인 실패:', error);
    return { hasCache: false, lastUpdate: null, hoursAgo: null, isExpired: true };
  }
}
