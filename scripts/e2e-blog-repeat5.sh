#!/bin/bash
# ═══════════════════════════════════════════════════════
# 블로그 코어 반복 검증 — 추가 5회 (서로 다른 주제)
# ═══════════════════════════════════════════════════════

set -euo pipefail

PROXY_URL="https://vercel-proxy-ten-jade.vercel.app/api/gemini"
RESULTS_DIR="/tmp/blog-e2e-repeat5"
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

TOPICS=(
  "스케일링 주기와 치석 제거의 중요성"
  "임산부 구강 관리와 치과 치료 시기"
  "노인 틀니 관리법과 임플란트 비교"
  "레진 치료 vs 세라믹 치료 비용과 장단점"
  "턱관절 장애 증상과 치과 교합 치료"
)

echo "═══════════════════════════════════════════════════════"
echo "  블로그 코어 반복 검증 — 추가 5회"
echo "  프록시: $PROXY_URL"
echo "═══════════════════════════════════════════════════════"

# 프록시 health
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "${PROXY_URL%/gemini}/health" 2>/dev/null || echo "000")
echo "[Health] $HTTP_CODE"

for i in "${!TOPICS[@]}"; do
  idx=$((i + 1))
  topic="${TOPICS[$i]}"
  echo ""
  echo "─── R${idx}/5: ${topic} ───"

  # 텍스트 생성
  prompt="당신은 치과 전문 블로그 작성자입니다. '${topic}'에 대한 블로그 글을 작성하세요.
반드시 아래 형식의 JSON으로 응답하세요:
{\"title\": \"SEO 최적화된 블로그 제목\", \"intro\": \"도입부 (2-3문장)\", \"sections\": [{\"heading\": \"소제목\", \"content\": \"본문 (3-5문장)\"}], \"conclusion\": \"결론 (2-3문장)\", \"imagePrompt\": \"hero 이미지 영문 프롬프트\"}
sections는 반드시 4개 이상 포함하세요."

  body=$(python3 -c "
import json
print(json.dumps({
  'prompt': '''$prompt''',
  'model': 'gemini-3.1-flash-lite-preview',
  'responseType': 'json',
  'timeout': 60000
}))
" 2>/dev/null)

  text_start=$(($(date +%s%N) / 1000000))
  text_response=$(curl -s --connect-timeout 15 --max-time 120 \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$PROXY_URL" 2>/dev/null) || text_response='{"error":"curl failed"}'
  text_ms=$(( $(date +%s%N) / 1000000 - text_start ))

  # 텍스트 파싱
  python3 -c "
import json, sys
raw = '''$text_response'''
try:
    data = json.loads(raw)
    text = data.get('text', json.dumps(data))
except:
    text = raw

# JSON 추출
import re
m = re.search(r'\`\`\`json\s*(.*?)\s*\`\`\`', text, re.DOTALL)
if m: text = m.group(1)
else:
    m2 = re.search(r'(\{.*\})', text, re.DOTALL)
    if m2: text = m2.group(1)

# balanced brace 파싱
depth = 0
start_idx = text.find('{')
result = {}
if start_idx >= 0:
    for ci, ch in enumerate(text[start_idx:], start_idx):
        if ch == '{': depth += 1
        elif ch == '}': depth -= 1
        if depth == 0:
            try:
                result = json.loads(text[start_idx:ci+1])
            except:
                result = {'error': 'parse failed'}
            break

result['_duration_ms'] = $text_ms
with open('$RESULTS_DIR/text_${idx}.json', 'w') as f:
    json.dump(result, f, ensure_ascii=False)
" 2>/dev/null

  text_data=$(cat "$RESULTS_DIR/text_${idx}.json")
  t_title=$(echo "$text_data" | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅' if d.get('title') else '❌')" 2>/dev/null || echo "?")
  t_sec=$(echo "$text_data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('sections',[])) if isinstance(d.get('sections'),list) else 0)" 2>/dev/null || echo "?")
  t_conc=$(echo "$text_data" | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅' if d.get('conclusion') else '❌')" 2>/dev/null || echo "?")
  echo "  [텍스트] title=${t_title} sections=${t_sec} conclusion=${t_conc} (${text_ms}ms)"

  # 이미지 생성
  img_prompt=$(echo "$text_data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('imagePrompt','dental health'))" 2>/dev/null || echo "dental health")

  img_body=$(python3 -c "
import json
print(json.dumps({
  'raw': True,
  'model': 'gemini-3.1-flash-image-preview',
  'apiBody': {
    'contents': [{'parts': [{'text': 'Generate a 16:9 dental health illustration: $img_prompt. Style: modern 3D illustration, soft pastel colors.'}]}],
    'generationConfig': {'responseModalities': ['TEXT','IMAGE']}
  },
  'timeout': 60000
}))
" 2>/dev/null)

  img_start=$(($(date +%s%N) / 1000000))
  img_response=$(curl -s --connect-timeout 15 --max-time 90 \
    -H "Content-Type: application/json" \
    -d "$img_body" \
    "$PROXY_URL" 2>/dev/null) || img_response='{"error":"curl failed"}'
  img_ms=$(( $(date +%s%N) / 1000000 - img_start ))

  python3 -c "
import json
try:
    data = json.loads('''$img_response''')
    for c in data.get('candidates', []):
        for part in c.get('content', {}).get('parts', []):
            if 'inlineData' in part:
                print(json.dumps({
                    'status': 'ai-image',
                    'mimeType': part['inlineData'].get('mimeType',''),
                    'dataLength': len(part['inlineData'].get('data','')),
                    'duration_ms': $img_ms
                }))
                exit(0)
    print(json.dumps({'status': 'no-image', 'duration_ms': $img_ms}))
except Exception as e:
    print(json.dumps({'status': 'error', 'error': str(e), 'duration_ms': $img_ms}))
" > "$RESULTS_DIR/image_${idx}.json" 2>/dev/null

  img_data=$(cat "$RESULTS_DIR/image_${idx}.json")
  i_status=$(echo "$img_data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "?")
  i_size=$(echo "$img_data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(round(d.get('dataLength',0)/1024))" 2>/dev/null || echo "0")
  echo "  [이미지] status=${i_status} size=${i_size}KB (${img_ms}ms)"

  # Rate limit 방지
  if [ $idx -lt ${#TOPICS[@]} ]; then
    sleep 3
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════"

# 종합 분석
python3 << 'PYEOF'
import json, os

results_dir = "/tmp/blog-e2e-repeat5"
records = []

for idx in range(1, 6):
    text_data = {}
    img_data = {}
    try:
        with open(f"{results_dir}/text_{idx}.json") as f:
            text_data = json.load(f)
    except: pass
    try:
        with open(f"{results_dir}/image_{idx}.json") as f:
            img_data = json.load(f)
    except: pass

    title = text_data.get("title", "")
    sections = text_data.get("sections", [])
    conclusion = text_data.get("conclusion", "")
    intro = text_data.get("intro", "")
    text_ms = text_data.get("_duration_ms", 0)
    img_status = img_data.get("status", "unknown")
    img_size = img_data.get("dataLength", 0)
    img_ms = img_data.get("duration_ms", 0)

    fatals = []
    warns = []
    if not title: fatals.append("제목 없음")
    if len(sections) < 2: warns.append(f"섹션 {len(sections)}개")
    if not conclusion: warns.append("결론 없음")
    if img_status != "ai-image":
        warns.append(f"hero: {img_status}")

    verdict = "FATAL" if fatals else ("WARN" if warns else "OK")

    records.append({
        "idx": idx,
        "title": (title or "(없음)")[:45],
        "sections": len(sections) if isinstance(sections, list) else 0,
        "intro": bool(intro),
        "conclusion": bool(conclusion),
        "text_ms": text_ms,
        "img_status": img_status,
        "img_kb": round(img_size / 1024, 1) if img_size else 0,
        "img_ms": img_ms,
        "verdict": verdict,
        "fatals": fatals,
        "warns": warns,
    })

print("═" * 100)
print("  블로그 코어 반복 검증 결과 — 추가 5회 (실제 Gemini API)")
print("═" * 100)

ok = sum(1 for r in records if r["verdict"] == "OK")
warn = sum(1 for r in records if r["verdict"] == "WARN")
fatal = sum(1 for r in records if r["verdict"] == "FATAL")
print(f"  총 실행: {len(records)} | OK: {ok} | WARN: {warn} | FATAL: {fatal}")
print("─" * 100)
print(f"  {'#':>2} │ {'제목':<45} │ {'섹션':>2} │ {'도입':>2} │ {'결론':>2} │ {'텍스트':>7} │ {'hero':>10} │ {'KB':>6} │ {'이미지':>7} │ 판정")
print("─" * 100)

for r in records:
    intro_s = "✅" if r["intro"] else "❌"
    conc_s = "✅" if r["conclusion"] else "❌"
    print(f"  {r['idx']:>2} │ {r['title']:<45} │ {r['sections']:>2} │ {intro_s:>2} │ {conc_s:>2} │ {r['text_ms']:>5}ms │ {r['img_status']:>10} │ {r['img_kb']:>6} │ {r['img_ms']:>5}ms │ {r['verdict']}")
    if r["fatals"]: print(f"     │ ❌ {', '.join(r['fatals'])}")
    if r["warns"]: print(f"     │ ⚠️  {', '.join(r['warns'])}")

print("─" * 100)

# 누적 통계 (이전 5회 + 이번 5회)
print(f"\n  === 누적 10회 통계 (이전 5 + 이번 5) ===")
print(f"  텍스트 완주: {sum(1 for r in records if r['sections'] >= 4 and r['conclusion'])}/5 (이번) | 5/5 (이전)")
print(f"  hero AI 이미지: {sum(1 for r in records if r['img_status']=='ai-image')}/5 (이번) | 5/5 (이전)")
print(f"  template fallback: {sum(1 for r in records if r['img_status']!='ai-image')}/5 (이번) | 0/5 (이전)")
avg_text = sum(r['text_ms'] for r in records) // len(records)
avg_img = sum(r['img_ms'] for r in records) // len(records)
avg_kb = sum(r['img_kb'] for r in records) / len(records)
print(f"  평균 텍스트: {avg_text}ms | 평균 이미지: {avg_img}ms | 평균 크기: {avg_kb:.0f}KB")

if fatal == 0:
    if warn <= 1:
        print("\n  ✅ 최종 판정: 승인 — '반복해서도 된다' 증명 완료")
    else:
        print(f"\n  ⚠️  최종 판정: 조건부 승인 — WARN {warn}건")
else:
    print(f"\n  ❌ 최종 판정: 불가 — FATAL {fatal}건")

print("═" * 100)
PYEOF
