// POST /api/medical-law/fetch — 의료광고법 정보 크롤링
// Ported from functions/api/medical-law/fetch.ts

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function setCors(res) {
  Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
}

function parseMedicalLaw56(text) {
  const rules = [];
  const prohibitionPatterns = [
    { regex: /(치료경험담|환자.*경험|치료.*사례|Before.*After)/i, category: 'treatment_experience', description: '환자에 관한 치료경험담 등 소비자로 하여금 치료 효과를 오인하게 할 우려가 있는 내용의 광고', examples: ['환자 후기', '치료 사례', 'Before & After', '체험담', '실제 사례'], legalBasis: '의료법 제56조 제2항 제2호', severity: 'critical' },
    { regex: /거짓.*내용.*표시/i, category: 'false_info', description: '거짓된 내용을 표시하는 광고', examples: ['허위 정보', '거짓 자격', '없는 장비', '가짜 인증'], legalBasis: '의료법 제56조 제2항 제3호', severity: 'critical' },
    { regex: /(비교|다른.*의료인|타.*병원)/i, category: 'comparison', description: '다른 의료인등의 기능 또는 진료 방법과 비교하는 내용의 광고', examples: ['타 병원 대비', '다른 병원보다', '최고', '1위', '어디보다'], legalBasis: '의료법 제56조 제2항 제4호', severity: 'high' },
    { regex: /(과장|100%|완치|확실|반드시)/i, category: 'exaggeration', description: '객관적인 사실을 과장하는 내용의 광고', examples: ['100% 완치', '반드시 낫습니다', '확실한 효과', '기적의 치료'], legalBasis: '의료법 제56조 제2항 제8호', severity: 'critical' },
    { regex: /법적.*근거.*없는.*자격/i, category: 'false_info', description: '법적 근거가 없는 자격이나 명칭을 표방하는 내용의 광고', examples: ['비공식 인증', '임의 자격증', '국제 OO 전문의'], legalBasis: '의료법 제56조 제2항 제9호', severity: 'critical' },
    { regex: /(부작용|중요.*정보|누락)/i, category: 'other', description: '의료인등의 기능, 진료 방법과 관련하여 심각한 부작용 등 중요한 정보를 누락하는 광고', examples: ['부작용 숨김', '위험 정보 미고지', '중요 사항 누락'], legalBasis: '의료법 제56조 제2항 제7호', severity: 'high' },
  ];

  prohibitionPatterns.forEach((pattern) => {
    if (pattern.regex.test(text)) {
      rules.push({ category: pattern.category, description: pattern.description, examples: pattern.examples, legalBasis: pattern.legalBasis, severity: pattern.severity });
    }
  });

  if (rules.length === 0) {
    prohibitionPatterns.forEach((pattern) => {
      rules.push({ category: pattern.category, description: pattern.description, examples: pattern.examples, legalBasis: pattern.legalBasis, severity: pattern.severity });
    });
  }
  return rules;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log('🏥 의료광고법 정보 크롤링:', url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MedicalLawBot/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch URL', status: response.status });
    }

    const html = await response.text();
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const prohibitions = parseMedicalLaw56(textContent);
    const criticalCount = prohibitions.filter((p) => p.severity === 'critical').length;
    const highCount = prohibitions.filter((p) => p.severity === 'high').length;
    const summary =
      `의료광고법 제56조에 따라 ${prohibitions.length}개의 주요 금지사항이 있습니다. ` +
      `중대 위반 ${criticalCount}개, 높은 위험 ${highCount}개를 포함하여 의료광고 시 반드시 준수해야 합니다.`;

    console.log('✅ 의료광고법 정보 파싱 완료:', prohibitions.length, '개 금지사항');

    return res.status(200).json({
      source: url,
      lastUpdated: new Date().toISOString(),
      prohibitions,
      summary,
      rawContent: textContent.substring(0, 10000),
    });
  } catch (error) {
    console.error('❌ 의료광고법 정보 크롤링 실패:', error);
    return res.status(500).json({ error: 'Medical law fetch failed', message: error.message || 'Unknown error' });
  }
}
