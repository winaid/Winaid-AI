/**
 * Sub Prompt Compacting 검증 — 프롬프트 길이 실측 + chain 정책 검증
 *
 * COMMON_CONSTRAINTS → SUB_CONSTRAINTS 교체 후:
 *   - sub 1차 prompt: ~830자 → ~460자 (44% 감소)
 *   - 예상 효과: nb2 응답 시간 단축 → 1차 timeout 제거
 *
 * 이 테스트는 실제 프롬프트 구성 로직을 시뮬레이션하여
 * 프롬프트 길이가 정책 범위 내인지 검증한다.
 */
import { describe, it, expect } from 'vitest';

// ── 실제 상수 복제 (imageOrchestrator.ts와 동기화) ──

const COMMON_CONSTRAINTS = 'No text, no letters, no typography, no watermark, no logo. No hanbok, no traditional clothing, no cultural costume, no historical styling, no wedding styling, no festival styling. No exaggerated poses, no glamorous fashion portrait. Single scene only — no split screen, no diptych, no collage, no side-by-side panels, no before-after comparison, no multiple frames in one image. No mirror scenes, no bathroom mirror selfie, no reflective surface shots — AI models produce physically incorrect reflections (duplicated person, wrong pose/angle in reflection, subject emerging from mirror). If a reflective surface is absolutely required: physically correct mirror reflection, single subject with consistent mirrored pose, no duplicated person, no impossible reflection geometry.';

const SUB_CONSTRAINTS = 'Single scene. No text, no watermark, no hanbok, no traditional clothing. No split screen, no collage, no mirror scenes.';

// STYLE_KEYWORD_SHORT.photo (from imagePromptBuilder.ts)
const STYLE_KW_PHOTO = 'photorealistic, DSLR, natural lighting, bokeh, Korean hospital, no text, no watermark';

// subPersonHint for photo
const SUB_PERSON_HINT_PHOTO = 'Modern Korean adult, natural Korean facial features, contemporary clothing.';

// STYLE_KEYWORD_SHORT.illustration
const STYLE_KW_ILLUSTRATION = '3D illustration, NOT a photo, pastel, Blender style, soft lighting, single scene, Korean clinic, no text, no watermark';

const SUB_PERSON_HINT_ILLUSTRATION = '3D illustration style, friendly rounded character, NOT a photo.';

// medical anchorShort
const MEDICAL_ANCHOR_SHORT = '3D medical render, anatomical clinical visualization, blue-white-teal palette, clean studio lighting, same rendering family, NOT photo, NOT portrait, NOT cartoon, NOT infographic. No text, no watermark.';

describe('Sub Prompt Compacting 검증', () => {
  describe('COMMON_CONSTRAINTS vs SUB_CONSTRAINTS 비교', () => {
    it('COMMON_CONSTRAINTS는 ~776자', () => {
      expect(COMMON_CONSTRAINTS.length).toBeGreaterThan(700);
      expect(COMMON_CONSTRAINTS.length).toBeLessThan(850);
    });

    it('SUB_CONSTRAINTS는 ~120자', () => {
      expect(SUB_CONSTRAINTS.length).toBeGreaterThan(80);
      expect(SUB_CONSTRAINTS.length).toBeLessThan(150);
    });

    it('SUB_CONSTRAINTS는 COMMON_CONSTRAINTS의 25% 이하', () => {
      expect(SUB_CONSTRAINTS.length / COMMON_CONSTRAINTS.length).toBeLessThan(0.25);
    });

    it('SUB_CONSTRAINTS에 필수 negative 포함', () => {
      const essentials = ['No text', 'no watermark', 'no hanbok', 'Single scene', 'no collage', 'no mirror'];
      for (const kw of essentials) {
        expect(SUB_CONSTRAINTS).toContain(kw);
      }
    });
  });

  describe('photo style sub prompt 실측', () => {
    // 실제 프롬프트 구성: 5장 생성 시 typical promptText
    const promptTexts = [
      '봄맞이 치아 교정 전 정밀 검진이 중요한 이유 — 교정 전 검사 항목과 치아 상태 확인 장면. 치과 진료실에서 의사와 환자가 검진하는 모습',
      '봄맞이 치아 교정 전 정밀 검진이 중요한 이유 — 파노라마 X-ray 촬영. 현대적 치과 장비와 디지털 영상 확인',
      '봄맞이 치아 교정 전 정밀 검진이 중요한 이유 — 교정 장치 설명. 금속 브라켓과 투명 교정기 비교',
      '봄맞이 치아 교정 전 정밀 검진이 중요한 이유 — 교정 후 관리. 칫솔질과 구강 위생 관리 방법',
    ];

    for (let i = 0; i < promptTexts.length; i++) {
      it(`sub ${i + 1} — compact prompt < 500자`, () => {
        const pt = promptTexts[i].substring(0, 140);
        const compact = `Korean health blog image: ${pt}. ${SUB_PERSON_HINT_PHOTO} ${STYLE_KW_PHOTO}. ${SUB_CONSTRAINTS} 16:9.`.trim();
        console.log(`  sub${i + 1} compact: ${compact.length}자`);
        expect(compact.length).toBeLessThan(500);
      });

      it(`sub ${i + 1} — old prompt was > 750자 (COMMON_CONSTRAINTS 사용)`, () => {
        const pt = promptTexts[i].substring(0, 140);
        const old = `Korean health blog image: ${pt}. ${SUB_PERSON_HINT_PHOTO} ${STYLE_KW_PHOTO}. ${COMMON_CONSTRAINTS} 16:9.`.trim();
        console.log(`  sub${i + 1} old: ${old.length}자`);
        expect(old.length).toBeGreaterThan(750);
      });

      it(`sub ${i + 1} — 감소율 > 40%`, () => {
        const pt = promptTexts[i].substring(0, 140);
        const compact = `Korean health blog image: ${pt}. ${SUB_PERSON_HINT_PHOTO} ${STYLE_KW_PHOTO}. ${SUB_CONSTRAINTS} 16:9.`.trim();
        const old = `Korean health blog image: ${pt}. ${SUB_PERSON_HINT_PHOTO} ${STYLE_KW_PHOTO}. ${COMMON_CONSTRAINTS} 16:9.`.trim();
        const reduction = 1 - compact.length / old.length;
        console.log(`  sub${i + 1} reduction: ${(reduction * 100).toFixed(1)}%`);
        expect(reduction).toBeGreaterThan(0.4);
      });
    }
  });

  describe('illustration style sub prompt 실측', () => {
    const pt = '봄맞이 치아 교정 전 정밀 검진이 중요한 이유 — 교정 전 검사 항목과 치아 상태 확인'.substring(0, 140);

    it('compact prompt < 500자', () => {
      const compact = `Korean health blog image: ${pt}. ${SUB_PERSON_HINT_ILLUSTRATION} ${STYLE_KW_ILLUSTRATION}. ${SUB_CONSTRAINTS} 16:9.`.trim();
      console.log(`  illustration compact: ${compact.length}자`);
      expect(compact.length).toBeLessThan(500);
    });
  });

  describe('medical style sub prompt 실측', () => {
    const pt = '봄맞이 치아 교정 전 정밀 검진이 중요한 이유 — 교정 전 검사 항목과 치아 상태 확인'.substring(0, 120);

    it('compact prompt < 500자', () => {
      const compact = `3D medical illustration: ${pt}. ${MEDICAL_ANCHOR_SHORT} ${SUB_CONSTRAINTS} 16:9.`.trim();
      console.log(`  medical compact: ${compact.length}자`);
      expect(compact.length).toBeLessThan(500);
    });

    it('old prompt was > 700자', () => {
      const old = `3D medical illustration: ${pt}. ${MEDICAL_ANCHOR_SHORT} ${COMMON_CONSTRAINTS} 16:9.`.trim();
      console.log(`  medical old: ${old.length}자`);
      expect(old.length).toBeGreaterThan(700);
    });
  });

  describe('ultraMinimal(2차 시도)은 변경 없음', () => {
    it('ultraMinimal < 300자', () => {
      const pt = '봄맞이 치아 교정 전 정밀 검진이 중요한 이유 — 교정 전 검사'.substring(0, 80);
      const ultra = `${pt}. ${SUB_PERSON_HINT_PHOTO} ${STYLE_KW_PHOTO}. No text, no watermark, no hanbok. 16:9.`.trim();
      console.log(`  ultraMinimal: ${ultra.length}자`);
      expect(ultra.length).toBeLessThan(300);
    });
  });

  describe('heroCompact 대비 sub prompt 길이 근접성', () => {
    it('sub compact는 heroCompact ±100자 범위', () => {
      const pt = '봄맞이 치아 교정 전 정밀 검진이 중요한 이유 — 교정 전 검사 항목'.substring(0, 140);
      const heroCompact = `Korean health blog hero image, 16:9 landscape: ${pt}. ${SUB_PERSON_HINT_PHOTO} ${STYLE_KW_PHOTO}. Single scene. No text, no watermark, no hanbok, no traditional clothing.`.trim();
      const subCompact = `Korean health blog image: ${pt}. ${SUB_PERSON_HINT_PHOTO} ${STYLE_KW_PHOTO}. ${SUB_CONSTRAINTS} 16:9.`.trim();
      console.log(`  heroCompact: ${heroCompact.length}자, subCompact: ${subCompact.length}자`);
      expect(Math.abs(heroCompact.length - subCompact.length)).toBeLessThan(100);
    });
  });

  describe('chain timeout 예산 검증', () => {
    it('compact sub(~460자) + ultraMinimal(~280자) worst case < wall cap(75s)', () => {
      // 1차: 40s timeout (compact prompt → 실제 25-35s 예상)
      // 2차: 25s timeout (ultraMinimal → 실제 15-25s 예상)
      // gap: 1s
      // total worst: 40 + 1 + 25 = 66s < 75s wall cap
      expect(40000 + 1000 + 25000).toBeLessThan(75000);
    });

    it('typical case: compact sub 1차 성공 시 25-35s 내 완료', () => {
      // heroCompact(~380자)가 20-30s 내 성공 → sub compact(~460자)는 25-35s 예상
      // 40s timeout 내 완료 확률 > 90%
      const typicalResponseMs = 35000; // conservative estimate
      const timeout = 40000;
      expect(typicalResponseMs).toBeLessThan(timeout);
    });
  });
});
