import { useState, useCallback, RefObject } from 'react';
import { GeneratedContent, CssTheme } from '../types';
import { applyThemeToHtml } from '../utils/cssThemes';
import { convertToWordCompatibleHtml, restoreBase64Images } from '../components/resultPreviewUtils';
import { persistBlogHistory } from '../core/generation/contentStorage';
import { toast } from '../components/Toast';
import { getDesignTemplateById } from '../services/cardNewsDesignTemplates';

interface UseDocumentExportParams {
  content: GeneratedContent;
  localHtml: string;
  currentTheme: CssTheme;
  editorRef: RefObject<HTMLDivElement | null>;
}

interface UseDocumentExportReturn {
  copied: boolean;
  editProgress: string;
  setEditProgress: (p: string) => void;
  handleDownloadWord: () => Promise<void>;
  handleDownloadPDF: () => Promise<void>;
  handleCopy: () => Promise<void>;
  applyInlineStylesForNaver: (html: string, theme?: CssTheme) => string;
}

export function useDocumentExport({
  content,
  localHtml,
  currentTheme,
  editorRef,
}: UseDocumentExportParams): UseDocumentExportReturn {
  const [copied, setCopied] = useState(false);
  const [editProgress, setEditProgress] = useState('');

  const applyInlineStylesForNaver = useCallback((html: string, theme: CssTheme = currentTheme) => {
    let styled = html;

    if (content.postType === 'card_news') {
      const _dt = content.designTemplateId ? getDesignTemplateById(content.designTemplateId) : undefined;
      const _dtsc = _dt?.styleConfig;
      const _dtBg = _dtsc?.backgroundColor || '#E8F4FD';
      const _dtBgGrad = `linear-gradient(180deg, ${_dtBg} 0%, ${_dtBg}dd 100%)`;
      const _dtBr = _dtsc?.borderRadius || '24px';
      const _dtBs = _dtsc?.boxShadow || '0 8px 32px rgba(0,0,0,0.06)';
      const _dtBorder = _dtsc?.borderWidth && _dtsc.borderWidth !== '0' ? `border: ${_dtsc.borderWidth} solid ${_dtsc.borderColor};` : '';
      styled = styled
        .replace(/<div class="card-news-container"/g, '<div class="card-news-container" style="max-width: 480px; margin: 0 auto; padding: 16px;"')
        .replace(/<div class="card-grid-wrapper"/g, '<div class="card-grid-wrapper" style="display: flex; flex-direction: column; gap: 24px;"')
        .replace(/<div class="card-slide"/g, `<div class="card-slide" style="background: ${_dtBgGrad}; border-radius: ${_dtBr}; box-shadow: ${_dtBs}; ${_dtBorder} overflow: hidden; width: 100%; aspect-ratio: 1/1; position: relative;"`)
        .replace(/<div class="card-border-box"/g, '<div class="card-border-box" style="border: 3px solid #1e293b; border-radius: 20px; margin: 16px; display: flex; flex-direction: column; background: #fff; overflow: hidden;"')
        .replace(/<div class="card-header-row"/g, '<div class="card-header-row" style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; position: relative; z-index: 3;"')
        .replace(/class="brand-text"/g, 'class="brand-text" style="font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #1e293b;"')
        .replace(/class="arrow-icon"/g, 'class="arrow-icon" style="font-size: 16px; border: 2px solid #1e293b; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: #1e293b;"')
        .replace(/<div class="card-content-area"/g, '<div class="card-content-area" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px 24px; gap: 8px; z-index: 2; pointer-events: none;"')
        .replace(/class="card-subtitle"/g, 'class="card-subtitle" style="font-size: 13px; font-weight: 700; color: #3b82f6; margin-bottom: 4px; pointer-events: auto; position: relative; z-index: 3;"')
        .replace(/class="card-divider-dotted"/g, 'class="card-divider-dotted" style="width: 60%; border-bottom: 2px dotted #cbd5e1; margin: 8px 0 12px 0;"')
        .replace(/class="card-main-title"/g, 'class="card-main-title" style="font-size: 26px; font-weight: 900; color: #0f172a; line-height: 1.3; margin: 0; word-break: keep-all; letter-spacing: -0.5px; display: block; text-align: center; max-width: 100%; padding: 0 8px; pointer-events: auto; position: relative; z-index: 3;"')
        .replace(/<h1([^>]*)>/g, '<p$1>')
        .replace(/<\/h1>/g, '</p>')
        .replace(/class="card-highlight"/g, 'class="card-highlight" style="color: #3b82f6;"')
        .replace(/class="card-img-container"/g, 'class="card-img-container" style="position: absolute; inset: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; padding: 0; z-index: 1;"')
        .replace(/class="card-inner-img"/g, 'class="card-inner-img" style="width: 100%; height: 100%; object-fit: cover; object-position: center;"')
        .replace(/class="card-desc"/g, 'class="card-desc" style="font-size: 15px; color: #475569; margin-top: 12px; font-weight: 500; line-height: 1.7; word-break: keep-all; max-width: 90%; pointer-events: auto; position: relative; z-index: 3;"')
        .replace(/<div class="card-footer-row"/g, '<div class="card-footer-row" style="padding: 12px 20px 16px; display: flex; justify-content: center; gap: 8px; border-top: 1px solid #f1f5f9; pointer-events: auto; position: relative; z-index: 3;"')
        .replace(/class="pill-tag"/g, 'class="pill-tag" style="background: #f1f5f9; padding: 6px 12px; border-radius: 16px; font-size: 11px; font-weight: 700; color: #475569;"')
        .replace(/class="hidden-title"/g, 'class="hidden-title" style="display: none;"')
        .replace(/class="legal-box-card"/g, 'class="legal-box-card" style="font-size: 10px; color: #94a3b8; text-align: center; margin-top: 16px; line-height: 1.5;"');
    } else {
      styled = applyThemeToHtml(styled, theme);
    }
    return styled;
  }, [content.postType, currentTheme]);

  const handleDownloadWord = useCallback(async () => {
    setEditProgress('Word 문서 생성 중...');

    try {
      const restoredHtml = restoreBase64Images(localHtml, content.generatedImages);
      const styledHtml = applyInlineStylesForNaver(restoredHtml, currentTheme);

      const wordHtml = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Microsoft Word 15">
  <meta name="Originator" content="Microsoft Word 15">
  <!--[if gte mso 9]>
  <xml>
    <o:DocumentProperties>
      <o:Author>WINAID</o:Author>
    </o:DocumentProperties>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
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
<body>
  ${styledHtml}
</body>
</html>`;

      const blob = new Blob(['\ufeff' + wordHtml], { type: 'application/msword;charset=utf-8' });
      const fileName = `hospital-ai-content-${Date.now()}.doc`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Word 생성 오류:', e);
      toast.error('Word 문서 생성 중 오류가 발생했습니다.');
    } finally {
      setEditProgress('');
    }
  }, [localHtml, currentTheme, applyInlineStylesForNaver, content.generatedImages]);

  const handleDownloadPDF = useCallback(async () => {
    setEditProgress('PDF 생성 중...');

    try {
      const restoredHtml = restoreBase64Images(localHtml, content.generatedImages);
      const styledHtml = applyInlineStylesForNaver(restoredHtml, currentTheme);

      // [Layer 2] History Persistence — PDF 다운로드 시 이력 저장
      if (content.title && localHtml) {
        const { stripLargeBase64FromHtml } = await import('../services/image/imageStorageService');
        const lightweightHtml = stripLargeBase64FromHtml(localHtml);
        console.info(`[STORAGE] persistBlogHistory | original=${localHtml.length}자 | lightweight=${lightweightHtml.length}자`);
        persistBlogHistory({
          title: content.title,
          plainText: localHtml.replace(/<[^>]*>/g, ' ').trim(),
          lightweightHtml,
          keywords: (content as any).keyword?.split(',').map((k: string) => k.trim()) || [],
          category: (content as any).category,
        }).catch(err => {
          console.error('블로그 이력 저장 실패:', err);
        });
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.warning('팝업이 차단되었습니다. 팝업을 허용해주세요.');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>WINAID Content - PDF</title>
          <style>
            @page { size: A4; margin: 2cm; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              h3, p, li, img { page-break-inside: avoid; }
              h2, h3 { page-break-after: avoid; }
              .content-image-wrapper, img { page-break-inside: avoid; page-break-before: auto; page-break-after: auto; }
            }
            * { box-sizing: border-box; }
            body { font-family: '맑은 고딕', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; line-height: 1.9; padding: 0; margin: 0; max-width: 100%; color: #333; font-size: 14px; word-break: keep-all; overflow-wrap: break-word; }
            h2, .main-title { font-size: 24px; font-weight: 900; margin: 0 0 20px 0; padding-bottom: 15px; color: #1a1a1a; line-height: 1.4; }
            h3 { font-size: 18px; font-weight: 700; margin: 35px 0 15px 0; padding: 12px 16px; color: #1e40af; background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; }
            p { font-size: 14px; margin: 0 0 18px 0; color: #333; text-align: justify; line-height: 1.9; }
            ul { margin: 15px 0 20px 0; padding-left: 0; list-style: none; }
            li { font-size: 14px; margin-bottom: 12px; padding: 10px 15px 10px 30px; background: #f8fafc; border-radius: 8px; position: relative; line-height: 1.7; }
            li::before { content: '•'; position: absolute; left: 12px; color: #10b981; font-weight: bold; font-size: 18px; }
            img { max-width: 100%; height: auto; margin: 25px auto; display: block; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
            .content-image-wrapper { margin: 30px 0; text-align: center; }
            .content-image-wrapper img { margin: 0 auto; }
            .cta-box, [class*="cta"] { background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 2px solid #10b981; padding: 25px; margin: 30px 0; border-radius: 16px; page-break-inside: avoid; }
            .hashtags, [class*="hashtag"] { margin-top: 30px; padding: 15px; background: #f8fafc; border-radius: 12px; color: #64748b; font-size: 13px; }
            .hidden-title { display: none; }
          </style>
        </head>
        <body>
          ${styledHtml}
          <script>
            window.onload = function() {
              var images = document.querySelectorAll('img');
              var loadedCount = 0;
              var totalImages = images.length;
              function tryPrint() { setTimeout(function() { window.print(); }, 500); }
              if (totalImages === 0) { tryPrint(); return; }
              for (var i = 0; i < images.length; i++) {
                var img = images[i];
                if (img.complete) { loadedCount++; }
                else { img.onload = img.onerror = function() { loadedCount++; if (loadedCount >= totalImages) { tryPrint(); } }; }
              }
              if (loadedCount >= totalImages) { tryPrint(); }
              setTimeout(function() { window.print(); }, 5000);
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch {
      toast.error('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setEditProgress('');
    }
  }, [localHtml, currentTheme, content, applyInlineStylesForNaver]);

  const handleCopy = useCallback(async () => {
    try {
      const restoredHtml = restoreBase64Images(localHtml, content.generatedImages);
      const styledHtml = applyInlineStylesForNaver(restoredHtml, currentTheme);

      const parser = new DOMParser();
      const doc = parser.parseFromString(styledHtml, 'text/html');

      doc.querySelectorAll('[style]').forEach(el => {
        const style = el.getAttribute('style') || '';
        const cleanStyle = style
          .replace(/border-radius\s*:[^;]+;?/gi, '')
          .replace(/box-shadow\s*:[^;]+;?/gi, '')
          .replace(/outline\s*:[^;]+;?/gi, '');
        el.setAttribute('style', cleanStyle);
      });

      doc.querySelectorAll('p').forEach(p => {
        const style = p.getAttribute('style') || '';
        const cleanStyle = style
          .replace(/background\s*:[^;]+;?/gi, '')
          .replace(/background-color\s*:[^;]+;?/gi, '')
          .replace(/padding\s*:[^;]+;?/gi, '')
          .replace(/border\s*:[^;]+;?/gi, '')
          .replace(/border-radius\s*:[^;]+;?/gi, '');
        p.setAttribute('style', cleanStyle + ' border: none;');
      });

      const container = doc.querySelector('.naver-post-container');
      if (container) {
        const style = container.getAttribute('style') || '';
        const cleanStyle = style
          .replace(/border\s*:[^;]+;?/gi, '')
          .replace(/border-top\s*:[^;]+;?/gi, '')
          .replace(/border-bottom\s*:[^;]+;?/gi, '');
        container.setAttribute('style', cleanStyle);
      }

      doc.querySelectorAll('h2').forEach(h2 => {
        const textContent = h2.textContent?.trim() || '';
        const table = document.createElement('table');
        table.style.cssText = 'width: 100%; border-collapse: collapse; margin: 0 0 30px 0; border: none;';
        table.innerHTML = `
          <tr><td style="padding: 0 0 15px 0; font-size: 32px; font-weight: bold; color: #1a1a1a; font-family: '맑은 고딕', Malgun Gothic, sans-serif; line-height: 1.4; border: none;">${textContent}</td></tr>
          <tr><td style="height: 4px; background-color: #787fff; border: none;"></td></tr>
        `;
        h2.parentNode?.replaceChild(table, h2);
      });

      doc.querySelectorAll('h3').forEach(h3 => {
        const textContent = h3.textContent?.trim() || '';
        const table = document.createElement('table');
        table.style.cssText = 'width: 100%; border-collapse: collapse; margin: 25px 0 15px 0; border: none;';
        table.innerHTML = `
          <tr>
            <td style="width: 4px; background-color: #787fff; border: none;"></td>
            <td style="padding: 12px 16px; font-size: 18px; font-weight: bold; color: #1e40af; font-family: '맑은 고딕', Malgun Gothic, sans-serif; border: none;">${textContent}</td>
          </tr>
        `;
        h3.parentNode?.replaceChild(table, h3);
      });

      const finalHtml = doc.body.innerHTML;

      const tempDiv = document.createElement('div');
      tempDiv.contentEditable = 'true';
      tempDiv.innerHTML = finalHtml;
      tempDiv.style.position = 'fixed';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      document.body.appendChild(tempDiv);

      const range = document.createRange();
      range.selectNodeContents(tempDiv);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);

        const success = document.execCommand('copy');
        selection.removeAllRanges();
        document.body.removeChild(tempDiv);

        if (success) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          throw new Error('Copy failed');
        }
      }
    } catch (err) {
      try {
        const restoredFallback = restoreBase64Images(localHtml, content.generatedImages);
        const styledHtml = applyInlineStylesForNaver(restoredFallback);
        const htmlForClip = convertToWordCompatibleHtml(styledHtml);
        const blob = new Blob([htmlForClip], { type: 'text/html' });
        const plainText = new Blob([editorRef.current?.innerText || ''], { type: 'text/plain' });
        const item = new ClipboardItem({
          'text/html': blob,
          'text/plain': plainText,
        });
        await navigator.clipboard.write([item]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        console.error('클립보드 복사 실패:', err);
      }
    }
  }, [localHtml, currentTheme, editorRef, applyInlineStylesForNaver, content.generatedImages]);

  return {
    copied,
    editProgress,
    setEditProgress,
    handleDownloadWord,
    handleDownloadPDF,
    handleCopy,
    applyInlineStylesForNaver,
  };
}
