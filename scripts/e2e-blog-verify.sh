#!/bin/bash
# ═══════════════════════════════════════════════════════
# 블로그 코어 E2E 검증 — 실제 Gemini 프록시 사용
# curl로 5회 블로그 생성, 결과를 JSON으로 저장 후 Node.js로 분석
# ═══════════════════════════════════════════════════════

set -euo pipefail

PROXY_URL="https://vercel-proxy-ten-jade.vercel.app/api/gemini"
RESULTS_DIR="/tmp/blog-e2e-results"
mkdir -p "$RESULTS_DIR"

# 5개 주제
TOPICS=(
  "임플란트 수술 후 관리법과 주의사항"
  "어린이 충치 예방을 위한 불소 도포 안내"
  "잇몸 출혈 원인과 치주 질환 자가진단법"
  "치아 교정 기간 중 구강 관리 요령"
  "사랑니 발치 시기와 수술 후 회복 과정"
)

echo "═══════════════════════════════════════════════════════"
echo "  블로그 코어 E2E 검증 — 실제 Gemini 프록시"
echo "  프록시: $PROXY_URL"
echo "  주제 수: ${#TOPICS[@]}"
echo "═══════════════════════════════════════════════════════"

# 프록시 health check
echo -n "[Health] 프록시 상태: "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "${PROXY_URL%/gemini}/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ OK (HTTP $HTTP_CODE)"
else
  echo "❌ FAIL (HTTP $HTTP_CODE)"
  exit 1
fi

# ── 텍스트 생성 함수 ──
generate_blog_text() {
  local idx=$1
  local topic=$2
  local output_file="$RESULTS_DIR/text_${idx}.json"

  local prompt="당신은 치과 전문 블로그 작성자입니다. '${topic}'에 대한 블로그 글을 작성하세요.

반드시 아래 형식의 JSON으로 응답하세요:
{
  \"title\": \"SEO 최적화된 블로그 제목\",
  \"intro\": \"도입부 (2-3문장)\",
  \"sections\": [
    {\"heading\": \"소제목1\", \"content\": \"본문1 (3-5문장)\"},
    {\"heading\": \"소제목2\", \"content\": \"본문2 (3-5문장)\"},
    {\"heading\": \"소제목3\", \"content\": \"본문3 (3-5문장)\"},
    {\"heading\": \"소제목4\", \"content\": \"본문4 (3-5문장)\"}
  ],
  \"conclusion\": \"결론 (2-3문장)\",
  \"imagePrompt\": \"이 글의 hero 이미지를 위한 영문 프롬프트\"
}"

  local body
  body=$(cat <<ENDJSON
{
  "prompt": $(echo "$prompt" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"),
  "model": "gemini-3.1-flash-lite-preview",
  "responseType": "json",
  "timeout": 60000
}
ENDJSON
)

  local start_ms=$(($(date +%s%N) / 1000000))

  local response
  response=$(curl -s --connect-timeout 15 --max-time 120 \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$PROXY_URL" 2>/dev/null) || {
    echo "{\"error\": \"curl failed\", \"duration_ms\": $(($(date +%s%N) / 1000000 - start_ms))}" > "$output_file"
    return 1
  }

  local end_ms=$(($(date +%s%N) / 1000000))
  local duration=$((end_ms - start_ms))

  # 프록시 응답에서 text 추출
  local text
  text=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'text' in data:
        print(data['text'])
    elif 'error' in data:
        print(json.dumps({'error': data['error']}))
    else:
        print(json.dumps(data))
except:
    print(sys.stdin.read() if hasattr(sys.stdin, 'read') else '')
" 2>/dev/null) || text="$response"

  # JSON 파싱 시도
  local parsed
  parsed=$(echo "$text" | python3 -c "
import sys, json, re
raw = sys.stdin.read().strip()
# ```json ... ``` 블록 추출
m = re.search(r'\`\`\`json\s*(.*?)\s*\`\`\`', raw, re.DOTALL)
if m:
    raw = m.group(1)
else:
    # { ... } 블록 추출
    m = re.search(r'(\{.*\})', raw, re.DOTALL)
    if m:
        raw = m.group(1)
try:
    obj = json.loads(raw)
    obj['_duration_ms'] = $duration
    obj['_raw_length'] = len(raw)
    print(json.dumps(obj, ensure_ascii=False))
except json.JSONDecodeError:
    # Extra data 등 — 첫 번째 유효한 JSON 객체만 추출
    import re as re2
    depth = 0
    start_idx = raw.find('{')
    if start_idx >= 0:
        for ci, ch in enumerate(raw[start_idx:], start_idx):
            if ch == '{': depth += 1
            elif ch == '}': depth -= 1
            if depth == 0:
                try:
                    obj = json.loads(raw[start_idx:ci+1])
                    obj['_duration_ms'] = $duration
                    obj['_raw_length'] = len(raw)
                    obj['_parse_recovery'] = True
                    print(json.dumps(obj, ensure_ascii=False))
                except:
                    print(json.dumps({
                        'error': 'JSON recovery failed',
                        '_raw_preview': raw[:500],
                        '_duration_ms': $duration
                    }, ensure_ascii=False))
                break
    else:
        print(json.dumps({
            'error': 'no JSON object found',
            '_raw_preview': raw[:500],
            '_duration_ms': $duration
        }, ensure_ascii=False))
" 2>/dev/null)

  echo "$parsed" > "$output_file"
  return 0
}

# ── 이미지 생성 함수 ──
generate_hero_image() {
  local idx=$1
  local image_prompt=$2
  local output_file="$RESULTS_DIR/image_${idx}.json"

  local body
  body=$(cat <<ENDJSON
{
  "raw": true,
  "model": "gemini-3.1-flash-image-preview",
  "apiBody": {
    "contents": [{
      "parts": [{
        "text": "Generate a 16:9 dental health illustration: ${image_prompt}. Style: modern 3D illustration, soft pastel colors, professional medical context."
      }]
    }],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"]
    }
  },
  "timeout": 60000
}
ENDJSON
)

  local start_ms=$(($(date +%s%N) / 1000000))

  local response
  response=$(curl -s --connect-timeout 15 --max-time 90 \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$PROXY_URL" 2>/dev/null) || {
    echo "{\"status\": \"failed\", \"error\": \"curl failed\", \"duration_ms\": $(($(date +%s%N) / 1000000 - start_ms))}" > "$output_file"
    return 1
  }

  local end_ms=$(($(date +%s%N) / 1000000))
  local duration=$((end_ms - start_ms))

  # 이미지 데이터 존재 여부 확인
  local has_image
  has_image=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    candidates = data.get('candidates', [])
    for c in candidates:
        for part in c.get('content', {}).get('parts', []):
            if 'inlineData' in part:
                mime = part['inlineData'].get('mimeType', '')
                data_len = len(part['inlineData'].get('data', ''))
                print(json.dumps({
                    'status': 'ai-image',
                    'mimeType': mime,
                    'dataLength': data_len,
                    'duration_ms': $duration
                }))
                sys.exit(0)
    # 이미지 없음 — 텍스트만 응답
    print(json.dumps({
        'status': 'no-image',
        'duration_ms': $duration
    }))
except Exception as e:
    print(json.dumps({
        'status': 'parse-error',
        'error': str(e),
        'duration_ms': $duration,
        'raw_preview': sys.stdin.read()[:200] if hasattr(sys.stdin, 'read') else ''
    }))
" 2>/dev/null)

  echo "$has_image" > "$output_file"
  return 0
}

# ═══════════════════════════════════════════════════════
# 5회 실행
# ═══════════════════════════════════════════════════════

for i in "${!TOPICS[@]}"; do
  idx=$((i + 1))
  topic="${TOPICS[$i]}"
  echo ""
  echo "─── E2E-${idx}/5: ${topic} ───"

  # 1. 텍스트 생성
  echo -n "  [텍스트] "
  if generate_blog_text "$idx" "$topic"; then
    local_result=$(cat "$RESULTS_DIR/text_${idx}.json")
    has_title=$(echo "$local_result" | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅' if d.get('title') else '❌')" 2>/dev/null || echo "❌")
    has_sections=$(echo "$local_result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('sections',[])) if isinstance(d.get('sections'), list) else 0)" 2>/dev/null || echo "0")
    has_conclusion=$(echo "$local_result" | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅' if d.get('conclusion') else '❌')" 2>/dev/null || echo "❌")
    duration=$(echo "$local_result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('_duration_ms', '?'))" 2>/dev/null || echo "?")
    echo "title=${has_title} sections=${has_sections} conclusion=${has_conclusion} (${duration}ms)"
  else
    echo "❌ 실패"
  fi

  # 2. 이미지 생성
  echo -n "  [이미지] "
  image_prompt=$(cat "$RESULTS_DIR/text_${idx}.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('imagePrompt', 'dental health illustration'))" 2>/dev/null || echo "dental health illustration")
  if generate_hero_image "$idx" "$image_prompt"; then
    img_result=$(cat "$RESULTS_DIR/image_${idx}.json")
    img_status=$(echo "$img_result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null || echo "unknown")
    img_duration=$(echo "$img_result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('duration_ms','?'))" 2>/dev/null || echo "?")
    img_size=$(echo "$img_result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dataLength',0))" 2>/dev/null || echo "0")
    echo "status=${img_status} size=${img_size}bytes (${img_duration}ms)"
  else
    echo "❌ 실패"
  fi

  # Rate limit 방지 — 시도 사이 3초 대기
  if [ $idx -lt ${#TOPICS[@]} ]; then
    echo "  [대기] 3초..."
    sleep 3
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  결과 파일: $RESULTS_DIR/"
echo "═══════════════════════════════════════════════════════"

# ── 종합 분석 ──
echo ""
python3 << 'PYEOF'
import json, os, glob

results_dir = "/tmp/blog-e2e-results"
records = []

for idx in range(1, 6):
    text_file = f"{results_dir}/text_{idx}.json"
    img_file = f"{results_dir}/image_{idx}.json"

    text_data = {}
    img_data = {}

    if os.path.exists(text_file):
        with open(text_file) as f:
            try:
                text_data = json.load(f)
            except:
                text_data = {"error": "json parse fail"}

    if os.path.exists(img_file):
        with open(img_file) as f:
            try:
                img_data = json.load(f)
            except:
                img_data = {"status": "unknown"}

    title = text_data.get("title", "")
    intro = text_data.get("intro", "")
    sections = text_data.get("sections", [])
    conclusion = text_data.get("conclusion", "")
    text_error = text_data.get("error", "")
    text_ms = text_data.get("_duration_ms", 0)

    img_status = img_data.get("status", "unknown")
    img_ms = img_data.get("duration_ms", 0)
    img_size = img_data.get("dataLength", 0)

    fatals = []
    warns = []

    if text_error:
        fatals.append(f"텍스트 실패: {text_error[:80]}")
    if not title:
        fatals.append("제목 없음")
    if len(sections) < 2:
        warns.append(f"섹션 {len(sections)}개")
    if not conclusion:
        warns.append("결론 없음")
    if img_status == "no-image":
        warns.append("hero AI 이미지 실패")
    elif img_status != "ai-image":
        warns.append(f"hero 상태: {img_status}")

    if fatals:
        verdict = "FATAL"
    elif warns:
        verdict = "WARN"
    else:
        verdict = "OK"

    records.append({
        "idx": idx,
        "title": title[:40] if title else "(없음)",
        "sections": len(sections) if isinstance(sections, list) else 0,
        "conclusion": bool(conclusion),
        "text_ms": text_ms,
        "img_status": img_status,
        "img_size_kb": round(img_size / 1024, 1) if img_size else 0,
        "img_ms": img_ms,
        "verdict": verdict,
        "fatals": fatals,
        "warns": warns,
    })

# 보고서 출력
print("═" * 100)
print("  블로그 코어 E2E 검증 결과 — 실제 Gemini API")
print("═" * 100)

ok = sum(1 for r in records if r["verdict"] == "OK")
warn = sum(1 for r in records if r["verdict"] == "WARN")
fatal = sum(1 for r in records if r["verdict"] == "FATAL")
print(f"  총 실행: {len(records)} | OK: {ok} | WARN: {warn} | FATAL: {fatal}")
print("─" * 100)
print(f"  {'#':>2} │ {'제목':<40} │ {'섹션':>4} │ {'결론':>4} │ {'텍스트':>6} │ {'hero':>10} │ {'img KB':>7} │ {'이미지':>6} │ 판정")
print("─" * 100)

for r in records:
    c = "✅" if r["conclusion"] else "❌"
    t = f"{r['text_ms']}ms" if r['text_ms'] else "—"
    i = f"{r['img_ms']}ms" if r['img_ms'] else "—"
    print(f"  {r['idx']:>2} │ {r['title']:<40} │ {r['sections']:>4} │ {c:>4} │ {t:>6} │ {r['img_status']:>10} │ {r['img_size_kb']:>7} │ {i:>6} │ {r['verdict']}")
    if r["fatals"]:
        print(f"     │ ❌ {', '.join(r['fatals'])}")
    if r["warns"]:
        print(f"     │ ⚠️  {', '.join(r['warns'])}")

print("─" * 100)

# hero 분포
hero_dist = {}
for r in records:
    s = r["img_status"]
    hero_dist[s] = hero_dist.get(s, 0) + 1
print(f"  [hero 분포] {' | '.join(f'{k}={v}' for k,v in hero_dist.items())}")

# 최종 판정
if fatal == 0 and ok + warn == len(records):
    if warn <= 1:
        print("  ✅ 최종 판정: 승인")
    else:
        print("  ⚠️  최종 판정: 조건부 승인")
else:
    print("  ❌ 최종 판정: 불가")

print("═" * 100)
PYEOF
