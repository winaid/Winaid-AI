#!/usr/bin/env bash
# Gemini Proxy Worker 배포 스크립트
# 사용법: cd workers/gemini-proxy && bash deploy.sh
#
# 사전 조건:
#   - npx wrangler가 사용 가능해야 함
#   - Cloudflare 계정 인증이 되어 있어야 함 (wrangler login 또는 CLOUDFLARE_API_TOKEN)

set -euo pipefail

echo "=== Gemini Proxy Worker 배포 ==="
echo ""

# 1. 빌드 검증 (dry-run)
echo "[1/4] 빌드 검증..."
npx wrangler deploy --dry-run --outdir=dist-check --config wrangler.toml 2>&1 | tail -3
rm -rf dist-check
echo "  ✅ 빌드 성공"
echo ""

# 2. Worker 배포
echo "[2/4] Worker 배포..."
npx wrangler deploy --config wrangler.toml
WORKER_URL=$(npx wrangler deployments list --config wrangler.toml 2>/dev/null | grep -oP 'https://[^ ]+' | head -1 || echo "")
echo ""

# 3. 시크릿 설정 안내
echo "[3/4] API 키 시크릿 설정"
echo "  이미 설정되어 있으면 건너뛰세요."
echo "  설정 명령어:"
echo "    npx wrangler secret put GEMINI_API_KEY --config wrangler.toml"
echo "    npx wrangler secret put GEMINI_API_KEY_2 --config wrangler.toml  (선택)"
echo "    npx wrangler secret put GEMINI_API_KEY_3 --config wrangler.toml  (선택)"
echo ""

# 4. 검증
echo "[4/4] 배포 검증"
echo "  아래 curl 명령으로 확인하세요 (WORKER_URL을 실제 URL로 교체):"
echo ""
echo "  # 텍스트 생성 테스트:"
echo '  curl -s -X POST WORKER_URL/generate \'
echo '    -H "Content-Type: application/json" \'
echo '    -d '"'"'{"prompt":"안녕","model":"gemini-3.1-flash-lite-preview"}'"'"' | head -c 200'
echo ""
echo "  # Raw 모드 테스트 (이미지):"
echo '  curl -s -X POST WORKER_URL/generate \'
echo '    -H "Content-Type: application/json" \'
echo '    -d '"'"'{"raw":true,"model":"gemini-3-pro-image-preview","apiBody":{"contents":[{"role":"user","parts":[{"text":"파란 하늘"}]}],"generationConfig":{"responseModalities":["IMAGE","TEXT"]}}}'"'"' | head -c 200'
echo ""
echo "=== 배포 완료 ==="
echo ""
echo "⚠️ 다음 단계:"
echo "  1. Cloudflare Pages 환경변수에서 VITE_GEMINI_PROXY_URL을 Worker URL/generate로 변경"
echo "  2. npm run deploy 로 Pages 재배포"
