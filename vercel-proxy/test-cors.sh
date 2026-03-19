#!/bin/bash
# Vercel 프록시 CORS preflight 테스트
# 사용법: bash vercel-proxy/test-cors.sh

PROXY_URL="https://vercel-proxy-ten-jade.vercel.app/api/gemini"

echo "=== Vercel Proxy CORS Preflight Test ==="
echo "Target: $PROXY_URL"
echo ""

# 테스트할 origin 목록
ORIGINS=(
  "https://preview.story-darugi.com"
  "https://ai-hospital.pages.dev"
  "https://story-darugi.com"
  "https://www.story-darugi.com"
  "https://d0507fad.ai-hospital.pages.dev"
)

for ORIGIN in "${ORIGINS[@]}"; do
  echo "--- Origin: $ORIGIN ---"

  # OPTIONS preflight 요청
  RESPONSE=$(curl -s -D - -o /dev/null \
    -X OPTIONS \
    -H "Origin: $ORIGIN" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type" \
    "$PROXY_URL" 2>&1)

  # Access-Control-Allow-Origin 헤더 추출
  ACAO=$(echo "$RESPONSE" | grep -i "access-control-allow-origin" | tr -d '\r')
  STATUS=$(echo "$RESPONSE" | head -1 | awk '{print $2}')

  if [ -z "$ACAO" ]; then
    echo "  ❌ FAIL: No Access-Control-Allow-Origin header"
    echo "  HTTP Status: $STATUS"
  else
    echo "  $ACAO"
    # origin이 echo-back 되는지 확인
    if echo "$ACAO" | grep -q "$ORIGIN"; then
      echo "  ✅ PASS: Origin correctly reflected"
    else
      echo "  ❌ FAIL: Origin mismatch"
    fi
    echo "  HTTP Status: $STATUS"
  fi
  echo ""
done

echo "--- Health Check (GET) ---"
curl -s "$PROXY_URL" | python3 -m json.tool 2>/dev/null || curl -s "$PROXY_URL"
echo ""
