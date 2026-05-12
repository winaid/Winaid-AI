/**
 * PSI 결과 24h 캐시 — 같은 URL 반복 진단 시 33s+ 절약.
 * (next-app/lib/diagnostic/psiCache.ts 와 동일)
 */

import { supabaseAdmin } from '@winaid/blog-core';
import { fetchPsi } from './psi';
import type { PsiResult } from './types';

const PSI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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
  if (!supabaseAdmin) return await fetchPsi(url);

  let urlHash = '';
  try {
    urlHash = await sha256Hex(url);
  } catch {
    return await fetchPsi(url);
  }

  try {
    const cutoff = new Date(Date.now() - PSI_CACHE_TTL_MS).toISOString();
    const { data: cached } = await supabaseAdmin
      .from('diagnostic_psi_cache')
      .select('score, fcp, lcp, cls, tbt, created_at')
      .eq('url_hash', urlHash)
      .gt('created_at', cutoff)
      .maybeSingle<CachedRow>();
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
    console.warn(`[psiCache] 조회 실패 (skip): ${(e as Error).message.slice(0, 100)}`);
  }

  const result = await fetchPsi(url);

  if (result) {
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
        if (error) console.warn(`[psiCache] upsert 실패: ${error.message.slice(0, 100)}`);
      } catch (e) {
        console.warn(`[psiCache] upsert throw: ${(e as Error).message.slice(0, 100)}`);
      }
    })();
  }

  return result;
}
