/**
 * 임상글 카테고리별 톤·전문 용어·금기 표현 (카테고리 quartet 완결).
 *
 * 콘텐츠 카테고리 정합 quartet:
 *   - PR #194 CATEGORY_TONE: 블로그 (환자 친화 어조)
 *   - PR #195 CATEGORY_IMAGE_GUIDES: 블로그 이미지 (장면·페르소나·스타일)
 *   - PR #196 PRESS_CATEGORY_TONE: 보도자료 (3인칭 기사체, 학회·임상 근거)
 *   - 본 record CLINICAL_CATEGORY_TONE: 임상글 (의학 술어 register, 환자 보고서 톤)
 *
 * 임상글 register 분리 — vocabulary 가 의학 술어 중심 (영문 원어 병기), avoid 에
 * 환자 호소형 + 광고성 모두 포함 (환자 친화·보도 어휘 둘 다 부적합).
 *
 * 양 앱(public-app/lib/clinicalPrompt.ts, next-app/lib/clinicalPrompt.ts) 가 본 상수와
 * 헬퍼를 import 하므로 drift 0 보장 (PR #196 동일 패턴).
 *
 * 미등록 카테고리 → buildClinicalCategoryToneBlock 이 null 반환 → 호출자가 push skip
 * → 기존 단일 톤 fallback 그대로.
 */

export interface ClinicalCategoryTone {
  /** 한 문장 어조. 임상글 register 반영 (객관·의학 술어·시술 단계). */
  tone: string;
  /** 권장 임상 어휘 — 시술 단계·해부학·약리·장비명. 영문 원어 병기 자연. 5-9개. */
  vocabulary: string[];
  /** 금기 표현 — 환자 호소형 + 광고성 둘 다 (임상글에는 모두 부적합). 3-6개. */
  avoid: string[];
}

export const FALLBACK_CLINICAL_CATEGORY_TONE: ClinicalCategoryTone = {
  tone: '환자 보고서 register. 의학 술어로 객관 기술하되 환자 호소·광고성 어휘 회피.',
  vocabulary: ['시술 단계', '경과 관찰', '임상적', '진단 결과', '치료 계획'],
  avoid: ['최고', '완벽', '~하세요', '걱정 없이', '안심하세요'],
};

export const CLINICAL_CATEGORY_TONE: Record<string, ClinicalCategoryTone> = {
  '치과': {
    tone:
      '환자 보고서 register. 진단(파노라마/CT)·시술 단계·재료를 의학 술어로 기술. 환자 친화 비유나 광고성 어휘 회피.',
    vocabulary: [
      '파노라마 (panoramic radiograph)', '구강스캐너 (intraoral scan)',
      '근관치료 (endodontic treatment)', '교합 조정 (occlusal adjustment)',
      '골유착 (osseointegration)', '지르코니아 보철', '경과 관찰', 'CAD/CAM',
    ],
    avoid: ['통증 없이', '평생 보장', '걱정 없이', '안심하세요', '단연 최고의 기술'],
  },
  '피부과': {
    tone:
      '환자 보고서 register. 시술 파장·타겟 깊이·다운타임을 의학 술어로 기술. 효과 단정·환자 호소형 회피.',
    vocabulary: [
      '레이저 파장 (wavelength)', '표피 (epidermis)', '진피 (dermis)',
      'HIFU (high-intensity focused ultrasound)', 'PDO 실리프팅',
      '치료 횟수', '유지 기간', '경과 관찰',
    ],
    avoid: ['완벽한 피부', '즉시 효과', '리프팅 보장', '~받으세요', '걱정 없이'],
  },
  '정형외과': {
    tone:
      '환자 보고서 register. 이학적 검사명·영상 소견·술식명을 의학 술어로 기술. 재활 단계 명시.',
    vocabulary: [
      '이학적 검사', '맥머리 검사 (McMurray test)', '관절경 (arthroscopy)',
      'MRI 소견', '인공관절 치환술', '재활 단계', '비수술 치료', '경과 관찰',
    ],
    avoid: ['완전 회복 보장', '단번에 해결', '~해보세요', '재발 제로', '걱정 없이'],
  },
  '한의원': {
    tone:
      '환자 보고서 register. 사진(四診)·변증·체질 분류 결과를 한방 술어로 기술. 만병통치·양방 비교 우열 금지.',
    vocabulary: [
      '망문문절 (사진 四診)', '변증 (辨證)', '체질 분류 (사상)',
      '침구 (acupuncture)', '한약 처방', '추나 요법', '경과 관찰', '약침',
    ],
    avoid: ['만병통치', '완치', '양방보다 우수', '단번에 효과', '부작용 전혀 없는'],
  },
  '성형외과': {
    tone:
      '환자 보고서 register. 시술 기법·해부학·회복 단계를 의학 술어로 기술. 결과 단정·환자 호소 금기.',
    vocabulary: [
      '절개법 (incision)', '비절개법', '안검성형술 (blepharoplasty)',
      '비중격 연골 (septal cartilage)', '광대 축소술', '회복 단계',
      '봉합 (suture)', '경과 관찰',
    ],
    avoid: ['완벽한 결과', '부작용 0%', '평생 유지', '인생 변화', '안심하세요'],
  },
  '안과': {
    tone:
      '환자 보고서 register. 굴절·안압·안저·각막 두께 등 검사 소견을 의학 술어로 기술. 결과 단정 금지.',
    vocabulary: [
      '굴절 검사', '안압 (IOP)', 'OCT (optical coherence tomography)',
      '각막 두께 (corneal pachymetry)', '인공수정체 (IOL)', '적응증',
      'ICL (Implantable Collamer Lens)', '경과 관찰',
    ],
    avoid: ['시력 완벽 회복', '평생 시력 보장', '재수술 0%', '~받으세요', '걱정 없이'],
  },
  '내과': {
    tone:
      '환자 보고서 register. 검사 수치(혈압·혈당·HbA1c)·약물 처방·합병증 추적을 의학 술어로 기술.',
    vocabulary: [
      '혈압 (BP)', '당화혈색소 (HbA1c)', '복약 순응도', '임상 가이드라인',
      '심전도 (ECG)', '복부 초음파', '경과 관찰', '합병증 예방',
    ],
    avoid: ['완치 보장', '약 없이 회복', '단번에 해결', '부작용 없는 약', '~해보세요'],
  },
};

/**
 * 임상글용 카테고리 톤 가이드 XML 블록. 미등록 카테고리 → null
 * (호출자가 push skip — fallback 강제 안 함, 기존 단일 톤 동작 100% 호환).
 */
export function buildClinicalCategoryToneBlock(category: string | undefined | null): string | null {
  if (!category) return null;
  const tone = CLINICAL_CATEGORY_TONE[category];
  if (!tone) return null;
  return `[${category} 임상글 톤 가이드]
어조: ${tone.tone}
권장 임상 어휘 (영문 원어 병기 자연): ${tone.vocabulary.join(', ')}
금기 표현 (사용 금지): ${tone.avoid.join(', ')}`;
}
