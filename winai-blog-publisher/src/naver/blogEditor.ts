/**
 * 네이버 블로그 스마트에디터 자동 입력
 *
 * 제목 + 본문(HTML 서식) + 태그까지 자동 입력.
 * 이미지 추가와 발행은 사용자가 직접 처리.
 *
 * 보안: contentHtml 은 DOMPurify 로 sanitize 후 insertHTML.
 *   - <script>, on* 핸들러, javascript: URI 차단
 *   - 네이버 쿠키(NID_SES) XSS 탈취 방어
 */

import { BrowserContext } from 'playwright';
import DOMPurify from 'isomorphic-dompurify';
import { SELECTORS } from './login';
import { log } from '../utils/logger';

export interface BlogPost {
  title: string;
  contentHtml: string;
  tags: string[];
  category?: string;
}

// 네이버 블로그 발행용 허용 태그 — 본문 표현에 필요한 최소 set
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'em', 'u', 'b', 'i', 's', 'mark',
  'a',
  'ul', 'ol', 'li',
  'img',
  'blockquote',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'span', 'div',
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel',
  'src', 'alt', 'title',
  'class', 'id',
  'style', // 인라인 스타일 (폰트 색·굵기 등 — 네이버 에디터 호환). 위험 속성은 ALLOWED_URI_REGEXP 로 보강.
  'colspan', 'rowspan',
];

/**
 * HTML sanitize 결과.
 * - clean: sanitize 된 HTML
 * - removed: 원본 길이와 차이 (대략적 변경 감지)
 */
function sanitizeHtml(input: string): { clean: string; removed: boolean } {
  const clean = DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // <script>, <iframe>, <object>, <embed>, <form> 자동 차단 (ALLOWED_TAGS 화이트리스트라)
    // on* 이벤트 속성 자동 차단 (ALLOWED_ATTR 화이트리스트라)
    // javascript: URI 차단
    ALLOWED_URI_REGEXP: /^(?:(?:https?|data|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    // FORBID_ATTR 명시 (방어 심화)
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    // 외부 host 의 src 도 허용 (이미지 URL — 다만 javascript: / data:script 는 위 URI regexp 가 차단)
    ADD_DATA_URI_TAGS: ['img'],
  });

  // 길이 차이로 변경 감지 (정확하지 않지만 사용자 경고용)
  const removed = clean.length !== input.length;
  return { clean, removed };
}

export async function writeToNaverBlog(
  context: BrowserContext,
  blogId: string,
  post: BlogPost,
): Promise<{ success: boolean; message: string; warning?: string }> {

  // contentHtml sanitize — execCommand insertHTML 직전 단계
  const { clean: safeHtml, removed } = sanitizeHtml(post.contentHtml);
  if (removed) {
    log.warn('contentHtml 의 일부 태그/속성이 sanitize 로 제거됨 (XSS 방어).');
  }

  const page = await context.newPage();

  try {
    // 1. 블로그 글쓰기 페이지
    log.step('블로그 글쓰기 페이지 이동...');
    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, { waitUntil: 'networkidle', timeout: 30000 });

    // 에디터 로드 대기
    await page.waitForTimeout(2000);

    // 2. 제목 입력
    log.step(`제목 입력: "${post.title.slice(0, 30)}..."`);
    try {
      await page.waitForSelector(SELECTORS.editorTitle, { timeout: 10000 });
      await page.click(SELECTORS.editorTitle);
      await page.keyboard.type(post.title, { delay: 25 });
    } catch {
      // fallback: 다른 제목 셀렉터 시도
      const titleAlt = await page.$('.se-title-text, .post_title input, #post-title-input');
      if (titleAlt) {
        await titleAlt.click();
        await page.keyboard.type(post.title, { delay: 25 });
      } else {
        log.warn('제목 입력 영역을 찾지 못했습니다.');
      }
    }

    // 3. 본문 입력 (HTML 서식 포함, sanitize 완료된 safeHtml 사용)
    log.step('본문 입력...');
    await page.waitForTimeout(500);

    try {
      // 본문 영역 클릭
      const contentSel = SELECTORS.editorContent;
      await page.waitForSelector(contentSel, { timeout: 10000 });
      await page.click(contentSel);

      // sanitize 된 HTML 만 insertHTML — 원본 contentHtml 절대 사용 금지
      await page.evaluate((html: string) => {
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
        document.execCommand('insertHTML', false, html);
      }, safeHtml);

    } catch {
      // fallback: 텍스트만 입력
      log.warn('HTML 서식 입력 실패 — 텍스트만 입력합니다.');
      const plain = safeHtml.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      const contentArea = await page.$('.se-component-content, .se-text-paragraph');
      if (contentArea) {
        await contentArea.click();
        await page.keyboard.type(plain, { delay: 10 });
      }
    }

    // 4. 태그 입력
    if (post.tags.length > 0) {
      log.step(`태그 입력: ${post.tags.join(', ')}`);
      await page.waitForTimeout(500);

      try {
        const tagInput = await page.$(SELECTORS.tagInput);
        if (tagInput) {
          for (const tag of post.tags) {
            await tagInput.click();
            await page.keyboard.type(tag, { delay: 20 });
            await page.keyboard.press('Enter');
            await page.waitForTimeout(300);
          }
        }
      } catch {
        log.warn('태그 입력 영역을 찾지 못했습니다.');
      }
    }

    // 5. 완료 — 페이지를 열어둔 채로 리턴
    log.success('글 자동 입력 완료!');
    log.info('이미지를 추가하고 발행 버튼을 눌러주세요.');
    log.info(`제목: ${post.title}`);
    log.info(`태그: ${post.tags.join(', ')}`);

    // page.close() 안 함! 사용자가 이미지 추가 + 발행해야 하므로

    return {
      success: true,
      message: '글 자동 입력 완료. 이미지를 추가하고 발행해주세요.',
      ...(removed ? { warning: '본문 HTML 의 일부 태그/속성이 보안상 제거됨. 결과 확인 권장.' } : {}),
    };

  } catch (err) {
    log.error(`블로그 입력 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    return { success: false, message: err instanceof Error ? err.message : '입력 실패' };
  }
}
