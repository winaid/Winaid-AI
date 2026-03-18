/**
 * contentStorage — ContentArtifact → 저장 레이어 어댑터
 *
 * 3개 계층을 명확히 분리한다:
 *   1. ContentArtifact: 생성 1회의 제품 단위 결과물 (contracts.ts)
 *   2. SaveContentPayload: API 서버(Cloudflare KV) 저장용 payload
 *   3. SaveContentRecord: 저장 후 서버가 반환하는 레코드 (id 포함)
 *
 * UI 코드(훅, 컴포넌트)는 이 모듈의 함수만 호출하고,
 * 저장 필드를 직접 조합하지 않는다.
 */

import type { ContentArtifact } from './contracts';
import type { SaveContentRequest, SaveContentResponse } from '../../services/apiService';

// ══════════════════════════════════════════════
// 타입 정의
// ══════════════════════════════════════════════

/** API 서버 저장용 payload — ContentArtifact에서 변환 */
export type SaveContentPayload = SaveContentRequest;

/** 저장 완료 후 레코드 — 서버가 부여한 id 포함 */
export interface SaveContentRecord {
  id: string;
  title: string;
  postType: string;
  category: string;
  createdAt: string;
}

// ══════════════════════════════════════════════
// 어댑터 함수
// ══════════════════════════════════════════════

/**
 * ContentArtifact → SaveContentPayload 변환.
 *
 * storageHtml이 있으면 그대로 사용하고,
 * 없으면 htmlContent에서 base64/blob을 strip한다.
 *
 * UI 코드에서 저장 필드를 직접 조합하는 대신 이 함수를 사용하라.
 */
export function buildSavePayload(artifact: ContentArtifact): SaveContentPayload {
  const content = artifact.content;

  // storageHtml 우선, 없으면 htmlContent에서 base64/blob strip
  let contentForSave = content.storageHtml || '';
  if (!contentForSave) {
    contentForSave = content.htmlContent
      .replace(/src="data:image\/[^"]*"/gi, 'src=""')
      .replace(/src="blob:[^"]*"/gi, 'src=""');
    console.warn('[STORAGE] storageHtml 없음 — htmlContent에서 base64/blob strip 후 저장');
  }

  // 페이로드 크기 진단
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
 * ContentArtifact를 API 서버에 저장하고 결과를 반환한다.
 *
 * UI 훅에서 직접 saveContentToServer를 호출하는 대신 이 함수를 사용하라.
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
