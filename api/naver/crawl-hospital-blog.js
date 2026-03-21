// POST /api/naver/crawl-hospital-blog — 병원 블로그 글 목록 + 본문 수집
// Ported from functions/api/naver/crawl-hospital-blog.ts

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://blog.naver.com/',
};

function extractBlogId(blogUrl) {
  const m = blogUrl.match(/blog\.naver\.com\/([^/?#]+)/);
  return m ? m[1] : null;
}

function parseNaverDate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (s.includes('T') && s.includes('-')) { const d = new Date(s); if (!isNaN(d.getTime())) return d; }
  const dotMatch = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/);
  if (dotMatch) return new Date(Number(dotMatch[1]), Number(dotMatch[2]) - 1, Number(dotMatch[3]));
  const dashMatch = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dashMatch) return new Date(Number(dashMatch[1]), Number(dashMatch[2]) - 1, Number(dashMatch[3]));
  const now = new Date();
  const hourAgo = s.match(/(\d+)\s*시간\s*전/);
  if (hourAgo) return new Date(now.getTime() - Number(hourAgo[1]) * 3600000);
  const minAgo = s.match(/(\d+)\s*분\s*전/);
  if (minAgo) return new Date(now.getTime() - Number(minAgo[1]) * 60000);
  const dayAgo = s.match(/(\d+)\s*일\s*전/);
  if (dayAgo) return new Date(now.getTime() - Number(dayAgo[1]) * 86400000);
  if (s.includes('어제')) return new Date(now.getTime() - 86400000);
  if (s.includes('그저께') || s.includes('그제')) return new Date(now.getTime() - 172800000);
  return null;
}

async function fetchLogNos(blogId, maxCandidates) {
  const seenLogNos = new Set();
  const logNos = [];
  let page = 1;

  while (logNos.length < maxCandidates && page <= 10) {
    const listUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&currentPage=${page}&categoryNo=0&postListType=&blogType=B`;
    const r = await fetch(listUrl, { headers: FETCH_HEADERS });
    if (!r.ok) break;
    const html = await r.text();
    let foundNew = 0;

    const p1 = /logNo=(\d{10,})/g;
    let m;
    while ((m = p1.exec(html)) !== null) {
      if (!seenLogNos.has(m[1])) { seenLogNos.add(m[1]); logNos.push(m[1]); foundNew++; }
    }
    const p2 = new RegExp(`blog\\.naver\\.com\\/${blogId}\\/(\\d{10,})`, 'g');
    while ((m = p2.exec(html)) !== null) {
      if (!seenLogNos.has(m[1])) { seenLogNos.add(m[1]); logNos.push(m[1]); foundNew++; }
    }

    console.log(`[Crawl] 페이지 ${page}: ${foundNew}개 신규 logNo 발견 (누적: ${logNos.length}개)`);
    if (foundNew === 0) break;
    page++;
  }

  logNos.sort((a, b) => Number(b) - Number(a));
  return logNos.slice(0, maxCandidates);
}

async function fetchPostContent(blogId, logNo) {
  const url = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
  const r = await fetch(url, { headers: FETCH_HEADERS });
  if (!r.ok) return null;
  const html = await r.text();

  let title = '';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1].replace(/\s*:\s*네이버\s*블로그$/i, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").trim();
  if (!title) { const m = html.match(/<[^>]*class="[^"]*se-title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i); if (m) title = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

  let publishedAt = '';
  const ogPatterns = [/<meta[^>]*property="og:createdate"[^>]*content="([^"]+)"/i, /<meta[^>]*content="([^"]+)"[^>]*property="og:createdate"/i];
  for (const op of ogPatterns) { const om = op.exec(html); if (om) { const d = parseNaverDate(om[1]); if (d) { publishedAt = d.toISOString(); break; } } }
  if (!publishedAt) {
    const fps = [/class="[^"]*se_publishDate[^"]*"[^>]*>([^<]+)/i, /class="[^"]*blog_date[^"]*"[^>]*>([^<]+)/i, /class="[^"]*date[^"]*"[^>]*>\s*(\d{4}[\s./-]+\d{1,2}[\s./-]+\d{1,2})/i];
    for (const fp of fps) { const fm = fp.exec(html); if (fm) { const d = parseNaverDate(fm[1].trim()); if (d) { publishedAt = d.toISOString(); break; } } }
  }

  let thumbnail = '';
  const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i);
  if (ogImage) thumbnail = ogImage[1];

  const paragraphs = [];
  let m;
  const cleanHtml = (raw) => raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').split('\n').map((l) => l.trim()).filter((l) => l.length > 0).join('\n').trim();

  const p1 = /<[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g;
  while ((m = p1.exec(html)) !== null) { const t = cleanHtml(m[1]); if (t.length > 5) paragraphs.push(t); }

  if (paragraphs.length === 0) { const p2 = /<div[^>]*class="[^"]*se-module-text[^"]*"[^>]*>([\s\S]*?)<\/div>/g; while ((m = p2.exec(html)) !== null) { const t = cleanHtml(m[1]); if (t.length > 5) paragraphs.push(t); } }
  if (paragraphs.length === 0) { const p3 = /<div[^>]*class="[^"]*se_component_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g; while ((m = p3.exec(html)) !== null) { const t = cleanHtml(m[1]); if (t.length > 5) paragraphs.push(t); } }
  if (paragraphs.length === 0) {
    const areaMatch = html.match(/id="postViewArea"[^>]*>([\s\S]+)/i);
    if (areaMatch) {
      let chunk = areaMatch[1];
      for (const marker of ['class="post_footer"', 'class="comment_area"', 'class="area_sympathy"', 'class="wrap_postdata"', 'class="post_tag"']) { const idx = chunk.indexOf(marker); if (idx > 0) chunk = chunk.substring(0, idx); }
      const t = cleanHtml(chunk);
      if (t.length > 30) paragraphs.push(t);
    }
  }
  if (paragraphs.length === 0) { const p5 = /<p[^>]*>([\s\S]*?)<\/p>/g; const allP = []; while ((m = p5.exec(html)) !== null) { const t = cleanHtml(m[1]); if (t.length > 15) allP.push(t); } if (allP.length >= 2) paragraphs.push(...allP); }
  if (paragraphs.length === 0) {
    const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i);
    if (ogDesc) { const desc = cleanHtml(ogDesc[1]); if (desc.length > 30) paragraphs.push(desc); }
  }

  const content = paragraphs.join('\n\n');
  if (content.length <= 30) return null;

  return { logNo, url: `https://blog.naver.com/${blogId}/${logNo}`, content, title, publishedAt, summary: content.substring(0, 200).replace(/\n/g, ' ').trim(), thumbnail };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { blogUrl, maxPosts = 10 } = req.body || {};

    if (!blogUrl || !blogUrl.includes('blog.naver.com')) {
      return res.status(400).json({ error: 'Invalid URL', message: '네이버 블로그 URL을 입력해주세요. (blog.naver.com/...)' });
    }

    const blogId = extractBlogId(blogUrl);
    if (!blogId) {
      return res.status(400).json({ error: 'Cannot extract blogId', message: 'blog.naver.com/아이디 형태의 URL이어야 합니다.' });
    }

    const limited = Math.min(Number(maxPosts) || 10, 20);
    console.log(`🏥 블로그 수집 시작: ${blogId} (목표: ${limited}개)`);

    const candidates = Math.min(limited * 3, 60);
    const logNos = await fetchLogNos(blogId, candidates);

    const posts = [];
    let skipped = 0;
    for (const logNo of logNos) {
      if (posts.length >= limited) break;
      const result = await fetchPostContent(blogId, logNo);
      if (result) posts.push(result); else skipped++;
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`[Crawl] 본문 수집: ${posts.length}개 성공, ${skipped}개 스킵`);

    posts.sort((a, b) => {
      if (a.publishedAt && b.publishedAt) return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (a.publishedAt && !b.publishedAt) return -1;
      if (!a.publishedAt && b.publishedAt) return 1;
      return Number(b.logNo) - Number(a.logNo);
    });

    const output = posts.map(({ logNo: _logNo, ...rest }) => rest);

    return res.status(200).json({
      success: true,
      blogUrl,
      blogId,
      posts: output,
      postsCount: output.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('병원 블로그 크롤링 에러:', err);
    return res.status(500).json({ error: 'Crawling Failed', message: err.message });
  }
}
