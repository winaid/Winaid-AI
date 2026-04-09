/**
 * 로컬 API 서버
 *
 * winai.kr 웹에서 이 로컬 앱으로 데이터를 전달하기 위한 REST API.
 * 포트: 17580
 */

import express from 'express';
import cors from 'cors';
import { saveCredentials, listAccounts, deleteCredentials, getCredentials } from '../utils/crypto';
import { getOrCreateContext, closeBrowser } from '../naver/login';
import { writeToNaverBlog, BlogPost } from '../naver/blogEditor';
import { log } from '../utils/logger';

const app = express();

app.use(cors({
  origin: ['https://winai.kr', 'https://www.winai.kr', 'http://localhost:3000', 'http://localhost:3001'],
}));
app.use(express.json({ limit: '10mb' }));

// ── 상태 확인 ──
app.get('/status', (_req, res) => {
  res.json({ status: 'running', version: '1.0.0', port: 17580 });
});

// ── 계정 등록 ──
app.post('/account/register', async (req, res) => {
  try {
    const { hospital_name, naver_id, naver_pw, blog_id } = req.body;
    if (!naver_id || !naver_pw || !blog_id) {
      return res.status(400).json({ error: '아이디, 비밀번호, 블로그 ID가 필요합니다.' });
    }

    const accountId = naver_id.replace(/[^a-zA-Z0-9]/g, '');
    await saveCredentials(accountId, {
      hospitalName: hospital_name || '',
      naverId: naver_id,
      naverPw: naver_pw,
      blogId: blog_id,
      createdAt: new Date().toISOString(),
    });

    log.success(`계정 등록: ${hospital_name || naver_id} (${blog_id})`);
    res.json({ success: true, account_id: accountId });
  } catch (err) {
    log.error(`계정 등록 실패: ${err}`);
    res.status(500).json({ error: '계정 등록 실패' });
  }
});

// ── 계정 목록 ──
app.get('/account/list', async (_req, res) => {
  try {
    const accounts = await listAccounts();
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: '계정 목록 조회 실패' });
  }
});

// ── 계정 삭제 ──
app.delete('/account/:id', async (req, res) => {
  try {
    await deleteCredentials(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: '계정 삭제 실패' });
  }
});

// ── 로그인 테스트 ──
app.post('/account/login-test', async (req, res) => {
  try {
    const { account_id } = req.body;
    if (!account_id) return res.status(400).json({ error: 'account_id 필요' });

    log.step(`로그인 테스트: ${account_id}`);
    await getOrCreateContext(account_id);
    res.json({ success: true, message: '로그인 성공' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '로그인 실패';
    res.status(500).json({ error: msg });
  }
});

// ── 블로그 발행 ──
app.post('/publish', async (req, res) => {
  try {
    const { account_id, title, content_html, tags } = req.body;
    if (!account_id || !title || !content_html) {
      return res.status(400).json({ error: 'account_id, title, content_html 필요' });
    }

    log.step(`블로그 입력 시작: "${title.slice(0, 30)}..."`);

    // 계정 정보에서 blogId 가져오기
    const creds = await getCredentials(account_id);

    // 로그인 + 컨텍스트
    const context = await getOrCreateContext(account_id);

    // 블로그 에디터에 자동 입력
    const post: BlogPost = {
      title,
      contentHtml: content_html,
      tags: tags || [],
    };

    const result = await writeToNaverBlog(context, creds.blogId, post);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '발행 실패';
    log.error(`발행 실패: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ── 브라우저 종료 ──
app.post('/shutdown', async (_req, res) => {
  log.info('앱 종료 요청...');
  await closeBrowser();
  res.json({ success: true });
  setTimeout(() => process.exit(0), 500);
});

export function startServer() {
  app.listen(17580, () => {
    log.success('WINAI Blog Publisher 실행 중 — http://localhost:17580');
    log.info('winai.kr에서 블로그 발행 버튼을 누르면 자동으로 처리됩니다.');
  });
}
