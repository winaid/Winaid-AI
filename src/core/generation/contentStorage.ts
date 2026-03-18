/**
 * contentStorage — 저장 레이어 어댑터
 *
 * 저장 계층을 3개로 분류한다:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Layer 1: Result Persistence (결과 저장)                      │
 *   │   대상: Cloudflare KV (saveArtifactToServer)                │
 *   │         Supabase generated_posts (persistGeneratedPost)     │
 *   │   시점: 생성 완료 직후, 비동기                                │
 *   │   목적: 생성 결과의 영구 보존                                 │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ Layer 2: History Persistence (이력 저장)                     │
 *   │   대상: Supabase blog_history (persistBlogHistory)          │
 *   │   시점: 생성 완료 직후, 비동기                                │
 *   │   목적: 유사도 검사용 이력, 임베딩 기반 중복 탐지              │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ Layer 3: Draft Persistence (임시저장)                        │
 *   │   대상: localStorage (hospitalai_autosave)                   │
 *   │   시점: 편집 중 실시간                                       │
 *   │   목적: 브라우저 세션 유지, 편집 복구                          │
 *   │   담당: ResultPreview.tsx (이 파일 범위 밖)                   │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * 호출자(generateContentJob, useContentGeneration)는
 * 서비스 함수를 직접 import하지 않고 이 모듈의 함수만 사용한다.
 */

import type { ContentArtifact } from './contracts';
import type { SaveContentRequest, SaveContentResponse } from '../../services/apiService';
import type { GenerationRequest } from '../../types';
import { stripLargeBase64FromHtml } from '../../services/image/imageStorageService';

// ══════════════════════════════════════════════
// Layer 1: Result Persistence — 타입 + 어댑터
// ══════════════════════════════════════════════

/** API 서버(Cloudflare KV) 저장용 payload */
export type SaveContentPayload = SaveContentRequest;

/** 저장 완료 후 레코드 — 서버가 부여한 id 포함 */
export interface SaveContentRecord {
  id: string;
  title: string;
  postType: string;
  category: string;
  createdAt: string;
}

/**
 * ContentArtifact → SaveContentPayload 변환.
 * storageHtml 우선, 없으면 htmlContent에서 base64/blob strip.
 */
export function buildSavePayload(artifact: ContentArtifact): SaveContentPayload {
  const content = artifact.content;

  let contentForSave = content.storageHtml || '';
  if (!contentForSave) {
    // storageHtml 없으면 htmlContent에서 strip — 공용 함수 사용 (static import)
    contentForSave = stripLargeBase64FromHtml(content.htmlContent);
    console.warn('[STORAGE] storageHtml 없음 — htmlContent에서 공용 strip 적용 (SVG 보존)');
  }

  const storageKB = Math.round(contentForSave.length * 2 / 1024);
  if (storageKB > 500) {
    console.error(`[STORAGE] ⚠️ storage payload ${storageKB}KB — 비정상 크기! storageHtml 경로 점검 필요`);
  }

  return {
    title: artifact.title,
    content: contentForSave,
    category: artifact.category ?? '',
    postType: artifact.postType,
    metadata: {
      keywords: artifact.keywords,
      seoScore: artifact.seoTotal,
      aiSmellScore: artifact.aiSmellScore,
    },
  };
}

/**
 * [Layer 1] ContentArtifact → API 서버(Cloudflare KV) 저장.
 */
export async function saveArtifactToServer(
  artifact: ContentArtifact,
): Promise<SaveContentResponse> {
  const { saveContentToServer } = await import('../../services/apiService');
  const payload = buildSavePayload(artifact);

  const displayKB = Math.round(artifact.content.htmlContent.length * 2 / 1024);
  const storageKB = Math.round(payload.content.length * 2 / 1024);
  console.debug(`[STORAGE] saveArtifactToServer | display=${displayKB}KB | storage=${storageKB}KB`);

  return saveContentToServer(payload);
}

/**
 * [Layer 1] 생성 결과를 Supabase generated_posts에 저장.
 *
 * generateContentJob에서 직접 saveGeneratedPost를 호출하는 대신 이 함수를 사용한다.
 * 저장 의도(persist result)와 저장 구현(Supabase INSERT)을 분리.
 */
export async function persistGeneratedPost(
  request: GenerationRequest,
  opts: {
    postType: 'blog' | 'card_news' | 'press_release';
    title: string;
    contentHtml: string;
    slideCount?: number;
  },
): Promise<void> {
  const { saveGeneratedPost } = await import('../../services/postStorageService');

  const result = await saveGeneratedPost({
    hospitalName: request.hospitalName,
    category: request.category,
    doctorName: request.doctorName,
    doctorTitle: request.doctorTitle,
    postType: opts.postType,
    title: opts.title,
    content: opts.contentHtml,
    keywords: request.keywords?.split(',').map(k => k.trim()),
    topic: request.topic,
    imageStyle: request.imageStyle,
    slideCount: opts.slideCount,
  });

  if (result.success) {
    console.log(`✅ ${opts.postType} 저장 완료:`, result.postId);
  } else {
    console.warn(`⚠️ ${opts.postType} 저장 실패:`, result.error);
  }
}

// ══════════════════════════════════════════════
// Layer 2: History Persistence — 어댑터
// ══════════════════════════════════════════════

/**
 * [Layer 2] 블로그 이력을 Supabase blog_history에 저장.
 *
 * 유사도 검사용 이력 저장. generateContentJob에서 직접
 * saveBlogHistory를 호출하는 대신 이 함수를 사용한다.
 */
export async function persistBlogHistory(
  opts: {
    title: string;
    plainText: string;
    lightweightHtml: string;
    keywords: string[];
    naverUrl?: string;
    category?: string;
  },
): Promise<void> {
  const { saveBlogHistory } = await import('../../services/contentSimilarityService');

  await saveBlogHistory(
    opts.title,
    opts.plainText,
    opts.lightweightHtml,
    opts.keywords,
    opts.naverUrl,
    opts.category,
  );
}

// ══════════════════════════════════════════════
// Layer 3: Draft Persistence
// ══════════════════════════════════════════════
// localStorage 기반 임시저장은 ResultPreview.tsx에서 관리.
// 이 파일에서는 관여하지 않는다 — 계층만 선언.
// 상수는 resultPreviewUtils.ts의 AUTOSAVE_KEY / AUTOSAVE_HISTORY_KEY 참조.
