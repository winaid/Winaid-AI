/**
 * 네이버 블로그 스마트에디터 자동 입력
 *
 * 제목 + 본문(HTML 서식) + 태그까지 자동 입력.
 * 이미지 추가와 발행은 사용자가 직접 처리.
 */

import { BrowserContext } from 'playwright';
import { SELECTORS } from './login';
import { log } from '../utils/logger';

export interface BlogPost {
  title: string;
  contentHtml: string;
  tags: string[];
  category?: string;
}

export async function writeToNaverBlog(
  context: BrowserContext,
  blogId: string,
  post: BlogPost,
): Promise<{ success: boolean; message: string }> {

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

    // 3. 본문 입력 (HTML 서식 포함)
    log.step('본문 입력...');
    await page.waitForTimeout(500);

    try {
      // 본문 영역 클릭
      const contentSel = SELECTORS.editorContent;
      await page.waitForSelector(contentSel, { timeout: 10000 });
      await page.click(contentSel);

      // HTML을 클립보드 붙여넣기로 삽입 (서식 유지)
      await page.evaluate((html: string) => {
        // 방법 1: execCommand insertHTML
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
        document.execCommand('insertHTML', false, html);
      }, post.contentHtml);

    } catch {
      // fallback: 텍스트만 입력
      log.warn('HTML 서식 입력 실패 — 텍스트만 입력합니다.');
      const plain = post.contentHtml.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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

    return { success: true, message: '글 자동 입력 완료. 이미지를 추가하고 발행해주세요.' };

  } catch (err) {
    log.error(`블로그 입력 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    return { success: false, message: err instanceof Error ? err.message : '입력 실패' };
  }
}
