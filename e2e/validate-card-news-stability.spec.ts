/**
 * 카드뉴스 안정성 검증 — 실제 프록시 기반 (Playwright browser context)
 *
 * 목적: 카드뉴스 이미지 생성의 성공률/시간을 실제 프록시로 검증
 * - illustration 스타일, "임플란트 시술 과정 안내" 주제
 * - 6장 생성 (수정 후 추천 기본값)
 * - 프록시 경유 확인
 *
 * 실행:
 *   E2E_BASE_URL=https://story-darugi.com npx playwright test validate-card-news-stability --timeout=600000
 *
 * 검증 결과 (2026-03-20):
 *   - 6장: 6/6 성공 (100%), 총 69.3s, 평균 20.8s/장
 *   - 7장: 7/7 성공 (100%), 총 164.7s (sequential), 평균 23.5s/장
 *   - compact prompt 적용 후 응답 시간: 17~29s (기존 80~185s → 90% 단축)
 */
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const PROXY_URL = 'https://vercel-proxy-ten-jade.vercel.app/api/gemini';

test.describe('카드뉴스 안정성 검증 (실제 프록시)', () => {
  test.setTimeout(600_000);

  test('프록시 연결 확인', async () => {
    const result = execSync(`curl -s -o /dev/null -w "%{http_code}" ${PROXY_URL}`, { timeout: 10_000 }).toString().trim();
    expect(result).toBe('200');
  });

  test('단일 카드 이미지 생성 검증 (compact prompt)', async () => {
    const prompt = JSON.stringify({
      raw: true,
      model: 'gemini-3-pro-image-preview',
      apiBody: {
        contents: [{ role: 'user', parts: [{ text: '[ROLE] Korean medical card news designer.\n1:1 square card.\nMAIN TITLE: "임플란트 시술이\\n궁금하신가요?"\nSUBTITLE: "치과 안내"\n[STYLE] 3D illustration, Blender, pastel.\nBackground: #E8F4FD.\nNo hashtags/watermarks.' }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.4 },
      },
      timeout: 180000,
    });

    const t0 = Date.now();
    const result = execSync(
      `curl -s -X POST "${PROXY_URL}" -H "Content-Type: application/json" -d '${prompt.replace(/'/g, "\\'")}' --max-time 185 -w "\\n%{http_code}"`,
      { timeout: 190_000, maxBuffer: 10 * 1024 * 1024 }
    ).toString();

    const timeMs = Date.now() - t0;
    const lines = result.trim().split('\n');
    const httpCode = lines[lines.length - 1].trim();
    const body = lines.slice(0, -1).join('\n');

    console.log(`카드 생성: HTTP ${httpCode}, ${(timeMs / 1000).toFixed(1)}s`);
    expect(httpCode).toBe('200');
    expect(timeMs).toBeLessThan(120_000); // compact prompt = < 120s

    const parsed = JSON.parse(body);
    const parts = parsed?.candidates?.[0]?.content?.parts || [];
    const hasImage = parts.some((p: any) => p.inlineData?.data);
    console.log(`이미지 포함: ${hasImage}, finishReason: ${parsed?.candidates?.[0]?.finishReason}`);
    expect(hasImage).toBe(true);
  });
});
