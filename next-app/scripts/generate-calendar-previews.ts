/**
 * generate-calendar-previews.ts
 *
 * 진료일정 11개 템플릿 프리뷰 이미지 생성 (sch_korean_classic 제외).
 * 특정 월 없이 범용 "디자인 스타일 미리보기" 용도.
 *
 * 실행: npm run dev 상태에서
 *   npx tsx scripts/generate-calendar-previews.ts
 * 프로덕션:
 *   BASE_URL=https://winaid-ai.vercel.app npx tsx scripts/generate-calendar-previews.ts
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'calendar-previews');
const DELAY_MS = 5000;

const TEMPLATES: { id: string; prompt: string }[] = [
  {
    id: 'sch_spreadsheet',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail showing design style only. Dark slate (#1e293b) header banner spanning full width with 'OO치과' and '진료일정 안내' in large white bold text. Below: clean white calendar grid area with alternating row colors (white and light gray). Sunday column in red, Saturday in blue. One sample date with red circle badge marked '휴진'. Dark slate footer bar with legend. Header banner must be prominent (30%+ of image). Professional corporate medical style. DO NOT include any specific month number.`,
  },
  {
    id: 'sch_charcoal_frame',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail. THICK charcoal (#292524) decorative frame border surrounding entire image (at least 15px). Inside: pure white canvas with calendar grid area. Title '진료일정 안내' in bold white text ON the charcoal frame at top. One sample date with FULL RED (#ef4444) background cell and white number. The thick charcoal frame is the signature element. Clean, bold, high-contrast. DO NOT include any specific month number.`,
  },
  {
    id: 'sch_modern_note',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail. Ultra-minimal Swiss typography on pure white. Very large elegant text '진료일정' (taking 25% of height) in black (#111827). Below: double line separator (thick 2px black + thin 1px gray, 3px gap). Minimal calendar area below. One dot marker in red. Maximum whitespace (40%+), zero decorations. Premium architecture studio aesthetic. DO NOT include any specific month number.`,
  },
  {
    id: 'sch_night_clinic',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail for night clinic. DARK background (#1c1917) entire image. Prominent AMBER/GOLD (#d97706) horizontal stripe banner at top with white text '야간진료 안내'. Calendar area with white text on dark. Two columns subtly highlighted with warm amber tint. One red pill badge marker. Warm sophisticated dark theme. The amber banner is eye-catching signature element. DO NOT include any specific month number.`,
  },
  {
    id: 'sch_blushy_rose',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail. Soft pastel pink (#fff1f2) background. Coral-to-rose gradient (#e11d48 to #f43f5e) header banner with white '진료일정 안내'. Calendar area with ROUND circular cells. One rose pink (#fda4af) circle badge. Soft, feminine, Instagram-worthy for beauty clinic. Gentle shadows, rounded corners. DO NOT include any specific month number.`,
  },
  {
    id: 'sch_sns_bold',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail. White background with bold CORAL/ORANGE (#f97316) vertical bar on LEFT SIDE (full height, 8% width). Large bold '진료일정' in orange. Calendar area with rounded badge-style cells. One orange border round badge. Modern SNS post style — bold typography, the left orange bar is the unique signature. DO NOT include any specific month number.`,
  },
  {
    id: 'sch_lavender_soft',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail. Soft lavender gradient (#f3eff8 to #fefcff) background. Purple (#7c3aed) header banner. Small sparkle stars scattered in soft purple. Calendar area with rounded pill-shaped cells. One purple circle marker. Dreamy, magical, soft design. Lavender gradient and sparkles are signature. DO NOT include any specific month number.`,
  },
  {
    id: 'sch_gold_classic',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail. Warm ivory (#faf7f2) background. GOLD (#c9a96e) decorative horizontal bands at TOP and BOTTOM (prominent, 12px+ each). Elegant serif typography '진료일정 안내' with diamond decorations. Calendar area with dotted grid lines. One gold circle marker. Luxurious, classical, premium like 5-star hotel. Gold bands and serif are signature. DO NOT include any specific month number.`,
  },
  {
    id: 'sch_deep_frost',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail. Deep navy (#0f2444) background entire image. WHITE floating card (rounded, shadow) in center with calendar area. White text '진료일정 안내' on navy above card. Sky blue (#7dd3fc) accents. One light blue cell marker. Authoritative like university hospital notice. Navy + white card contrast is signature. DO NOT include any specific month number.`,
  },
  {
    id: 'sch_premium_green',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail. Soft sage (#f0f7f2) background. Dark green (#2d6a4f) header bar with white text. Thin emerald (#10b981) vertical line on left (3px, full height). Clean medical aesthetic. One left red border marker. Wellness healing mood. Dark green header + emerald line are signature. DO NOT include any specific month number.`,
  },
  {
    id: 'sch_navy_modern',
    prompt: `Korean hospital monthly schedule POSTER — preview thumbnail. Pure white background. Navy (#1e3a5f) text ONLY — no background colors. Two prominent navy horizontal lines at top and bottom (2.5px). '진료일정 안내' in navy bold. Calendar area with navy text only. One navy left border marker. Zero decoration, business document style. DO NOT include any specific month number.`,
  },
];

function sleep(ms: number) {
  execSync(`sleep ${ms / 1000}`);
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(0)}KB`;
}

function generate(t: { id: string; prompt: string }, idx: number, total: number, retry = false): { id: string; success: boolean; size?: number; error?: string } {
  const label = `[${idx + 1}/${total}] ${t.id}${retry ? ' (재시도)' : ''}`;
  process.stdout.write(`${label} 생성 중...`);

  const body = JSON.stringify({ prompt: t.prompt, aspectRatio: '1:1' });
  const tmpFile = `/tmp/cal_req_${t.id}.json`;
  fs.writeFileSync(tmpFile, body);

  try {
    const resp = execSync(
      `curl -s -X POST ${BASE_URL}/api/image -H "Content-Type: application/json" -d @${tmpFile} --max-time 180`,
      { maxBuffer: 50 * 1024 * 1024, timeout: 200000 },
    ).toString();

    const data = JSON.parse(resp);
    if (data.imageDataUrl) {
      const match = data.imageDataUrl.match(/^data:image\/\w+;base64,(.+)$/);
      if (match) {
        const buf = Buffer.from(match[1], 'base64');
        fs.writeFileSync(path.join(OUTPUT_DIR, `${t.id}.png`), buf);
        console.log(` ✅ 완료 (${formatBytes(buf.length)})`);
        return { id: t.id, success: true, size: buf.length };
      }
    }
    const err = data.error || 'no imageDataUrl';
    console.log(` ❌ ${err}`);
    return { id: t.id, success: false, error: err };
  } catch (e) {
    const msg = e instanceof Error ? e.message.substring(0, 100) : String(e);
    console.log(` ❌ ${msg}`);
    return { id: t.id, success: false, error: msg };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// main
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

console.log('='.repeat(60));
console.log(`📸 진료일정 프리뷰 생성 (11개, sch_korean_classic 제외)`);
console.log(`   서버: ${BASE_URL}`);
console.log(`   출력: ${OUTPUT_DIR}`);
console.log('='.repeat(60));
console.log('');

const results: ReturnType<typeof generate>[] = [];

for (let i = 0; i < TEMPLATES.length; i++) {
  let result = generate(TEMPLATES[i], i, TEMPLATES.length);
  // 실패 시 1회 재시도
  if (!result.success) {
    sleep(3000);
    result = generate(TEMPLATES[i], i, TEMPLATES.length, true);
  }
  results.push(result);
  if (i < TEMPLATES.length - 1) sleep(DELAY_MS);
}

console.log('');
console.log('='.repeat(60));
const ok = results.filter(r => r.success);
const fail = results.filter(r => !r.success);
console.log(`✅ 성공: ${ok.length}개`);
ok.forEach(r => console.log(`   ${r.id}.png (${formatBytes(r.size!)})`));
if (fail.length) {
  console.log(`❌ 실패: ${fail.length}개`);
  fail.forEach(r => console.log(`   ${r.id}: ${r.error}`));
}
console.log(`총 크기: ${formatBytes(ok.reduce((s, r) => s + (r.size || 0), 0))}`);
console.log('='.repeat(60));
if (fail.length) process.exit(1);
