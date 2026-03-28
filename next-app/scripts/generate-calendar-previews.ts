/**
 * generate-calendar-previews.ts
 *
 * 진료일정 12개 템플릿의 대표 프리뷰 이미지를 AI로 생성하여 정적 파일로 저장.
 *
 * 실행: npm run dev 실행 중인 상태에서
 *   npx tsx scripts/generate-calendar-previews.ts
 *
 * 프로덕션:
 *   BASE_URL=https://winaid-ai.vercel.app npx tsx scripts/generate-calendar-previews.ts
 */

import fs from 'fs';
import path from 'path';

// categoryTemplates.ts에서 schedule 배열 직접 import
import { CATEGORY_TEMPLATES } from '../lib/categoryTemplates';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'calendar-previews');
const DELAY_MS = 3000;

const scheduleTemplates = CATEGORY_TEMPLATES.schedule;

if (!scheduleTemplates || scheduleTemplates.length === 0) {
  console.error('❌ schedule 템플릿을 찾을 수 없습니다.');
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(0)}KB`;
}

async function generatePreview(
  template: (typeof scheduleTemplates)[0],
  index: number,
  total: number,
): Promise<{ id: string; success: boolean; size?: number; error?: string }> {
  const label = `[${index + 1}/${total}] ${template.id}`;
  process.stdout.write(`${label} 생성 중...`);

  const prompt = [
    '[CALENDAR PREVIEW THUMBNAIL]',
    template.aiPrompt,
    '',
    '3월 진료일정 샘플. 휴진: 9일, 23일 (빨간 표시). 단축진료: 16일 (주황 표시). 병원명: OO치과.',
    '사용자가 입력하지 않은 진료시간, 점심시간, 전화번호를 넣지 마세요.',
  ].join('\n');

  try {
    const res = await fetch(`${BASE_URL}/api/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        aspectRatio: '1:1' as const,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      const errMsg = `HTTP ${res.status}: ${text.substring(0, 200)}`;
      console.log(` ❌ 실패 (${errMsg})`);
      return { id: template.id, success: false, error: errMsg };
    }

    const data = (await res.json()) as {
      imageDataUrl?: string;
      error?: string;
    };

    if (!data.imageDataUrl) {
      const errMsg = data.error || '응답에 imageDataUrl 없음';
      console.log(` ❌ 실패 (${errMsg})`);
      return { id: template.id, success: false, error: errMsg };
    }

    // base64 → Buffer → PNG 파일
    const base64Match = data.imageDataUrl.match(
      /^data:image\/\w+;base64,(.+)$/,
    );
    if (!base64Match) {
      console.log(` ❌ 실패 (base64 파싱 불가)`);
      return { id: template.id, success: false, error: 'base64 파싱 불가' };
    }

    const buffer = Buffer.from(base64Match[1], 'base64');
    const outPath = path.join(OUTPUT_DIR, `${template.id}.png`);
    fs.writeFileSync(outPath, buffer);

    console.log(` ✅ 완료 (${formatBytes(buffer.length)})`);
    return { id: template.id, success: true, size: buffer.length };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log(` ❌ 실패 (${errMsg})`);
    return { id: template.id, success: false, error: errMsg };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log(`📸 진료일정 프리뷰 이미지 생성 시작`);
  console.log(`   서버: ${BASE_URL}`);
  console.log(`   출력: ${OUTPUT_DIR}`);
  console.log(`   템플릿: ${scheduleTemplates.length}개`);
  console.log('='.repeat(60));
  console.log('');

  // 출력 디렉토리 확인
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results: Awaited<ReturnType<typeof generatePreview>>[] = [];

  for (let i = 0; i < scheduleTemplates.length; i++) {
    const result = await generatePreview(
      scheduleTemplates[i],
      i,
      scheduleTemplates.length,
    );
    results.push(result);

    // 마지막이 아니면 딜레이
    if (i < scheduleTemplates.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // 결과 리포트
  console.log('');
  console.log('='.repeat(60));
  console.log('📊 생성 결과 리포트');
  console.log('='.repeat(60));

  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`✅ 성공: ${succeeded.length}개`);
  for (const r of succeeded) {
    console.log(`   ${r.id}.png (${formatBytes(r.size!)})`);
  }

  if (failed.length > 0) {
    console.log('');
    console.log(`❌ 실패: ${failed.length}개`);
    for (const r of failed) {
      console.log(`   ${r.id}: ${r.error}`);
    }
  }

  const totalSize = succeeded.reduce((sum, r) => sum + (r.size || 0), 0);
  console.log('');
  console.log(`총 파일 크기: ${formatBytes(totalSize)}`);
  console.log('='.repeat(60));

  // 실패가 있으면 exit code 1
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('치명적 에러:', err);
  process.exit(1);
});
