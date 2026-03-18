#!/usr/bin/env python3
"""블로그 코어 반복 검증 — 추가 5회 (실제 Gemini 프록시)"""

import json
import subprocess
import time
import re
import sys

PROXY_URL = "https://vercel-proxy-ten-jade.vercel.app/api/gemini"

TOPICS = [
    "스케일링 주기와 치석 제거의 중요성",
    "임산부 구강 관리와 치과 치료 시기",
    "노인 틀니 관리법과 임플란트 비교",
    "레진 치료 vs 세라믹 치료 비용과 장단점",
    "턱관절 장애 증상과 치과 교합 치료",
]

def curl_post(url, data, timeout=120):
    """curl로 POST 요청"""
    try:
        result = subprocess.run(
            ["curl", "-s", "--connect-timeout", "15", "--max-time", str(timeout),
             "-H", "Content-Type: application/json",
             "-d", json.dumps(data),
             url],
            capture_output=True, text=True, timeout=timeout + 10
        )
        return result.stdout
    except Exception as e:
        return json.dumps({"error": str(e)})

def extract_json(raw_text):
    """응답에서 JSON 객체 추출 (Extra data 방어)"""
    text = raw_text.strip()

    # 프록시 응답에서 text 필드 추출
    try:
        proxy_resp = json.loads(text)
        if "text" in proxy_resp:
            text = proxy_resp["text"]
        elif "error" in proxy_resp:
            return {"error": proxy_resp["error"]}
    except:
        pass

    # ```json ... ``` 블록 추출
    m = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
    if m:
        text = m.group(1)

    # balanced brace 파싱
    start_idx = text.find('{')
    if start_idx < 0:
        return {"error": "no JSON found", "_raw_preview": text[:200]}

    depth = 0
    for ci, ch in enumerate(text[start_idx:], start_idx):
        if ch == '{': depth += 1
        elif ch == '}': depth -= 1
        if depth == 0:
            try:
                return json.loads(text[start_idx:ci+1])
            except Exception as e:
                return {"error": f"parse failed: {e}", "_raw_preview": text[start_idx:start_idx+200]}

    return {"error": "unbalanced braces"}

def generate_text(topic):
    """텍스트 생성"""
    prompt = f"""당신은 치과 전문 블로그 작성자입니다. '{topic}'에 대한 블로그 글을 작성하세요.
반드시 아래 형식의 JSON으로 응답하세요:
{{"title": "SEO 최적화된 블로그 제목", "intro": "도입부 (2-3문장)", "sections": [{{"heading": "소제목", "content": "본문 (3-5문장)"}}], "conclusion": "결론 (2-3문장)", "imagePrompt": "hero 이미지 영문 프롬프트"}}
sections는 반드시 4개 이상 포함하세요."""

    data = {
        "prompt": prompt,
        "model": "gemini-3.1-flash-lite-preview",
        "responseType": "json",
        "timeout": 60000
    }

    t0 = time.time()
    response = curl_post(PROXY_URL, data, timeout=120)
    duration_ms = int((time.time() - t0) * 1000)

    result = extract_json(response)
    result["_duration_ms"] = duration_ms
    return result

def generate_image(image_prompt):
    """이미지 생성"""
    data = {
        "raw": True,
        "model": "gemini-3.1-flash-image-preview",
        "apiBody": {
            "contents": [{"parts": [{"text": f"Generate a 16:9 dental health illustration: {image_prompt}. Style: modern 3D illustration, soft pastel colors, professional medical context."}]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
        },
        "timeout": 60000
    }

    t0 = time.time()
    response = curl_post(PROXY_URL, data, timeout=90)
    duration_ms = int((time.time() - t0) * 1000)

    try:
        resp_data = json.loads(response)
        for c in resp_data.get("candidates", []):
            for part in c.get("content", {}).get("parts", []):
                if "inlineData" in part:
                    return {
                        "status": "ai-image",
                        "mimeType": part["inlineData"].get("mimeType", ""),
                        "dataLength": len(part["inlineData"].get("data", "")),
                        "duration_ms": duration_ms
                    }
        return {"status": "no-image", "duration_ms": duration_ms}
    except Exception as e:
        return {"status": "error", "error": str(e), "duration_ms": duration_ms}


# ═══════════════════════════════════════════════════════
# 실행
# ═══════════════════════════════════════════════════════

print("═" * 100)
print("  블로그 코어 반복 검증 — 추가 5회 (실제 Gemini API)")
print("═" * 100)

# Health check
try:
    health = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--connect-timeout", "10",
         PROXY_URL.replace("/gemini", "/health")],
        capture_output=True, text=True, timeout=15
    )
    print(f"  [Health] {health.stdout}")
except:
    print("  [Health] FAIL")
    sys.exit(1)

records = []

for i, topic in enumerate(TOPICS):
    idx = i + 1
    print(f"\n─── R{idx}/5: {topic} ───")

    # 텍스트 생성
    text_result = generate_text(topic)
    title = text_result.get("title", "")
    sections = text_result.get("sections", [])
    conclusion = text_result.get("conclusion", "")
    intro = text_result.get("intro", "")
    text_ms = text_result.get("_duration_ms", 0)
    text_err = text_result.get("error", "")

    t_ok = "✅" if title else "❌"
    s_n = len(sections) if isinstance(sections, list) else 0
    c_ok = "✅" if conclusion else "❌"
    print(f"  [텍스트] title={t_ok} sections={s_n} conclusion={c_ok} ({text_ms}ms)")
    if text_err:
        print(f"  [텍스트 에러] {text_err[:100]}")

    # 이미지 생성
    img_prompt = text_result.get("imagePrompt", "dental health illustration")
    img_result = generate_image(img_prompt)
    img_status = img_result.get("status", "unknown")
    img_size = img_result.get("dataLength", 0)
    img_ms = img_result.get("duration_ms", 0)
    print(f"  [이미지] status={img_status} size={round(img_size/1024)}KB ({img_ms}ms)")

    # 판정
    fatals = []
    warns = []
    if text_err: fatals.append(f"텍스트 에러: {text_err[:60]}")
    if not title: fatals.append("제목 없음")
    if s_n < 2: warns.append(f"섹션 {s_n}개")
    if not conclusion: warns.append("결론 없음")
    if img_status != "ai-image": warns.append(f"hero: {img_status}")

    verdict = "FATAL" if fatals else ("WARN" if warns else "OK")

    records.append({
        "idx": idx,
        "topic": topic,
        "title": (title or "(없음)")[:45],
        "sections": s_n,
        "intro": bool(intro),
        "conclusion": bool(conclusion),
        "text_ms": text_ms,
        "img_status": img_status,
        "img_kb": round(img_size / 1024, 1),
        "img_ms": img_ms,
        "verdict": verdict,
        "fatals": fatals,
        "warns": warns,
    })

    # Rate limit 방지
    if idx < len(TOPICS):
        time.sleep(3)

# 보고서
print("\n" + "═" * 100)
print("  블로그 코어 반복 검증 결과 — 추가 5회")
print("═" * 100)

ok = sum(1 for r in records if r["verdict"] == "OK")
warn = sum(1 for r in records if r["verdict"] == "WARN")
fatal = sum(1 for r in records if r["verdict"] == "FATAL")
print(f"  총 실행: {len(records)} | OK: {ok} | WARN: {warn} | FATAL: {fatal}")
print("─" * 100)
print(f"  {'#':>2} │ {'제목':<45} │ {'섹션':>2} │ {'결론':>2} │ {'텍스트':>7} │ {'hero':>10} │ {'KB':>6} │ {'이미지':>7} │ 판정")
print("─" * 100)

for r in records:
    c = "✅" if r["conclusion"] else "❌"
    print(f"  {r['idx']:>2} │ {r['title']:<45} │ {r['sections']:>2} │ {c:>2} │ {r['text_ms']:>5}ms │ {r['img_status']:>10} │ {r['img_kb']:>6} │ {r['img_ms']:>5}ms │ {r['verdict']}")
    if r["fatals"]: print(f"     │ ❌ {', '.join(r['fatals'])}")
    if r["warns"]: print(f"     │ ⚠️  {', '.join(r['warns'])}")

print("─" * 100)

# hero 분포
hero_dist = {}
for r in records:
    s = r["img_status"]
    hero_dist[s] = hero_dist.get(s, 0) + 1
print(f"  [hero 분포] {' | '.join(f'{k}={v}' for k,v in hero_dist.items())}")

# 누적 10회 통계
print(f"\n  === 누적 10회 통계 (이전 5 + 이번 5) ===")
prev_text_ok = 5
prev_img_ok = 5
curr_text_ok = sum(1 for r in records if r["sections"] >= 4 and r["conclusion"])
curr_img_ok = sum(1 for r in records if r["img_status"] == "ai-image")
print(f"  텍스트 완주: {curr_text_ok + prev_text_ok}/10 (이번 {curr_text_ok}/5 + 이전 5/5)")
print(f"  hero AI 이미지: {curr_img_ok + prev_img_ok}/10 (이번 {curr_img_ok}/5 + 이전 5/5)")
print(f"  template fallback: {5 - curr_img_ok}/5 (이번)")
avg_text = sum(r["text_ms"] for r in records) // len(records)
avg_img = sum(r["img_ms"] for r in records) // len(records)
avg_kb = sum(r["img_kb"] for r in records) / len(records)
print(f"  평균 텍스트: {avg_text}ms | 평균 이미지: {avg_img}ms | 평균 크기: {avg_kb:.0f}KB")

if fatal == 0:
    if warn <= 1:
        print(f"\n  ✅ 최종 판정: 승인 — '반복해서도 된다' 증명 완료")
    else:
        print(f"\n  ⚠️  최종 판정: 조건부 승인 — WARN {warn}건")
else:
    print(f"\n  ❌ 최종 판정: 불가 — FATAL {fatal}건")

print("═" * 100)
