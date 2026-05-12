/**
 * PSI 결과 24h 캐시 — 같은 URL 반복 진단 시 33s+ 절약.
 *
 * 사용 패턴:
 *   1) fetchPsiCached(url) 호출
 *   2) 캐시 hit → 즉시 반환 (~10ms)
 *   3) 캐시 miss → fetchPsi(url) 호출 후 upsert
 *   4) 캐시/upsert 실패는 swallow — fetchPsi 단독 폴백
 *
 * 부하 보호:
 *   첫 SELECT 가 "relation does not exist" (42P01) 에러면 그 함수 인스턴스에서
 *   캐시 영구 비활성. SQL migration 적용 전 매 호출마다 실패한 SELECT 가 connection
 *   낭비하던 회귀 차단 (사용자 보고: Supabase 과부하 알림).
 */

import { supabaseAdmin } from '@winaid/blog-core';
import { fetchPsi } from './psi';
import type { PsiResult } from './types';

const PSI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// 모듈 스코프 disable 플래그 — 한 번 "table missing" 확인하면 더 이상 시도 안 함.
// Vercel function 인스턴스 lifetime 동안 유효. 새 instance 시작 시 다시 1회 확인.
let cacheDisabled = false;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface CachedRow {
  score: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  created_at: string;
}

export async function fetchPsiCached(url: string): Promise<PsiResult | null> {
  if (!supabaseAdmin || cacheDisabled) return await fetchPsi(url);

  let urlHash = '';
  try {
    urlHash = await sha256Hex(url);
  } catch {
    return await fetchPsi(url);
  }

  // 1) 캐시 조회
  try {
    const cutoff = new Date(Date.now() - PSI_CACHE_TTL_MS).toISOString();
    const { data: cached, error } = await supabaseAdmin
      .from('diagnostic_psi_cache')
      .select('score, fcp, lcp, cls, tbt, created_at')
      .eq('url_hash', urlHash)
      .gt('created_at', cutoff)
      .maybeSingle<CachedRow>();
    if (error) {
      // 42P01 = relation does not exist (테이블 미생성)
      if (error.code === '42P01' || /relation .* does not exist/i.test(error.message)) {
        cacheDisabled = true;
        console.warn('[psiCache] 테이블 미생성 — 캐시 비활성 (인스턴스 lifetime). SQL migration 적용 후 재배포 필요.');
        return await fetchPsi(url);
      }
      console.warn(`[psiCache] 조회 에러: ${error.message.slice(0, 100)}`);
    }
    if (cached) {
      console.info(`[psiCache] hit url_hash=${urlHash.slice(0, 8)} score=${cached.score}`);
      return {
        score: cached.score,
        fcp: cached.fcp,
        lcp: cached.lcp,
        cls: cached.cls,
        tbt: cached.tbt,
      };
    }
  } catch (e) {
    console.warn(`[psiCache] 조회 throw (skip): ${(e as Error).message.slice(0, 100)}`);
  }

  // 2) miss → 실제 PSI 호출
  const result = await fetchPsi(url);

  // 3) upsert (fire-and-forget — 응답 안 막음)
  if (result && !cacheDisabled) {
    void (async () => {
      try {
        const { error } = await supabaseAdmin
          .from('diagnostic_psi_cache')
          .upsert({
            url_hash: urlHash,
            url,
            score: result.score,
            fcp: result.fcp,
            lcp: result.lcp,
            cls: result.cls,
            tbt: result.tbt,
            created_at: new Date().toISOString(),
          }, { onConflict: 'url_hash' });
        if (error) {
          if (error.code === '42P01') {
            cacheDisabled = true;
          } else {
            console.warn(`[psiCache] upsert 실패: ${error.message.slice(0, 100)}`);
          }
        }
      } catch (e) {
        console.warn(`[psiCache] upsert throw: ${(e as Error).message.slice(0, 100)}`);
      }
    })();
  }

  return result;
}
