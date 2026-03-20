#!/usr/bin/env bash
#
# test-proxy.sh — Vercel Gemini Proxy 검증 스크립트
#
# 사용법:
#   ./test-proxy.sh                    # 전체 검증 (health + text + image)
#   ./test-proxy.sh health             # health만
#   ./test-proxy.sh text               # text만
#   ./test-proxy.sh image              # single image만
#   ./test-proxy.sh batch              # multi-image batch
#
# 환경변수:
#   PROXY_URL  — 프록시 base URL (기본: https://vercel-proxy-ten-jade.vercel.app)
#   IMG_TIMEOUT — 이미지 요청 timeout (ms, 기본: 90000)
#

set -euo pipefail

PROXY_URL="${PROXY_URL:-https://vercel-proxy-ten-jade.vercel.app}"
GEMINI_ENDPOINT="${PROXY_URL}/api/gemini"
HEALTH_ENDPOINT="${PROXY_URL}/api/health"
IMG_TIMEOUT="${IMG_TIMEOUT:-90000}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[$(date -u +%H:%M:%S)]${NC} $*"; }
ok()  { echo -e "  ${GREEN}✅ $*${NC}"; }
fail() { echo -e "  ${RED}❌ $*${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $*${NC}"; }

# ── Health Check ──
test_health() {
  log "=== A. HEALTH CHECK ==="

  for ep in "$HEALTH_ENDPOINT" "$GEMINI_ENDPOINT"; do
    local label=$(echo "$ep" | grep -oP '/api/\K\w+')
    local start=$SECONDS
    local resp
    resp=$(curl -s -w '\n{"_http_code":%{http_code},"_time":"%{time_total}"}' \
      --max-time 15 "$ep" 2>&1) || true
    local code=$(echo "$resp" | tail -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['_http_code'])" 2>/dev/null || echo "000")
    local time_s=$(echo "$resp" | tail -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['_time'])" 2>/dev/null || echo "?")

    if [ "$code" = "200" ]; then
      ok "GET /api/$label → $code (${time_s}s)"
      # Extract key info
      echo "$resp" | head -1 | python3 -c "
import sys, json
try:
  d = json.loads(sys.stdin.readline())
  region = d.get('region', '?')
  keys = d.get('keys', '?')
  cooldowns = d.get('cooldowns', '?')
  print(f'     region={region} keys={keys} cooldowns={cooldowns}')
except: pass
" 2>/dev/null || true
    else
      fail "GET /api/$label → $code (${time_s}s)"
    fi
  done
}

# ── Text API ──
test_text() {
  log "=== B. TEXT API ==="
  local start_ns=$(date +%s%N)
  local resp
  resp=$(curl -s -w '\n{"_http_code":%{http_code},"_time":"%{time_total}","_size":%{size_download}}' \
    --max-time 60 \
    -X POST "$GEMINI_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{
      "prompt": "Say hello in Korean, one sentence only.",
      "model": "gemini-3.1-flash-lite-preview",
      "temperature": 0.5,
      "maxOutputTokens": 50,
      "timeout": 30000
    }' 2>&1) || true
  local end_ns=$(date +%s%N)
  local wall_ms=$(( (end_ns - start_ns) / 1000000 ))

  local code=$(echo "$resp" | tail -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['_http_code'])" 2>/dev/null || echo "000")
  local size=$(echo "$resp" | tail -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['_size'])" 2>/dev/null || echo "0")

  if [ "$code" = "200" ]; then
    local text=$(echo "$resp" | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('text','')[:80])" 2>/dev/null || echo "?")
    ok "TEXT → $code (${wall_ms}ms, ${size}B) text=\"$text\""
  else
    fail "TEXT → $code (${wall_ms}ms)"
    echo "     $(echo "$resp" | head -1 | head -c 200)"
  fi
}

# ── Single Image ──
test_image() {
  log "=== C. SINGLE IMAGE (raw mode, timeout=${IMG_TIMEOUT}ms) ==="
  local start_ns=$(date +%s%N)
  local max_curl=$(( IMG_TIMEOUT / 1000 + 120 ))  # generous curl timeout
  local resp
  resp=$(curl -s -w '\n{"_http_code":%{http_code},"_time":"%{time_total}","_size":%{size_download}}' \
    --max-time "$max_curl" \
    -X POST "$GEMINI_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{
      \"raw\": true,
      \"model\": \"gemini-3-pro-image-preview\",
      \"apiBody\": {
        \"contents\": [{\"role\": \"user\", \"parts\": [{\"text\": \"Generate a simple 1:1 square blue gradient card image with white text Hello in center\"}]}],
        \"generationConfig\": {
          \"responseModalities\": [\"IMAGE\", \"TEXT\"],
          \"temperature\": 0.4
        }
      },
      \"timeout\": $IMG_TIMEOUT
    }" 2>&1) || true
  local end_ns=$(date +%s%N)
  local wall_ms=$(( (end_ns - start_ns) / 1000000 ))

  local code=$(echo "$resp" | tail -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['_http_code'])" 2>/dev/null || echo "000")
  local size=$(echo "$resp" | tail -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['_size'])" 2>/dev/null || echo "0")
  local has_image=$(echo "$resp" | head -c 500 | grep -c 'inlineData' || true)

  if [ "$code" = "200" ] && [ "$has_image" -gt 0 ]; then
    ok "IMAGE → $code (${wall_ms}ms, ${size}B) — image data received"
    echo "$resp" | python3 -c "
import sys, json
try:
  data = json.loads(sys.stdin.readline())
  parts = data.get('candidates',[{}])[0].get('content',{}).get('parts',[])
  for i,p in enumerate(parts):
    if 'inlineData' in p:
      sz = len(p['inlineData'].get('data',''))
      print(f'     Part {i}: image ({p[\"inlineData\"].get(\"mimeType\",\"?\")}) base64={sz} (~{sz*3//4//1024}KB)')
    elif 'text' in p:
      print(f'     Part {i}: text \"{p[\"text\"][:60]}\"')
except: pass
" 2>/dev/null || true
  else
    fail "IMAGE → $code (${wall_ms}ms, ${size}B)"
    echo "     $(echo "$resp" | head -1 | head -c 300)"
  fi
}

# ── Batch ──
test_batch() {
  local count=${1:-2}
  log "=== D. BATCH: $count concurrent image requests ==="
  local start_ns=$(date +%s%N)
  local tmpdir=$(mktemp -d)

  for i in $(seq 1 "$count"); do
    (
      local s=$(date +%s%N)
      local r
      r=$(curl -s -w '\n{"_http_code":%{http_code},"_time":"%{time_total}"}' \
        --max-time 200 \
        -X POST "$GEMINI_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{
          \"raw\": true,
          \"model\": \"gemini-3-pro-image-preview\",
          \"apiBody\": {
            \"contents\": [{\"role\": \"user\", \"parts\": [{\"text\": \"Generate card image $i blue background white text\"}]}],
            \"generationConfig\": {
              \"responseModalities\": [\"IMAGE\", \"TEXT\"],
              \"temperature\": 0.4
            }
          },
          \"timeout\": $IMG_TIMEOUT
        }" 2>&1) || true
      local e=$(date +%s%N)
      local w=$(( (e - s) / 1000000 ))
      local c=$(echo "$r" | tail -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['_http_code'])" 2>/dev/null || echo "000")
      local img=$(echo "$r" | head -c 500 | grep -c 'inlineData' || true)
      echo "Card $i: HTTP=$c wall=${w}ms hasImage=$img" > "$tmpdir/card_$i.txt"
    ) &
  done

  wait

  for i in $(seq 1 "$count"); do
    local result=$(cat "$tmpdir/card_$i.txt" 2>/dev/null || echo "Card $i: no result")
    if echo "$result" | grep -q "hasImage=1"; then
      ok "$result"
    else
      fail "$result"
    fi
  done

  local end_ns=$(date +%s%N)
  local total_ms=$(( (end_ns - start_ns) / 1000000 ))
  log "Batch total wall time: ${total_ms}ms"
  rm -rf "$tmpdir"
}

# ── Main ──
mode="${1:-all}"

echo "========================================"
echo " Vercel Gemini Proxy Verification"
echo " Endpoint: $PROXY_URL"
echo " Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "========================================"
echo ""

case "$mode" in
  health) test_health ;;
  text)   test_text ;;
  image)  test_image ;;
  batch)  test_batch "${2:-2}" ;;
  all)
    test_health
    echo ""
    test_text
    echo ""
    test_image
    echo ""
    test_batch 2
    ;;
  *)
    echo "Usage: $0 [health|text|image|batch [count]|all]"
    exit 1
    ;;
esac

echo ""
log "Done."
