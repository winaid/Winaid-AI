/**
 * 블로그 Word / PDF 다운로드
 * root app src/hooks/useDocumentExport.ts + src/components/resultPreviewUtils.ts 기준 이식
 * blog 전용 — card_news 분기 제외
 */

/** Word 호환 HTML 변환 (root resultPreviewUtils.convertToWordCompatibleHtml 동일) */
function convertToWordCompatibleHtml(html: string): string {
  let r = html;

  // naver-post-container 제거
  r = r.replace(/<div[^>]*class="naver-post-container"[^>]*>/gi, '');
  r = r.replace(/<\/div>\s*$/gi, '');

  // h2 → table (bottom bar)
  r = r.replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, c) => {
    const t = c.replace(/<[^>]*>/g, '').trim();
    return `<table style="width:100%;border-collapse:collapse;margin:0 0 30px 0;border:none;"><tr><td style="padding:0 0 15px 0;font-size:32px;font-weight:bold;color:#1a1a1a;font-family:'맑은 고딕',Malgun Gothic,sans-serif;line-height:1.4;border:none;">${t}</td></tr><tr><td style="height:4px;background-color:#787fff;border:none;"></td></tr></table>`;
  });

  // h3 → table (left bar)
  r = r.replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, c) => {
    const t = c.replace(/<[^>]*>/g, '').trim();
    return `<table style="width:100%;border-collapse:collapse;margin:25px 0 15px 0;border:none;"><tr><td style="width:4px;background-color:#787fff;border:none;"></td><td style="padding:12px 16px;font-size:18px;font-weight:bold;color:#1e40af;font-family:'맑은 고딕',Malgun Gothic,sans-serif;border:none;">${t}</td></tr></table>`;
  });

  // gradient → solid
  r = r.replace(/background:\s*linear-gradient\([^)]+\)/gi, 'background-color:#f8fafc');
  r = r.replace(/background-image:\s*linear-gradient\([^)]+\)/gi, 'background-color:#f8fafc');

  // font-weight 통일
  r = r.replace(/font-weight:\s*[6-9]00/gi, 'font-weight:bold');

  // rgba → hex
  r = r.replace(/rgba\(0,\s*0,\s*0,\s*0\.1\)/gi, '#e5e5e5');
  r = r.replace(/rgba\(0,\s*0,\s*0,\s*0\.06\)/gi, '#f0f0f0');
  r = r.replace(/rgba\(0,\s*0,\s*0,\s*0\.08\)/gi, '#ebebeb');

  // Word 미지원 속성 제거
  r = r.replace(/box-shadow:\s*[^;]+;/gi, '');
  r = r.replace(/border-radius:\s*[^;]+;/gi, '');
  r = r.replace(/border\s*:\s*[^;]+;/gi, '');
  r = r.replace(/border-top\s*:\s*[^;]+;/gi, '');
  r = r.replace(/border-bottom\s*:\s*[^;]+;/gi, '');
  r = r.replace(/border-left\s*:\s*[^;]+;/gi, '');
  r = r.replace(/border-right\s*:\s*[^;]+;/gi, '');

  // p 태그 박스 문제
  r = r.replace(/<p([^>]*)style="([^"]*)">/gi, (_, before, style) => {
    const clean = style
      .replace(/background\s*:[^;]+;?/gi, '')
      .replace(/background-color\s*:[^;]+;?/gi, '')
      .replace(/padding\s*:[^;]+;?/gi, '');
    return `<p${before}style="${clean}">`;
  });

  r = r.replace(/aspect-ratio:\s*[^;]+;/gi, '');
  r = r.replace(/font-family:\s*[^;]+;/gi, "font-family:'맑은 고딕',Malgun Gothic,sans-serif;");

  return r;
}

/** Word (.doc) 다운로드 — root useDocumentExport.handleDownloadWord 동일 */
export function downloadWord(html: string): void {
  const wordCompatHtml = convertToWordCompatibleHtml(html);

  const wordDoc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 15">
<meta name="Originator" content="Microsoft Word 15">
<!--[if gte mso 9]>
<xml><o:DocumentProperties><o:Author>WINAID</o:Author></o:DocumentProperties>
<w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml>
<![endif]-->
<style>
@page { size: A4; margin: 2.5cm; }
body { font-family: '맑은 고딕', Malgun Gothic, sans-serif; font-size: 11pt; line-height: 1.8; color: #333; max-width: 100%; }
h2 { font-size: 18pt; font-weight: bold; color: #1a1a1a; margin-bottom: 20px; padding-bottom: 10px; }
h3 { font-size: 14pt; font-weight: bold; color: #1e40af; margin-top: 25px; margin-bottom: 10px; padding-left: 12px; border-left: 4px solid #787fff; }
p { font-size: 11pt; color: #333; margin-bottom: 15px; line-height: 1.8; text-align: justify; }
ul, ol { margin: 15px 0; padding-left: 25px; }
li { font-size: 11pt; margin-bottom: 8px; line-height: 1.6; }
img { max-width: 100%; height: auto; margin: 20px 0; }
.naver-post-container { max-width: 100%; padding: 0; }
div { border: none !important; box-shadow: none !important; border-radius: 0 !important; }
</style>
</head>
<body>${wordCompatHtml}</body>
</html>`;

  const blob = new Blob(['\ufeff' + wordDoc], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `winaid-blog-${Date.now()}.doc`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** PDF 다운로드 (인쇄 창) — root useDocumentExport.handleDownloadPDF 동일 */
export function downloadPDF(html: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('팝업이 차단되었습니다. 팝업을 허용해주세요.');
    return;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>WINAID Blog - PDF</title>
<style>
@page { size: A4; margin: 2cm; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h3, p, li, img { page-break-inside: avoid; }
  h2, h3 { page-break-after: avoid; }
  .content-image-wrapper, img { page-break-inside: avoid; }
}
* { box-sizing: border-box; }
body { font-family: '맑은 고딕', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; line-height: 1.9; padding: 0; margin: 0; max-width: 100%; color: #333; font-size: 14px; word-break: keep-all; overflow-wrap: break-word; }
h2, .main-title { font-size: 24px; font-weight: 900; margin: 0 0 20px 0; padding-bottom: 15px; color: #1a1a1a; line-height: 1.4; }
h3 { font-size: 18px; font-weight: 700; margin: 35px 0 15px 0; padding: 12px 16px; color: #1e40af; background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; }
p { font-size: 14px; margin: 0 0 18px 0; color: #333; text-align: justify; line-height: 1.9; }
ul { margin: 15px 0 20px 0; padding-left: 0; list-style: none; }
li { font-size: 14px; margin-bottom: 12px; padding: 10px 15px 10px 30px; background: #f8fafc; border-radius: 8px; position: relative; line-height: 1.7; }
li::before { content: '\\2022'; position: absolute; left: 12px; color: #10b981; font-weight: bold; font-size: 18px; }
img { max-width: 100%; height: auto; margin: 25px auto; display: block; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
.content-image-wrapper { margin: 30px 0; text-align: center; }
.hidden-title { display: none; }
</style></head>
<body>${html}
<script>
window.onload = function() {
  var imgs = document.querySelectorAll('img');
  var loaded = 0, total = imgs.length;
  function tryPrint() { setTimeout(function() { window.print(); }, 500); }
  if (total === 0) { tryPrint(); return; }
  for (var i = 0; i < imgs.length; i++) {
    if (imgs[i].complete) { loaded++; }
    else { imgs[i].onload = imgs[i].onerror = function() { loaded++; if (loaded >= total) tryPrint(); }; }
  }
  if (loaded >= total) tryPrint();
  setTimeout(function() { window.print(); }, 5000);
};
<\/script></body></html>`);
  printWindow.document.close();
}
