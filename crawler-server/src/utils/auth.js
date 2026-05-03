/**
 * Bearer 토큰 인증 미들웨어.
 *
 * 사용자 호출:
 *   Authorization: Bearer <hex>   (대소문자 구분 없음)
 *
 * production: process.env.CRAWLER_SHARED_SECRET 가 필수. 미설정 시 server boot 시
 * fail-fast (process.exit(1)). dev/test: 32-byte 무작위 자동 생성 + 콘솔 출력
 * (silent-allow 회귀 차단; 호출자는 출력된 hex 를 Authorization 헤더로 사용).
 *
 * `skipPaths` 에 명시된 path prefix 는 통과 (/health 만 권장).
 * timing-safe equal 로 길이 mismatch 도 즉시 false.
 */

const { timingSafeEqual, randomBytes } = require('crypto');

function resolveSharedSecret() {
  const raw = process.env.CRAWLER_SHARED_SECRET;
  const env = (raw || '').trim();
  if (env) return env;
  if (process.env.NODE_ENV === 'production') {
    // Railway 환경변수 진단 — secret 누설 없이 상태만:
    //   - 변수 자체 미정의: 'CRAWLER_SHARED_SECRET' in env false
    //   - 빈 문자열/공백만: trim 후 length=0
    //   - 다른 service 에 설정: NODE_ENV=production 인데 본 service 환경에 없음
    const inEnv = 'CRAWLER_SHARED_SECRET' in process.env;
    const rawLen = raw === undefined ? -1 : raw.length;
    const trimLen = env.length;
    console.error('FATAL: CRAWLER_SHARED_SECRET is required in production.');
    console.error(`  diag: NODE_ENV=${process.env.NODE_ENV} in_env=${inEnv} raw_len=${rawLen} trim_len=${trimLen}`);
    console.error('  fix: Railway Dashboard > crawler-server service > Variables 에 CRAWLER_SHARED_SECRET 설정 후 redeploy.');
    console.error('       (next-app / video-processor 등 다른 service 가 아닌 crawler-server service 에 설정해야 함.)');
    process.exit(1);
  }
  const generated = randomBytes(32).toString('hex');
  console.warn('⚠️  CRAWLER_SHARED_SECRET 환경변수 미설정 — dev 임시 시크릿 자동 생성:');
  console.warn(`   ${generated}`);
  console.warn('   클라이언트 호출 시 Authorization: Bearer <위 값> 헤더 사용.');
  return generated;
}

const SHARED_SECRET = resolveSharedSecret();

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Express middleware factory.
 * @param {string[]} [skipPaths] path prefix list (예: ['/health'])
 */
function bearerAuth(skipPaths = []) {
  return function (req, res, next) {
    if (skipPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) {
      return next();
    }
    const header = req.get('authorization') || req.get('Authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!safeEqual(match[1], SHARED_SECRET)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    return next();
  };
}

module.exports = { bearerAuth, SHARED_SECRET };
